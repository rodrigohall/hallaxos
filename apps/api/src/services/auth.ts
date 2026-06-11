import { hash, verify } from "@node-rs/argon2";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { sessoes, usuarios } from "../db/schema";
import { novoId } from "../lib/ids";
import { AppError } from "../lib/erros";
import { registrarEvento } from "./timeline";
import { config } from "../config";

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashSenha = (senha: string) => hash(senha, ARGON2);

export async function login(email: string, senha: string, ip?: string, userAgent?: string) {
  const [usuario] = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, email.toLowerCase().trim()));

  const falha = new AppError(401, "CREDENCIAIS_INVALIDAS", "E-mail ou senha incorretos.");
  if (!usuario || !usuario.ativo) throw falha;

  const ok = await verify(usuario.senhaHash, senha);
  if (!ok) {
    await registrarEvento(db, {
      entidadeTipo: "usuario",
      entidadeId: usuario.id,
      evento: "login_falhou",
      descricao: `Tentativa de login falhou (${ip ?? "ip desconhecido"})`,
    });
    throw falha;
  }

  const sessaoId = novoId();
  const expiraEm = new Date(Date.now() + config.sessaoDuracaoHoras * 3600_000);
  await db.transaction(async (tx) => {
    await tx.insert(sessoes).values({ id: sessaoId, usuarioId: usuario.id, expiraEm, ip, userAgent });
    await tx.update(usuarios).set({ ultimoAcesso: new Date() }).where(eq(usuarios.id, usuario.id));
    await registrarEvento(tx, {
      entidadeTipo: "usuario",
      entidadeId: usuario.id,
      evento: "login",
      descricao: `Login realizado (${ip ?? "ip desconhecido"})`,
      usuarioId: usuario.id,
    });
  });
  return { sessaoId, usuario };
}

export async function logout(sessaoId: string, usuarioId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(sessoes).where(eq(sessoes.id, sessaoId));
    await registrarEvento(tx, {
      entidadeTipo: "usuario",
      entidadeId: usuarioId,
      evento: "logout",
      descricao: "Logout realizado",
      usuarioId,
    });
  });
}

export async function usuarioDaSessao(sessaoId: string) {
  const [linha] = await db
    .select({ sessao: sessoes, usuario: usuarios })
    .from(sessoes)
    .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
    .where(eq(sessoes.id, sessaoId));
  if (!linha || linha.sessao.expiraEm < new Date() || !linha.usuario.ativo) return null;

  // Renovação deslizante: estende sessões usadas na metade final da validade
  const metade = config.sessaoDuracaoHoras * 1800_000;
  if (linha.sessao.expiraEm.getTime() - Date.now() < metade) {
    await db
      .update(sessoes)
      .set({ expiraEm: new Date(Date.now() + config.sessaoDuracaoHoras * 3600_000) })
      .where(eq(sessoes.id, sessaoId));
  }
  return linha.usuario;
}

export async function limparSessoesExpiradas() {
  await db.execute(sql`DELETE FROM sessoes WHERE expira_em < now()`);
}
