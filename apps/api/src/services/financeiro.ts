// Financeiro: todo dinheiro tem origem; agregados sempre derivados (doc 03).
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  LancamentoCriarInput, LancamentoEditarInput, LancamentoPagarInput,
} from "@hallaxos/shared";
import { db } from "../db/client";
import { lancamentos, contas, categoriasFinanceiras, pessoas } from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado, regraNegocio, semPermissao } from "../lib/erros";
import { diff, registrarEvento } from "./timeline";
import { indexar } from "./busca";

type Lancamento = typeof lancamentos.$inferSelect;

async function indexarLancamento(conn: typeof db, l: Lancamento) {
  await indexar(conn, {
    entidadeTipo: "lancamento",
    entidadeId: l.id,
    titulo: l.descricao,
    subtitulo: `Lançamento · ${l.tipo} · ${l.status}`,
    termos: [l.descricao, l.tipo],
  });
}

export async function listarLancamentos(opts: {
  tipo?: string; status?: string; categoriaId?: string; contaId?: string;
  pessoaId?: string; busca?: string; operacaoTipo?: string; pagina: number; porPagina: number;
  de?: string; ate?: string;
}) {
  const filtros = [isNull(lancamentos.deletedAt)];
  if (opts.tipo) filtros.push(eq(lancamentos.tipo, opts.tipo as never));
  if (opts.status === "vencido") {
    filtros.push(eq(lancamentos.status, "previsto"), sql`${lancamentos.dataVencimento} < current_date`);
  } else if (opts.status) {
    filtros.push(eq(lancamentos.status, opts.status as never));
  }
  if (opts.categoriaId) filtros.push(eq(lancamentos.categoriaId, opts.categoriaId));
  if (opts.contaId) filtros.push(eq(lancamentos.contaId, opts.contaId));
  if (opts.pessoaId) filtros.push(eq(lancamentos.pessoaId, opts.pessoaId));
  if (opts.busca) filtros.push(sql`unaccent(${lancamentos.descricao}) ILIKE unaccent(${"%" + opts.busca + "%"})`);
  // Filtro por data (pago usa data_pagamento; previsto usa data_vencimento).
  if (opts.de && opts.ate) {
    filtros.push(
      sql`COALESCE(${lancamentos.dataPagamento}, ${lancamentos.dataVencimento}) BETWEEN ${opts.de} AND ${opts.ate}`
    );
  }
  // Filtro por origem/tipo — para drill-down do dashboard financeiro.
  if (opts.operacaoTipo === "manutencao") {
    filtros.push(sql`${lancamentos.manutencaoId} IS NOT NULL`);
  } else if (opts.operacaoTipo === "avulso") {
    filtros.push(sql`${lancamentos.operacaoId} IS NULL AND ${lancamentos.manutencaoId} IS NULL`);
  } else if (opts.operacaoTipo) {
    filtros.push(sql`${lancamentos.operacaoId} IN (SELECT id FROM operacoes WHERE tipo = ${opts.operacaoTipo} AND deleted_at IS NULL)`);
  }
  const where = and(...filtros);

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(lancamentos)
    .where(where)) as [{ total: number }];

  const linhas = await db
    .select({
      l: lancamentos,
      categoria: categoriasFinanceiras.nome,
      conta: contas.nome,
      pessoa: pessoas.nome,
    })
    .from(lancamentos)
    .innerJoin(categoriasFinanceiras, eq(categoriasFinanceiras.id, lancamentos.categoriaId))
    .innerJoin(contas, eq(contas.id, lancamentos.contaId))
    .leftJoin(pessoas, eq(pessoas.id, lancamentos.pessoaId))
    .where(where)
    .orderBy(desc(lancamentos.dataVencimento), desc(lancamentos.createdAt))
    .limit(opts.porPagina)
    .offset((opts.pagina - 1) * opts.porPagina);

  const hoje = new Date().toISOString().slice(0, 10);
  return {
    dados: linhas.map(({ l, categoria, conta, pessoa }) => ({
      ...l, categoria, conta, pessoa,
      // "vencido" é sempre derivado, nunca gravado (doc 02)
      vencido: l.status === "previsto" && l.dataVencimento < hoje,
      temOrigem: !!(l.operacaoId || l.manutencaoId),
    })),
    total,
  };
}

/** Lançamento avulso; com parcelas > 1 gera o grupo com vencimentos mensais. */
export async function criarLancamento(input: LancamentoCriarInput, usuarioId: string) {
  const totalCentavos = Math.round(input.valor * 100);
  const n = input.parcelas;
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  const grupoId = n > 1 ? novoId() : null;
  const primeiroVencimento = new Date(input.data_vencimento + "T12:00:00Z");
  if (input.pago && n > 1) throw regraNegocio("Lançamento parcelado não pode nascer pago.");

  return db.transaction(async (tx) => {
    const criados: Lancamento[] = [];
    for (let i = 0; i < n; i++) {
      const venc = new Date(primeiroVencimento);
      venc.setUTCMonth(venc.getUTCMonth() + i);
      const id = novoId();
      const [linha] = await tx
        .insert(lancamentos)
        .values({
          id,
          tipo: input.tipo,
          descricao: n > 1 ? `${input.descricao} (${i + 1}/${n})` : input.descricao,
          categoriaId: input.categoria_id,
          contaId: input.conta_id,
          pessoaId: input.pessoa_id ?? null,
          // Interconexão: vínculo opcional a operação/manutenção (origem) e/ou
          // ativo (classificação). O CHECK de origem única e o refine do schema
          // garantem que operação e manutenção não coexistem.
          operacaoId: input.operacao_id ?? null,
          manutencaoId: input.manutencao_id ?? null,
          ativoId: input.ativo_id ?? null,
          valor: ((base + (i === 0 ? resto : 0)) / 100).toFixed(2),
          dataVencimento: venc.toISOString().slice(0, 10),
          // Retroativo: quando pago, usa a data de pagamento informada (ou o vencimento).
          dataPagamento: input.pago ? (input.data_pagamento ?? input.data_vencimento) : null,
          status: input.pago ? "pago" : "previsto",
          formaPagamento: input.pago ? (input.forma_pagamento ?? null) : null,
          parcelaNumero: n > 1 ? i + 1 : null,
          parcelaTotal: n > 1 ? n : null,
          grupoParcelasId: grupoId,
        })
        .returning();
      criados.push(linha!);
      await registrarEvento(tx, {
        entidadeTipo: "lancamento",
        entidadeId: id,
        evento: "criado",
        descricao: `Lançamento ${linha!.descricao} criado (${input.tipo})`,
        usuarioId,
      });
      await indexarLancamento(tx as never, linha!);
    }
    return criados;
  });
}

async function obter(id: string) {
  const [l] = await db
    .select()
    .from(lancamentos)
    .where(and(eq(lancamentos.id, id), isNull(lancamentos.deletedAt)));
  if (!l) throw naoEncontrado("Lançamento");
  return l;
}

export async function editarLancamento(
  id: string, input: LancamentoEditarInput, usuario: { id: string; papel: string }
) {
  const atual = await obter(id);
  // Anulado/cancelado é estado terminal — não se edita (use os fluxos próprios).
  if (atual.status === "cancelado") throw regraNegocio("Lançamento cancelado/anulado não pode ser editado.");
  // Editar um lançamento JÁ PAGO reescreve indicadores: reservado ao admin (decisão #48).
  if (atual.status === "pago" && usuario.papel !== "admin") {
    throw semPermissao();
  }
  // Lançamento gerado por operação/manutenção é editável aqui (decisão #48): o
  // vínculo de origem (operacao_id/manutencao_id) é preservado e a mudança vai
  // para a timeline. Relaxa a antiga trava da regra 5 do doc 03.
  const mudancas: Record<string, unknown> = {};
  if (input.descricao) mudancas.descricao = input.descricao;
  if (input.categoria_id) mudancas.categoriaId = input.categoria_id;
  if (input.conta_id) mudancas.contaId = input.conta_id;
  if (input.pessoa_id !== undefined) mudancas.pessoaId = input.pessoa_id;
  if (input.valor !== undefined) mudancas.valor = input.valor.toFixed(2);
  if (input.data_vencimento) mudancas.dataVencimento = input.data_vencimento;
  if (input.forma_pagamento !== undefined) mudancas.formaPagamento = input.forma_pagamento;
  // Linkar ao ativo (classificação que coexiste, decisão #53): setar ativo_id em
  // qualquer lançamento — mesmo que já tenha operacao_id/manutencao_id.
  if (input.ativo_id !== undefined) mudancas.ativoId = input.ativo_id;
  // Invariante chk_lancamento_pago_com_data (pago ⇔ data_pagamento): a data de
  // pagamento só se aplica a um lançamento pago, e não pode ficar nula nele.
  if (input.data_pagamento !== undefined) {
    if (atual.status !== "pago") {
      throw regraNegocio("Data de pagamento só vale para lançamento já pago.");
    }
    mudancas.dataPagamento = input.data_pagamento;
  }

  return db.transaction(async (tx) => {
    const [editado] = await tx.update(lancamentos).set(mudancas).where(eq(lancamentos.id, id)).returning();
    const mudou = diff(atual as never, editado as never);
    delete mudou.updatedAt;
    if (Object.keys(mudou).length) {
      await registrarEvento(tx, {
        entidadeTipo: "lancamento", entidadeId: id, evento: "atualizado",
        descricao: `Lançamento ${editado!.descricao} atualizado`, dados: mudou, usuarioId: usuario.id,
      });
    }
    await indexarLancamento(tx as never, editado!);
    return editado!;
  });
}

export async function pagarLancamento(id: string, input: LancamentoPagarInput, usuarioId: string) {
  const atual = await obter(id);
  if (atual.status !== "previsto") throw conflito("Este lançamento não está em aberto.");
  return db.transaction(async (tx) => {
    const [pago] = await tx
      .update(lancamentos)
      .set({
        status: "pago",
        dataPagamento: input.data_pagamento,
        formaPagamento: input.forma_pagamento,
        ...(input.conta_id ? { contaId: input.conta_id } : {}),
      })
      .where(eq(lancamentos.id, id))
      .returning();
    await registrarEvento(tx, {
      entidadeTipo: "lancamento", entidadeId: id, evento: "status_alterado",
      descricao: `Lançamento ${pago!.descricao} pago (${input.forma_pagamento})`, usuarioId,
    });
    await indexarLancamento(tx as never, pago!);
    return pago!;
  });
}

export async function vincularLancamentos(dryRun: boolean, usuarioId: string) {
  // Unlinked lancamentos com exatamente UMA operação candidata (pessoa + janela de 7 dias).
  const resOp = await db.execute(sql`
    WITH contagem AS (
      SELECT l.id AS lancamento_id, l.descricao, l.valor::numeric AS valor,
             o.id AS operacao_id, o.codigo,
             COUNT(*) OVER (PARTITION BY l.id) AS n
      FROM lancamentos l
      JOIN operacoes o
        ON o.cliente_id = l.pessoa_id AND o.deleted_at IS NULL
        AND l.created_at::date
            BETWEEN (o.created_at::date - INTERVAL '1 day')
                AND (o.created_at::date + INTERVAL '7 days')
      WHERE l.operacao_id IS NULL AND l.manutencao_id IS NULL
        AND l.deleted_at IS NULL AND l.pessoa_id IS NOT NULL
    )
    SELECT lancamento_id, descricao, valor, operacao_id, codigo FROM contagem WHERE n = 1
  `);
  type RowOp = { lancamento_id: string; descricao: string; valor: string; operacao_id: string; codigo: string };
  const vincularOp = resOp.rows as RowOp[];
  const jaOp = new Set(vincularOp.map((r) => r.lancamento_id));

  // Unlinked lancamentos com exatamente UMA manutenção candidata — excluindo os já resolvidos por operação.
  const resMan = await db.execute(sql`
    WITH contagem AS (
      SELECT l.id AS lancamento_id, l.descricao, l.valor::numeric AS valor,
             m.id AS manutencao_id,
             COUNT(*) OVER (PARTITION BY l.id) AS n
      FROM lancamentos l
      JOIN manutencoes m
        ON m.fornecedor_id = l.pessoa_id AND m.deleted_at IS NULL
        AND l.created_at::date
            BETWEEN (m.created_at::date - INTERVAL '1 day')
                AND (m.created_at::date + INTERVAL '7 days')
      WHERE l.operacao_id IS NULL AND l.manutencao_id IS NULL
        AND l.deleted_at IS NULL AND l.pessoa_id IS NOT NULL
    )
    SELECT lancamento_id, descricao, valor, manutencao_id FROM contagem WHERE n = 1
  `);
  type RowMan = { lancamento_id: string; descricao: string; valor: string; manutencao_id: string };
  const vincularMan = (resMan.rows as RowMan[]).filter((r) => !jaOp.has(r.lancamento_id));

  if (dryRun) {
    return {
      dry_run: true,
      operacoes: vincularOp.map((r) => ({ lancamento_id: r.lancamento_id, descricao: r.descricao, valor: r.valor, operacao_codigo: r.codigo })),
      manutencoes: vincularMan.map((r) => ({ lancamento_id: r.lancamento_id, descricao: r.descricao, valor: r.valor })),
      total: vincularOp.length + vincularMan.length,
    };
  }

  await db.transaction(async (tx) => {
    for (const r of vincularOp) {
      await tx.update(lancamentos).set({ operacaoId: r.operacao_id }).where(eq(lancamentos.id, r.lancamento_id));
      await registrarEvento(tx, {
        entidadeTipo: "lancamento", entidadeId: r.lancamento_id, evento: "atualizado",
        descricao: `Vinculado automaticamente à operação ${r.codigo}`, usuarioId,
      });
    }
    for (const r of vincularMan) {
      await tx.update(lancamentos).set({ manutencaoId: r.manutencao_id }).where(eq(lancamentos.id, r.lancamento_id));
      await registrarEvento(tx, {
        entidadeTipo: "lancamento", entidadeId: r.lancamento_id, evento: "atualizado",
        descricao: "Vinculado automaticamente a manutenção", usuarioId,
      });
    }
  });

  return {
    dry_run: false,
    operacoes: vincularOp.length,
    manutencoes: vincularMan.length,
    total: vincularOp.length + vincularMan.length,
  };
}

export async function pagarLancamentosLote(
  ids: string[],
  input: LancamentoPagarInput,
  usuarioId: string,
): Promise<{ ok: number; falhas: Array<{ id: string; erro: string }> }> {
  let ok = 0;
  const falhas: Array<{ id: string; erro: string }> = [];
  for (const id of ids) {
    try {
      await pagarLancamento(id, input, usuarioId);
      ok++;
    } catch (e) {
      falhas.push({ id, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok, falhas };
}

export async function cancelarLancamento(id: string, motivo: string, usuarioId: string) {
  const atual = await obter(id);
  if (atual.status !== "previsto") throw conflito("Só lançamentos previstos podem ser cancelados — use estorno para pagos.");
  return db.transaction(async (tx) => {
    const [cancelado] = await tx
      .update(lancamentos).set({ status: "cancelado" }).where(eq(lancamentos.id, id)).returning();
    await registrarEvento(tx, {
      entidadeTipo: "lancamento", entidadeId: id, evento: "status_alterado",
      descricao: `Lançamento cancelado: ${motivo}`, usuarioId,
    });
    await indexarLancamento(tx as never, cancelado!);
    return cancelado!;
  });
}

/**
 * Anulação: para lançamento **lançado errado** (ex.: receita digitada por
 * engano). Diferente do estorno — não houve dinheiro real para reverter, então
 * NÃO gera contrapartida; apenas marca `cancelado`. Como dashboard, DRE,
 * resultado por ativo e saldo de conta só somam `pago`/`previsto`, o valor
 * deixa de impactar todos os indicadores na hora, sem recálculo.
 *
 * A linha permanece (não é hard delete) e o vínculo de origem
 * (`operacao_id`/`manutencao_id`) é preservado: a rastreabilidade origem →
 * lançamento continua íntegra (vê-se que a operação gerou, que foi anulado e
 * por quê). Reservado ao `admin` (doc 05) — anular um pago reescreve indicadores.
 */
export async function anularLancamento(id: string, motivo: string, usuarioId: string) {
  const atual = await obter(id);
  if (atual.status === "cancelado") throw conflito("Este lançamento já está anulado.");
  return db.transaction(async (tx) => {
    const [anulado] = await tx
      .update(lancamentos)
      // Limpa data_pagamento: o invariante chk_lancamento_pago_com_data exige
      // data ⇔ pago. Um lançamento anulado (erro) não é um pagamento real.
      .set({ status: "cancelado", dataPagamento: null })
      .where(eq(lancamentos.id, id))
      .returning();
    await registrarEvento(tx, {
      entidadeTipo: "lancamento", entidadeId: id, evento: "status_alterado",
      descricao: `Lançamento anulado (lançado errado): ${motivo}`, usuarioId,
    });
    await indexarLancamento(tx as never, anulado!);
    return anulado!;
  });
}

/** Estorno: dinheiro pago nunca some — gera contrapartida (doc 03 regra 6). */
export async function estornarLancamento(id: string, motivo: string, usuarioId: string) {
  const atual = await obter(id);
  if (atual.status !== "pago") throw conflito("Só lançamentos pagos podem ser estornados.");
  const hoje = new Date().toISOString().slice(0, 10);
  return db.transaction(async (tx) => {
    const estornoId = novoId();
    const [estorno] = await tx
      .insert(lancamentos)
      .values({
        id: estornoId,
        tipo: atual.tipo === "receita" ? "despesa" : "receita",
        descricao: `Estorno: ${atual.descricao}`,
        categoriaId: atual.categoriaId,
        contaId: atual.contaId,
        pessoaId: atual.pessoaId,
        valor: atual.valor,
        dataVencimento: hoje,
        dataPagamento: hoje,
        status: "pago",
        formaPagamento: atual.formaPagamento,
      })
      .returning();
    for (const [entidadeId, descricao] of [
      [id, `Estornado: ${motivo}`],
      [estornoId, `Estorno de "${atual.descricao}" criado`],
    ] as const) {
      await registrarEvento(tx, {
        entidadeTipo: "lancamento", entidadeId, evento: "status_alterado", descricao, usuarioId,
      });
    }
    await indexarLancamento(tx as never, estorno!);
    return estorno!;
  });
}

/** Contas com saldo derivado — nunca armazenado (doc 02). */
export async function listarContas() {
  const r = await db.execute(sql`
    SELECT c.id, c.nome, c.saldo_inicial AS "saldoInicial",
           c.saldo_inicial
             + coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita' AND l.status = 'pago' AND l.deleted_at IS NULL), 0)
             - coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa' AND l.status = 'pago' AND l.deleted_at IS NULL), 0)
           AS saldo
    FROM contas c
    LEFT JOIN lancamentos l ON l.conta_id = c.id
    GROUP BY c.id ORDER BY c.nome`);
  return r.rows;
}

export async function criarConta(nome: string, saldoInicial: number) {
  const [criada] = await db
    .insert(contas)
    .values({ id: novoId(), nome, saldoInicial: saldoInicial.toFixed(2) })
    .returning();
  return criada!;
}

export async function listarCategoriasFinanceiras() {
  return db.select().from(categoriasFinanceiras).orderBy(categoriasFinanceiras.tipo, categoriasFinanceiras.nome);
}

export async function criarCategoriaFinanceira(nome: string, tipo: "receita" | "despesa") {
  const [criada] = await db
    .insert(categoriasFinanceiras)
    .values({ id: novoId(), nome, tipo })
    .returning();
  return criada!;
}

export async function fluxoCaixa(de: string, ate: string) {
  const r = await db.execute(sql`
    SELECT d.dia::date AS dia,
      coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita' AND l.status = 'pago' AND l.data_pagamento = d.dia::date), 0) AS receitas_pagas,
      coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa' AND l.status = 'pago' AND l.data_pagamento = d.dia::date), 0) AS despesas_pagas,
      coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita' AND l.status = 'previsto' AND l.data_vencimento = d.dia::date), 0) AS receitas_previstas,
      coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa' AND l.status = 'previsto' AND l.data_vencimento = d.dia::date), 0) AS despesas_previstas
    FROM generate_series(${de}::date, ${ate}::date, interval '1 day') AS d(dia)
    LEFT JOIN lancamentos l ON l.deleted_at IS NULL
      AND (l.data_pagamento = d.dia::date OR l.data_vencimento = d.dia::date)
    GROUP BY d.dia ORDER BY d.dia`);
  return r.rows;
}

/** Faturamento de receitas pagas por tipo de operação, agrupado por mês. */
export async function faturamentoPorTipo(meses: number) {
  const r = await db.execute(sql`
    WITH serie AS (
      SELECT generate_series(
        date_trunc('month', current_date - (${meses} - 1) * interval '1 month'),
        date_trunc('month', current_date),
        interval '1 month'
      )::date AS mes
    )
    SELECT
      s.mes,
      coalesce(sum(l.valor) FILTER (WHERE o.tipo = 'guincho'), 0)::numeric     AS guincho,
      coalesce(sum(l.valor) FILTER (WHERE o.tipo = 'locacao'), 0)::numeric     AS locacao,
      coalesce(sum(l.valor) FILTER (WHERE o.tipo = 'venda_ativo'), 0)::numeric AS venda_ativo,
      coalesce(sum(l.valor) FILTER (WHERE l.operacao_id IS NULL AND l.manutencao_id IS NULL), 0)::numeric AS avulso
    FROM serie s
    LEFT JOIN lancamentos l
      ON l.deleted_at IS NULL
      AND l.tipo = 'receita'
      AND l.status = 'pago'
      AND date_trunc('month', l.data_pagamento) = s.mes
    LEFT JOIN operacoes o ON o.id = l.operacao_id AND o.deleted_at IS NULL
    GROUP BY s.mes
    ORDER BY s.mes
  `);
  return r.rows as Array<{
    mes: string; guincho: string; locacao: string; venda_ativo: string; avulso: string;
  }>;
}

/** Custo por ativo (despesas pagas vinculadas via ativo_id ou manutenção) nos últimos N meses. */
export async function custoPorAtivo(meses: number) {
  const r = await db.execute(sql`
    SELECT
      a.id          AS ativo_id,
      a.nome        AS ativo,
      coalesce(sum(l.valor) FILTER (WHERE cf.nome = 'Manutenção'), 0)::numeric                               AS manutencao,
      coalesce(sum(l.valor) FILTER (WHERE cf.nome IN ('Combustível','Abastecimento')), 0)::numeric           AS combustivel,
      coalesce(sum(l.valor) FILTER (WHERE cf.nome NOT IN ('Manutenção','Combustível','Abastecimento')), 0)::numeric AS outros,
      coalesce(sum(l.valor), 0)::numeric AS total
    FROM ativos a
    LEFT JOIN lancamentos l
      ON l.deleted_at IS NULL
      AND l.tipo = 'despesa'
      AND l.status = 'pago'
      AND l.data_pagamento >= (current_date - ${meses} * interval '1 month')::date
      AND (
        l.ativo_id = a.id
        OR l.manutencao_id IN (
          SELECT id FROM manutencoes WHERE ativo_id = a.id AND deleted_at IS NULL
        )
      )
    LEFT JOIN categorias_financeiras cf ON cf.id = l.categoria_id
    WHERE a.deleted_at IS NULL
    GROUP BY a.id, a.nome
    HAVING coalesce(sum(l.valor), 0) > 0
    ORDER BY total DESC
  `);
  return r.rows as Array<{
    ativo_id: string; ativo: string;
    manutencao: string; combustivel: string; outros: string; total: string;
  }>;
}
