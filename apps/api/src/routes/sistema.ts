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

  // Sprint 14 · F1: além do período nomeado, aceita intervalo customizado
  // (?de=YYYY-MM-DD&ate=YYYY-MM-DD) — quando os dois vêm, têm precedência.
  const intervaloDe = (q: { de?: string; ate?: string }) =>
    q.de && q.ate ? { de: q.de <= q.ate ? q.de : q.ate, ate: q.de <= q.ate ? q.ate : q.de } : undefined;

  app.get(
    "/dashboard/financeiro",
    { preHandler: exigirPermissao("dashboard_financeiro", "ler") },
    async (req) => {
      const q = z
        .object({
          periodo: z.enum(["hoje", "semana", "mes", "ano", "ultimos30"]).default("hoje"),
          avencer: z.coerce.number().int().min(1).max(90).default(7),
          de: z.string().date().optional(),
          ate: z.string().date().optional(),
        })
        .parse(req.query);
      return {
        dados: await montarFinanceiro(exigirLogin(req).papel, q.periodo, q.avencer, intervaloDe(q)),
      };
    }
  );

  app.get(
    "/dashboard/financeiro/por-origem",
    { preHandler: exigirPermissao("dashboard_financeiro", "ler") },
    async (req) => {
      const q = z
        .object({
          periodo: z.enum(["hoje", "semana", "mes", "ano", "ultimos30"]).default("mes"),
          de: z.string().date().optional(),
          ate: z.string().date().optional(),
        })
        .parse(req.query);
      return {
        dados: await montarFinanceiroPorOrigem(exigirLogin(req).papel, q.periodo, intervaloDe(q)),
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

  // Sprint 14 · B3: resolve um link do Google Maps em coordenadas. Links curtos
  // (maps.app.goo.gl) não trazem lat/lng na URL — é preciso seguir o redirect
  // no servidor e extrair da URL final. Só hosts do Maps são aceitos (anti-SSRF);
  // em falha devolve lat/lng nulos e o front degrada para link clicável sem mapa.
  app.get("/geo/resolver", { preHandler: exigirPermissao("operacoes", "criar") }, async (req) => {
    const { url } = z.object({ url: z.string().url() }).parse(req.query);
    const HOSTS_MAPS = new Set([
      "maps.app.goo.gl", "goo.gl", "maps.google.com", "www.google.com",
      "google.com", "maps.google.com.br", "www.google.com.br",
    ]);
    const origem = new URL(url);
    if (!HOSTS_MAPS.has(origem.hostname)) {
      return { dados: { lat: null, lng: null, url_final: null } };
    }
    const extrair = (u: string): { lat: number; lng: number } | null => {
      // !3d<lat>!4d<lng> é a posição do marcador (mais precisa que o centro @)
      for (const re of [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&]q(?:uery)?=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/]) {
        const m = u.match(re);
        if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
      }
      return null;
    };
    try {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), 8000);
      const resp = await fetch(url, { redirect: "follow", signal: controle.signal });
      clearTimeout(timer);
      const final = resp.url ? decodeURIComponent(resp.url) : url;
      const coords = extrair(final);
      return { dados: { lat: coords?.lat ?? null, lng: coords?.lng ?? null, url_final: resp.url ?? null } };
    } catch {
      return { dados: { lat: null, lng: null, url_final: null } };
    }
  });

  app.get("/saude", async () => ({ dados: { ok: true } }));

  // Versão em execução: o SHA do commit é carimbado na imagem no build (ver
  // Dockerfile + instalar.sh). Serve para confirmar, do lado de fora, que o
  // deploy realmente trocou os containers — quando o "deploy verde" e o bug
  // persistem, é porque o container ficou no código antigo (cache do Docker).
  app.get("/versao", async () => ({ dados: { versao: process.env.HALLAX_VERSAO ?? "dev" } }));
}
