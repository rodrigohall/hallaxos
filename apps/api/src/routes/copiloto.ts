import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { perguntar } from "../services/copiloto";
import { exigirLogin } from "../plugins/auth";

export default async function rotasCopiloto(app: FastifyInstance) {
  // Copiloto de IA (Sprint 9). Qualquer usuário logado pode perguntar; a busca
  // por trás já filtra o que o papel dele pode ver (doc 05). Desligado até
  // IA_API_KEY estar configurada — nesse caso responde 503 IA_NAO_CONFIGURADA.
  app.post("/copiloto/perguntar", async (req) => {
    const { pergunta } = z
      .object({ pergunta: z.string().min(1).max(2000) })
      .parse(req.body);
    const usuario = exigirLogin(req);
    return { dados: await perguntar(pergunta, usuario.papel) };
  });
}
