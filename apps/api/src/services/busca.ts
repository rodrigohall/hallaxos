// Busca global (doc 04 §7): índice derivado e reconstruível no Postgres.
// A mesma normalização vale para indexação e consulta.
import { sql } from "drizzle-orm";
import { pode, type PapelUsuario, type ReferenciaEntidade } from "@hallaxos/shared";
import type { DbConn } from "../db/client";
import { normalizar, soDigitosTexto } from "../lib/texto";

export interface EntradaIndice {
  entidadeTipo: ReferenciaEntidade;
  entidadeId: string;
  titulo: string;
  subtitulo: string;
  termos: Array<string | null | undefined>;
  termosNumericos?: Array<string | null | undefined>;
}

export async function indexar(conn: DbConn, e: EntradaIndice): Promise<void> {
  const termos = normalizar(e.termos.filter(Boolean).join(" "));
  const numericos = (e.termosNumericos ?? [])
    .filter((v): v is string => !!v)
    .map(soDigitosTexto)
    .filter(Boolean)
    .join(" ");
  await conn.execute(sql`
    INSERT INTO busca_indice (entidade_tipo, entidade_id, titulo, subtitulo, termos, termos_numericos, tsv)
    VALUES (${e.entidadeTipo}, ${e.entidadeId}, ${e.titulo}, ${e.subtitulo}, ${termos}, ${numericos},
            to_tsvector('simple', ${termos}))
    ON CONFLICT (entidade_tipo, entidade_id) DO UPDATE SET
      titulo = EXCLUDED.titulo,
      subtitulo = EXCLUDED.subtitulo,
      termos = EXCLUDED.termos,
      termos_numericos = EXCLUDED.termos_numericos,
      tsv = EXCLUDED.tsv,
      atualizado_em = now()
  `);
}

export async function removerDoIndice(
  conn: DbConn,
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string
): Promise<void> {
  await conn.execute(
    sql`DELETE FROM busca_indice WHERE entidade_tipo = ${entidadeTipo} AND entidade_id = ${entidadeId}`
  );
}

export interface ResultadoBusca {
  entidade_tipo: ReferenciaEntidade;
  entidade_id: string;
  titulo: string;
  subtitulo: string;
}

export async function buscar(
  conn: DbConn,
  consulta: string,
  papel: PapelUsuario,
  limite = 20
): Promise<ResultadoBusca[]> {
  const digitos = soDigitosTexto(consulta);
  const texto = normalizar(consulta);
  const buscaNumerica = digitos.length >= 3 && digitos.length >= texto.replace(/\s/g, "").length / 2;

  const r = buscaNumerica
    ? await conn.execute(sql`
        SELECT entidade_tipo, entidade_id, titulo, subtitulo
        FROM busca_indice
        WHERE termos_numericos LIKE ${"%" + digitos + "%"}
        ORDER BY titulo LIMIT ${limite}`)
    : await conn.execute(sql`
        SELECT entidade_tipo, entidade_id, titulo, subtitulo
        FROM busca_indice
        WHERE termos LIKE ${"%" + texto + "%"}
           OR word_similarity(${texto}, termos) > 0.45
        ORDER BY word_similarity(${texto}, termos) DESC, titulo
        LIMIT ${limite}`);

  // A busca respeita a matriz de permissões (doc 05 §3, nota 4)
  const podeFinanceiro = pode(papel, "lancamentos", "ler");
  return (r.rows as unknown as ResultadoBusca[]).filter(
    (item) => item.entidade_tipo !== "lancamento" || podeFinanceiro
  );
}
