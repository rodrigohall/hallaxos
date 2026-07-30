// Reconstrói o índice de busca do zero (doc 04 §7 — índice derivado).
//
// Exporta `reindexarTudo` para o arranque poder chamar (ver garantirIndiceBusca
// em bootstrap.ts). O módulo não tem mais efeito colateral de topo: quem roda
// pela linha de comando é o bloco no fim, atrás de uma checagem de entrypoint —
// antes, importar este arquivo derrubava o pool do servidor.
//
// Uso manual: pnpm --filter @hallaxos/api busca:reindexar
import { sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { db, pool, type DbConn } from "./client";
import { indexar } from "../services/busca";

/**
 * Versão do FORMATO do índice. Suba um número sempre que mudar o que entra em
 * título/subtítulo/termos de qualquer entidade — a API compara com o valor
 * gravado em meta_sistema e reindexa sozinha no arranque seguinte.
 *
 * 2 — Sprint 16: manutenções passam a ser indexadas.
 */
export const BUSCA_INDICE_VERSAO = 2;

export interface ResumoReindexacao {
  pessoas: number; ativos: number; operacoes: number;
  documentos: number; lancamentos: number; manutencoes: number;
}

/**
 * Apaga e reconstrói o índice inteiro, numa transação só: sem ela existe uma
 * janela — que pode durar segundos num banco grande — em que a busca global
 * responde vazio para todo mundo.
 */
export async function reindexarTudo(conn: DbConn = db): Promise<ResumoReindexacao> {
  return conn.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM busca_indice`);

    const pessoas = (await tx.execute(sql`
      SELECT id, nome, nome_fantasia, cpf_cnpj, email, telefone, telefone_secundario, cnh_numero, cidade
      FROM pessoas WHERE deleted_at IS NULL`)).rows as Record<string, string | null>[];
    for (const p of pessoas) {
      await indexar(tx, {
        entidadeTipo: "pessoa", entidadeId: p.id!, titulo: p.nome!, subtitulo: "Pessoa",
        termos: [p.nome, p.nome_fantasia, p.email, p.cidade],
        termosNumericos: [p.cpf_cnpj, p.telefone, p.telefone_secundario, p.cnh_numero],
      });
    }

    const ativos = (await tx.execute(sql`
      SELECT a.id, a.nome, a.codigo, a.status, a.observacoes, v.placa, v.marca, v.modelo, v.renavam, v.chassi, v.cor
      FROM ativos a LEFT JOIN ativos_veiculos v ON v.ativo_id = a.id
      WHERE a.deleted_at IS NULL`)).rows as Record<string, string | null>[];
    for (const a of ativos) {
      await indexar(tx, {
        entidadeTipo: "ativo", entidadeId: a.id!,
        titulo: a.placa ? `${a.nome} · ${a.placa}` : a.nome!,
        subtitulo: `Ativo · ${a.status} · ${a.codigo}`,
        termos: [a.nome, a.codigo, a.observacoes, a.placa, a.marca, a.modelo, a.chassi, a.cor],
        termosNumericos: [a.codigo, a.placa, a.renavam, a.chassi],
      });
    }

    const operacoes = (await tx.execute(sql`
      SELECT o.id, o.codigo, o.tipo, p.nome AS cliente FROM operacoes o
      JOIN pessoas p ON p.id = o.cliente_id WHERE o.deleted_at IS NULL`)).rows as Record<string, string>[];
    for (const o of operacoes) {
      await indexar(tx, {
        entidadeTipo: "operacao", entidadeId: o.id!, titulo: `${o.codigo} — ${o.tipo} · ${o.cliente}`,
        subtitulo: "Operação", termos: [o.codigo, o.tipo, o.cliente], termosNumericos: [o.codigo],
      });
    }

    // Manutenções nunca entraram no índice, embora a busca global e a
    // ferramenta busca_global do copiloto as prometessem (Sprint 16).
    const manutencoes = (await tx.execute(sql`
      SELECT m.id, m.descricao, m.tipo, m.status, a.nome AS ativo, a.codigo AS ativo_codigo, v.placa
      FROM manutencoes m
      JOIN ativos a ON a.id = m.ativo_id
      LEFT JOIN ativos_veiculos v ON v.ativo_id = a.id
      WHERE m.deleted_at IS NULL`)).rows as Record<string, string | null>[];
    for (const m of manutencoes) {
      await indexar(tx, entradaManutencao(m));
    }

    const documentos = (await tx.execute(sql`
      SELECT id, nome, tipo FROM documentos WHERE deleted_at IS NULL AND tipo != 'foto'`)).rows as Record<string, string>[];
    for (const d of documentos) {
      await indexar(tx, {
        entidadeTipo: "documento", entidadeId: d.id!, titulo: d.nome!,
        subtitulo: `Documento · ${d.tipo}`, termos: [d.nome, d.tipo],
      });
    }

    const lancamentos = (await tx.execute(sql`
      SELECT id, descricao, tipo, status FROM lancamentos WHERE deleted_at IS NULL`)).rows as Record<string, string>[];
    for (const l of lancamentos) {
      await indexar(tx, {
        entidadeTipo: "lancamento", entidadeId: l.id!, titulo: l.descricao!,
        subtitulo: `Lançamento · ${l.tipo} · ${l.status}`, termos: [l.descricao, l.tipo],
      });
    }

    return {
      pessoas: pessoas.length, ativos: ativos.length, operacoes: operacoes.length,
      documentos: documentos.length, lancamentos: lancamentos.length,
      manutencoes: manutencoes.length,
    };
  });
}

/**
 * Como uma manutenção entra no índice. Vive aqui (e não no serviço) para a
 * reindexação em massa e a indexação incremental usarem a MESMA regra — se o
 * formato mudar, muda num lugar só.
 */
export function entradaManutencao(m: Record<string, string | null>) {
  return {
    entidadeTipo: "manutencao" as const,
    entidadeId: m.id!,
    titulo: m.descricao!,
    subtitulo: `Manutenção · ${m.tipo} · ${m.status} · ${m.ativo_codigo ?? ""}`.trim(),
    termos: [m.descricao, m.tipo, m.status, m.ativo, m.ativo_codigo, m.placa],
    termosNumericos: [m.ativo_codigo, m.placa],
  };
}

// Execução direta pela CLI (o import pelo servidor não dispara nada disto).
const chamadoDiretamente =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (chamadoDiretamente) {
  reindexarTudo()
    .then((r) => {
      console.log(
        `Reindexado: ${r.pessoas} pessoas, ${r.ativos} ativos, ${r.operacoes} operações, ` +
          `${r.manutencoes} manutenções, ${r.documentos} documentos, ${r.lancamentos} lançamentos.`
      );
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
