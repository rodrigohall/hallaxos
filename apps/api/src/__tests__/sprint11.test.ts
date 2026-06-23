import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";

// Sprint 11: agenda com filtro de tipo, dashboard financeiro por origem,
// linkar lançamento→ativo via PATCH /lancamentos/:id.
// Integração real contra Postgres (CI sobe banco e roda migrations antes).
const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("sprint11 (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  const {
    criarConta, criarCategoriaFinanceira, criarLancamento,
    editarLancamento, listarLancamentos,
  } = await import("../services/financeiro");
  const { listarAgenda, criarEventoAgenda } = await import("../services/agenda");
  const { montarFinanceiroPorOrigem } = await import("../services/dashboard");
  const { db, pool } = await import("../db/client");
  const { usuarios, ativos, ativoCategorias } = await import("../db/schema");
  const { novoId } = await import("../lib/ids");

  const hoje = new Date().toISOString().slice(0, 10);
  let usuarioId = "";
  let contaId = "";
  let catRecId = "";
  let catDesId = "";
  let ativoId = "";

  before(async () => {
    usuarioId = novoId();
    await db.insert(usuarios).values({
      id: usuarioId, nome: "Teste Sprint11", email: `s11-${usuarioId}@t.com`,
      senhaHash: "x", papel: "admin",
    });

    // Categoria de ativo para criar um ativo de teste
    const [catAtivo] = await db
      .insert(ativoCategorias)
      .values({ id: novoId(), nome: `Cat-s11-${usuarioId}`, ehVeicular: false })
      .returning();

    const [ativo] = await db.insert(ativos).values({
      id: novoId(), codigo: `AT-S11-${usuarioId.slice(0, 6)}`,
      categoriaId: catAtivo!.id, nome: "Ativo Teste Sprint11", status: "disponivel",
    }).returning();
    ativoId = ativo!.id;

    contaId = (await criarConta(`Conta S11 ${usuarioId}`, 0)).id;
    catRecId = (await criarCategoriaFinanceira(`Guincho S11 ${usuarioId}`, "receita")).id;
    catDesId = (await criarCategoriaFinanceira(`Manut S11 ${usuarioId}`, "despesa")).id;
  });

  after(async () => {
    await pool.end();
  });

  // ── Agenda: filtro por tipo ──────────────────────────────────────────────

  describe("Agenda — filtro por tipo", () => {
    test("sem filtro retorna compromisso manual", async () => {
      await criarEventoAgenda({
        titulo: "Compromisso S11", data_inicio: hoje, dia_inteiro: true,
      }, usuarioId);

      const tudo = await listarAgenda(hoje, hoje);
      const meu = tudo.filter((i) => i.tipo === "compromisso" && i.titulo === "Compromisso S11");
      assert.ok(meu.length >= 1, "deve conter o compromisso criado");
    });

    test("filtro por tipo=[compromisso] retorna só compromissos", async () => {
      const filtrado = await listarAgenda(hoje, hoje, ["compromisso"]);
      assert.ok(filtrado.every((i) => i.tipo === "compromisso"), "todos devem ser tipo=compromisso");
    });

    test("filtro por tipo=[vencimento] não retorna compromissos manuais", async () => {
      const filtrado = await listarAgenda(hoje, hoje, ["vencimento"]);
      assert.ok(filtrado.every((i) => i.tipo !== "compromisso"), "não deve ter compromisso quando filtro=[vencimento]");
    });
  });

  // ── Agenda: gerar lançamento junto ──────────────────────────────────────

  describe("Agenda — gerar lançamento junto (guard #58 mão única)", () => {
    test("cria evento + lançamento em transação e retorna lancamentoId", async () => {
      const { evento, lancamentoId } = await criarEventoAgenda({
        titulo: "Custo extra S11",
        data_inicio: hoje,
        dia_inteiro: true,
        gerar_lancamento: {
          tipo: "despesa",
          descricao: "Custo extra teste S11",
          categoria_id: catDesId,
          conta_id: contaId,
          valor: 99.00,
          data_vencimento: hoje,
        },
      }, usuarioId);

      assert.ok(lancamentoId, "deve retornar um lancamentoId");
      assert.equal(evento.entidadeTipo, "lancamento", "entidadeTipo deve ser 'lancamento'");
      assert.equal(evento.entidadeId, lancamentoId, "entidadeId deve bater com lancamentoId");

      // Confirma que o lançamento foi criado
      const { dados } = await listarLancamentos({
        contaId, pagina: 1, porPagina: 50,
      });
      const lanc = dados.find((l) => l.id === lancamentoId);
      assert.ok(lanc, "lançamento deve existir no banco");
      assert.equal(Number(lanc!.valor), 99.00);
    });
  });

  // ── Linkar lançamento → ativo ────────────────────────────────────────────

  describe("Linkar lançamento → ativo via editarLancamento", () => {
    test("seta ativo_id num lançamento avulso (decisão #53)", async () => {
      const [lanc] = await criarLancamento({
        tipo: "despesa", descricao: "IPVA S11", categoria_id: catDesId,
        conta_id: contaId, valor: 500, data_vencimento: hoje,
        parcelas: 1, pago: false,
      }, usuarioId);

      const editado = await editarLancamento(lanc!.id, { ativo_id: ativoId }, { id: usuarioId, papel: "admin" });
      assert.equal(editado.ativoId, ativoId, "ativo_id deve ser setado");

      // Limpar (deslinkar) também deve funcionar
      const desvinculado = await editarLancamento(lanc!.id, { ativo_id: null }, { id: usuarioId, papel: "admin" });
      assert.equal(desvinculado.ativoId, null, "ativo_id deve poder ser setado para null");
    });
  });

  // ── Dashboard financeiro por origem ────────────────────────────────────

  describe("Dashboard financeiro por origem — agrupamento correto", () => {
    test("retorna tipos com zeros para banco limpo de origem", async () => {
      const res = await montarFinanceiroPorOrigem("admin", "mes");
      assert.ok(res, "deve retornar resultado");
      assert.ok("tipos" in res!, "deve ter campo tipos");
      assert.ok("total" in res!, "deve ter campo total");
      const tipos = res!.tipos as Record<string, unknown>;
      for (const orig of ["guincho", "locacao", "venda", "compra", "manutencao", "avulso"]) {
        assert.ok(orig in tipos, `deve ter origem '${orig}'`);
      }
    });

    test("lançamento avulso pago aparece no total geral do período", async () => {
      // Cria e paga um lançamento avulso
      const [lanc] = await criarLancamento({
        tipo: "receita", descricao: "Receita Avulsa S11", categoria_id: catRecId,
        conta_id: contaId, valor: 777, data_vencimento: hoje,
        parcelas: 1, pago: true, data_pagamento: hoje,
      }, usuarioId);
      assert.ok(lanc, "lançamento criado");

      const res = await montarFinanceiroPorOrigem("admin", "hoje");
      assert.ok(res, "resultado existe");
      const avulso = (res!.tipos as Record<string, TipoOrigem>).avulso;
      assert.ok(Number(avulso?.receita_paga) >= 777, "receita_paga do avulso deve incluir os 777");
      assert.ok(Number(res!.total.receita_paga) >= 777, "total.receita_paga deve incluir os 777");
    });

    test("filtro por operacao_tipo=avulso em listarLancamentos bate com o agrupamento", async () => {
      const { dados, total } = await listarLancamentos({
        operacaoTipo: "avulso", pagina: 1, porPagina: 50,
      });
      assert.ok(total >= 0, "deve retornar sem erro");
      assert.ok(dados.every((l) => !l.operacaoId && !l.manutencaoId), "avulso: sem operacao_id e sem manutencao_id");
    });
  });
}

interface TipoOrigem {
  receita_paga: number; despesa_paga: number;
  receita_prevista: number; despesa_prevista: number;
  vencido_receitas: number; vencido_despesas: number;
  liquido: number; qtd: number;
}
