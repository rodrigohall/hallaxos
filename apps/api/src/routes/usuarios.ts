import type { FastifyInstance } from "fastify";
import { idSchema, usuarioCriarSchema, usuarioEditarSchema } from "@hallaxos/shared";
import { z } from "zod";
import { criarUsuario, definirAtivo, editarUsuario, listarUsuarios } from "../services/usuarios";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });

export default async function rotasUsuarios(app: FastifyInstance) {
  app.get("/usuarios", { preHandler: exigirPermissao("usuarios", "ler") }, async () => ({
    dados: await listarUsuarios(),
  }));

  app.post("/usuarios", { preHandler: exigirPermissao("usuarios", "criar") }, async (req, reply) => {
    const input = usuarioCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarUsuario(input, exigirLogin(req).id) };
  });

  app.patch("/usuarios/:id", { preHandler: exigirPermissao("usuarios", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = usuarioEditarSchema.parse(req.body);
    return { dados: await editarUsuario(id, input, exigirLogin(req).id) };
  });

  app.post(
    "/usuarios/:id/desativar",
    { preHandler: exigirPermissao("usuarios", "editar") },
    async (req) => {
      const { id } = params.parse(req.params);
      return { dados: await definirAtivo(id, false, exigirLogin(req).id) };
    }
  );

  app.post(
    "/usuarios/:id/reativar",
    { preHandler: exigirPermissao("usuarios", "editar") },
    async (req) => {
      const { id } = params.parse(req.params);
      return { dados: await definirAtivo(id, true, exigirLogin(req).id) };
    }
  );
}
