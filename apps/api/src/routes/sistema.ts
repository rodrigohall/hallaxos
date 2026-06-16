// Dashboard, busca global e timeline genérica.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema, REFERENCIA_ENTIDADES } from "@hallaxos/shared";
import { montarDashboard } from "../services/dashboard";
import { buscar } from "../services/busca";
import { listarTimeline } from "../services/timeline";
import { db } from "../db/client";
import { exigirLogin, exigirPermissao } from "../plugins/auth";

export default async function rotasSistema(app: FastifyInstance) {
  app.get(
    "/dashboard",
    { preHandler: exigirPermissao("dashboard_operacional", "ler") },
    async (req) => ({ dados: await montarDashboard(exigirLogin(req).papel) })
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

  app.get("/saude", async () => ({ dados: { ok: true } }));

  // Versão em execução: o SHA do commit é carimbado na imagem no build (ver
  // Dockerfile + instalar.sh). Serve para confirmar, do lado de fora, que o
  // deploy realmente trocou os containers — quando o "deploy verde" e o bug
  // persistem, é porque o container ficou no código antigo (cache do Docker).
  app.get("/versao", async () => ({ dados: { versao: process.env.HALLAX_VERSAO ?? "dev" } }));
}
