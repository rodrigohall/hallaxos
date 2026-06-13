import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema } from "@hallaxos/shared";
import {
  listarNotificacoes, contarNaoLidas, marcarLida, marcarTodasLidas,
} from "../services/notificacoes";
import { exigirLogin } from "../plugins/auth";

export default async function rotasNotificacoes(app: FastifyInstance) {
  app.get("/notificacoes/contador", async (req) => {
    const usuario = exigirLogin(req);
    return { dados: { naoLidas: await contarNaoLidas(usuario.id) } };
  });

  app.get("/notificacoes", async (req) => {
    const usuario = exigirLogin(req);
    return { dados: await listarNotificacoes(usuario.id) };
  });

  app.patch("/notificacoes/marcar-todas-lidas", async (req) => {
    const usuario = exigirLogin(req);
    await marcarTodasLidas(usuario.id);
    return { dados: { ok: true } };
  });

  app.patch("/notificacoes/:id/lida", async (req) => {
    const usuario = exigirLogin(req);
    const { id } = z.object({ id: idSchema }).parse(req.params);
    await marcarLida(id, usuario.id);
    return { dados: { ok: true } };
  });
}
