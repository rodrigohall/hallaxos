import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config";
import * as schema from "./schema";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });
const raiz = drizzle(pool, { schema });

type Raiz = typeof raiz;
type Transacao = Parameters<Parameters<Raiz["transaction"]>[0]>[0];

// Transação única (Sprint 17): o copiloto registra cliente + operação +
// transições + pagamento num clique, reusando os services de sempre — e cada um
// abre a própria `db.transaction` e lê pelo `db` global. Compor isso em
// transações separadas deixaria meio registro gravado se o terceiro passo
// falhasse (e as leituras fora da transação não enxergariam o que ela criou).
//
// Em vez de reescrever cada service em versão "DentroDe(tx)", o `db` exportado
// consulta um AsyncLocalStorage: dentro de `emTransacaoUnica`, toda chamada vai
// para a transação aberta, e o `db.transaction` de cada service vira um
// SAVEPOINT nela. Fora dela, nada muda — o proxy só repassa para a raiz.
const transacaoAtual = new AsyncLocalStorage<Transacao>();

export const db: Raiz = new Proxy(raiz, {
  get(alvo, prop) {
    const fonte = (transacaoAtual.getStore() ?? alvo) as Raiz;
    const valor = Reflect.get(fonte, prop, fonte);
    return typeof valor === "function" ? valor.bind(fonte) : valor;
  },
});

/** Roda `fn` numa transação só: tudo o que ela chamar pelo `db` — services
 *  inclusive — grava junto ou não grava nada. Aninhar reaproveita a externa. */
export function emTransacaoUnica<T>(fn: () => Promise<T>): Promise<T> {
  const aberta = transacaoAtual.getStore();
  if (aberta) return fn();
  return raiz.transaction((tx) => transacaoAtual.run(tx, fn));
}

export type Db = typeof db;
/** Transação ou conexão — todos os services aceitam ambos. */
export type DbConn = Db | Transacao;
