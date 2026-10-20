import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { registroCopilotoCompletoSchema } from "@hallaxos/shared";
import { diariasEntre } from "../services/registroCopiloto";

// Sprint 17 · decisão #79 — registro pelo copiloto: um toque grava cliente,
// operação, transições e pagamento numa transação só, pelos services de sempre.
// Os testes puros cobrem o schema; os de integração (gated por DATABASE_URL)
// rodam o registro inteiro contra um Postgres e conferem o que ficou gravado.

test("diárias: mínimo 1, contadas entre as datas", () => {
  assert.equal(diariasEntre("2026-10-10", "2026-10-10"), 1);
  assert.equal(diariasEntre("2026-10-10", "2026-10-13"), 3);
});

test("schema aponta o que falta em frases prontas para o usuário", () => {
  const r = registroCopilotoCompletoSchema.safeParse({
    tipo: "guincho",
    cliente: { novo: { nome: "João", cpf_cnpj: "123" } },
    origem_endereco: "Centro",
  });
  assert.equal(r.success, false);
  const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
  for (const esperado of ["Informe o destino", "Informe o veículo transportado", "Informe o valor do guincho"]) {
    assert.ok(msgs.includes(esperado), `faltou "${esperado}" em ${JSON.stringify(msgs)}`);
  }
  assert.ok(msgs.some((m) => m.includes("CPF")), "CPF curto deve ser apontado");
});

test("locação finalizada sem pagamento é recusada; reservada não precisa", () => {
  const base = {
    tipo: "locacao", cliente: { id: crypto.randomUUID() }, ativo_id: crypto.randomUUID(),
    valor_diaria: 150, data_retirada: "2026-10-01", data_devolucao: "2026-10-05",
  };
  assert.equal(registroCopilotoCompletoSchema.safeParse({ ...base, situacao: "finalizada" }).success, false);
  assert.equal(registroCopilotoCompletoSchema.safeParse({ ...base, situacao: "reservada" }).success, true);
});

const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("registro pelo copiloto (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  const { executarRegistro, conferirRegistro } = await import("../services/registroCopiloto");
  const { criarConta, criarCategoriaFinanceira } = await import("../services/financeiro");
  const { criarPessoa } = await import("../services/pessoas");
  const { criarAtivo } = await import("../services/ativos");
  const { db, pool, emTransacaoUnica } = await import("../db/client");
  const { usuarios, ativoCategorias } = await import("../db/schema");
  const { sql } = await import("drizzle-orm");
  const { novoId } = await import("../lib/ids");
  const { hojeEmDourados } = await import("../lib/hoje");

  const hoje = hojeEmDourados().data;
  const admin = { id: "", papel: "admin" as const };
  let contaId = "";
  let categoriaVeicularId = "";
  const cpf = () => String(Math.floor(Math.random() * 1e11)).padStart(11, "0");
  const placa = () => "TST" + String(Math.floor(Math.random() * 1e4)).padStart(4, "0");

  async function umaLinha<T>(consulta: ReturnType<typeof sql>): Promise<T> {
    return (await db.execute(consulta)).rows[0] as T;
  }

  before(async () => {
    admin.id = novoId();
    await db.insert(usuarios).values({
      id: admin.id, nome: "Teste Registro", email: `registro-${admin.id}@t.com`, senhaHash: "x", papel: "admin",
    });
    contaId = (await criarConta(`Cresol Teste ${admin.id}`, 0)).id;
    categoriaVeicularId = novoId();
    await db.insert(ativoCategorias).values({ id: categoriaVeicularId, nome: `Carros ${admin.id}`, ehVeicular: true });
  });

  after(async () => {
    await pool.end();
  });

  test("guincho com cliente novo e pago: um toque grava tudo, e o segundo toque não duplica", async () => {
    const chave = crypto.randomUUID();
    const documento = cpf();
    const registro = {
      tipo: "guincho",
      data: hoje,
      cliente: { novo: { nome: "Cliente Guincho Teste", cpf_cnpj: documento } },
      origem_endereco: "Rua Hayel Bon Faker, 100",
      destino_endereco: "Oficina do Zé, Vila Industrial",
      veiculo_cliente_descricao: "Gol prata",
      veiculo_cliente_placa: "ABC1D23",
      valor: 400,
      pagamento: { situacao: "pago", conta_id: contaId, forma_pagamento: "pix" },
    };

    const r = await executarRegistro(chave, registro, admin);
    assert.equal(r.repetido, false);
    const opLink = r.links.find((l) => l.entidade_tipo === "operacao")!;
    assert.ok(opLink, "deve devolver link da operação");

    const op = await umaLinha<{ status: string; valor_total: string; cliente: string }>(sql`
      SELECT o.status, o.valor_total, p.nome AS cliente FROM operacoes o JOIN pessoas p ON p.id = o.cliente_id
      WHERE o.id = ${opLink.entidade_id}`);
    assert.equal(op.status, "concluido", "guincho percorre a máquina de estados até concluído");
    assert.equal(Number(op.valor_total), 400);
    assert.equal(op.cliente, "Cliente Guincho Teste");

    const lancs = (await db.execute(sql`
      SELECT status, valor, conta_id, forma_pagamento, data_pagamento::text FROM lancamentos
      WHERE operacao_id = ${opLink.entidade_id} AND deleted_at IS NULL`)).rows as Array<Record<string, string>>;
    assert.equal(lancs.length, 1);
    assert.equal(lancs[0]!.status, "pago");
    assert.equal(Number(lancs[0]!.valor), 400);
    assert.equal(lancs[0]!.conta_id, contaId);
    assert.equal(lancs[0]!.forma_pagamento, "pix");
    assert.equal(lancs[0]!.data_pagamento, hoje);

    const autoria = await umaLinha<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM timeline WHERE entidade_id = ${opLink.entidade_id} AND usuario_id = ${admin.id}`);
    assert.ok(autoria.n >= 4, "criação e transições ficam com a autoria de quem confirmou");

    const repetido = await executarRegistro(chave, registro, admin);
    assert.equal(repetido.repetido, true);
    assert.deepEqual(repetido.links, r.links);
    const pessoas = await umaLinha<{ n: number }>(sql`SELECT count(*)::int AS n FROM pessoas WHERE cpf_cnpj = ${documento}`);
    assert.equal(pessoas.n, 1, "o segundo toque não cria outro cliente");
  });

  test("transação única: se um passo falha, nada do que veio antes fica", async () => {
    const documento = cpf();
    await assert.rejects(
      emTransacaoUnica(async () => {
        await criarPessoa({ tipo: "pf", nome: "Não Deve Ficar", cpf_cnpj: documento }, admin.id);
        throw new Error("falha no meio do registro");
      }),
      /falha no meio/
    );
    const n = await umaLinha<{ n: number }>(sql`SELECT count(*)::int AS n FROM pessoas WHERE cpf_cnpj = ${documento}`);
    assert.equal(n.n, 0, "o cliente criado antes da falha some junto");
  });

  test("locação finalizada: total = diárias × dias, parcelado e a receber", async () => {
    const cliente = await criarPessoa({ tipo: "pf", nome: "Locatário Teste", cpf_cnpj: cpf() }, admin.id);
    const carro = await criarAtivo(
      { nome: "Onix Locação Teste", categoria_id: categoriaVeicularId, veiculo: { placa: placa(), marca: "Chevrolet", modelo: "Onix", km_atual: 0 }, gerar_compra: false },
      admin.id
    );
    const r = await executarRegistro(crypto.randomUUID(), {
      tipo: "locacao", cliente: { id: cliente.id }, ativo_id: carro.id, valor_diaria: 150,
      data_retirada: "2026-09-01", data_devolucao: "2026-09-05", situacao: "finalizada",
      pagamento: { situacao: "pendente", data_vencimento: "2026-11-05", parcelas: 2 },
    }, admin);
    const opId = r.links.find((l) => l.entidade_tipo === "operacao")!.entidade_id;
    const op = await umaLinha<{ status: string }>(sql`SELECT status FROM operacoes WHERE id = ${opId}`);
    assert.equal(op.status, "finalizada");
    const lancs = (await db.execute(sql`
      SELECT valor, status, data_vencimento::text FROM lancamentos WHERE operacao_id = ${opId} ORDER BY data_vencimento`))
      .rows as Array<{ valor: string; status: string; data_vencimento: string }>;
    assert.deepEqual(lancs.map((l) => l.data_vencimento), ["2026-11-05", "2026-12-05"]);
    assert.equal(lancs.reduce((s, l) => s + Number(l.valor), 0), 600, "4 diárias de 150");
    assert.ok(lancs.every((l) => l.status === "previsto"));
    const ativo = await umaLinha<{ status: string }>(sql`SELECT status FROM ativos WHERE id = ${carro.id}`);
    assert.equal(ativo.status, "disponivel", "carro volta a ficar disponível");
  });

  test("compra de ativo novo: cadastra o ativo, a compra com o vendedor real e a despesa paga", async () => {
    const vendedor = await criarPessoa({ tipo: "pf", nome: "Vendedor Teste", cpf_cnpj: cpf() }, admin.id);
    const r = await executarRegistro(crypto.randomUUID(), {
      tipo: "compra", data: hoje, cliente: { id: vendedor.id }, transferido: true, valor: 35000,
      ativo: { novo: { nome: "Saveiro Compra Teste", categoria_id: categoriaVeicularId, veiculo: { placa: placa(), marca: "VW", modelo: "Saveiro" } } },
      pagamento: { situacao: "pago", conta_id: contaId, forma_pagamento: "transferencia" },
    }, admin);
    const ativoId = r.links.find((l) => l.entidade_tipo === "ativo")!.entidade_id;
    const opId = r.links.find((l) => l.entidade_tipo === "operacao")!.entidade_id;
    const ativo = await umaLinha<{ valor_aquisicao: string; status: string }>(sql`SELECT valor_aquisicao, status FROM ativos WHERE id = ${ativoId}`);
    assert.equal(Number(ativo.valor_aquisicao), 35000);
    assert.equal(ativo.status, "disponivel");
    const op = await umaLinha<{ status: string; cliente_id: string }>(sql`SELECT status, cliente_id FROM operacoes WHERE id = ${opId}`);
    assert.equal(op.status, "concluida");
    assert.equal(op.cliente_id, vendedor.id, "o vendedor é a pessoa informada, não o primeiro cadastro");
    const compras = await umaLinha<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM operacao_ativos oa JOIN operacoes o ON o.id = oa.operacao_id
      WHERE oa.ativo_id = ${ativoId} AND o.tipo = 'compra'`);
    assert.equal(compras.n, 1, "uma compra só — o atalho gerar_compra não dispara junto");
    const despesa = await umaLinha<{ tipo: string; status: string }>(sql`SELECT tipo, status FROM lancamentos WHERE operacao_id = ${opId}`);
    assert.deepEqual(despesa, { tipo: "despesa", status: "pago" });
  });

  test("venda transferida deixa o ativo como vendido e gera a receita", async () => {
    const comprador = await criarPessoa({ tipo: "pf", nome: "Comprador Teste", cpf_cnpj: cpf() }, admin.id);
    const carro = await criarAtivo(
      { nome: "Uno Venda Teste", categoria_id: categoriaVeicularId, veiculo: { placa: placa(), marca: "Fiat", modelo: "Uno", km_atual: 0 }, gerar_compra: false },
      admin.id
    );
    const r = await executarRegistro(crypto.randomUUID(), {
      tipo: "venda", cliente: { id: comprador.id }, ativo_id: carro.id, valor: 20000, transferido: true,
      pagamento: { situacao: "pago", conta_id: contaId, forma_pagamento: "pix" },
    }, admin);
    const opId = r.links.find((l) => l.entidade_tipo === "operacao")!.entidade_id;
    const ativo = await umaLinha<{ status: string }>(sql`SELECT status FROM ativos WHERE id = ${carro.id}`);
    assert.equal(ativo.status, "vendido");
    const receita = await umaLinha<{ tipo: string; status: string; valor: string }>(sql`SELECT tipo, status, valor FROM lancamentos WHERE operacao_id = ${opId}`);
    assert.equal(receita.tipo, "receita");
    assert.equal(receita.status, "pago");
    assert.equal(Number(receita.valor), 20000);
  });

  test("lançamento avulso pago entra na conta escolhida", async () => {
    const cat = await criarCategoriaFinanceira(`Combustível Teste ${admin.id}`, "despesa");
    const r = await executarRegistro(crypto.randomUUID(), {
      tipo: "lancamento", natureza: "despesa", descricao: "Diesel da retro", valor: 300,
      categoria_id: cat.id, pagamento: { situacao: "pago", conta_id: contaId, forma_pagamento: "dinheiro" },
    }, admin);
    const l = await umaLinha<{ status: string; conta_id: string; data_pagamento: string }>(sql`
      SELECT status, conta_id, data_pagamento::text FROM lancamentos WHERE id = ${r.links[0]!.entidade_id}`);
    assert.deepEqual(l, { status: "pago", conta_id: contaId, data_pagamento: hoje });
  });

  test("conferir: CPF já cadastrado, data futura e papel sem permissão viram perguntas, sem gravar", async () => {
    const existente = await criarPessoa({ tipo: "pf", nome: "Já Cadastrado", cpf_cnpj: cpf() }, admin.id);
    const amanha = new Date(Date.parse(hoje) + 86400_000).toISOString().slice(0, 10);
    const c = await conferirRegistro({
      tipo: "guincho", data: amanha,
      cliente: { novo: { nome: "Outro Nome", cpf_cnpj: existente.cpfCnpj } },
      origem_endereco: "Centro", destino_endereco: "Jardim América", veiculo_cliente_descricao: "Hilux",
      valor: 250, pagamento: { situacao: "pago", conta_id: contaId, forma_pagamento: "pix" },
    }, "operador");
    const texto = c.problemas.join(" | ");
    assert.match(texto, /Já Cadastrado/, "aponta o cadastro existente pelo nome");
    assert.match(texto, /futuro/);
    assert.match(texto, /não pode dar baixa/, "operador não dá baixa em pagamento");
    const semPlaca = await conferirRegistro({
      tipo: "compra", cliente: { id: existente.id }, valor: 1000,
      ativo: { novo: { nome: "Carro sem placa", categoria_id: categoriaVeicularId, veiculo: { marca: "Fiat", modelo: "Mobi" } } },
      pagamento: { situacao: "pago", conta_id: contaId, forma_pagamento: "pix" },
    }, "admin");
    assert.ok(semPlaca.problemas.includes("Informe a placa do veículo comprado."));
    await assert.rejects(executarRegistro(crypto.randomUUID(), {
      tipo: "lancamento", natureza: "despesa", descricao: "Despesa do operador", valor: 1, categoria_id: crypto.randomUUID(),
      pagamento: { situacao: "pago", conta_id: contaId, forma_pagamento: "pix" },
    }, { id: admin.id, papel: "operador" }), (e: { status?: number }) => e.status === 403);
  });
}
