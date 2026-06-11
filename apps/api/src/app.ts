import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { ZodError } from "zod";
import authPlugin from "./plugins/auth";
import rotasAuth from "./routes/auth";
import rotasPessoas from "./routes/pessoas";
import rotasUsuarios from "./routes/usuarios";
import rotasSistema from "./routes/sistema";
import { AppError } from "./lib/erros";

export function criarApp() {
  const app = Fastify({ logger: { level: "info" } });

  app.register(cookie);
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
      await v1.register(rotasSistema);
    },
    { prefix: "/api/v1" }
  );

  return app;
}
