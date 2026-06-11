// Timeline: cidadão de primeira classe (doc 01 §1.6). Toda mutação relevante
// passa por aqui, dentro da transação da ação.
import { and, desc, eq, lt } from "drizzle-orm";
import type { EventoTimeline, ReferenciaEntidade } from "@hallaxos/shared";
import type { DbConn } from "../db/client";
import { timeline, usuarios } from "../db/schema";
import { novoId } from "../lib/ids";
import { validarReferencia } from "./refTransversal";

export interface NovoEventoTimeline {
  entidadeTipo: ReferenciaEntidade;
  entidadeId: string;
  evento: EventoTimeline;
  descricao: string;
  dados?: Record<string, unknown> | null;
  usuarioId?: string | null;
}

export async function registrarEvento(conn: DbConn, e: NovoEventoTimeline): Promise<void> {
  await validarReferencia(conn, e.entidadeTipo, e.entidadeId);
  await conn.insert(timeline).values({
    id: novoId(),
    entidadeTipo: e.entidadeTipo,
    entidadeId: e.entidadeId,
    evento: e.evento,
    descricao: e.descricao,
    dados: e.dados ?? null,
    usuarioId: e.usuarioId ?? null,
  });
}

/** Diff estruturado {campo: {de, para}} para eventos `atualizado`. */
export function diff(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>
): Record<string, { de: unknown; para: unknown }> {
  const resultado: Record<string, { de: unknown; para: unknown }> = {};
  for (const campo of Object.keys(depois)) {
    const de = antes[campo] ?? null;
    const para = depois[campo] ?? null;
    if (String(de) !== String(para)) resultado[campo] = { de, para };
  }
  return resultado;
}

export async function listarTimeline(
  conn: DbConn,
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string,
  antesDe?: string,
  limite = 30
) {
  const filtros = [eq(timeline.entidadeTipo, entidadeTipo), eq(timeline.entidadeId, entidadeId)];
  if (antesDe) filtros.push(lt(timeline.id, antesDe));
  const linhas = await conn
    .select({
      id: timeline.id,
      evento: timeline.evento,
      descricao: timeline.descricao,
      dados: timeline.dados,
      createdAt: timeline.createdAt,
      usuarioNome: usuarios.nome,
    })
    .from(timeline)
    .leftJoin(usuarios, eq(usuarios.id, timeline.usuarioId))
    .where(and(...filtros))
    .orderBy(desc(timeline.id))
    .limit(limite);
  return linhas.map(({ usuarioNome, ...e }) => ({
    ...e,
    usuario: usuarioNome ? { nome: usuarioNome } : null,
  }));
}
