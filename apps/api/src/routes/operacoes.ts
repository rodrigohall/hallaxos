import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  idSchema, paginacaoSchema, operacaoFiltrosSchema, guinchoCriarSchema,
  locacaoCriarSchema, vendaCriarSchema, compraCriarSchema, transicaoSchema,
  operacaoEditarSchema,
} from "@hallaxos/shared";
import {
  listarOperacoes, obterOperacao, criarGuincho, criarLocacao, criarVenda,
  criarCompra, transicionar, previaFinanceira, editarOperacao, linkarAtivoOperacao,
} from "../services/operacoes";
import { listarTimeline } from "../services/timeline";
import { db } from "../db/client";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

const params = z.object({ id: idSchema });

export default async function rotasOperacoes(app: FastifyInstance) {
  app.get("/operacoes", { preHandler: exigirPermissao("operacoes", "ler") }, async (req) => {
    const f = operacaoFiltrosSchema.parse(req.query);
    const { pagina, por_pagina } = paginacaoSchema.parse(req.query);
    const { dados, total } = await listarOperacoes({
      tipo: f.tipo, status: f.status, clienteId: f.cliente_id, ativoId: f.ativo_id,
      busca: f.busca, situacao: f.situacao, pagina, porPagina: por_pagina,
    });
    return { dados, meta: { total, pagina, por_pagina } };
  });

  app.get("/operacoes/:id", { preHandler: exigirPermissao("operacoes", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await obterOperacao(id) };
  });

  app.get("/operacoes/:id/timeline", { preHandler: exigirPermissao("timeline", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    const { antes_de } = z.object({ antes_de: idSchema.optional() }).parse(req.query);
    return { dados: await listarTimeline(db, "operacao", id, antes_de) };
  });

  // Edição depois de lançada: descritivos + datas (retroativo). O valor vai pelo
  // lançamento vinculado (Financeiro), não aqui (decisão #49).
  app.patch("/operacoes/:id", { preHandler: exigirPermissao("operacoes", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = operacaoEditarSchema.parse(req.body);
    return { dados: await editarOperacao(id, input, exigirLogin(req).id) };
  });

  // Criação por tipo — núcleo + extensão (doc 01 §2)
  app.post("/operacoes/guincho", { preHandler: exigirPermissao("operacoes", "criar") }, async (req, reply) => {
    const input = guinchoCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarGuincho(input, exigirLogin(req).id) };
  });

  app.post("/operacoes/locacao", { preHandler: exigirPermissao("operacoes", "criar") }, async (req, reply) => {
    const input = locacaoCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarLocacao(input, exigirLogin(req).id) };
  });

  app.post("/operacoes/venda", { preHandler: exigirPermissao("operacoes", "criar") }, async (req, reply) => {
    const input = vendaCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarVenda(input, exigirLogin(req).id) };
  });

  app.post("/operacoes/compra", { preHandler: exigirPermissao("operacoes", "criar") }, async (req, reply) => {
    const input = compraCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarCompra(input, exigirLogin(req).id) };
  });

  // Prévia dos lançamentos a gerar na finalização (read-only) — a UI usa para
  // montar as parcelas editáveis antes de confirmar (doc 03 §1, regra 5).
  app.get("/operacoes/:id/previa-financeira", { preHandler: exigirPermissao("operacoes", "ler") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await previaFinanceira(id) };
  });

  // Sprint 14 · D1 — Linkar ativo à operação: um clique, dois vínculos
  // (operação↔ativo e lancamentos.ativo_id herdado), zero duplicação.
  app.post("/operacoes/:id/ativos", { preHandler: exigirPermissao("operacoes", "editar") }, async (req, reply) => {
    const { id } = params.parse(req.params);
    const { ativo_id } = z.object({ ativo_id: idSchema }).parse(req.body);
    reply.code(201);
    return { dados: await linkarAtivoOperacao(id, ativo_id, exigirLogin(req).id) };
  });

  // Transição de estado nomeada (o front solicita; o back decide — doc 03)
  app.post("/operacoes/:id/transicao", { preHandler: exigirPermissao("operacoes", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    const input = transicaoSchema.parse(req.body);
    const u = exigirLogin(req);
    return { dados: await transicionar(id, input, { id: u.id, papel: u.papel }) };
  });
}
