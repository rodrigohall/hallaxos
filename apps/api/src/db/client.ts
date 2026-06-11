import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config";
import * as schema from "./schema";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });
export const db = drizzle(pool, { schema });

export type Db = typeof db;
/** Transação ou conexão — todos os services aceitam ambos. */
export type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
