import { criarApp } from "./app";
import { config } from "./config";
import { limparSessoesExpiradas } from "./services/auth";
import { garantirAdminInicial } from "./db/bootstrap";

const app = criarApp();

garantirAdminInicial()
  .then(() => app.listen({ port: config.porta, host: "0.0.0.0" }))
  .then(() => {
    setInterval(() => limparSessoesExpiradas().catch(() => {}), 3600_000);
  })
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
