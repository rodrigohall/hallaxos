import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ativoCriarSchema, ativoEditarSchema, ativoFiltrosSchema, idSchema, paginacaoSchema,
} from "@hallaxos/shared";
import {
  arquivarAtivo, criarAtivo, criarCategoria, editarAtivo, lancamentosDoAtivo, listarAtivos,
  listarCategorias, listarRelatorioPatrimonio, obterAtivo, reativarAtivo, timelineDoAtivo,
} from "../services/ativos";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });

export default async function rotasAtivos(app: FastifyInstance) {
  app.get("/ativos/categorias", { preHandler: exigirPermissao("ativos", "ler") }, async () => ({
    dados: await listarCategorias(),
  }));

  app.post(
    "/ativos/categorias",
    { preHandler: exigirPermissao("ativos", "criar") },
    async (req, reply) => {
      const input = z
        .object({ nome: z.string().trim().min(2), eh_veicular: z.boolean().default(false) })
        .parse(req.body);
      reply.code(201);
      return { dados: await criarCategoria(input.nome, input.eh_veicular) };
    }
  );

  app.get("/ativos", { preHandler: exigirPermissao("ativos", "ler") }, async (req) => {
    const filtros = ativoFiltrosSchema.parse(req.query);
    const { pagina, por_pagina } = paginacaoSchema.parse(req.query);
    const { dados, total } = await listarAtivos({
      busca: filtros.busca,
      status: filtros.status,
      categoriaId: filtros.categoria_id,
      incluirArquivados: filtros.incluir_arquivados,
      pagina,
      porPagina: por_pagina,
    });
    return { dados, meta: { total, pagina, por_pagina } };
  });

  app.post("/ativos", { preHandler: exigirPermissao("ativos", "criar") }, async (req, reply) => {
    const input = ativoCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarAtivo(input, exigirLogin(req).id) };
  });

  app.get(
    "/ativos/relatorio-patrimonio",
    { preHandler: exigirPermissao("ativos", "ler") },
    async (req) => {
      const { categoria_id, ordenar } = z
        .object({
          categoria_id: z.string().uuid().optional(),
          ordenar: z.enum(["fipe", "receita", "lucro", "custo"]).optional(),
        })
        .parse(req.query);
      return { dados: await listarRelatorioPatrimonio({ categoriaId: categoria_id, ordenar }) };
    }
  );

  app.get("/ativos/:id", { preHandler: exigirPermissao("ativos", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await obterAtivo(id) };
  });

  app.patch("/ativos/:id", { preHandler: exigirPermissao("ativos", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = ativoEditarSchema.parse(req.body);
    return { dados: await editarAtivo(id, input, exigirLogin(req).id) };
  });

  app.delete("/ativos/:id", { preHandler: exigirPermissao("ativos", "arquivar") }, async (req) => {
    const { id } = params.parse(req.params);
    await arquivarAtivo(id, exigirLogin(req).id);
    return { dados: { ok: true } };
  });

  app.post(
    "/ativos/:id/reativar",
    { preHandler: exigirPermissao("ativos", "arquivar") },
    async (req) => {
      const { id } = params.parse(req.params);
      return { dados: await reativarAtivo(id, exigirLogin(req).id) };
    }
  );

  app.get(
    "/ativos/:id/timeline",
    { preHandler: exigirPermissao("timeline", "ler") },
    async (req) => {
      const { id } = params.parse(req.params);
      const { antes_de } = z.object({ antes_de: idSchema.optional() }).parse(req.query);
      return { dados: await timelineDoAtivo(id, antes_de) };
    }
  );

  // Lançamentos vinculados ao ativo — diretos (custo do ativo) + herdados via
  // operação/manutenção (consulta, não cópia). Gated por `lancamentos` para não
  // vazar o financeiro a quem não pode vê-lo (operador).
  app.get(
    "/ativos/:id/lancamentos",
    { preHandler: exigirPermissao("lancamentos", "ler") },
    async (req) => {
      const { id } = params.parse(req.params);
      return { dados: await lancamentosDoAtivo(id) };
    }
  );
}
