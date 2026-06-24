// Relatórios: consultas sobre o núcleo — sem tabelas próprias (doc 01 §6).
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { DimensaoLinha, DimensaoColuna, MedidaPlanilha } from "@hallaxos/shared";

/** Receita, despesa, resultado e ROI por ativo — "qual ativo mais lucrou?" */
export async function resultadoPorAtivo(de?: string, ate?: string) {
  const periodo = de && ate ? sql`AND l.data_pagamento BETWEEN ${de} AND ${ate}` : sql``;
  const r = await db.execute(sql`
    SELECT a.id, a.codigo, a.nome, a.status, a.valor_aquisicao,
      coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita'), 0) AS receita,
      coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa'), 0) AS despesa,
      coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita'), 0)
        - coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa'), 0) AS resultado
    FROM ativos a
    LEFT JOIN lancamentos l ON l.deleted_at IS NULL AND l.status = 'pago' ${periodo}
      AND (l.ativo_id = a.id
           OR l.operacao_id IN (SELECT operacao_id FROM operacao_ativos oa WHERE oa.ativo_id = a.id AND oa.papel = 'objeto')
           OR l.manutencao_id IN (SELECT m.id FROM manutencoes m WHERE m.ativo_id = a.id))
    WHERE a.deleted_at IS NULL
    GROUP BY a.id ORDER BY resultado DESC`);
  return r.rows.map((a) => {
    const linha = a as Record<string, string | null>;
    const base = Number(linha.valor_aquisicao ?? 0);
    return {
      ...linha,
      roi: base > 0 ? Number((((Number(linha.resultado)) / base) * 100).toFixed(1)) : null,
    };
  });
}

export interface PlanilhaOpts {
  linha: DimensaoLinha;
  coluna: DimensaoColuna;
  medida: MedidaPlanilha;
  ano?: number;
  de?: string;
  ate?: string;
  contaId?: string;
  origemFiltro?: string;
  statusFiltro: string;
}

export interface PlanilhaResult {
  linhas: string[];
  colunas: string[];
  celulas: number[][];
  totaisLinha: number[];
  totaisColuna: number[];
  totalGeral: number;
  rotuloLinha: string;
  rotuloColuna: string;
}

// Allowlist: expressões SQL fixas — nunca interpoladas de entrada do usuário (F1).
const EXPR_LINHA: Record<DimensaoLinha, string> = {
  categoria: "COALESCE(cf.nome, 'Sem categoria')",
  origem:
    "CASE WHEN op.tipo IS NOT NULL THEN op.tipo WHEN l.manutencao_id IS NOT NULL THEN 'manutencao' ELSE 'avulso' END",
  conta: "co.nome",
  tipo: "l.tipo",
};

const EXPR_COLUNA: Record<DimensaoColuna, string> = {
  mes: "TO_CHAR(COALESCE(l.data_pagamento, l.data_vencimento), 'YYYY-MM')",
  trimestre:
    "CONCAT(EXTRACT(YEAR FROM COALESCE(l.data_pagamento, l.data_vencimento))::int, '-T', CEIL(EXTRACT(MONTH FROM COALESCE(l.data_pagamento, l.data_vencimento)) / 3.0)::int)",
  ativo: "COALESCE(a.nome, 'Sem ativo')",
  status: "l.status",
};

const ROTULO_LINHA: Record<DimensaoLinha, string> = {
  categoria: "Categoria", origem: "Origem", conta: "Conta", tipo: "Tipo",
};
const ROTULO_COLUNA: Record<DimensaoColuna, string> = {
  mes: "Mês", trimestre: "Trimestre", ativo: "Ativo", status: "Status",
};

export async function planilhaPivot(opts: PlanilhaOpts): Promise<PlanilhaResult> {
  const { linha, coluna, medida, ano, de, ate, contaId, origemFiltro, statusFiltro } = opts;

  const exprL = sql.raw(EXPR_LINHA[linha]);
  const exprC = sql.raw(EXPR_COLUNA[coluna]);

  const exprMedida =
    medida === "receita"
      ? sql.raw("SUM(CASE WHEN l.tipo = 'receita' THEN l.valor::numeric ELSE 0 END)")
      : medida === "despesa"
      ? sql.raw("SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor::numeric ELSE 0 END)")
      : sql.raw(
          "SUM(CASE WHEN l.tipo = 'receita' THEN l.valor::numeric ELSE -(l.valor::numeric) END)"
        );

  const filtros: ReturnType<typeof sql>[] = [sql`AND l.status = ${statusFiltro}`];

  if (ano) {
    filtros.push(
      sql`AND EXTRACT(YEAR FROM COALESCE(l.data_pagamento, l.data_vencimento)) = ${ano}`
    );
  } else if (de && ate) {
    filtros.push(
      sql`AND COALESCE(l.data_pagamento, l.data_vencimento) BETWEEN ${de} AND ${ate}`
    );
  }

  if (contaId) filtros.push(sql`AND l.conta_id = ${contaId}`);

  if (origemFiltro === "manutencao") {
    filtros.push(sql`AND l.manutencao_id IS NOT NULL`);
  } else if (origemFiltro === "avulso") {
    filtros.push(sql`AND l.operacao_id IS NULL AND l.manutencao_id IS NULL`);
  } else if (origemFiltro) {
    filtros.push(sql`AND op.tipo = ${origemFiltro}`);
  }

  const filtrosSQL = filtros.reduce((acc, f) => sql`${acc} ${f}`, sql``);

  const rows = (
    await db.execute(sql`
      SELECT
        ${exprL} AS linha_key,
        ${exprC} AS coluna_key,
        ${exprMedida} AS valor
      FROM lancamentos l
      LEFT JOIN categorias_financeiras cf ON cf.id = l.categoria_id
      LEFT JOIN contas co ON co.id = l.conta_id
      LEFT JOIN operacoes op ON op.id = l.operacao_id
      LEFT JOIN ativos a ON a.id = l.ativo_id
      WHERE l.deleted_at IS NULL
      ${filtrosSQL}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `)
  ).rows as { linha_key: string; coluna_key: string; valor: string }[];

  const linhaMap = new Map<string, Map<string, number>>();
  const colunasSet = new Set<string>();

  for (const row of rows) {
    const lk = row.linha_key ?? "—";
    const ck = row.coluna_key ?? "—";
    if (!linhaMap.has(lk)) linhaMap.set(lk, new Map());
    linhaMap.get(lk)!.set(ck, Number(row.valor ?? 0));
    colunasSet.add(ck);
  }

  const linhas = [...linhaMap.keys()].sort();
  const colunas = [...colunasSet].sort();
  const celulas = linhas.map((l) => colunas.map((c) => linhaMap.get(l)?.get(c) ?? 0));
  const totaisLinha = celulas.map((row) => row.reduce((s, v) => s + v, 0));
  const totaisColuna = colunas.map((_, ci) => celulas.reduce((s, row) => s + (row[ci] ?? 0), 0));
  const totalGeral = totaisLinha.reduce((s, v) => s + v, 0);

  return {
    linhas,
    colunas,
    celulas,
    totaisLinha,
    totaisColuna,
    totalGeral,
    rotuloLinha: ROTULO_LINHA[linha],
    rotuloColuna: ROTULO_COLUNA[coluna],
  };
}

/** DRE simples: receitas, despesas e resultado por mês + por categoria. */
export async function dre(ano: number) {
  const meses = (
    await db.execute(sql`
      SELECT to_char(l.data_pagamento, 'YYYY-MM') AS mes,
        coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita'), 0) AS receitas,
        coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa'), 0) AS despesas
      FROM lancamentos l
      WHERE l.deleted_at IS NULL AND l.status = 'pago'
        AND extract(year FROM l.data_pagamento) = ${ano}
      GROUP BY 1 ORDER BY 1`)
  ).rows;
  const categorias = (
    await db.execute(sql`
      SELECT c.nome, c.tipo, coalesce(sum(l.valor), 0) AS total
      FROM lancamentos l
      JOIN categorias_financeiras c ON c.id = l.categoria_id
      WHERE l.deleted_at IS NULL AND l.status = 'pago'
        AND extract(year FROM l.data_pagamento) = ${ano}
      GROUP BY c.id ORDER BY total DESC`)
  ).rows;
  return { meses, categorias };
}
