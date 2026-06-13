import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import authPlugin from "./plugins/auth";
import rotasAuth from "./routes/auth";
import rotasPessoas from "./routes/pessoas";
import rotasUsuarios from "./routes/usuarios";
import rotasSistema from "./routes/sistema";
import rotasAtivos from "./routes/ativos";
import rotasOperacoes from "./routes/operacoes";
import rotasManutencoes from "./routes/manutencoes";
import rotasAgenda from "./routes/agenda";
import rotasDocumentos from "./routes/documentos";
import rotasComentarios from "./routes/comentarios";
import rotasFinanceiro from "./routes/financeiro";
import rotasNotificacoes from "./routes/notificacoes";
import rotasTags from "./routes/tags";
import rotasFavoritos from "./routes/favoritos";
import { AppError } from "./lib/erros";
import { config } from "./config";

export function criarApp() {
  // trustProxy: em produção o Caddy faz reverse-proxy de /api/* para a API, então
  // sem isto req.ip seria o IP interno do Caddy para TODOS os clientes — o que
  // colapsaria o rate limit por IP num único balde e registraria o IP errado na
  // timeline. Com trustProxy, req.ip vem do X-Forwarded-For (o cliente real).
  const app = Fastify({ logger: { level: "info" }, trustProxy: true });

  app.register(cookie);
  app.register(multipart, { limits: { fileSize: config.uploadMaxBytes, files: 20 } });
  // Rate limiting global: máximo 200 req/min por IP. Login tem seu próprio limite no Sprint 7.
  // errorResponseBuilder mantém o 429 no mesmo envelope {erro:{codigo,mensagem}} da API —
  // sem isto o frontend não acha a mensagem e mostra "Erro inesperado.".
  app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      erro: {
        codigo: "MUITAS_REQUISICOES",
        mensagem: `Muitas requisições. Tente novamente em ${Math.ceil(ctx.ttl / 1000)} segundos.`,
        detalhes: null,
      },
    }),
  });
  app.register(authPlugin);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.status).send({
        erro: { codigo: err.codigo, mensagem: err.message, detalhes: err.detalhes ?? null },
      });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({
        erro: {
          codigo: "VALIDACAO",
          mensagem: "Dados inválidos. Verifique os campos destacados.",
          detalhes: err.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
        },
      });
    }
    app.log.error(err);
    return reply.code(500).send({
      erro: { codigo: "ERRO_INTERNO", mensagem: "Erro interno. Tente novamente.", detalhes: null },
    });
  });

  app.register(
    async (v1) => {
      await v1.register(rotasAuth);
      await v1.register(rotasPessoas);
      await v1.register(rotasUsuarios);
      await v1.register(rotasAtivos);
      await v1.register(rotasOperacoes);
      await v1.register(rotasManutencoes);
      await v1.register(rotasAgenda);
      await v1.register(rotasDocumentos);
      await v1.register(rotasComentarios);
      await v1.register(rotasFinanceiro);
      await v1.register(rotasNotificacoes);
      await v1.register(rotasTags);
      await v1.register(rotasFavoritos);
      await v1.register(rotasSistema);
    },
    { prefix: "/api/v1" }
  );

  return app;
}
