import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema, REFERENCIA_ENTIDADES } from "@hallaxos/shared";
import {
  listarFavoritos, estaFavoritado, adicionarFavorito, removerFavorito,
} from "../services/favoritos";
import { exigirLogin } from "../plugins/auth";

const entidadeBody = z.object({
  entidade_tipo: z.enum(REFERENCIA_ENTIDADES),
  entidade_id: idSchema,
});

export default async function rotasFavoritos(app: FastifyInstance) {
  app.get("/favoritos", async (req) => {
    const usuario = exigirLogin(req);
    return { dados: await listarFavoritos(usuario.id) };
  });

  app.get("/favoritos/verificar", async (req) => {
    const usuario = exigirLogin(req);
    const q = entidadeBody.parse(req.query);
    const favoritado = await estaFavoritado(usuario.id, q.entidade_tipo, q.entidade_id);
    return { dados: { favoritado } };
  });

  app.post("/favoritos", async (req, reply) => {
    const usuario = exigirLogin(req);
    const body = entidadeBody.parse(req.body);
    await adicionarFavorito(usuario.id, body.entidade_tipo, body.entidade_id);
    reply.code(201);
    return { dados: { ok: true } };
  });

  app.delete("/favoritos", async (req) => {
    const usuario = exigirLogin(req);
    const q = entidadeBody.parse(req.query);
    await removerFavorito(usuario.id, q.entidade_tipo, q.entidade_id);
    return { dados: { ok: true } };
  });
}
