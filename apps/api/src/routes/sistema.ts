// Dashboard, busca global e timeline genérica.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { idSchema, REFERENCIA_ENTIDADES, EVENTOS_TIMELINE } from "@hallaxos/shared";
import { montarDashboard, montarFinanceiro, montarFinanceiroPorOrigem } from "../services/dashboard";
import { buscar } from "../services/busca";
import { listarTimeline } from "../services/timeline";
import { db } from "../db/client";
import { timeline, usuarios } from "../db/schema";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

export default async function rotasSistema(app: FastifyInstance) {
  app.get(
    "/dashboard",
    { preHandler: exigirPermissao("dashboard_operacional", "ler") },
    async (req) => ({ dados: await montarDashboard(exigirLogin(req).papel) })
  );

  app.get(
    "/dashboard/financeiro",
    { preHandler: exigirPermissao("dashboard_financeiro", "ler") },
    async (req) => {
      const { periodo, avencer } = z
        .object({
          periodo: z.enum(["hoje", "semana", "mes", "ano", "ultimos30"]).default("hoje"),
          avencer: z.coerce.number().int().min(1).max(90).default(7),
        })
        .parse(req.query);
      return {
        dados: await montarFinanceiro(exigirLogin(req).papel, periodo, avencer),
      };
    }
  );

  app.get(
    "/dashboard/financeiro/por-origem",
    { preHandler: exigirPermissao("dashboard_financeiro", "ler") },
    async (req) => {
      const { periodo } = z
        .object({ periodo: z.enum(["hoje", "semana", "mes", "ano", "ultimos30"]).default("mes") })
        .parse(req.query);
      return {
        dados: await montarFinanceiroPorOrigem(exigirLogin(req).papel, periodo),
      };
    }
  );

  app.get("/busca", { preHandler: exigirPermissao("busca", "ler") }, async (req) => {
    const { q } = z.object({ q: z.string().min(2) }).parse(req.query);
    return { dados: await buscar(db, q, exigirLogin(req).papel) };
  });

  app.get("/timeline", { preHandler: exigirPermissao("timeline", "ler") }, async (req) => {
    const query = z
      .object({
        entidade_tipo: z.enum(REFERENCIA_ENTIDADES),
        entidade_id: idSchema,
        antes_de: idSchema.optional(),
      })
      .parse(req.query);
    return {
      dados: await listarTimeline(db, query.entidade_tipo, query.entidade_id, query.antes_de),
    };
  });

  // Auditoria global: todos os eventos da timeline, com filtros.
  // Restrito a admin e gestor (usa a permissão de "usuários/ler" como proxy).
  app.get("/auditoria", { preHandler: exigirPermissao("usuarios", "ler") }, async (req) => {
    const q = z.object({
      entidade_tipo: z.enum(REFERENCIA_ENTIDADES).optional(),
      evento: z.enum(EVENTOS_TIMELINE).optional(),
      usuario_id: z.string().uuid().optional(),
      de: z.string().date().optional(),
      ate: z.string().date().optional(),
      pagina: z.coerce.number().int().min(1).default(1),
      por_pagina: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);

    const filtros = [];
    if (q.entidade_tipo) filtros.push(eq(timeline.entidadeTipo, q.entidade_tipo));
    if (q.evento) filtros.push(eq(timeline.evento, q.evento));
    if (q.usuario_id) filtros.push(eq(timeline.usuarioId, q.usuario_id));
    if (q.de) filtros.push(gte(timeline.createdAt, new Date(q.de)));
    if (q.ate) filtros.push(lte(timeline.createdAt, new Date(q.ate + "T23:59:59Z")));

    const where = filtros.length > 0 ? and(...filtros) : undefined;
    const countResult = await db.select({ total: count() }).from(timeline).where(where);
    const total = countResult[0]?.total ?? 0;
    const dados = await db
      .select({
        id: timeline.id,
        entidadeTipo: timeline.entidadeTipo,
        entidadeId: timeline.entidadeId,
        evento: timeline.evento,
        descricao: timeline.descricao,
        createdAt: timeline.createdAt,
        usuarioNome: usuarios.nome,
      })
      .from(timeline)
      .leftJoin(usuarios, eq(timeline.usuarioId, usuarios.id))
      .where(where)
      .orderBy(desc(timeline.createdAt))
      .limit(q.por_pagina)
      .offset((q.pagina - 1) * q.por_pagina);

    return { dados, meta: { total, pagina: q.pagina, por_pagina: q.por_pagina } };
  });

  app.get("/saude", async () => ({ dados: { ok: true } }));

  // Versão em execução: o SHA do commit é carimbado na imagem no build (ver
  // Dockerfile + instalar.sh). Serve para confirmar, do lado de fora, que o
  // deploy realmente trocou os containers — quando o "deploy verde" e o bug
  // persistem, é porque o container ficou no código antigo (cache do Docker).
  app.get("/versao", async () => ({ dados: { versao: process.env.HALLAX_VERSAO ?? "dev" } }));
}
