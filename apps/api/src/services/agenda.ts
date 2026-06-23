// Agenda: eventos derivados das origens (devoluções, manutenções, vencimentos,
// CNH/documentos) + compromissos manuais (`eventos_agenda`, única fonte
// própria — doc 03 §2). Nada é copiado: tudo é consulta direta às origens.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { EventoAgendaCriarInput } from "@hallaxos/shared";
import { db } from "../db/client";
import { eventosAgenda, lancamentos } from "../db/schema";
import { novoId } from "../lib/ids";
import { naoEncontrado } from "../lib/erros";

export interface ItemAgenda {
  tipo: string;
  titulo: string;
  data: string;
  link: string | null;
  manualId: string | null;
  concluido: boolean;
  entidadeTipo: string | null;
  entidadeId: string | null;
}

/** Eventos da agenda no intervalo [de, ate] (datas YYYY-MM-DD inclusivas).
 *  `tipos` opcional filtra por categoria de evento. */
export async function listarAgenda(de: string, ate: string, tipos?: string[]): Promise<ItemAgenda[]> {
  // O filtro de tipo é aplicado após a UNION via CTE para não duplicar lógica.
  const tipoFiltro = tipos && tipos.length > 0
    ? sql`WHERE tipo = ANY(${sql.raw(`ARRAY['${tipos.join("','")}']`)})`
    : sql``;

  const r = await db.execute(sql`
    WITH agenda AS (
      -- Compromissos manuais
      SELECT 'compromisso' AS tipo, titulo, data_inicio AS data,
             NULL AS link, id::text AS manual_id, concluido,
             entidade_tipo::text AS entidade_tipo, entidade_id::text AS entidade_id
      FROM eventos_agenda
      WHERE deleted_at IS NULL AND data_inicio::date BETWEEN ${de}::date AND ${ate}::date

      UNION ALL
      -- Devoluções de locação previstas
      SELECT 'devolucao', 'Devolução: ' || at.nome, ol.data_devolucao_prevista,
             '/operacoes/' || o.id::text, NULL, (o.status != 'ativa'),
             'operacao', o.id::text
      FROM operacoes_locacao ol
      JOIN operacoes o ON o.id = ol.operacao_id AND o.deleted_at IS NULL AND o.status = 'ativa'
      JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.papel = 'objeto'
      JOIN ativos at ON at.id = oa.ativo_id
      WHERE ol.data_devolucao_real IS NULL
        AND ol.data_devolucao_prevista::date BETWEEN ${de}::date AND ${ate}::date

      UNION ALL
      -- Manutenções agendadas
      SELECT 'manutencao', 'Manutenção: ' || at.nome, m.data_agendada::timestamptz,
             '/manutencoes/' || m.id::text, NULL, (m.status != 'agendada'),
             'manutencao', m.id::text
      FROM manutencoes m JOIN ativos at ON at.id = m.ativo_id
      WHERE m.deleted_at IS NULL AND m.data_agendada IS NOT NULL
        AND m.data_agendada BETWEEN ${de}::date AND ${ate}::date

      UNION ALL
      -- Lançamentos a vencer
      SELECT 'vencimento',
             (CASE WHEN l.tipo = 'receita' THEN 'A receber: ' ELSE 'A pagar: ' END) || l.descricao,
             l.data_vencimento::timestamptz, '/financeiro', NULL, (l.status != 'previsto'),
             'lancamento', l.id::text
      FROM lancamentos l
      WHERE l.deleted_at IS NULL AND l.status = 'previsto'
        AND l.data_vencimento BETWEEN ${de}::date AND ${ate}::date

      UNION ALL
      -- CNH vencendo
      SELECT 'cnh', 'CNH de ' || nome || ' vence', cnh_validade::timestamptz,
             '/clientes/' || id::text, NULL, false,
             'pessoa', id::text
      FROM pessoas
      WHERE deleted_at IS NULL AND cnh_validade IS NOT NULL
        AND cnh_validade BETWEEN ${de}::date AND ${ate}::date

      UNION ALL
      -- Documentos vencendo
      SELECT 'documento', 'Vence: ' || nome, data_validade::timestamptz, NULL, NULL, false,
             'documento', id::text
      FROM documentos
      WHERE deleted_at IS NULL AND data_validade IS NOT NULL
        AND data_validade BETWEEN ${de}::date AND ${ate}::date
    )
    SELECT * FROM agenda
    ${tipoFiltro}
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
      entidadeTipo: (row.entidade_tipo as string | null) ?? null,
      entidadeId: (row.entidade_id as string | null) ?? null,
    };
  });
}

export async function criarEventoAgenda(input: EventoAgendaCriarInput, usuarioId: string) {
  return db.transaction(async (tx) => {
    let lancamentoId: string | null = null;

    // Gerar lançamento avulso junto com o compromisso (guard #58: mão única —
    // o evento não recria o lançamento em cadeia).
    if (input.gerar_lancamento) {
      const gl = input.gerar_lancamento;
      const [novoLanc] = await tx
        .insert(lancamentos)
        .values({
          id: novoId(),
          tipo: gl.tipo,
          descricao: gl.descricao,
          categoriaId: gl.categoria_id,
          contaId: gl.conta_id,
          valor: gl.valor.toFixed(2),
          dataVencimento: gl.data_vencimento,
          status: "previsto",
          pessoaId: null,
          operacaoId: null,
          manutencaoId: null,
          ativoId: null,
          formaPagamento: null,
          dataPagamento: null,
          parcelaNumero: null,
          parcelaTotal: null,
          grupoParcelasId: null,
        })
        .returning();
      lancamentoId = novoLanc!.id;
    }

    const id = novoId();
    const [criado] = await tx.insert(eventosAgenda).values({
      id,
      titulo: input.titulo,
      descricao: input.descricao ?? null,
      dataInicio: new Date(input.data_inicio),
      dataFim: input.data_fim ? new Date(input.data_fim) : null,
      diaInteiro: input.dia_inteiro,
      responsavelId: usuarioId,
      // Link a entidade existente — ou ao lançamento gerado (se criou um).
      entidadeTipo: lancamentoId
        ? "lancamento"
        : (input.entidade_tipo as never ?? null),
      entidadeId: lancamentoId ?? (input.entidade_id ?? null),
    }).returning();

    return { evento: criado!, lancamentoId };
  });
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
