import { test, after } from "node:test";
import assert from "node:assert/strict";
import { BUSCA_INDICE_VERSAO, entradaManutencao } from "../db/reindexar";
import { pool } from "../db/client";

// Sprint 16: manutenções passaram a entrar no índice e a reindexação virou
// automática (versionada em meta_sistema). Estes testes guardam as duas coisas.

after(async () => {
  await pool.end();
});

test("entradaManutencao indexa o que a busca precisa achar", () => {
  const e = entradaManutencao({
    id: "m1",
    descricao: "Troca de embreagem",
    tipo: "corretiva",
    status: "em_andamento",
    ativo: "Caminhão guincho",
    ativo_codigo: "AT-0003",
    placa: "KAB1234",
  });
  assert.equal(e.entidadeTipo, "manutencao");
  assert.equal(e.titulo, "Troca de embreagem");
  // Achar a manutenção pela placa ou pelo código do ativo é o caso de uso real.
  assert.ok(e.termos.includes("KAB1234"), "placa entra nos termos");
  assert.ok(e.termos.includes("AT-0003"), "código do ativo entra nos termos");
  assert.ok(e.termosNumericos?.includes("KAB1234"), "placa entra nos numéricos");
});

test("entradaManutencao aguenta ativo sem veículo", () => {
  const e = entradaManutencao({
    id: "m2", descricao: "Revisão", tipo: "preventiva", status: "agendada",
    ativo: "Compressor", ativo_codigo: "AT-0010", placa: null,
  });
  assert.ok(e.subtitulo.includes("AT-0010"));
  assert.ok(!e.subtitulo.endsWith(" "), "subtítulo não fica com sobra de espaço");
});

test("a versão do índice é um inteiro positivo (gatilho da reindexação)", () => {
  assert.ok(Number.isInteger(BUSCA_INDICE_VERSAO) && BUSCA_INDICE_VERSAO > 0);
});

// Integração: com banco, o arranque reindexa uma vez e nas próximas não faz nada.
const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("garantirIndiceBusca (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  test("garantirIndiceBusca reindexa uma vez e depois é early-return", async () => {
    const { garantirIndiceBusca } = await import("../db/bootstrap");
    const { db } = await import("../db/client");
    const { sql } = await import("drizzle-orm");

    // Estado inicial desconhecido (o banco de CI pode já ter rodado): força a
    // primeira execução apagando a marca de versão.
    await db.execute(sql`DELETE FROM meta_sistema WHERE chave = 'busca_indice_versao'`);
    await garantirIndiceBusca();

    const versao = async () =>
      (await db.execute(sql`SELECT valor FROM meta_sistema WHERE chave = 'busca_indice_versao'`))
        .rows[0] as { valor: string } | undefined;

    assert.equal((await versao())?.valor, String(BUSCA_INDICE_VERSAO), "gravou a versão");

    // Segunda chamada não deve mexer no índice — marcamos a hora para conferir.
    const antes = (await db.execute(sql`SELECT max(atualizado_em) AS t FROM busca_indice`))
      .rows[0] as { t: string | null };
    await garantirIndiceBusca();
    const depois = (await db.execute(sql`SELECT max(atualizado_em) AS t FROM busca_indice`))
      .rows[0] as { t: string | null };
    assert.deepEqual(depois.t, antes.t, "segunda chamada não reindexou");
  });

  test("reindexarTudo roda em transação e devolve o resumo com manutenções", async () => {
    const { reindexarTudo } = await import("../db/reindexar");
    const r = await reindexarTudo();
    for (const chave of ["pessoas", "ativos", "operacoes", "documentos", "lancamentos", "manutencoes"] as const) {
      assert.equal(typeof r[chave], "number", `${chave} veio no resumo`);
    }
  });
}
