import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { pode, type Acao, type PapelUsuario, type Recurso } from "@hallaxos/shared";
import { usuarioDaSessao } from "../services/auth";
import { naoAutenticado, semPermissao } from "../lib/erros";

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
}

declare module "fastify" {
  interface FastifyRequest {
    usuario: UsuarioAutenticado | null;
    sessaoId: string | null;
  }
}

export const COOKIE_SESSAO = "hallax_sessao";

export default fp(async (app) => {
  app.decorateRequest("usuario", null);
  app.decorateRequest("sessaoId", null);

  app.addHook("preHandler", async (req) => {
    const sessaoId = req.cookies[COOKIE_SESSAO];
    if (!sessaoId) return;
    const usuario = await usuarioDaSessao(sessaoId);
    if (usuario) {
      req.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel };
      req.sessaoId = sessaoId;
    }
  });
});

export function exigirLogin(req: FastifyRequest): UsuarioAutenticado {
  if (!req.usuario) throw naoAutenticado();
  return req.usuario;
}

export function exigirPermissao(recurso: Recurso, acao: Acao) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const usuario = exigirLogin(req);
    if (!pode(usuario.papel, recurso, acao)) throw semPermissao();
  };
}
