// Dashboard: o centro da operação (doc 01 §1.9). Sem tabelas próprias —
// tudo derivado do núcleo em uma única chamada.
import { sql } from "drizzle-orm";
import { pode, type PapelUsuario } from "@hallaxos/shared";
import { db } from "../db/client";

export async function montarDashboard(papel: PapelUsuario) {
  const operacional = await blocoOperacional();
  const financeiro = pode(papel, "dashboard_financeiro", "ler") ? await blocoFinanceiro() : null;
  return { ...operacional, financeiro };
}

async function blocoOperacional() {
  const r = await db.execute(sql`
    SELECT
      (SELECT jsonb_object_agg(status, total) FROM
        (SELECT status, count(*)::int AS total FROM ativos
         WHERE deleted_at IS NULL GROUP BY status) s)                       AS ativos_por_status,

      (SELECT jsonb_build_object(
         'total', count(*)::int,
         'valor_patrimonial', coalesce(sum(valor_aquisicao), 0),
         'disponiveis', count(*) FILTER (WHERE status = 'disponivel')::int,
         'em_operacao', count(*) FILTER (WHERE status IN ('alugado', 'reservado', 'em_uso_interno'))::int,
         'indisponiveis', count(*) FILTER (WHERE status = 'em_manutencao')::int)
       FROM ativos
       WHERE deleted_at IS NULL AND status NOT IN ('vendido', 'baixado'))   AS patrimonio,

      (SELECT coalesce(jsonb_agg(g), '[]'::jsonb) FROM
        (SELECT o.id, o.codigo, p.nome AS cliente, o.status,
                og.origem_endereco, og.destino_endereco
         FROM operacoes o
         JOIN pessoas p ON p.id = o.cliente_id
         JOIN operacoes_guincho og ON og.operacao_id = o.id
         WHERE o.tipo = 'guincho' AND o.deleted_at IS NULL
           AND o.status IN ('solicitado', 'a_caminho', 'em_execucao')
         ORDER BY o.data_inicio) g)                                         AS guinchos_em_andamento,

      (SELECT coalesce(jsonb_agg(a), '[]'::jsonb) FROM
        (SELECT titulo, data_inicio, concluido FROM eventos_agenda
         WHERE deleted_at IS NULL AND data_inicio::date = current_date
         UNION ALL
         SELECT 'Devolução: ' || at.nome, ol.data_devolucao_prevista, false
         FROM operacoes_locacao ol
         JOIN operacoes o ON o.id = ol.operacao_id AND o.status = 'ativa' AND o.deleted_at IS NULL
         JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.papel = 'objeto'
         JOIN ativos at ON at.id = oa.ativo_id
         WHERE ol.data_devolucao_prevista::date = current_date
         UNION ALL
         SELECT 'Manutenção: ' || at.nome, m.data_agendada::timestamptz, false
         FROM manutencoes m JOIN ativos at ON at.id = m.ativo_id
         WHERE m.status = 'agendada' AND m.deleted_at IS NULL AND m.data_agendada = current_date
         ORDER BY 2) a)                                                     AS agenda_do_dia,

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

async function blocoFinanceiro() {
  const r = await db.execute(sql`
    SELECT
      (SELECT coalesce(sum(valor), 0) FROM lancamentos
       WHERE tipo = 'receita' AND status = 'pago' AND deleted_at IS NULL
         AND data_pagamento = current_date)                                 AS receitas_dia,

      (SELECT coalesce(sum(valor), 0) FROM lancamentos
       WHERE tipo = 'despesa' AND status = 'pago' AND deleted_at IS NULL
         AND data_pagamento = current_date)                                 AS despesas_dia,

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
         AND data_vencimento BETWEEN current_date AND current_date + 7)     AS a_vencer_7d
  `);
  return r.rows[0] as Record<string, unknown>;
}
