#!/usr/bin/env node
// Comando único de desenvolvimento: sobe o banco, migra, semeia e inicia API + Web.
import { execSync, spawn } from "node:child_process";

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });

const temBancoExterno = !!process.env.DATABASE_URL;
if (!temBancoExterno) {
  try {
    sh("docker compose up -d db --wait");
  } catch {
    console.error(
      "\nNão foi possível subir o Postgres via Docker.\n" +
        "Suba um Postgres 16 manualmente e defina DATABASE_URL no .env.\n"
    );
    process.exit(1);
  }
}

sh("pnpm --filter @hallaxos/api migrate");
sh("pnpm --filter @hallaxos/api seed");

spawn(
  "pnpm",
  ["exec", "concurrently", "-n", "api,web", "-c", "cyan,magenta",
    "pnpm --filter @hallaxos/api dev",
    "pnpm --filter @hallaxos/web dev"],
  { stdio: "inherit" }
);
