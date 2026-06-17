import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS_LEITURA,
  FERRAMENTAS_PROPOSTA,
  ferramentasPara,
  executarFerramenta,
  perguntar,
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

// 1b. Fase 2: a ferramenta de proposta vive FORA da lista de leitura (o invariante
//     "leitura não muta" segue válido) e o copiloto continua NÃO escrevendo — ela
//     só monta uma proposta inerte que o humano confirma (decisão #43).
test("propor_lancamento existe como ferramenta de proposta, separada da leitura", () => {
  assert.ok(!FERRAMENTAS_LEITURA.some((f) => f.name === "propor_lancamento"), "propor não é leitura");
  assert.ok(FERRAMENTAS_PROPOSTA.some((f) => f.name === "propor_lancamento"), "propor é proposta");
});

test("ferramentasPara expõe propor_lancamento só a quem pode lançar", () => {
  const nomes = (papel: Parameters<typeof ferramentasPara>[0]) =>
    ferramentasPara(papel).map((f) => f.name);
  assert.ok(nomes("admin").includes("propor_lancamento"), "admin pode propor");
  assert.ok(nomes("financeiro").includes("propor_lancamento"), "financeiro pode propor");
  assert.ok(!nomes("operador").includes("propor_lancamento"), "operador não pode propor");
});

test("propor_lancamento devolve PROPOSTA e não escreve (decisão #43)", async () => {
  const r = await executarFerramenta(
    "propor_lancamento",
    { tipo: "despesa", descricao: "IPVA do caminhão", valor: 1200, data_vencimento: "2026-08-10" },
    "admin"
  );
  assert.ok(r.proposta, "deve devolver uma proposta");
  assert.equal(r.proposta!.acao, "criar_lancamento");
  assert.equal(r.proposta!.endpoint, "POST /lancamentos");
  assert.equal(r.proposta!.payload.tipo, "despesa");
  // O tool_result diz ao modelo que nada foi criado — só proposto.
  const corpo = JSON.parse(r.conteudo) as { proposta_registrada?: boolean };
  assert.equal(corpo.proposta_registrada, true);
});

test("propor_lancamento nega o operador (não pode lançar)", async () => {
  const r = await executarFerramenta("propor_lancamento", { tipo: "despesa", descricao: "x", valor: 10 }, "operador");
  assert.equal((JSON.parse(r.conteudo) as { sem_permissao?: boolean }).sem_permissao, true);
  assert.equal(r.proposta, undefined);
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

  // Invariante central da Fase 2: propor NÃO escreve. Contamos os lançamentos
  // antes e depois — propor_lancamento não pode criar nenhuma linha (decisão #43).
  test("propor_lancamento não cria nada no banco (só confirmação humana escreve)", async () => {
    const { db } = await import("../db/client");
    const { sql } = await import("drizzle-orm");
    const contar = async () =>
      Number((await db.execute(sql`SELECT count(*)::int AS n FROM lancamentos`)).rows[0]!.n);
    const antes = await contar();
    const r = await executarFerramenta(
      "propor_lancamento",
      { tipo: "despesa", descricao: "Proposta sem efeito", valor: 99.9 },
      "admin"
    );
    assert.ok(r.proposta, "devolve proposta");
    assert.equal(await contar(), antes, "nenhum lançamento criado pela proposta");
  });
}
