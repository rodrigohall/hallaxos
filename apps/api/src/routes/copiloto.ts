import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { perguntar, MAX_TURNOS_HISTORICO } from "../services/copiloto";
import { exigirLogin } from "../plugins/auth";

export default async function rotasCopiloto(app: FastifyInstance) {
  // Copiloto de IA (Sprint 9) — Fase 1, só leitura. Qualquer usuário logado pode
  // perguntar; as ferramentas por trás filtram/revalidam o que o papel pode ver
  // (doc 05). Desligado até IA_API_KEY estar configurada (responde 503 sem custo).
  //
  // Rate limit próprio (20/min por IP) além do global de 200/min: limita o gasto
  // com a IA mesmo que o resto da API esteja folgado (decisão #47).
  app.post(
    "/copiloto/perguntar",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      // Sprint 17: o chat manda os turnos anteriores para o copiloto poder
      // perguntar o que falta e continuar de onde parou. Sem tabela nova — a
      // conversa vive no navegador, e aqui só chega o recorte recente.
      const { pergunta, historico } = z
        .object({
          pergunta: z.string().min(1).max(2000),
          historico: z
            .array(z.object({ pergunta: z.string().min(1).max(2000), resposta: z.string().min(1).max(8000) }))
            .max(MAX_TURNOS_HISTORICO)
            .default([]),
        })
        .parse(req.body);
      const usuario = exigirLogin(req);
      return { dados: await perguntar(pergunta, usuario.papel, historico) };
    }
  );
}
