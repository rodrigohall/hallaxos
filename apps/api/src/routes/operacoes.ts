import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  idSchema, paginacaoSchema, guinchoCriarSchema, guinchoConcluirSchema,
  operacaoCancelarSchema, operacaoFiltrosSchema,
} from "@hallaxos/shared";
import {
  caminhoesDisponiveis, criarGuincho, listarGuinchos, obterGuincho, transicionarGuincho,
} from "../services/guincho";
import { listarTimeline } from "../services/timeline";
import { db } from "../db/client";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });

export default async function rotasOperacoes(app: FastifyInstance) {
  app.get("/guinchos", { preHandler: exigirPermissao("operacoes", "ler") }, async (req) => {
    const f = operacaoFiltrosSchema.parse(req.query);
    const { pagina, por_pagina } = paginacaoSchema.parse(req.query);
    const { dados, total } = await listarGuinchos({ status: f.status, busca: f.busca, pagina, porPagina: por_pagina });
    return { dados, meta: { total, pagina, por_pagina } };
  });

  app.get(
    "/guinchos/caminhoes-disponiveis",
    { preHandler: exigirPermissao("operacoes", "criar") },
    async () => ({ dados: await caminhoesDisponiveis() })
  );

  app.post("/guinchos", { preHandler: exigirPermissao("operacoes", "criar") }, async (req, reply) => {
    const input = guinchoCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarGuincho(input, exigirLogin(req).id) };
  });

  app.get("/guinchos/:id", { preHandler: exigirPermissao("operacoes", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await obterGuincho(id) };
  });

  app.get("/guinchos/:id/timeline", { preHandler: exigirPermissao("timeline", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    const { antes_de } = z.object({ antes_de: idSchema.optional() }).parse(req.query);
    return { dados: await listarTimeline(db, "operacao", id, antes_de) };
  });

  app.post("/guinchos/:id/a-caminho", { preHandler: exigirPermissao("operacoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await transicionarGuincho(id, "a_caminho", exigirLogin(req).id) };
  });

  app.post("/guinchos/:id/em-execucao", { preHandler: exigirPermissao("operacoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await transicionarGuincho(id, "em_execucao", exigirLogin(req).id) };
  });

  app.post("/guinchos/:id/concluir", { preHandler: exigirPermissao("operacoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = guinchoConcluirSchema.parse(req.body ?? {});
    return { dados: await transicionarGuincho(id, "concluido", exigirLogin(req).id, input) };
  });

  app.post("/guinchos/:id/cancelar", { preHandler: exigirPermissao("operacoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    const { motivo } = operacaoCancelarSchema.parse(req.body);
    return { dados: await transicionarGuincho(id, "cancelada", exigirLogin(req).id, undefined, motivo) };
  });
}
