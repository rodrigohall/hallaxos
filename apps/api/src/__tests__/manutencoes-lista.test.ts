import { test, after } from "node:test";
import assert from "node:assert/strict";

// Regressão da aba de Manutenções: a lista (`listarManutencoes`) montava o WHERE
// interpolando um fragmento do Drizzle numa query crua que aliasa a tabela como
// `m`. O Drizzle renderiza `"manutencoes"."deleted_at"` e o Postgres rejeita a
// referência depois do alias — a aba quebrava 100% das vezes, mas typecheck,
// build e os testes puros não pegavam (a query só estoura em runtime, contra um
// banco de verdade). Este teste exige um Postgres com schema aplicado: o job
// `verificar` da CI sobe um `postgres:16` e roda `pnpm db:migrate` antes.
//
// Sem DATABASE_URL (rodada local da suíte pura), é pulado.
const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("lista de manutenções (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  // Import dinâmico: só toca o pool de conexão quando há banco configurado.
  const { listarManutencoes } = await import("../services/manutencoes");
  const { listarPessoas } = await import("../services/pessoas");
  const { pool } = await import("../db/client");

  after(async () => {
    await pool.end();
  });

  // Cada combinação de filtro exercita um ramo do WHERE cru. O bug derrubava
  // todas elas; mesmo com o banco vazio, a query inválida lançaria o erro de
  // referência ao FROM antes de olhar dado nenhum.
  for (const opts of [
    {},
    { status: "agendada" as const },
    { tipo: "preventiva" },
    { ativoId: crypto.randomUUID() },
    { busca: "revisão" },
  ]) {
    test(`listarManutencoes não quebra com filtro ${JSON.stringify(opts)}`, async () => {
      const r = await listarManutencoes({ pagina: 1, porPagina: 50, ...(opts as object) });
      assert.ok(Array.isArray(r.dados), "dados deve ser uma lista");
      assert.equal(typeof r.total, "number", "total deve ser numérico");
    });
  }

  // O autocomplete de oficina na manutenção depende deste contrato (?papel=).
  test("listarPessoas com papel=oficina filtra no SQL sem quebrar", async () => {
    const r = await listarPessoas({ papel: "oficina", busca: "auto", pagina: 1, porPagina: 8 });
    assert.ok(Array.isArray(r.dados));
    assert.equal(typeof r.total, "number");
  });
}
