import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Anulação de lançamento lançado errado (item 2b): o valor deve sair de TODOS
// os indicadores (saldo derivado, dashboard, DRE) na hora, sem contrapartida, e
// preservando a linha + o vínculo de origem (rastreabilidade origem→lançamento).
// Integração: precisa de um Postgres com schema (a CI sobe um e roda migrate).
const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("anular lançamento (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  const { anularLancamento, criarConta, criarCategoriaFinanceira, criarLancamento, listarContas } =
    await import("../services/financeiro");
  const { montarFinanceiro } = await import("../services/dashboard");
  const { db, pool } = await import("../db/client");
  const { usuarios, lancamentos, pessoas, operacoes } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { novoId } = await import("../lib/ids");

  const hoje = new Date().toISOString().slice(0, 10);
  let usuarioId = "";
  let contaId = "";
  let categoriaId = "";

  before(async () => {
    usuarioId = novoId();
    await db.insert(usuarios).values({
      id: usuarioId, nome: "Teste Anular", email: `anular-${usuarioId}@t.com`,
      senhaHash: "x", papel: "admin",
    });
    const conta = await criarConta(`Caixa Teste ${usuarioId}`, 0);
    contaId = conta.id;
    const cat = await criarCategoriaFinanceira(`Receita Teste ${usuarioId}`, "receita");
    categoriaId = cat.id;
  });

  after(async () => {
    await pool.end();
  });

  async function saldoConta() {
    const contas = (await listarContas()) as Array<{ id: string; saldo: string }>;
    return Number(contas.find((c) => c.id === contaId)!.saldo);
  }

  test("anular receita paga tira o valor do saldo e do dashboard", async () => {
    const saldoAntes = await saldoConta();
    const finAntes = (await montarFinanceiro("admin", "hoje", 7)) as { receitas: string };
    const receitasAntes = Number(finAntes.receitas);

    const [lanc] = await criarLancamento(
      { tipo: "receita", descricao: "Receita lançada errada", categoria_id: categoriaId,
        conta_id: contaId, valor: 500, data_vencimento: hoje, parcelas: 1, pago: true,
        forma_pagamento: "pix" },
      usuarioId
    );

    // Conta no saldo e no dashboard enquanto está paga.
    assert.equal(await saldoConta(), saldoAntes + 500, "receita paga deve entrar no saldo");
    const finMeio = (await montarFinanceiro("admin", "hoje", 7)) as { receitas: string };
    assert.equal(Number(finMeio.receitas), receitasAntes + 500);

    // Anula: sai dos indicadores, sem contrapartida.
    await anularLancamento(lanc!.id, "valor digitado por engano", usuarioId);

    assert.equal(await saldoConta(), saldoAntes, "após anular, saldo volta ao anterior");
    const finDepois = (await montarFinanceiro("admin", "hoje", 7)) as { receitas: string };
    assert.equal(Number(finDepois.receitas), receitasAntes, "some do dashboard");

    // Sem contrapartida: nenhum lançamento de estorno foi criado.
    const todos = await db.select().from(lancamentos).where(eq(lancamentos.contaId, contaId));
    assert.equal(todos.length, 1, "não cria contrapartida — só o original anulado");
    assert.equal(todos[0]!.status, "cancelado");
  });

  test("anular preserva a linha e o vínculo de origem (operação)", async () => {
    // Operação real para o FK valer: pessoa (cliente) + operação.
    const clienteId = novoId();
    await db.insert(pessoas).values({
      id: clienteId, tipo: "pf", nome: "Cliente Teste", cpfCnpj: `cpf-${clienteId}`,
    });
    const opId = novoId();
    await db.insert(operacoes).values({
      id: opId, codigo: `OP-T-${opId.slice(-8)}`, tipo: "venda", clienteId,
      responsavelId: usuarioId, status: "fechada", valorTotal: "300.00",
    });
    const id = novoId();
    // Lançamento gerado pela operação: o vínculo deve sobreviver à anulação.
    await db.insert(lancamentos).values({
      id, tipo: "receita", descricao: "Receita com origem", categoriaId, contaId,
      operacaoId: opId, valor: "300.00", dataVencimento: hoje, status: "previsto",
    });
    await anularLancamento(id, "operação cadastrada errada", usuarioId);
    const [depois] = await db.select().from(lancamentos).where(eq(lancamentos.id, id));
    assert.equal(depois!.status, "cancelado");
    assert.equal(depois!.operacaoId, opId, "vínculo origem→lançamento preservado");
  });
}
