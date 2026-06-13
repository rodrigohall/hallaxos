import { and, eq, isNull } from "drizzle-orm";
import type { ReferenciaEntidade } from "@hallaxos/shared";
import { db } from "../db/client";
import { tags, tagsVinculos } from "../db/schema";
import { novoId } from "../lib/ids";
import { naoEncontrado } from "../lib/erros";

export async function listarTags() {
  return db.select().from(tags).where(isNull(tags.deletedAt)).orderBy(tags.nome);
}

export async function criarTag(dados: { nome: string; cor?: string }, _usuarioId: string) {
  const [criada] = await db
    .insert(tags)
    .values({ id: novoId(), nome: dados.nome, cor: dados.cor ?? "#6366f1" })
    .returning();
  return criada!;
}

export async function excluirTag(id: string) {
  const [t] = await db.select().from(tags).where(and(eq(tags.id, id), isNull(tags.deletedAt)));
  if (!t) throw naoEncontrado("Tag");
  await db.update(tags).set({ deletedAt: new Date() }).where(eq(tags.id, id));
}

export async function listarTagsEntidade(entidadeTipo: ReferenciaEntidade, entidadeId: string) {
  const vinculos = await db
    .select({ tag: tags })
    .from(tagsVinculos)
    .innerJoin(tags, and(eq(tagsVinculos.tagId, tags.id), isNull(tags.deletedAt)))
    .where(
      and(eq(tagsVinculos.entidadeTipo, entidadeTipo), eq(tagsVinculos.entidadeId, entidadeId))
    );
  return vinculos.map((v) => v.tag);
}

export async function vincularTag(
  tagId: string,
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string,
  usuarioId: string
) {
  const existente = await db
    .select()
    .from(tagsVinculos)
    .where(
      and(
        eq(tagsVinculos.tagId, tagId),
        eq(tagsVinculos.entidadeTipo, entidadeTipo),
        eq(tagsVinculos.entidadeId, entidadeId)
      )
    );
  if (existente.length > 0) return;
  await db.insert(tagsVinculos).values({ tagId, entidadeTipo, entidadeId, usuarioId });
}

export async function desvincularTag(
  tagId: string,
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string
) {
  await db
    .delete(tagsVinculos)
    .where(
      and(
        eq(tagsVinculos.tagId, tagId),
        eq(tagsVinculos.entidadeTipo, entidadeTipo),
        eq(tagsVinculos.entidadeId, entidadeId)
      )
    );
}
