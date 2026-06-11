// Comentários internos: transversais, editáveis — separados da timeline
// imutável (doc 04 §1). Criação/edição/remoção sempre registradas nela.
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ReferenciaEntidade } from "@hallaxos/shared";
import { db } from "../db/client";
import { comentarios, usuarios } from "../db/schema";
import { novoId } from "../lib/ids";
import { naoEncontrado, semPermissao } from "../lib/erros";
import { registrarEvento } from "./timeline";
import { validarReferencia } from "./refTransversal";

export async function listarComentarios(entidadeTipo: ReferenciaEntidade, entidadeId: string) {
  return db
    .select({
      id: comentarios.id,
      texto: comentarios.texto,
      editadoEm: comentarios.editadoEm,
      createdAt: comentarios.createdAt,
      usuarioId: comentarios.usuarioId,
      usuarioNome: usuarios.nome,
    })
    .from(comentarios)
    .innerJoin(usuarios, eq(usuarios.id, comentarios.usuarioId))
    .where(
      and(
        eq(comentarios.entidadeTipo, entidadeTipo),
        eq(comentarios.entidadeId, entidadeId),
        isNull(comentarios.deletedAt)
      )
    )
    .orderBy(desc(comentarios.createdAt));
}

export async function criarComentario(
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string,
  texto: string,
  usuarioId: string
) {
  await validarReferencia(db, entidadeTipo, entidadeId);
  const id = novoId();
  return db.transaction(async (tx) => {
    const [criado] = await tx
      .insert(comentarios)
      .values({ id, entidadeTipo, entidadeId, texto, usuarioId })
      .returning();
    await registrarEvento(tx, {
      entidadeTipo,
      entidadeId,
      evento: "comentario_adicionado",
      descricao: `Comentário adicionado: "${texto.slice(0, 80)}${texto.length > 80 ? "…" : ""}"`,
      usuarioId,
    });
    return criado!;
  });
}

async function obterProprio(id: string, usuarioId: string) {
  const [c] = await db
    .select()
    .from(comentarios)
    .where(and(eq(comentarios.id, id), isNull(comentarios.deletedAt)));
  if (!c) throw naoEncontrado("Comentário");
  if (c.usuarioId !== usuarioId) throw semPermissao();
  return c;
}

export async function editarComentario(id: string, texto: string, usuarioId: string) {
  const c = await obterProprio(id, usuarioId);
  return db.transaction(async (tx) => {
    const [editado] = await tx
      .update(comentarios)
      .set({ texto, editadoEm: new Date() })
      .where(eq(comentarios.id, id))
      .returning();
    await registrarEvento(tx, {
      entidadeTipo: c.entidadeTipo,
      entidadeId: c.entidadeId,
      evento: "atualizado",
      descricao: "Comentário editado",
      dados: { texto: { de: c.texto, para: texto } },
      usuarioId,
    });
    return editado!;
  });
}

export async function excluirComentario(id: string, usuarioId: string) {
  const c = await obterProprio(id, usuarioId);
  await db.transaction(async (tx) => {
    await tx.update(comentarios).set({ deletedAt: new Date() }).where(eq(comentarios.id, id));
    await registrarEvento(tx, {
      entidadeTipo: c.entidadeTipo,
      entidadeId: c.entidadeId,
      evento: "atualizado",
      descricao: "Comentário removido",
      usuarioId,
    });
  });
}
