// Primeiro arranque em produção: se o banco não tem nenhum usuário e
// ADMIN_EMAIL/ADMIN_SENHA estão definidos, cria o administrador inicial.
// Nunca roda de novo (idempotente por construção).
import { db } from "./client";
import { usuarios } from "./schema";
import { novoId } from "../lib/ids";
import { hashSenha } from "../services/auth";
import { registrarEvento } from "../services/timeline";

export async function garantirAdminInicial(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_SENHA;
  if (!email || !senha) return;

  const existentes = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
  if (existentes.length > 0) return;

  const id = novoId();
  await db.transaction(async (tx) => {
    await tx.insert(usuarios).values({
      id,
      nome: "Administrador",
      email: email.toLowerCase().trim(),
      senhaHash: await hashSenha(senha),
      papel: "admin",
    });
    await registrarEvento(tx, {
      entidadeTipo: "usuario",
      entidadeId: id,
      evento: "criado",
      descricao: "Administrador inicial criado no primeiro arranque",
      usuarioId: id,
    });
  });
  console.log(`Administrador inicial criado: ${email}`);
}
