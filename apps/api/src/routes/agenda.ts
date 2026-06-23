import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema, agendaFiltrosSchema, eventoAgendaCriarSchema } from "@hallaxos/shared";
import {
  listarAgenda, criarEventoAgenda, alternarConcluidoEvento, excluirEventoAgenda,
} from "../services/agenda";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });

export default async function rotasAgenda(app: FastifyInstance) {
  app.get("/agenda", { preHandler: exigirPermissao("agenda", "ler") }, async (req) => {
    const { de, ate, tipo } = agendaFiltrosSchema.parse(req.query);
    return { dados: await listarAgenda(de, ate, tipo) };
  });

  app.post("/agenda", { preHandler: exigirPermissao("agenda", "criar") }, async (req, reply) => {
    const input = eventoAgendaCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarEventoAgenda(input, exigirLogin(req).id) };
  });

  app.post("/agenda/:id/concluir", { preHandler: exigirPermissao("agenda", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await alternarConcluidoEvento(id) };
  });

  app.delete("/agenda/:id", { preHandler: exigirPermissao("agenda", "arquivar") }, async (req) => {
    const { id } = params.parse(req.params);
    await excluirEventoAgenda(id, exigirLogin(req).id);
    return { dados: { ok: true } };
  });
}
