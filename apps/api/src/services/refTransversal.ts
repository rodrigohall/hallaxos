// Garantia de integridade das referências transversais (doc 04 §0).
// Único ponto do sistema que valida entidade_tipo/entidade_id — nunca
// reimplementar em chamadores.
import { sql } from "drizzle-orm";
import type { ReferenciaEntidade } from "@hallaxos/shared";
import type { DbConn } from "../db/client";
import { naoEncontrado } from "../lib/erros";

const TABELAS: Record<ReferenciaEntidade, string> = {
  pessoa: "pessoas",
  ativo: "ativos",
  operacao: "operacoes",
  manutencao: "manutencoes",
  lancamento: "lancamentos",
  documento: "documentos",
  usuario: "usuarios",
};

export async function validarReferencia(
  conn: DbConn,
  tipo: ReferenciaEntidade,
  id: string
): Promise<void> {
  const tabela = TABELAS[tipo];
  const r = await conn.execute(
    sql`SELECT 1 FROM ${sql.identifier(tabela)} WHERE id = ${id} FOR KEY SHARE`
  );
  if (r.rows.length === 0) throw naoEncontrado(`Referência (${tipo})`);
}
