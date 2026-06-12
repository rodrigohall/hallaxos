// Agenda: eventos derivados das origens (devoluções, manutenções, vencimentos,
// CNH/documentos) + compromissos manuais (`eventos_agenda`, única fonte
// própria — doc 03 §2). Nada é copiado: tudo é consulta direta às origens.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { EventoAgendaCriarInput } from "@hallaxos/shared";
import { db } from "../db/client";
import { eventosAgenda } from "../db/schema";
import { novoId } from "../lib/ids";
import { naoEncontrado } from "../lib/erros";

export interface ItemAgenda {
  tipo: string;
  titulo: string;
  data: string;
  link: string | null;
  manualId: string | null;
  concluido: boolean;
}

/** Eventos da agenda no intervalo [de, ate] (datas YYYY-MM-DD inclusivas). */
export async function listarAgenda(de: string, ate: string): Promise<ItemAgenda[]> {
  const r = await db.execute(sql`
    -- Compromissos manuais
    SELECT 'compromisso' AS tipo, titulo, data_inicio AS data,
           NULL AS link, id::text AS manual_id, concluido
    FROM eventos_agenda
    WHERE deleted_at IS NULL AND data_inicio::date BETWEEN ${de}::date AND ${ate}::date

    UNION ALL
    -- Devoluções de locação previstas
    SELECT 'devolucao', 'Devolução: ' || at.nome, ol.data_devolucao_prevista,
           '/operacoes/' || o.id::text, NULL, (o.status != 'ativa')
    FROM operacoes_locacao ol
    JOIN operacoes o ON o.id = ol.operacao_id AND o.deleted_at IS NULL AND o.status = 'ativa'
    JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.papel = 'objeto'
    JOIN ativos at ON at.id = oa.ativo_id
    WHERE ol.data_devolucao_real IS NULL
      AND ol.data_devolucao_prevista::date BETWEEN ${de}::date AND ${ate}::date

    UNION ALL
    -- Manutenções agendadas
    SELECT 'manutencao', 'Manutenção: ' || at.nome, m.data_agendada::timestamptz,
           '/manutencoes/' || m.id::text, NULL, (m.status != 'agendada')
    FROM manutencoes m JOIN ativos at ON at.id = m.ativo_id
    WHERE m.deleted_at IS NULL AND m.data_agendada IS NOT NULL
      AND m.data_agendada BETWEEN ${de}::date AND ${ate}::date

    UNION ALL
    -- Lançamentos a vencer
    SELECT 'vencimento',
           (CASE WHEN l.tipo = 'receita' THEN 'A receber: ' ELSE 'A pagar: ' END) || l.descricao,
           l.data_vencimento::timestamptz, '/financeiro', NULL, (l.status != 'previsto')
    FROM lancamentos l
    WHERE l.deleted_at IS NULL AND l.status = 'previsto'
      AND l.data_vencimento BETWEEN ${de}::date AND ${ate}::date

    UNION ALL
    -- CNH vencendo
    SELECT 'cnh', 'CNH de ' || nome || ' vence', cnh_validade::timestamptz,
           '/clientes/' || id::text, NULL, false
    FROM pessoas
    WHERE deleted_at IS NULL AND cnh_validade IS NOT NULL
      AND cnh_validade BETWEEN ${de}::date AND ${ate}::date

    UNION ALL
    -- Documentos vencendo
    SELECT 'documento', 'Vence: ' || nome, data_validade::timestamptz, NULL, NULL, false
    FROM documentos
    WHERE deleted_at IS NULL AND data_validade IS NOT NULL
      AND data_validade BETWEEN ${de}::date AND ${ate}::date

    ORDER BY data`);

  return r.rows.map((l) => {
    const row = l as Record<string, unknown>;
    return {
      tipo: row.tipo as string,
      titulo: row.titulo as string,
      data: row.data as string,
      link: (row.link as string | null) ?? null,
      manualId: (row.manual_id as string | null) ?? null,
      concluido: !!row.concluido,
    };
  });
}

export async function criarEventoAgenda(input: EventoAgendaCriarInput, usuarioId: string) {
  const id = novoId();
  const [criado] = await db.insert(eventosAgenda).values({
    id,
    titulo: input.titulo,
    descricao: input.descricao ?? null,
    dataInicio: new Date(input.data_inicio),
    dataFim: input.data_fim ? new Date(input.data_fim) : null,
    diaInteiro: input.dia_inteiro,
    responsavelId: usuarioId,
  }).returning();
  return criado!;
}

export async function alternarConcluidoEvento(id: string) {
  const [e] = await db.select().from(eventosAgenda).where(and(eq(eventosAgenda.id, id), isNull(eventosAgenda.deletedAt)));
  if (!e) throw naoEncontrado("Compromisso");
  const [atualizado] = await db.update(eventosAgenda)
    .set({ concluido: !e.concluido }).where(eq(eventosAgenda.id, id)).returning();
  return atualizado!;
}

export async function excluirEventoAgenda(id: string, usuarioId: string) {
  const [e] = await db.select().from(eventosAgenda).where(and(eq(eventosAgenda.id, id), isNull(eventosAgenda.deletedAt)));
  if (!e) throw naoEncontrado("Compromisso");
  await db.update(eventosAgenda).set({ deletedAt: new Date() }).where(eq(eventosAgenda.id, id));
  void usuarioId;
}
