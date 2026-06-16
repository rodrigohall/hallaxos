import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  FERRAMENTAS_LEITURA,
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
}
