import { mkdir, access, constants } from "node:fs/promises";
import { criarApp } from "./app";
import { config } from "./config";
import { limparSessoesExpiradas } from "./services/auth";
import { garantirAdminInicial, garantirCategoriasPadrao } from "./db/bootstrap";
import { verificarPrazos } from "./services/notificacoes";
import { jobReferenciasOrfas } from "./services/integridade";

const app = criarApp();

// Garante que o diretório de arquivos existe e é gravável — falha cedo e claro
// se o volume de dados estiver mal montado (causa comum de upload quebrado).
async function verificarArmazenamento() {
  try {
    await mkdir(config.arquivosDir, { recursive: true });
    await access(config.arquivosDir, constants.W_OK);
    app.log.info(`Armazenamento de arquivos OK: ${config.arquivosDir}`);
  } catch (e) {
    app.log.error(
      `Diretório de arquivos não gravável (${config.arquivosDir}) — uploads vão falhar. ` +
        `Verifique o volume de dados. Detalhe: ${(e as Error).message}`
    );
  }
}

garantirAdminInicial()
  .then(() => garantirCategoriasPadrao())
  .then(() => verificarArmazenamento())
  .then(() => app.listen({ port: config.porta, host: "0.0.0.0" }))
  .then(() => {
    setInterval(() => limparSessoesExpiradas().catch(() => {}), 3600_000);
    // Verifica prazos uma vez por hora: devoluções atrasadas, CNH/doc vencendo, etc.
    setInterval(() => verificarPrazos().catch(() => {}), 3600_000);
    verificarPrazos().catch(() => {});
    // Detector de referências órfãs (doc 04 §0): varre 1×/dia e alerta no log
    // (deve sempre achar zero). Roda no arranque e a cada 24h.
    const rodarOrfaos = () => jobReferenciasOrfas(app.log).catch((e) => app.log.error(e));
    setInterval(rodarOrfaos, 86_400_000);
    rodarOrfaos();
  })
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
