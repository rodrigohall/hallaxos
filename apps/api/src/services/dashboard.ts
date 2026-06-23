// Dashboard: o centro da operação (doc 01 §1.9). Sem tabelas próprias —
// tudo derivado do núcleo em uma única chamada.
import { sql } from "drizzle-orm";
import { pode, type PapelUsuario, type TipoOrigemLancamento } from "@hallaxos/shared";
import { db } from "../db/client";

export async function montarDashboard(papel: PapelUsuario) {
  return blocoOperacional();
}

async function blocoOperacional() {
  const r = await db.execute(sql`
    SELECT
      (SELECT jsonb_object_agg(status, total) FROM
        (SELECT status, count(*)::int AS total FROM ativos
         WHERE deleted_at IS NULL GROUP BY status) s)                       AS ativos_por_status,

      (SELECT jsonb_build_object(
         'total', count(*)::int,
         'valor_patrimonial', coalesce(sum(COALESCE(a.valor_fipe, a.valor_aquisicao)), 0),
         'disponiveis', count(*) FILTER (WHERE status = 'disponivel')::int,
         'em_operacao', count(*) FILTER (WHERE status IN ('alugado', 'reservado', 'em_uso_interno'))::int,
         'em_manutencao', count(*) FILTER (WHERE status = 'em_manutencao')::int)
       FROM ativos a
       WHERE a.deleted_at IS NULL AND a.status NOT IN ('vendido', 'baixado'))   AS patrimonio,

      (SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM
        (SELECT o.id, o.codigo, p.nome AS cliente, o.status, o.data_inicio,
                og.origem_endereco, og.destino_endereco
         FROM operacoes o
         JOIN pessoas p ON p.id = o.cliente_id
         JOIN operacoes_guincho og ON og.operacao_id = o.id
         WHERE o.tipo = 'guincho' AND o.deleted_at IS NULL
           AND o.status IN ('solicitado', 'a_caminho', 'em_execucao')
         ORDER BY o.data_inicio) g)                                         AS guinchos_em_andamento,

      (SELECT coalesce(jsonb_agg(l), '[]'::jsonb) FROM
        (SELECT o.id, o.codigo, p.nome AS cliente,
                at.nome AS ativo, o.data_inicio
         FROM operacoes o
         JOIN pessoas p ON p.id = o.cliente_id
         JOIN operacoes_locacao ol ON ol.operacao_id = o.id
         JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.papel = 'objeto'
         JOIN ativos at ON at.id = oa.ativo_id
         WHERE o.tipo = 'locacao' AND o.deleted_at IS NULL
           AND o.status = 'ativa'
         ORDER BY o.data_inicio LIMIT 20) l)                                AS locacoes_em_andamento,

      (SELECT coalesce(jsonb_agg(a), '[]'::jsonb) FROM
        (SELECT null::uuid AS id, titulo, data_inicio, concluido,
                null::text AS link FROM eventos_agenda
         WHERE deleted_at IS NULL AND data_inicio::date = current_date
         UNION ALL
         SELECT null::uuid, 'Devolução: ' || at.nome, ol.data_devolucao_prevista, false,
                '/operacoes/' || o.id::text
         FROM operacoes_locacao ol
         JOIN operacoes o ON o.id = ol.operacao_id AND o.status = 'ativa' AND o.deleted_at IS NULL
         JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.papel = 'objeto'
         JOIN ativos at ON at.id = oa.ativo_id
         WHERE ol.data_devolucao_prevista::date = current_date
         UNION ALL
         SELECT m.id, 'Manutenção: ' || at.nome, m.data_agendada::timestamptz, false,
                '/manutencoes/' || m.id::text
         FROM manutencoes m JOIN ativos at ON at.id = m.ativo_id
         WHERE m.status = 'agendada' AND m.deleted_at IS NULL AND m.data_agendada = current_date
         ORDER BY 3) a)                                                     AS agenda_do_dia,

      (SELECT coalesce(jsonb_agg(m), '[]'::jsonb) FROM
        (SELECT m.id, at.nome AS ativo, m.descricao, m.data_agendada
         FROM manutencoes m JOIN ativos at ON at.id = m.ativo_id
         WHERE m.status = 'agendada' AND m.deleted_at IS NULL
           AND m.data_agendada BETWEEN current_date AND current_date + 14
         ORDER BY m.data_agendada LIMIT 10) m)                              AS proximas_manutencoes,

      (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM
        (SELECT o.id, o.codigo, p.nome AS cliente, at.nome AS ativo,
                ol.data_devolucao_prevista, o.data_inicio
         FROM operacoes o
         JOIN operacoes_locacao ol ON ol.operacao_id = o.id
         JOIN pessoas p ON p.id = o.cliente_id
         JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.papel = 'objeto'
         JOIN ativos at ON at.id = oa.ativo_id
         WHERE o.status = 'reservada' AND o.deleted_at IS NULL
         ORDER BY o.data_inicio LIMIT 10) r)                                AS reservas_futuras,

      (SELECT count(*)::int
       FROM operacoes o JOIN operacoes_locacao ol ON ol.operacao_id = o.id
       WHERE o.status = 'ativa' AND o.deleted_at IS NULL
         AND ol.data_devolucao_prevista < now())                            AS locacoes_atrasadas,

      (SELECT coalesce(jsonb_agg(al), '[]'::jsonb) FROM
        (SELECT 'cnh_vencendo' AS tipo,
                'CNH de ' || nome || ' vence em ' || to_char(cnh_validade, 'DD/MM/YYYY') AS texto,
                id AS entidade_id, 'pessoa' AS entidade_tipo
         FROM pessoas
         WHERE deleted_at IS NULL AND cnh_validade IS NOT NULL
           AND cnh_validade BETWEEN current_date AND current_date + 30
         UNION ALL
         SELECT 'documento_vencendo',
                'Documento "' || nome || '" vence em ' || to_char(data_validade, 'DD/MM/YYYY'),
                id, 'documento'
         FROM documentos
         WHERE deleted_at IS NULL AND data_validade IS NOT NULL
           AND data_validade BETWEEN current_date AND current_date + 30
         LIMIT 20) al)                                                      AS alertas
  `);
  return r.rows[0] as Record<string, unknown>;
}

export async function montarFinanceiro(
  papel: PapelUsuario,
  periodo: string,
  avencer: number
) {
  if (!pode(papel, "dashboard_financeiro", "ler")) return null;

  // monta o filtro de data baseado no período
  let rangeSql: ReturnType<typeof sql>;
  switch (periodo) {
    case "semana":
      rangeSql = sql`data_pagamento BETWEEN date_trunc('week', current_date)::date AND current_date`;
      break;
    case "mes":
      rangeSql = sql`data_pagamento BETWEEN date_trunc('month', current_date)::date AND current_date`;
      break;
    case "ano":
      rangeSql = sql`data_pagamento BETWEEN date_trunc('year', current_date)::date AND current_date`;
      break;
    case "ultimos30":
      rangeSql = sql`data_pagamento BETWEEN current_date - 29 AND current_date`;
      break;
    default: // 'hoje'
      rangeSql = sql`data_pagamento = current_date`;
  }

  const avencerDias = [7, 15, 30].includes(avencer) ? avencer : 7;

  const r = await db.execute(sql`
    SELECT
      (SELECT coalesce(sum(valor), 0) FROM lancamentos
       WHERE tipo = 'receita' AND status = 'pago' AND deleted_at IS NULL
         AND ${rangeSql})                                                    AS receitas,

      (SELECT coalesce(sum(valor), 0) FROM lancamentos
       WHERE tipo = 'despesa' AND status = 'pago' AND deleted_at IS NULL
         AND ${rangeSql})                                                    AS despesas,

      (SELECT coalesce(jsonb_agg(f ORDER BY f.dia), '[]'::jsonb) FROM
        (SELECT d.dia,
                coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita'), 0) AS receitas,
                coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa'), 0) AS despesas
         FROM generate_series(current_date - 6, current_date, interval '1 day') AS d(dia)
         LEFT JOIN lancamentos l
           ON l.data_pagamento = d.dia::date AND l.status = 'pago' AND l.deleted_at IS NULL
         GROUP BY d.dia) f)                                                 AS fluxo_caixa_7d,

      (SELECT jsonb_build_object('quantidade', count(*)::int, 'total', coalesce(sum(valor), 0))
       FROM lancamentos
       WHERE status = 'previsto' AND deleted_at IS NULL
         AND data_vencimento < current_date)                                AS contas_vencidas,

      (SELECT jsonb_build_object('quantidade', count(*)::int, 'total', coalesce(sum(valor), 0))
       FROM lancamentos
       WHERE status = 'previsto' AND deleted_at IS NULL
         AND data_vencimento BETWEEN current_date AND current_date + ${sql.raw(String(avencerDias))})
                                                                            AS a_vencer
  `);
  return r.rows[0] as Record<string, unknown>;
}

/** Breakdown financeiro por origem/tipo de operação.
 *  Pago: filtrado pelo período do seletor (= data_pagamento no intervalo).
 *  Previsto: todos os lançamentos em aberto (independente de período — mostra o que está pendente).
 *  Decisão #60: endpoint separado para não recarregar o bloco operacional.
 */
export async function montarFinanceiroPorOrigem(
  papel: PapelUsuario,
  periodo: string,
) {
  if (!pode(papel, "dashboard_financeiro", "ler")) return null;

  let rangeSql: ReturnType<typeof sql>;
  switch (periodo) {
    case "semana":
      rangeSql = sql`data_pagamento BETWEEN date_trunc('week', current_date)::date AND current_date`;
      break;
    case "mes":
      rangeSql = sql`data_pagamento BETWEEN date_trunc('month', current_date)::date AND current_date`;
      break;
    case "ano":
      rangeSql = sql`data_pagamento BETWEEN date_trunc('year', current_date)::date AND current_date`;
      break;
    case "ultimos30":
      rangeSql = sql`data_pagamento BETWEEN current_date - 29 AND current_date`;
      break;
    default: // 'hoje'
      rangeSql = sql`data_pagamento = current_date`;
  }

  const r = await db.execute(sql`
    WITH base AS (
      SELECT
        CASE
          WHEN o.tipo IS NOT NULL THEN o.tipo::text
          WHEN l.manutencao_id IS NOT NULL THEN 'manutencao'
          ELSE 'avulso'
        END                             AS origem,
        l.tipo                          AS tipo_lancamento,
        l.status,
        l.data_vencimento,
        l.data_pagamento,
        l.valor::numeric                AS valor
      FROM lancamentos l
      LEFT JOIN operacoes o ON o.id = l.operacao_id AND o.deleted_at IS NULL
      WHERE l.deleted_at IS NULL AND l.status != 'cancelado'
    )
    SELECT
      origem,
      coalesce(sum(valor) FILTER (
        WHERE tipo_lancamento = 'receita' AND status = 'pago' AND ${rangeSql}
      ), 0)                             AS receita_paga,
      coalesce(sum(valor) FILTER (
        WHERE tipo_lancamento = 'despesa' AND status = 'pago' AND ${rangeSql}
      ), 0)                             AS despesa_paga,
      coalesce(sum(valor) FILTER (
        WHERE tipo_lancamento = 'receita' AND status = 'previsto'
      ), 0)                             AS receita_prevista,
      coalesce(sum(valor) FILTER (
        WHERE tipo_lancamento = 'despesa' AND status = 'previsto'
      ), 0)                             AS despesa_prevista,
      coalesce(sum(valor) FILTER (
        WHERE tipo_lancamento = 'receita' AND status = 'previsto'
          AND data_vencimento < current_date
      ), 0)                             AS vencido_receitas,
      coalesce(sum(valor) FILTER (
        WHERE tipo_lancamento = 'despesa' AND status = 'previsto'
          AND data_vencimento < current_date
      ), 0)                             AS vencido_despesas,
      count(*) FILTER (
        WHERE status = 'pago' AND ${rangeSql}
      )::int                            AS qtd
    FROM base
    GROUP BY origem
    ORDER BY origem
  `);

  const ORIGENS = ["guincho", "locacao", "venda", "compra", "manutencao", "avulso"] as const;
  type Origem = (typeof ORIGENS)[number];
  const zero = () => ({
    receita_paga: 0, despesa_paga: 0,
    receita_prevista: 0, despesa_prevista: 0,
    vencido_receitas: 0, vencido_despesas: 0,
    liquido: 0, qtd: 0,
  });

  const tipos: Record<Origem, ReturnType<typeof zero>> = Object.fromEntries(
    ORIGENS.map((o) => [o, zero()]),
  ) as Record<Origem, ReturnType<typeof zero>>;

  for (const row of r.rows as Record<string, unknown>[]) {
    const origem = row.origem as Origem;
    if (!tipos[origem]) continue;
    const t = tipos[origem];
    t.receita_paga = Number(row.receita_paga);
    t.despesa_paga = Number(row.despesa_paga);
    t.receita_prevista = Number(row.receita_prevista);
    t.despesa_prevista = Number(row.despesa_prevista);
    t.vencido_receitas = Number(row.vencido_receitas);
    t.vencido_despesas = Number(row.vencido_despesas);
    t.liquido = t.receita_paga - t.despesa_paga;
    t.qtd = Number(row.qtd);
  }

  const total = {
    receita_paga: ORIGENS.reduce((s, o) => s + tipos[o].receita_paga, 0),
    despesa_paga: ORIGENS.reduce((s, o) => s + tipos[o].despesa_paga, 0),
    liquido: 0,
    a_receber: ORIGENS.reduce((s, o) => s + Math.max(0, tipos[o].receita_prevista - tipos[o].vencido_receitas), 0),
    a_pagar: ORIGENS.reduce((s, o) => s + Math.max(0, tipos[o].despesa_prevista - tipos[o].vencido_despesas), 0),
    vencido_receitas: ORIGENS.reduce((s, o) => s + tipos[o].vencido_receitas, 0),
    vencido_despesas: ORIGENS.reduce((s, o) => s + tipos[o].vencido_despesas, 0),
  };
  total.liquido = total.receita_paga - total.despesa_paga;

  return { periodo, tipos, total };
}
