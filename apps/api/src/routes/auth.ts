import type { FastifyInstance } from "fastify";
import { loginSchema, permissoesDe } from "@hallaxos/shared";
import { login, logout } from "../services/auth";
import { COOKIE_SESSAO, exigirLogin } from "../plugins/auth";
import { config } from "../config";

export default async function rotasAuth(app: FastifyInstance) {
  app.post("/auth/login", async (req, reply) => {
    const { email, senha } = loginSchema.parse(req.body);
    const { sessaoId, usuario } = await login(email, senha, req.ip, req.headers["user-agent"]);
    reply.setCookie(COOKIE_SESSAO, sessaoId, {
      path: "/",
      httpOnly: true,
      secure: config.cookieSeguro,
      sameSite: "lax",
      maxAge: config.sessaoDuracaoHoras * 3600,
    });
    return {
      dados: {
        usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
        permissoes: permissoesDe(usuario.papel),
      },
    };
  });

  app.post("/auth/logout", async (req, reply) => {
    const usuario = exigirLogin(req);
    await logout(req.sessaoId!, usuario.id);
    reply.clearCookie(COOKIE_SESSAO, { path: "/" });
    return { dados: { ok: true } };
  });

  app.get("/auth/sessao", async (req) => {
    const usuario = exigirLogin(req);
    return { dados: { usuario, permissoes: permissoesDe(usuario.papel) } };
  });
}
