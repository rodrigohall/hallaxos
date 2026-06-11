import type { FastifyInstance } from "fastify";
import {
  idSchema, paginacaoSchema, pessoaCriarSchema, pessoaEditarSchema, pessoaFiltrosSchema,
} from "@hallaxos/shared";
import { z } from "zod";
import {
  arquivarPessoa, criarPessoa, editarPessoa, listarPessoas, obterPessoa,
} from "../services/pessoas";
import { listarTimeline } from "../services/timeline";
import { db } from "../db/client";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });

export default async function rotasPessoas(app: FastifyInstance) {
  app.get("/pessoas", { preHandler: exigirPermissao("pessoas", "ler") }, async (req) => {
    const filtros = pessoaFiltrosSchema.parse(req.query);
    const { pagina, por_pagina } = paginacaoSchema.parse(req.query);
    const { dados, total } = await listarPessoas({
      busca: filtros.busca,
      papel: filtros.papel,
      incluirArquivados: filtros.incluir_arquivados,
      pagina,
      porPagina: por_pagina,
    });
    return { dados, meta: { total, pagina, por_pagina } };
  });

  app.post("/pessoas", { preHandler: exigirPermissao("pessoas", "criar") }, async (req, reply) => {
    const input = pessoaCriarSchema.parse(req.body);
    const pessoa = await criarPessoa(input, exigirLogin(req).id);
    reply.code(201);
    return { dados: pessoa };
  });

  app.get("/pessoas/:id", { preHandler: exigirPermissao("pessoas", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await obterPessoa(id) };
  });

  app.patch("/pessoas/:id", { preHandler: exigirPermissao("pessoas", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = pessoaEditarSchema.parse(req.body);
    return { dados: await editarPessoa(id, input, exigirLogin(req).id) };
  });

  app.delete("/pessoas/:id", { preHandler: exigirPermissao("pessoas", "arquivar") }, async (req) => {
    const { id } = params.parse(req.params);
    await arquivarPessoa(id, exigirLogin(req).id);
    return { dados: { ok: true } };
  });

  app.get(
    "/pessoas/:id/timeline",
    { preHandler: exigirPermissao("timeline", "ler") },
    async (req) => {
      const { id } = params.parse(req.params);
      const { antes_de } = z.object({ antes_de: idSchema.optional() }).parse(req.query);
      return { dados: await listarTimeline(db, "pessoa", id, antes_de) };
    }
  );
}
