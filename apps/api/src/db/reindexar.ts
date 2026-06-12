// Reconstrói o índice de busca do zero (doc 04 §7 — índice derivado).
// Uso: pnpm --filter @hallaxos/api busca:reindexar
import { sql } from "drizzle-orm";
import { db, pool } from "./client";
import { indexar } from "../services/busca";

async function reindexar() {
  await db.execute(sql`DELETE FROM busca_indice`);

  const pessoas = (await db.execute(sql`
    SELECT id, nome, nome_fantasia, cpf_cnpj, email, telefone, telefone_secundario, cnh_numero, cidade
    FROM pessoas WHERE deleted_at IS NULL`)).rows as Record<string, string | null>[];
  for (const p of pessoas) {
    await indexar(db, {
      entidadeTipo: "pessoa", entidadeId: p.id!, titulo: p.nome!, subtitulo: "Pessoa",
      termos: [p.nome, p.nome_fantasia, p.email, p.cidade],
      termosNumericos: [p.cpf_cnpj, p.telefone, p.telefone_secundario, p.cnh_numero],
    });
  }

  const ativos = (await db.execute(sql`
    SELECT a.id, a.nome, a.codigo, a.status, a.observacoes, v.placa, v.marca, v.modelo, v.renavam, v.chassi, v.cor
    FROM ativos a LEFT JOIN ativos_veiculos v ON v.ativo_id = a.id
    WHERE a.deleted_at IS NULL`)).rows as Record<string, string | null>[];
  for (const a of ativos) {
    await indexar(db, {
      entidadeTipo: "ativo", entidadeId: a.id!,
      titulo: a.placa ? `${a.nome} · ${a.placa}` : a.nome!,
      subtitulo: `Ativo · ${a.status} · ${a.codigo}`,
      termos: [a.nome, a.codigo, a.observacoes, a.placa, a.marca, a.modelo, a.chassi, a.cor],
      termosNumericos: [a.codigo, a.placa, a.renavam, a.chassi],
    });
  }

  const operacoes = (await db.execute(sql`
    SELECT o.id, o.codigo, o.tipo, p.nome AS cliente FROM operacoes o
    JOIN pessoas p ON p.id = o.cliente_id WHERE o.deleted_at IS NULL`)).rows as Record<string, string>[];
  for (const o of operacoes) {
    await indexar(db, {
      entidadeTipo: "operacao", entidadeId: o.id!, titulo: `${o.codigo} — ${o.tipo} · ${o.cliente}`,
      subtitulo: "Operação", termos: [o.codigo, o.tipo, o.cliente], termosNumericos: [o.codigo],
    });
  }

  const documentos = (await db.execute(sql`
    SELECT id, nome, tipo FROM documentos WHERE deleted_at IS NULL AND tipo != 'foto'`)).rows as Record<string, string>[];
  for (const d of documentos) {
    await indexar(db, {
      entidadeTipo: "documento", entidadeId: d.id!, titulo: d.nome!,
      subtitulo: `Documento · ${d.tipo}`, termos: [d.nome, d.tipo],
    });
  }

  const lancamentos = (await db.execute(sql`
    SELECT id, descricao, tipo, status FROM lancamentos WHERE deleted_at IS NULL`)).rows as Record<string, string>[];
  for (const l of lancamentos) {
    await indexar(db, {
      entidadeTipo: "lancamento", entidadeId: l.id!, titulo: l.descricao!,
      subtitulo: `Lançamento · ${l.tipo} · ${l.status}`, termos: [l.descricao, l.tipo],
    });
  }

  console.log(
    `Reindexado: ${pessoas.length} pessoas, ${ativos.length} ativos, ` +
      `${operacoes.length} operações, ${documentos.length} documentos, ${lancamentos.length} lançamentos.`
  );
}

reindexar()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
