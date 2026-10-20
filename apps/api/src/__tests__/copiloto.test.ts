import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS_LEITURA,
  FERRAMENTAS_REGISTRO,
  ferramentasPara,
  executarFerramenta,
  perguntar,
  montarMensagens,
  hojeEmDourados,
  MAX_TURNOS_HISTORICO,
} from "../services/copiloto";
import { pool } from "../db/client";
import { AppError } from "../lib/erros";

// O copiloto (Fase 1) é só leitura. Estes testes são a porta de qualidade do
// principal invariante pedido: o copiloto NÃO executa ação de escrita, e respeita
// o papel do usuário em cada ferramenta (doc 05). Os testes puros não tocam o
// banco nem a IA; os de integração (gated por DATABASE_URL) rodam o SQL real das
// ferramentas contra um Postgres — pegam erro de SQL cru que só estoura em runtime
// (mesma filosofia da decisão #39).

after(async () => {
  // Pool nunca conecta nos testes puros; nos de integração, fecha ao final.
  await pool.end();
});

// 1. Nenhuma ferramenta de escrita existe — a lista é a garantia, em código, de
//    que o modelo não tem como mutar dado (decisão #43).
const LEITURA_PERMITIDA = new Set([
  "busca_global",
  "dashboard_resumo",
  "operacoes_abertas",
  "relatorio_financeiro",
  "opcoes_registro",
]);

test("copiloto só expõe ferramentas de leitura (nenhuma de escrita)", () => {
  assert.ok(FERRAMENTAS_LEITURA.length > 0, "deve haver ferramentas");
  for (const f of FERRAMENTAS_LEITURA) {
    assert.ok(LEITURA_PERMITIDA.has(f.name), `ferramenta inesperada (possível escrita): ${f.name}`);
  }
  // E nenhum verbo de mutação no nome (criar/anular/transicionar/excluir/pagar…).
  const proibido = /(criar|atualizar|editar|anular|estornar|cancelar|transicion|finaliz|excluir|deletar|apagar|pagar|iniciar|concluir)/i;
  for (const f of FERRAMENTAS_LEITURA) {
    assert.doesNotMatch(f.name, proibido, `nome de ferramenta sugere escrita: ${f.name}`);
  }
});

// 1b. Registro (Sprint 17 · decisão #79): a ferramenta vive FORA da lista de
//     leitura (o invariante "leitura não muta" segue válido) e continua NÃO
//     escrevendo — só confere e monta uma proposta inerte que o humano confirma.
test("propor_registro existe como ferramenta de registro, separada da leitura", () => {
  assert.ok(!FERRAMENTAS_LEITURA.some((f) => f.name === "propor_registro"), "registro não é leitura");
  assert.ok(FERRAMENTAS_REGISTRO.some((f) => f.name === "propor_registro"));
  // As propostas antigas deram lugar a um caminho só.
  const todas = [...FERRAMENTAS_LEITURA, ...FERRAMENTAS_REGISTRO].map((f) => f.name);
  assert.ok(!todas.includes("propor_lancamento") && !todas.includes("propor_operacao"));
});

test("ferramentasPara expõe propor_registro a quem cria operação ou lançamento", () => {
  const nomes = (papel: Parameters<typeof ferramentasPara>[0]) => ferramentasPara(papel).map((f) => f.name);
  for (const papel of ["admin", "gestor", "operador", "financeiro"] as const) {
    assert.ok(nomes(papel).includes("propor_registro"), `${papel} registra pelo copiloto`);
  }
});

test("propor_registro incompleto devolve o que falta, sem proposta (o modelo pergunta)", async () => {
  const r = await executarFerramenta(
    "propor_registro",
    { tipo: "guincho", origem_endereco: "Centro", valor: 400 },
    "admin"
  );
  assert.equal(r.proposta, undefined, "nada a confirmar enquanto faltar dado");
  const corpo = JSON.parse(r.conteudo) as { registro_incompleto?: boolean; faltando: string[] };
  assert.equal(corpo.registro_incompleto, true);
  for (const esperado of ["Informe o destino", "Informe o veículo transportado"]) {
    assert.ok(corpo.faltando.includes(esperado), `faltou "${esperado}"`);
  }
  assert.ok(corpo.faltando.some((f) => f.includes("cliente")), "pede o cliente");
  assert.ok(corpo.faltando.some((f) => f.includes("pago")), "pergunta se já foi pago");
});

test("propor_registro aponta id inventado pelo modelo em vez de aceitar", async () => {
  const r = await executarFerramenta(
    "propor_registro",
    { tipo: "venda", cliente: { id: "o cliente João" }, ativo_id: "123", valor: 50000 },
    "admin"
  );
  assert.equal(r.proposta, undefined);
  const { faltando } = JSON.parse(r.conteudo) as { faltando: string[] };
  assert.ok(faltando.some((f) => f.includes("busca_global")), "manda procurar o cadastro de verdade");
});

// 2. Permissão por ferramenta: um operador não enxerga o financeiro pelo copiloto.
//    O bloqueio é antes de qualquer query — testável sem banco.
test("relatorio_financeiro nega o operador sem tocar o banco", async () => {
  const r = await executarFerramenta("relatorio_financeiro", {}, "operador");
  const corpo = JSON.parse(r.conteudo) as { sem_permissao?: boolean };
  assert.equal(corpo.sem_permissao, true);
  assert.equal(r.fontes.length, 0);
});

// 3. Desligado por padrão: sem IA_API_KEY, responde 503 e não faz chamada paga.
test("perguntar sem IA_API_KEY responde 503 IA_NAO_CONFIGURADA (sem custo)", async () => {
  await assert.rejects(
    () => perguntar("quanto faturei?", "admin"),
    (e: unknown) => {
      assert.ok(e instanceof AppError);
      assert.equal(e.status, 503);
      assert.equal(e.codigo, "IA_NAO_CONFIGURADA");
      return true;
    }
  );
});

// 4. Integração: as ferramentas de leitura rodam o SQL real sem quebrar (gated).
const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("ferramentas de leitura (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  test("busca_global executa contra o banco e respeita o papel", async () => {
    const r = await executarFerramenta("busca_global", { consulta: "auto" }, "operador");
    assert.ok(Array.isArray(JSON.parse(r.conteudo)));
  });

  test("dashboard_resumo executa para todos os papéis", async () => {
    for (const papel of ["admin", "operador", "financeiro"] as const) {
      const r = await executarFerramenta("dashboard_resumo", {}, papel);
      assert.equal(typeof JSON.parse(r.conteudo), "object");
    }
  });

  test("operacoes_abertas executa com e sem filtro", async () => {
    for (const input of [{}, { atrasadas: true }, { tipo: "guincho" }]) {
      const r = await executarFerramenta("operacoes_abertas", input, "operador");
      const corpo = JSON.parse(r.conteudo) as { total: number; operacoes: unknown[] };
      assert.equal(typeof corpo.total, "number");
      assert.ok(Array.isArray(corpo.operacoes));
    }
  });

  test("relatorio_financeiro executa para quem tem o papel", async () => {
    const r = await executarFerramenta("relatorio_financeiro", {}, "admin");
    const corpo = JSON.parse(r.conteudo) as { dre: unknown; resultado_por_ativo: unknown[] };
    assert.ok(corpo.dre);
    assert.ok(Array.isArray(corpo.resultado_por_ativo));
  });

  test("opcoes_registro esconde contas de quem não vê o financeiro", async () => {
    const operador = JSON.parse((await executarFerramenta("opcoes_registro", {}, "operador")).conteudo) as {
      contas: unknown[]; categorias_de_ativo: unknown[];
    };
    assert.deepEqual(operador.contas, []);
    assert.ok(Array.isArray(operador.categorias_de_ativo));
  });

  // Invariante central: propor NÃO escreve. Com um registro completo e válido a
  // ferramenta devolve a proposta (com chave) e nenhuma linha muda (decisão #43).
  test("propor_registro completo devolve proposta e não grava nada", async () => {
    const { db } = await import("../db/client");
    const { sql } = await import("drizzle-orm");
    const { criarConta } = await import("../services/financeiro");
    const conta = await criarConta(`Conta Proposta ${crypto.randomUUID()}`, 0);
    const contar = async () =>
      (await db.execute(sql`SELECT (SELECT count(*) FROM lancamentos) + (SELECT count(*) FROM operacoes)
                                + (SELECT count(*) FROM pessoas) AS n`)).rows[0]!.n;
    const antes = await contar();
    const r = await executarFerramenta(
      "propor_registro",
      {
        tipo: "guincho",
        cliente: { novo: { nome: "Proposta Sem Efeito", cpf_cnpj: "52998224725" } },
        origem_endereco: "Rua Monte Alegre, 10",
        destino_endereco: "Av. Weimar Torres, 900",
        veiculo_cliente_descricao: "Strada branca",
        valor: 380,
        pagamento: { situacao: "pago", conta_id: conta.id, forma_pagamento: "pix" },
      },
      "admin"
    );
    assert.ok(r.proposta, "devolve proposta");
    assert.equal(r.proposta!.acao, "registrar");
    assert.match(r.proposta!.chave, /^[0-9a-f-]{36}$/);
    assert.ok(r.proposta!.linhas.some((l) => l.valor.includes("Strada branca")));
    assert.equal(await contar(), antes, "a proposta não grava nada");
  });
}

// Sprint 17 — memória da conversa: o histórico vira pares user/assistant antes da
// pergunta nova, cortado nos últimos turnos (custo previsível).
test("montarMensagens intercala o histórico e termina na pergunta nova", () => {
  const msgs = montarMensagens("e o cpf é 123", [
    { pergunta: "lança um guincho de 400", resposta: "Qual o CPF do cliente?" },
  ]);
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs.at(-1)!.content, "e o cpf é 123");
});

test("montarMensagens guarda só os últimos turnos", () => {
  const historico = Array.from({ length: MAX_TURNOS_HISTORICO + 5 }, (_, i) => ({ pergunta: `p${i}`, resposta: `r${i}` }));
  const msgs = montarMensagens("agora", historico);
  assert.equal(msgs.length, MAX_TURNOS_HISTORICO * 2 + 1);
  assert.equal(msgs[0]!.content, "p5");
});

test("hojeEmDourados usa o fuso de Campo Grande, não o UTC do servidor", () => {
  // 02:30 UTC de 21/10 ainda é 20/10 em Dourados (UTC−4).
  assert.equal(hojeEmDourados(new Date("2026-10-21T02:30:00Z")).data, "2026-10-20");
});
