import { eq } from "drizzle-orm";
import type { UsuarioCriarInput, UsuarioEditarInput } from "@hallaxos/shared";
import { db } from "../db/client";
import { usuarios } from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado } from "../lib/erros";
import { hashSenha } from "./auth";
import { diff, registrarEvento } from "./timeline";

const semSenha = ({ senhaHash: _, ...resto }: typeof usuarios.$inferSelect) => resto;

export async function listarUsuarios() {
  const linhas = await db.select().from(usuarios).orderBy(usuarios.nome);
  return linhas.map(semSenha);
}

export async function criarUsuario(input: UsuarioCriarInput, autorId: string) {
  const email = input.email.toLowerCase().trim();
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (existente) throw conflito("Já existe um usuário com este e-mail.");

  const id = novoId();
  return db.transaction(async (tx) => {
    const [criado] = await tx
      .insert(usuarios)
      .values({ id, nome: input.nome, email, senhaHash: await hashSenha(input.senha), papel: input.papel })
      .returning();
    await registrarEvento(tx, {
      entidadeTipo: "usuario",
      entidadeId: id,
      evento: "criado",
      descricao: `Usuário ${input.nome} criado com papel ${input.papel}`,
      usuarioId: autorId,
    });
    return semSenha(criado!);
  });
}

export async function editarUsuario(id: string, input: UsuarioEditarInput, autorId: string) {
  const [atual] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!atual) throw naoEncontrado("Usuário");

  const mudancas: Partial<typeof usuarios.$inferInsert> = {};
  if (input.nome) mudancas.nome = input.nome;
  if (input.email) mudancas.email = input.email.toLowerCase().trim();
  if (input.papel) mudancas.papel = input.papel;
  if (input.senha) mudancas.senhaHash = await hashSenha(input.senha);

  return db.transaction(async (tx) => {
    const [editado] = await tx.update(usuarios).set(mudancas).where(eq(usuarios.id, id)).returning();
    const { senhaHash: _a, ...antes } = atual;
    const { senhaHash: _d, ...depois } = editado!;
    await registrarEvento(tx, {
      entidadeTipo: "usuario",
      entidadeId: id,
      evento: "atualizado",
      descricao: `Usuário ${editado!.nome} atualizado`,
      dados: diff(antes as Record<string, unknown>, depois as Record<string, unknown>),
      usuarioId: autorId,
    });
    return semSenha(editado!);
  });
}

export async function definirAtivo(id: string, ativo: boolean, autorId: string) {
  const [atual] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  if (!atual) throw naoEncontrado("Usuário");
  return db.transaction(async (tx) => {
    const [editado] = await tx.update(usuarios).set({ ativo }).where(eq(usuarios.id, id)).returning();
    await registrarEvento(tx, {
      entidadeTipo: "usuario",
      entidadeId: id,
      evento: "status_alterado",
      descricao: ativo ? "Usuário reativado" : "Usuário desativado",
      usuarioId: autorId,
    });
    return semSenha(editado!);
  });
}
