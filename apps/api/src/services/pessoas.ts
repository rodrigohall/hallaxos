import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { PessoaCriarInput, PessoaEditarInput, PapelPessoa } from "@hallaxos/shared";
import { db, type DbConn } from "../db/client";
import { pessoas, pessoaPapeis } from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado } from "../lib/erros";
import { diff, registrarEvento } from "./timeline";
import { indexar } from "./busca";

type Pessoa = typeof pessoas.$inferSelect;

async function reindexarPessoa(conn: DbConn, p: Pessoa, papeis: PapelPessoa[]) {
  await indexar(conn, {
    entidadeTipo: "pessoa",
    entidadeId: p.id,
    titulo: p.nome,
    subtitulo: ["Pessoa", ...papeis].join(" · "),
    termos: [p.nome, p.nomeFantasia, p.email, p.cidade],
    termosNumericos: [p.cpfCnpj, p.telefone, p.telefoneSecundario, p.cnhNumero],
  });
}

function paraLinha(input: PessoaCriarInput) {
  return {
    tipo: input.tipo,
    nome: input.nome,
    nomeFantasia: input.nome_fantasia ?? null,
    cpfCnpj: input.cpf_cnpj,
    email: input.email ?? null,
    telefone: input.telefone ?? null,
    telefoneSecundario: input.telefone_secundario ?? null,
    cep: input.cep ?? null,
    logradouro: input.logradouro ?? null,
    numero: input.numero ?? null,
    complemento: input.complemento ?? null,
    bairro: input.bairro ?? null,
    cidade: input.cidade ?? null,
    uf: input.uf ?? null,
    cnhNumero: input.cnh_numero ?? null,
    cnhCategoria: input.cnh_categoria ?? null,
    cnhValidade: input.cnh_validade ? input.cnh_validade.toISOString().slice(0, 10) : null,
    observacoes: input.observacoes ?? null,
  };
}

export async function listarPessoas(opts: {
  busca?: string;
  papel?: string;
  incluirArquivados?: boolean;
  pagina: number;
  porPagina: number;
}) {
  const filtros = [];
  if (!opts.incluirArquivados) filtros.push(isNull(pessoas.deletedAt));
  // Filtro por papel direto no SQL (antes era pós-paginação, perdia resultados).
  if (opts.papel) {
    filtros.push(
      sql`EXISTS (SELECT 1 FROM pessoa_papeis pp WHERE pp.pessoa_id = ${pessoas.id} AND pp.papel = ${opts.papel})`
    );
  }
  if (opts.busca) {
    const b = `%${opts.busca}%`;
    const digitos = opts.busca.replace(/\D/g, "");
    filtros.push(
      or(
        sql`unaccent(${pessoas.nome}) ILIKE unaccent(${b})`,
        sql`unaccent(coalesce(${pessoas.nomeFantasia}, '')) ILIKE unaccent(${b})`,
        digitos ? ilike(pessoas.cpfCnpj, `%${digitos}%`) : undefined,
        digitos ? ilike(pessoas.telefone, `%${digitos}%`) : undefined
      )
    );
  }
  const where = filtros.length ? and(...filtros) : undefined;

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(pessoas)
    .where(where)) as [{ total: number }];

  let linhas = await db
    .select()
    .from(pessoas)
    .where(where)
    .orderBy(desc(pessoas.createdAt))
    .limit(opts.porPagina)
    .offset((opts.pagina - 1) * opts.porPagina);

  const papeisPorPessoa = await papeisDe(linhas.map((p) => p.id));
  const dados = linhas.map((p) => ({ ...p, papeis: papeisPorPessoa.get(p.id) ?? [] }));
  return { dados, total };
}

async function papeisDe(ids: string[]): Promise<Map<string, PapelPessoa[]>> {
  const mapa = new Map<string, PapelPessoa[]>();
  if (ids.length === 0) return mapa;
  const linhas = await db
    .select()
    .from(pessoaPapeis)
    .where(inArray(pessoaPapeis.pessoaId, ids));
  for (const l of linhas) {
    mapa.set(l.pessoaId, [...(mapa.get(l.pessoaId) ?? []), l.papel]);
  }
  return mapa;
}

export async function obterPessoa(id: string) {
  const [p] = await db.select().from(pessoas).where(eq(pessoas.id, id));
  if (!p) throw naoEncontrado("Pessoa");
  const papeis = (await papeisDe([id])).get(id) ?? [];
  const rows = (
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM operacoes WHERE cliente_id = ${id} AND deleted_at IS NULL) AS operacoes,
        (SELECT count(*)::int FROM lancamentos WHERE pessoa_id = ${id} AND status = 'previsto' AND deleted_at IS NULL) AS lancamentos_pendentes,
        -- KPIs financeiros desta pessoa
        (SELECT json_build_object(
          'faturado',     COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND status='pago'), 0),
          'a_receber',    COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND status='previsto'
                            AND deleted_at IS NULL), 0),
          'vencido',      COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND status='previsto'
                            AND data_vencimento < current_date AND deleted_at IS NULL), 0),
          'qtd_operacoes', (SELECT count(*)::int FROM operacoes WHERE cliente_id = ${id} AND deleted_at IS NULL)
        ) FROM lancamentos WHERE pessoa_id = ${id} AND deleted_at IS NULL AND status != 'cancelado'
        ) AS resumo_financeiro,
        -- Últimas 10 operações desta pessoa
        (SELECT json_agg(row_to_json(o) ORDER BY o.data_inicio DESC) FROM (
          SELECT op.id, op.codigo, op.tipo, op.status, op.data_inicio,
                 (SELECT a.nome FROM ativos a
                  JOIN operacao_ativos oa ON oa.ativo_id = a.id
                  WHERE oa.operacao_id = op.id AND oa.papel = 'objeto' LIMIT 1) AS ativo,
                 (SELECT a.id FROM ativos a
                  JOIN operacao_ativos oa ON oa.ativo_id = a.id
                  WHERE oa.operacao_id = op.id AND oa.papel = 'objeto' LIMIT 1) AS ativo_id
          FROM operacoes op
          WHERE op.cliente_id = ${id} AND op.deleted_at IS NULL
          ORDER BY op.data_inicio DESC LIMIT 10
        ) o) AS operacoes_recentes,
        -- Últimos lançamentos vinculados a esta pessoa
        (SELECT json_agg(row_to_json(l) ORDER BY l.data_vencimento DESC) FROM (
          SELECT lc.id, lc.tipo, lc.descricao, lc.valor, lc.status,
                 lc.data_vencimento, lc.data_pagamento,
                 cf.nome AS categoria
          FROM lancamentos lc
          JOIN categorias_financeiras cf ON cf.id = lc.categoria_id
          WHERE lc.pessoa_id = ${id} AND lc.deleted_at IS NULL AND lc.status != 'cancelado'
          ORDER BY lc.data_vencimento DESC LIMIT 10
        ) l) AS lancamentos_recentes
    `)
  ).rows as [Record<string, unknown>];
  const contadores = {
    operacoes: rows[0]!.operacoes as number,
    lancamentos_pendentes: rows[0]!.lancamentos_pendentes as number,
  };
  return {
    ...p,
    papeis,
    contadores,
    resumoFinanceiro: rows[0]!.resumo_financeiro as {
      faturado: number; a_receber: number; vencido: number; qtd_operacoes: number;
    } | null,
    operacoesRecentes: (rows[0]!.operacoes_recentes ?? []) as Array<{
      id: string; codigo: string; tipo: string; status: string; data_inicio: string;
      ativo: string | null; ativo_id: string | null;
    }>,
    lancamentosRecentes: (rows[0]!.lancamentos_recentes ?? []) as Array<{
      id: string; tipo: string; descricao: string; valor: string; status: string;
      data_vencimento: string; data_pagamento: string | null; categoria: string;
    }>,
  };
}

export async function criarPessoa(input: PessoaCriarInput, usuarioId: string) {
  const [duplicada] = await db
    .select({ id: pessoas.id, deletedAt: pessoas.deletedAt })
    .from(pessoas)
    .where(eq(pessoas.cpfCnpj, input.cpf_cnpj));
  if (duplicada) {
    throw conflito(
      duplicada.deletedAt
        ? "Já existe um cadastro arquivado com este CPF/CNPJ. Restaure-o em vez de criar outro."
        : "Já existe um cadastro com este CPF/CNPJ."
    );
  }

  const id = novoId();
  return db.transaction(async (tx) => {
    const [criada] = await tx.insert(pessoas).values({ id, ...paraLinha(input) }).returning();
    await registrarEvento(tx, {
      entidadeTipo: "pessoa",
      entidadeId: id,
      evento: "criado",
      descricao: `Cadastro de ${input.nome} criado`,
      usuarioId,
    });
    // Oficina é papel de pessoa (doc 02 §1), não tabela — marcado no cadastro.
    const papeis: PapelPessoa[] = [];
    if (input.eh_oficina) {
      await garantirPapel(tx, id, "oficina");
      papeis.push("oficina");
    }
    await reindexarPessoa(tx, criada!, papeis);
    return { ...criada!, papeis };
  });
}

const CAMPO_COLUNA: Record<string, string> = {
  tipo: "tipo", nome: "nome", nome_fantasia: "nomeFantasia", cpf_cnpj: "cpfCnpj",
  email: "email", telefone: "telefone", telefone_secundario: "telefoneSecundario",
  cep: "cep", logradouro: "logradouro", numero: "numero", complemento: "complemento",
  bairro: "bairro", cidade: "cidade", uf: "uf", cnh_numero: "cnhNumero",
  cnh_categoria: "cnhCategoria", cnh_validade: "cnhValidade", observacoes: "observacoes",
};

export async function editarPessoa(id: string, input: PessoaEditarInput, usuarioId: string) {
  const [atual] = await db.select().from(pessoas).where(eq(pessoas.id, id));
  if (!atual) throw naoEncontrado("Pessoa");

  const mudancas: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(input)) {
    if (valor === undefined) continue;
    const coluna = CAMPO_COLUNA[campo];
    if (!coluna) continue;
    mudancas[coluna] =
      valor instanceof Date ? valor.toISOString().slice(0, 10) : valor;
  }

  return db.transaction(async (tx) => {
    const [editada] = await tx.update(pessoas).set(mudancas).where(eq(pessoas.id, id)).returning();
    const mudou = diff(atual as Record<string, unknown>, editada as Record<string, unknown>);
    delete mudou.updatedAt;
    // Papel oficina: marcar/desmarcar no cadastro (doc 02 §1).
    if (input.eh_oficina !== undefined) {
      if (input.eh_oficina) {
        await garantirPapel(tx, id, "oficina");
      } else {
        await tx.delete(pessoaPapeis).where(and(eq(pessoaPapeis.pessoaId, id), eq(pessoaPapeis.papel, "oficina")));
      }
    }
    if (Object.keys(mudou).length > 0) {
      await registrarEvento(tx, {
        entidadeTipo: "pessoa",
        entidadeId: id,
        evento: "atualizado",
        descricao: `Cadastro de ${editada!.nome} atualizado`,
        dados: mudou,
        usuarioId,
      });
    }
    const papeis = (await papeisDe([id])).get(id) ?? [];
    await reindexarPessoa(tx, editada!, papeis);
    return { ...editada!, papeis };
  });
}

export async function arquivarPessoa(id: string, usuarioId: string) {
  const [p] = await db.select().from(pessoas).where(eq(pessoas.id, id));
  if (!p || p.deletedAt) throw naoEncontrado("Pessoa");

  const vinculos = (
    await db.execute(sql`
      SELECT count(*)::int AS abertas FROM operacoes
      WHERE cliente_id = ${id} AND deleted_at IS NULL
        AND status NOT IN ('finalizada', 'concluido', 'concluida', 'cancelada')
    `)
  ).rows as [{ abertas: number }];
  if (vinculos[0].abertas > 0) {
    throw conflito("Esta pessoa possui operações em aberto e não pode ser arquivada.");
  }

  await db.transaction(async (tx) => {
    await tx.update(pessoas).set({ deletedAt: new Date() }).where(eq(pessoas.id, id));
    await registrarEvento(tx, {
      entidadeTipo: "pessoa",
      entidadeId: id,
      evento: "status_alterado",
      descricao: `Cadastro de ${p.nome} arquivado`,
      usuarioId,
    });
    // Arquivado sai das buscas, permanece no histórico (doc 03 regra 11)
    await tx.execute(
      sql`DELETE FROM busca_indice WHERE entidade_tipo = 'pessoa' AND entidade_id = ${id}`
    );
  });
}

/** Papéis automáticos (doc 03 regra 10) — chamado pelos services de operação/manutenção. */
export async function garantirPapel(conn: DbConn, pessoaId: string, papel: PapelPessoa) {
  await conn
    .insert(pessoaPapeis)
    .values({ pessoaId, papel })
    .onConflictDoNothing();
}
