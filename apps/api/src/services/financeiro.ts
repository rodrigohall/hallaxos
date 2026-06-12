// Financeiro: todo dinheiro tem origem; agregados sempre derivados (doc 03).
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  LancamentoCriarInput, LancamentoEditarInput, LancamentoPagarInput,
} from "@hallaxos/shared";
import { db } from "../db/client";
import { lancamentos, contas, categoriasFinanceiras, pessoas } from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado, regraNegocio } from "../lib/erros";
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
  pessoaId?: string; busca?: string; pagina: number; porPagina: number;
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
          valor: ((base + (i === 0 ? resto : 0)) / 100).toFixed(2),
          dataVencimento: venc.toISOString().slice(0, 10),
          dataPagamento: input.pago ? input.data_vencimento : null,
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

export async function editarLancamento(id: string, input: LancamentoEditarInput, usuarioId: string) {
  const atual = await obter(id);
  if (atual.status !== "previsto") throw regraNegocio("Só lançamentos previstos podem ser editados.");
  // Gerado por operação/manutenção: valores e datas pertencem à origem (doc 03 regra 5)
  if ((atual.operacaoId || atual.manutencaoId) && (input.valor !== undefined || input.data_vencimento)) {
    throw regraNegocio("Este lançamento foi gerado por uma operação — ajuste valores pela origem.");
  }
  const mudancas: Record<string, unknown> = {};
  if (input.descricao) mudancas.descricao = input.descricao;
  if (input.categoria_id) mudancas.categoriaId = input.categoria_id;
  if (input.conta_id) mudancas.contaId = input.conta_id;
  if (input.pessoa_id !== undefined) mudancas.pessoaId = input.pessoa_id;
  if (input.valor !== undefined) mudancas.valor = input.valor.toFixed(2);
  if (input.data_vencimento) mudancas.dataVencimento = input.data_vencimento;

  return db.transaction(async (tx) => {
    const [editado] = await tx.update(lancamentos).set(mudancas).where(eq(lancamentos.id, id)).returning();
    const mudou = diff(atual as never, editado as never);
    delete mudou.updatedAt;
    if (Object.keys(mudou).length) {
      await registrarEvento(tx, {
        entidadeTipo: "lancamento", entidadeId: id, evento: "atualizado",
        descricao: `Lançamento ${editado!.descricao} atualizado`, dados: mudou, usuarioId,
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
