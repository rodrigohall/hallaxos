// Runner de migrations: aplica src/db/migrations/*.sql em ordem, uma vez cada.
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config";

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

async function migrar() {
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS _migrations (
         nome text PRIMARY KEY,
         executada_em timestamptz NOT NULL DEFAULT now()
       )`
    );
    const arquivos = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const arquivo of arquivos) {
      const { rowCount } = await client.query("SELECT 1 FROM _migrations WHERE nome = $1", [arquivo]);
      if (rowCount) continue;
      const sql = await readFile(join(dir, arquivo), "utf8");
      console.log(`Aplicando ${arquivo}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (nome) VALUES ($1)", [arquivo]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    console.log("Banco atualizado.");
  } finally {
    await client.end();
  }
}

migrar().catch((e) => {
  console.error(e);
  process.exit(1);
});
