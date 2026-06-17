import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { lancamentoCriarSchema } from "@hallaxos/shared";

// Interconexão dos módulos no financeiro (Sprint 9):
// - lançamento avulso pode vincular a operação OU manutenção (origem, mutuamente
//   exclusivas) e/ou a um ativo (classificação que coexiste — decisão #53);
// - o CHECK chk_lancamento_origem_unica continua barrando operação+manutenção
//   juntas no banco.
// Testes puros exercitam o contrato; os de integração (gated por DATABASE_URL)
// rodam o SQL real e provam o vínculo lançamento→ativo e a invariante do CHECK.

const base = {
  tipo: "despesa" as const,
  descricao: "IPVA 2026",
  categoria_id: crypto.randomUUID(),
  conta_id: crypto.randomUUID(),
  valor: 250,
  data_vencimento: "2026-07-10",
};

test("aceita vincular lançamento a um ativo (custo direto)", () => {
  const r = lancamentoCriarSchema.parse({ ...base, ativo_id: crypto.randomUUID() });
  assert.ok(r.ativo_id);
});

test("ativo coexiste com a origem operação (não são exclusivos)", () => {
  const r = lancamentoCriarSchema.parse({
    ...base, operacao_id: crypto.randomUUID(), ativo_id: crypto.randomUUID(),
  });
  assert.ok(r.operacao_id && r.ativo_id);
});

test("operação e manutenção juntas são rejeitadas no contrato (espelha o CHECK)", () => {
  assert.throws(
    () => lancamentoCriarSchema.parse({
      ...base, operacao_id: crypto.randomUUID(), manutencao_id: crypto.randomUUID(),
    }),
    /no máximo uma origem/
  );
});

const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("interconexão (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  const { criarConta, criarCategoriaFinanceira, criarLancamento } =
    await import("../services/financeiro");
  const { lancamentosDoAtivo } = await import("../services/ativos");
  const { resultadoPorAtivo } = await import("../services/relatorios");
  const { db, pool } = await import("../db/client");
  const { usuarios, ativos, ativoCategorias, pessoas, operacoes, manutencoes } =
    await import("../db/schema");
  const { sql } = await import("drizzle-orm");
  const { novoId } = await import("../lib/ids");

  const hoje = new Date().toISOString().slice(0, 10);
  let usuarioId = "", contaId = "", categoriaId = "", ativoId = "";

  before(async () => {
    usuarioId = novoId();
    await db.insert(usuarios).values({
      id: usuarioId, nome: "Teste Interconexão", email: `inter-${usuarioId}@t.com`,
      senhaHash: "x", papel: "admin",
    });
    contaId = (await criarConta(`Caixa Inter ${usuarioId}`, 0)).id;
    categoriaId = (await criarCategoriaFinanceira(`Despesa Inter ${usuarioId}`, "despesa")).id;
    const catAtivo = novoId();
    await db.insert(ativoCategorias).values({ id: catAtivo, nome: `Cat ${catAtivo}`, ehVeicular: true });
    ativoId = novoId();
    await db.insert(ativos).values({
      id: ativoId, codigo: `AT-T-${ativoId.slice(-8)}`, categoriaId: catAtivo,
      nome: "Caminhão Teste", valorAquisicao: "100000.00",
    });
  });

  after(async () => {
    await pool.end();
  });

  test("lançamento com ativo_id: persiste, aparece como custo direto e conta no resultado do ativo", async () => {
    const [lanc] = await criarLancamento(
      { tipo: "despesa", descricao: "IPVA do caminhão", categoria_id: categoriaId,
        conta_id: contaId, valor: 250, data_vencimento: hoje, parcelas: 1, pago: true,
        forma_pagamento: "pix", ativo_id: ativoId },
      usuarioId
    );
    assert.equal(lanc!.ativoId, ativoId, "ativo_id persistido");
    assert.equal(lanc!.operacaoId, null);
    assert.equal(lanc!.manutencaoId, null);

    // Navegação cruzada: aparece na lista do ativo, marcado como origem 'direto'.
    const vinculados = (await lancamentosDoAtivo(ativoId)) as Array<{ id: string; origem: string }>;
    const achado = vinculados.find((l) => l.id === lanc!.id);
    assert.ok(achado, "lançamento direto aparece na tela do ativo");
    assert.equal(achado!.origem, "direto");

    // E entra no resultado financeiro do ativo (despesa), via o novo join direto.
    const linhas = (await resultadoPorAtivo()) as unknown as Array<{ id: string; despesa: string }>;
    const doAtivo = linhas.find((a) => a.id === ativoId);
    assert.ok(doAtivo, "ativo aparece no resultado por ativo");
    assert.equal(Number(doAtivo!.despesa), 250, "custo direto do ativo entra na despesa");
  });

  test("CHECK chk_lancamento_origem_unica: operação + manutenção juntas são rejeitadas no banco", async () => {
    // Origem real para isolar o CHECK do FK: uma operação e uma manutenção válidas.
    const clienteId = novoId();
    await db.insert(pessoas).values({
      id: clienteId, tipo: "pf", nome: "Cliente Inter", cpfCnpj: `cpf-${clienteId}`,
    });
    const opId = novoId();
    await db.insert(operacoes).values({
      id: opId, codigo: `OP-T-${opId.slice(-8)}`, tipo: "venda", clienteId,
      responsavelId: usuarioId, status: "fechada",
    });
    const manId = novoId();
    await db.insert(manutencoes).values({
      id: manId, ativoId, tipo: "corretiva", status: "agendada", descricao: "Revisão",
    });
    await assert.rejects(
      () => db.execute(sql`
        INSERT INTO lancamentos (id, tipo, descricao, categoria_id, conta_id, operacao_id, manutencao_id, valor, data_vencimento)
        VALUES (${novoId()}, 'despesa', 'origem dupla', ${categoriaId}, ${contaId}, ${opId}, ${manId}, 10, ${hoje})`),
      (e: unknown) => {
        const err = e as { code?: string; message?: string };
        assert.ok(err.code === "23514" || /chk_lancamento_origem_unica/.test(err.message ?? ""),
          "deve violar o CHECK de origem única");
        return true;
      }
    );
  });
}
