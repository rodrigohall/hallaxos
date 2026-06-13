import { test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../app";

// Porta de qualidade de arranque: garante que TODOS os plugins registram sem
// erro — typecheck e build não pegam incompatibilidade de versão de plugin
// (ex.: @fastify/rate-limit 9.x exige Fastify 4, mas rodamos Fastify 5), que
// só estoura em runtime e derrubava a API em produção. app.ready() executa o
// boot sem abrir porta nem tocar no banco.
test("app inicializa e registra todos os plugins (sem mismatch de versão)", async () => {
  const app = criarApp();
  await assert.doesNotReject(async () => {
    await app.ready();
  });
  await app.close();
});
