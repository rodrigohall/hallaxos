import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
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
import rotasCopiloto from "./routes/copiloto";
import { AppError } from "./lib/erros";
import { config } from "./config";

export function criarApp() {
  // trustProxy: em produção o Caddy faz reverse-proxy de /api/* para a API, então
  // sem isto req.ip seria o IP interno do Caddy para TODOS os clientes — o que
  // colapsaria o rate limit por IP num único balde e registraria o IP errado na
  // timeline. Com trustProxy, req.ip vem do X-Forwarded-For (o cliente real).
  const app = Fastify({ logger: { level: "info" }, trustProxy: true });

  // O frontend manda `Content-Type: application/json` em toda requisição (ver
  // api.ts), inclusive em POSTs sem corpo (ex.: iniciar manutenção) e DELETEs.
  // O parser JSON padrão do Fastify rejeita corpo vazio com
  // FST_ERR_CTP_EMPTY_JSON_BODY (400) — que o nosso error handler convertia em
  // 500 "Erro interno". Tratamos corpo vazio como `undefined` (as rotas já
  // fazem `req.body ?? {}`); corpo inválido continua sendo 400.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, corpo, done) => {
      const texto = (corpo as string).trim();
      if (texto.length === 0) return done(null, undefined);
      try {
        done(null, JSON.parse(texto));
      } catch {
        const erro = new AppError(400, "JSON_INVALIDO", "Corpo da requisição não é um JSON válido.");
        done(erro);
      }
    }
  );

  app.register(cookie);
  // CORS fechado por padrão (same-origin em dev e prod). origin:false não emite
  // Access-Control-Allow-Origin → o navegador bloqueia qualquer origem cruzada.
  // Defina CORS_ORIGINS para liberar origens específicas (com cookies/credenciais).
  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: true,
  });
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
    // Erros do próprio Fastify (parse de corpo, payload grande, etc.) trazem um
    // statusCode 4xx. Não são falha do servidor: devolvemos o 4xx real com a
    // mensagem, em vez de mascarar como 500 (era o que escondia o corpo vazio).
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({
        erro: { codigo: (err as { code?: string }).code ?? "REQUISICAO_INVALIDA", mensagem: (err as Error).message, detalhes: null },
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
      await v1.register(rotasCopiloto);
      await v1.register(rotasSistema);
    },
    { prefix: "/api/v1" }
  );

  return app;
}
