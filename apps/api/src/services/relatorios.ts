// Relatórios: consultas sobre o núcleo — sem tabelas próprias (doc 01 §6).
import { sql } from "drizzle-orm";
import { db } from "../db/client";

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
