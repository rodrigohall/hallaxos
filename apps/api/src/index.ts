import { criarApp } from "./app";
import { config } from "./config";
import { limparSessoesExpiradas } from "./services/auth";

const app = criarApp();

app.listen({ port: config.porta, host: "0.0.0.0" }).then(() => {
  setInterval(() => limparSessoesExpiradas().catch(() => {}), 3600_000);
});
