import { and, eq, desc } from "drizzle-orm";
import type { ReferenciaEntidade } from "@hallaxos/shared";
import { db } from "../db/client";
import { favoritos } from "../db/schema";

export async function estaFavoritado(
  usuarioId: string,
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string
): Promise<boolean> {
  const [f] = await db
    .select()
    .from(favoritos)
    .where(
      and(
        eq(favoritos.usuarioId, usuarioId),
        eq(favoritos.entidadeTipo, entidadeTipo),
        eq(favoritos.entidadeId, entidadeId)
      )
    );
  return f !== undefined;
}

export async function adicionarFavorito(
  usuarioId: string,
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string
) {
  if (await estaFavoritado(usuarioId, entidadeTipo, entidadeId)) return;
  await db.insert(favoritos).values({ usuarioId, entidadeTipo, entidadeId });
}

export async function removerFavorito(
  usuarioId: string,
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string
) {
  await db
    .delete(favoritos)
    .where(
      and(
        eq(favoritos.usuarioId, usuarioId),
        eq(favoritos.entidadeTipo, entidadeTipo),
        eq(favoritos.entidadeId, entidadeId)
      )
    );
}

export async function listarFavoritos(usuarioId: string) {
  return db
    .select()
    .from(favoritos)
    .where(eq(favoritos.usuarioId, usuarioId))
    .orderBy(desc(favoritos.createdAt))
    .limit(50);
}
