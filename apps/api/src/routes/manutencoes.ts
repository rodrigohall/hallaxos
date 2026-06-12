import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  idSchema, paginacaoSchema, manutencaoCriarSchema, manutencaoEditarSchema,
  manutencaoConcluirSchema, manutencaoFiltrosSchema,
} from "@hallaxos/shared";
import {
  listarManutencoes, obterManutencao, criarManutencao, editarManutencao,
  iniciarManutencao, concluirManutencao, cancelarManutencao,
} from "../services/manutencoes";
import { listarTimeline } from "../services/timeline";
import { db } from "../db/client";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });

export default async function rotasManutencoes(app: FastifyInstance) {
  app.get("/manutencoes", { preHandler: exigirPermissao("manutencoes", "ler") }, async (req) => {
    const f = manutencaoFiltrosSchema.parse(req.query);
    const { pagina, por_pagina } = paginacaoSchema.parse(req.query);
    const { dados, total } = await listarManutencoes({
      status: f.status, tipo: f.tipo, ativoId: f.ativo_id, busca: f.busca,
      pagina, porPagina: por_pagina,
    });
    return { dados, meta: { total, pagina, por_pagina } };
  });

  app.get("/manutencoes/:id", { preHandler: exigirPermissao("manutencoes", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await obterManutencao(id) };
  });

  app.get("/manutencoes/:id/timeline", { preHandler: exigirPermissao("timeline", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    const { antes_de } = z.object({ antes_de: idSchema.optional() }).parse(req.query);
    return { dados: await listarTimeline(db, "manutencao", id, antes_de) };
  });

  app.post("/manutencoes", { preHandler: exigirPermissao("manutencoes", "criar") }, async (req, reply) => {
    const input = manutencaoCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarManutencao(input, exigirLogin(req).id) };
  });

  app.patch("/manutencoes/:id", { preHandler: exigirPermissao("manutencoes", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = manutencaoEditarSchema.parse(req.body);
    return { dados: await editarManutencao(id, input, exigirLogin(req).id) };
  });

  app.post("/manutencoes/:id/iniciar", { preHandler: exigirPermissao("manutencoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await iniciarManutencao(id, exigirLogin(req).id) };
  });

  app.post("/manutencoes/:id/concluir", { preHandler: exigirPermissao("manutencoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = manutencaoConcluirSchema.parse(req.body ?? {});
    return { dados: await concluirManutencao(id, input, exigirLogin(req).id) };
  });

  app.post("/manutencoes/:id/cancelar", { preHandler: exigirPermissao("manutencoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    const { motivo } = z.object({ motivo: z.string().trim().min(3) }).parse(req.body);
    return { dados: await cancelarManutencao(id, motivo, exigirLogin(req).id) };
  });
}
