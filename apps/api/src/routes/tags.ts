import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema, REFERENCIA_ENTIDADES } from "@hallaxos/shared";
import {
  listarTags, criarTag, excluirTag, listarTagsEntidade, vincularTag, desvincularTag,
} from "../services/tags";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const entidadeParams = z.object({
  entidade_tipo: z.enum(REFERENCIA_ENTIDADES),
  entidade_id: idSchema,
});

export default async function rotasTags(app: FastifyInstance) {
  app.get("/tags", { preHandler: exigirPermissao("tags", "ler") }, async () => {
    return { dados: await listarTags() };
  });

  app.post(
    "/tags",
    { preHandler: exigirPermissao("tags", "criar") },
    async (req, reply) => {
      const body = z.object({ nome: z.string().min(1).max(50), cor: z.string().optional() }).parse(req.body);
      const usuario = exigirLogin(req);
      const tag = await criarTag(body, usuario.id);
      reply.code(201);
      return { dados: tag };
    }
  );

  app.delete("/tags/:id", { preHandler: exigirPermissao("tags", "arquivar") }, async (req) => {
    const { id } = z.object({ id: idSchema }).parse(req.params);
    await excluirTag(id);
    return { dados: { ok: true } };
  });

  app.get("/tags/entidade", { preHandler: exigirPermissao("tags", "ler") }, async (req) => {
    const q = entidadeParams.parse(req.query);
    return { dados: await listarTagsEntidade(q.entidade_tipo, q.entidade_id) };
  });

  app.post("/tags/vincular", { preHandler: exigirPermissao("tags", "criar") }, async (req) => {
    const body = z.object({ tag_id: idSchema, ...entidadeParams.shape }).parse(req.body);
    const usuario = exigirLogin(req);
    await vincularTag(body.tag_id, body.entidade_tipo, body.entidade_id, usuario.id);
    return { dados: { ok: true } };
  });

  app.post("/tags/desvincular", { preHandler: exigirPermissao("tags", "editar") }, async (req) => {
    const body = z.object({ tag_id: idSchema, ...entidadeParams.shape }).parse(req.body);
    await desvincularTag(body.tag_id, body.entidade_tipo, body.entidade_id);
    return { dados: { ok: true } };
  });
}
