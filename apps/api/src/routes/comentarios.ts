import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { comentarioCriarSchema, idSchema, REFERENCIA_ENTIDADES } from "@hallaxos/shared";
import {
  criarComentario, editarComentario, excluirComentario, listarComentarios,
} from "../services/comentarios";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });
const entidadeQuery = z.object({
  entidade_tipo: z.enum(REFERENCIA_ENTIDADES),
  entidade_id: idSchema,
});

export default async function rotasComentarios(app: FastifyInstance) {
  app.get("/comentarios", { preHandler: exigirPermissao("comentarios", "ler") }, async (req) => {
    const q = entidadeQuery.parse(req.query);
    return { dados: await listarComentarios(q.entidade_tipo, q.entidade_id) };
  });

  app.post("/comentarios", { preHandler: exigirPermissao("comentarios", "criar") }, async (req, reply) => {
    const corpo = entidadeQuery.merge(comentarioCriarSchema).parse(req.body);
    reply.code(201);
    return {
      dados: await criarComentario(
        corpo.entidade_tipo,
        corpo.entidade_id,
        corpo.texto,
        exigirLogin(req).id
      ),
    };
  });

  app.patch("/comentarios/:id", { preHandler: exigirPermissao("comentarios", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    const { texto } = comentarioCriarSchema.parse(req.body);
    return { dados: await editarComentario(id, texto, exigirLogin(req).id) };
  });

  app.delete("/comentarios/:id", { preHandler: exigirPermissao("comentarios", "arquivar") }, async (req) => {
    const { id } = params.parse(req.params);
    await excluirComentario(id, exigirLogin(req).id);
    return { dados: { ok: true } };
  });
}
