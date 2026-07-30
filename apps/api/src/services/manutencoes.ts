// Manutenções: bloqueiam o ativo enquanto acontecem (doc 03 §1). Máquina de
// estados `agendada → em_andamento → concluida` (+ `cancelada`), custo via
// lançamentos vinculados e km atualizado na conclusão.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  ManutencaoCriarInput, ManutencaoEditarInput, ManutencaoConcluirInput,
  StatusManutencao,
} from "@hallaxos/shared";
import { db, type DbConn } from "../db/client";
import { manutencoes, manutencaoTipos, ativos, ativosVeiculos } from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado, regraNegocio } from "../lib/erros";
import { registrarEvento } from "./timeline";
import { indexar, removerDoIndice } from "./busca";
import { entradaManutencao } from "../db/reindexar";
import { garantirPapel } from "./pessoas";
import { gerarLancamentosOrigem } from "./origemFinanceira";

const ROTULOS_ATIVO: Record<string, string> = {
  disponivel: "disponível", reservado: "reservado", alugado: "alugado",
  em_manutencao: "em manutenção", em_uso_interno: "em uso interno",
  vendido: "vendido", baixado: "baixado",
};

// agendada → em_andamento → concluida ; cancelada a partir de não-terminal
const TERMINAIS = new Set<StatusManutencao>(["concluida", "cancelada"]);
const PROXIMO: Record<string, StatusManutencao> = {
  agendada: "em_andamento",
  em_andamento: "concluida",
};

export function proximasTransicoesManutencao(status: StatusManutencao): StatusManutencao[] {
  if (TERMINAIS.has(status)) return [];
  const r: StatusManutencao[] = [];
  if (PROXIMO[status]) r.push(PROXIMO[status]!);
  r.push("cancelada");
  return r;
}

export async function listarManutencoes(opts: {
  status?: StatusManutencao; tipo?: string; ativoId?: string; busca?: string;
  pagina: number; porPagina: number;
}) {
  // A query principal aliasa a tabela como `m`; por isso as condições do WHERE
  // são cruas e qualificadas por `m.` — interpolar fragmentos do Drizzle aqui
  // renderiza `"manutencoes"."deleted_at"`, que o Postgres rejeita depois do
  // alias ("invalid reference to FROM-clause entry"). O count usa o mesmo WHERE.
  const cond = [sql`m.deleted_at IS NULL`];
  if (opts.status) cond.push(sql`m.status = ${opts.status}`);
  if (opts.tipo) cond.push(sql`m.tipo = ${opts.tipo}`);
  if (opts.ativoId) cond.push(sql`m.ativo_id = ${opts.ativoId}`);
  if (opts.busca) cond.push(sql`unaccent(m.descricao) ILIKE unaccent(${"%" + opts.busca + "%"})`);
  const where = sql.join(cond, sql` AND `);

  const [{ total }] = (await db.execute(sql`
    SELECT count(*)::int AS total FROM manutencoes m WHERE ${where}`)).rows as [{ total: number }];

  const linhas = (await db.execute(sql`
    SELECT m.id, m.tipo, m.status, m.descricao, m.data_agendada AS "dataAgendada",
           m.data_inicio AS "dataInicio", m.data_conclusao AS "dataConclusao",
           at.id AS "ativoId", at.nome AS ativo, at.codigo AS "ativoCodigo",
           p.nome AS fornecedor,
           coalesce((SELECT sum(l.valor) FROM lancamentos l
                     WHERE l.manutencao_id = m.id AND l.deleted_at IS NULL
                       AND l.status != 'cancelado'), 0) AS custo
    FROM manutencoes m
    JOIN ativos at ON at.id = m.ativo_id
    LEFT JOIN pessoas p ON p.id = m.fornecedor_id
    WHERE ${where}
    ORDER BY coalesce(m.data_agendada, m.created_at::date) DESC, m.created_at DESC
    LIMIT ${opts.porPagina} OFFSET ${(opts.pagina - 1) * opts.porPagina}`)).rows;
  return { dados: linhas, total };
}

export async function obterManutencao(id: string) {
  const linhas = (await db.execute(sql`
    SELECT m.*, at.nome AS ativo_nome, at.codigo AS ativo_codigo, at.status AS ativo_status,
           p.nome AS fornecedor_nome
    FROM manutencoes m
    JOIN ativos at ON at.id = m.ativo_id
    LEFT JOIN pessoas p ON p.id = m.fornecedor_id
    WHERE m.id = ${id}`)).rows;
  if (linhas.length === 0) throw naoEncontrado("Manutenção");
  const m = linhas[0] as Record<string, unknown>;

  const lancs = (await db.execute(sql`
    SELECT l.id, l.tipo, l.descricao, l.valor, l.status, l.data_vencimento, l.data_pagamento
    FROM lancamentos l WHERE l.manutencao_id = ${id} AND l.deleted_at IS NULL
    ORDER BY coalesce(l.data_pagamento, l.data_vencimento)`)).rows;

  return { ...m, lancamentos: lancs, proximasTransicoes: proximasTransicoesManutencao(m.status as StatusManutencao) };
}

// ── Tipos customizáveis (Sprint 14 · C1; renomear/desativar no Sprint 16) ──

/**
 * Por padrão devolve só os tipos ativos — é o que o seletor de nova manutenção
 * deve oferecer. A tela de gestão pede `incluirInativos` para poder reativar.
 */
export async function listarTiposManutencao({ incluirInativos = false } = {}) {
  const q = db.select().from(manutencaoTipos);
  return incluirInativos
    ? q.orderBy(manutencaoTipos.nome)
    : q.where(eq(manutencaoTipos.ativo, true)).orderBy(manutencaoTipos.nome);
}

export async function criarTipoManutencao(nome: string, usuarioId: string) {
  const limpo = nome.trim();
  const [existente] = await db.select().from(manutencaoTipos)
    .where(sql`lower(${manutencaoTipos.nome}) = lower(${limpo})`);
  if (existente) throw conflito(`O tipo "${existente.nome}" já existe.`);
  const [criado] = await db.insert(manutencaoTipos).values({ nome: limpo }).returning();
  // O registro de tipos não é entidade da timeline; a criação fica auditável
  // pelo evento da primeira manutenção que usar o tipo (descricao inclui o tipo).
  void usuarioId;
  return criado!;
}

/**
 * Renomeia e/ou (des)ativa um tipo.
 *
 * O rename não precisa tocar em `manutencoes`: a FK por chave natural criada na
 * migration 0009 tem ON UPDATE CASCADE, então o Postgres propaga o novo nome
 * para todas as manutenções que usam o tipo.
 *
 * Os quatro tipos de fábrica (`padrao`) são intocáveis: garantirTiposManutencao
 * Padrao() os recria por nome a cada arranque, então permitir rename ou
 * desativação faria o bootstrap e o usuário brigarem para sempre.
 */
export async function editarTipoManutencao(
  id: string,
  input: { nome?: string; ativo?: boolean }
) {
  const [tipo] = await db.select().from(manutencaoTipos).where(eq(manutencaoTipos.id, id));
  if (!tipo) throw naoEncontrado("Tipo de manutenção");
  if (tipo.padrao) {
    throw regraNegocio(
      `"${tipo.nome}" é um tipo padrão do sistema e não pode ser renomeado nem desativado.`
    );
  }

  const patch: { nome?: string; ativo?: boolean } = {};

  if (input.nome !== undefined) {
    const limpo = input.nome.trim();
    if (limpo.toLowerCase() !== tipo.nome.toLowerCase()) {
      const [colisao] = await db.select().from(manutencaoTipos)
        .where(sql`lower(${manutencaoTipos.nome}) = lower(${limpo})`);
      if (colisao) throw conflito(`O tipo "${colisao.nome}" já existe.`);
    }
    patch.nome = limpo;
  }
  if (input.ativo !== undefined) patch.ativo = input.ativo;
  if (Object.keys(patch).length === 0) return tipo;

  const [atualizado] = await db.update(manutencaoTipos)
    .set(patch).where(eq(manutencaoTipos.id, id)).returning();
  return atualizado!;
}

async function exigirTipoManutencao(tipo: string) {
  const [t] = await db.select().from(manutencaoTipos).where(eq(manutencaoTipos.nome, tipo));
  if (!t) throw regraNegocio(`Tipo de manutenção "${tipo}" não existe — cadastre-o em "+ Novo tipo".`);
  // Um tipo desativado não pode receber manutenção nova, mas as antigas seguem
  // válidas (por isso a checagem é aqui, não em listarTiposManutencao).
  if (!t.ativo) throw regraNegocio(`O tipo "${t.nome}" está desativado.`);
  return t;
}

/**
 * Mantém a manutenção no índice da busca global (Sprint 16).
 *
 * Até aqui manutenção era a única entidade citada na busca ⌘K e na ferramenta
 * busca_global do copiloto que nunca entrava no índice — prometida e nunca
 * encontrada. Relê a linha já com ativo e placa para indexar pelo mesmo formato
 * da reindexação em massa (entradaManutencao é a fonte única do formato).
 */
async function reindexarManutencao(conn: DbConn, id: string) {
  const [linha] = (await conn.execute(sql`
    SELECT m.id, m.descricao, m.tipo, m.status, a.nome AS ativo, a.codigo AS ativo_codigo, v.placa
    FROM manutencoes m
    JOIN ativos a ON a.id = m.ativo_id
    LEFT JOIN ativos_veiculos v ON v.ativo_id = a.id
    WHERE m.id = ${id} AND m.deleted_at IS NULL
  `)).rows as Record<string, string | null>[];
  if (!linha) {
    await removerDoIndice(conn, "manutencao", id);
    return;
  }
  await indexar(conn, entradaManutencao(linha));
}

export async function criarManutencao(input: ManutencaoCriarInput, usuarioId: string) {
  const [ativo] = await db.select().from(ativos).where(and(eq(ativos.id, input.ativo_id), isNull(ativos.deletedAt)));
  if (!ativo) throw naoEncontrado("Ativo");
  await exigirTipoManutencao(input.tipo);

  // Sprint 14 · C2 — retroativo: com data_conclusao no corpo, a manutenção já
  // aconteceu. Nasce concluída (datas passadas), o custo vira despesa vinculada
  // (mesmo mecanismo da conclusão normal) e o status do ativo NÃO é tocado —
  // o veículo não está na oficina agora, o registro é histórico.
  const retroativa = !!input.data_conclusao;
  if (retroativa && input.data_agendada && input.data_conclusao! < input.data_agendada) {
    throw regraNegocio("A conclusão retroativa não pode ser anterior à data agendada.");
  }

  const id = novoId();
  return db.transaction(async (tx) => {
    const [criada] = await tx.insert(manutencoes).values({
      id,
      ativoId: input.ativo_id,
      tipo: input.tipo,
      status: retroativa ? "concluida" : "agendada",
      descricao: input.descricao,
      fornecedorId: input.fornecedor_id ?? null,
      dataAgendada: input.data_agendada ?? null,
      dataInicio: retroativa
        ? new Date((input.data_inicio ?? input.data_conclusao!) + "T12:00:00Z")
        : null,
      dataConclusao: retroativa ? new Date(input.data_conclusao! + "T12:00:00Z") : null,
      kmNoMomento: retroativa ? input.km_no_momento ?? null : null,
      observacoes: input.observacoes ?? null,
      pecas: input.pecas ?? null,
    }).returning();
    if (input.fornecedor_id) await garantirPapel(tx, input.fornecedor_id, "fornecedor");
    if (retroativa && input.custo && input.custo > 0) {
      await gerarLancamentosOrigem(tx, {
        origem: { manutencaoId: id },
        entidade: { tipo: "manutencao", id },
        clienteId: input.fornecedor_id ?? null,
        tipo: "despesa",
        categoriaNome: "Manutenção",
        descricao: `Manutenção: ${input.descricao}`,
        valor: input.custo,
        parcelas: input.parcelas ?? 1,
      }, usuarioId);
    }
    await registrarEvento(tx, {
      entidadeTipo: "manutencao", entidadeId: id, evento: "criado",
      descricao: retroativa
        ? `Manutenção (${input.tipo}) registrada retroativamente para ${ativo.nome} — concluída em ${input.data_conclusao}`
        : `Manutenção (${input.tipo}) agendada para ${ativo.nome}`,
      usuarioId,
    });
    await reindexarManutencao(tx, id);
    return criada!;
  });
}

export async function editarManutencao(id: string, input: ManutencaoEditarInput, usuarioId: string) {
  const [m] = await db.select().from(manutencoes).where(eq(manutencoes.id, id));
  if (!m || m.deletedAt) throw naoEncontrado("Manutenção");
  // Editável em qualquer status, exceto cancelada (encerrada). Edição corrige
  // dados depois de lançada — datas (retroativo), descrição, fornecedor, km —
  // tudo com auditoria na timeline. Não cria transição nova (doc 03 §1).
  if (m.status === "cancelada") throw regraNegocio("Uma manutenção cancelada não pode ser editada.");

  const mud: Record<string, unknown> = {};
  if (input.tipo) {
    await exigirTipoManutencao(input.tipo);
    mud.tipo = input.tipo;
  }
  if (input.descricao) mud.descricao = input.descricao;
  if (input.fornecedor_id !== undefined) mud.fornecedorId = input.fornecedor_id;
  if (input.data_agendada !== undefined) mud.dataAgendada = input.data_agendada;
  if (input.data_inicio !== undefined) mud.dataInicio = input.data_inicio ? new Date(input.data_inicio + "T12:00:00Z") : null;
  if (input.data_conclusao !== undefined) mud.dataConclusao = input.data_conclusao ? new Date(input.data_conclusao + "T12:00:00Z") : null;
  if (input.km_no_momento !== undefined) mud.kmNoMomento = input.km_no_momento;
  if (input.observacoes !== undefined) mud.observacoes = input.observacoes;
  if (input.pecas !== undefined) mud.pecas = input.pecas;

  return db.transaction(async (tx) => {
    const [ed] = await tx.update(manutencoes).set(mud).where(eq(manutencoes.id, id)).returning();
    if (input.fornecedor_id) await garantirPapel(tx, input.fornecedor_id, "fornecedor");
    await registrarEvento(tx, {
      entidadeTipo: "manutencao", entidadeId: id, evento: "atualizado",
      descricao: "Manutenção atualizada", usuarioId,
    });
    await reindexarManutencao(tx, id);
    return ed!;
  });
}

async function mudarStatusAtivo(tx: DbConn, ativoId: string, novo: string, usuarioId: string, ctx: string) {
  const [a] = await tx.select().from(ativos).where(eq(ativos.id, ativoId));
  if (!a || a.status === novo) return;
  await tx.update(ativos).set({ status: novo as never }).where(eq(ativos.id, ativoId));
  await registrarEvento(tx, {
    entidadeTipo: "ativo", entidadeId: ativoId, evento: "status_alterado",
    descricao: `${a.nome}: situação alterada para ${ROTULOS_ATIVO[novo] ?? novo} (${ctx})`, usuarioId,
  });
}

export async function iniciarManutencao(id: string, usuarioId: string, dataInicio?: string | null) {
  const [m] = await db.select().from(manutencoes).where(eq(manutencoes.id, id));
  if (!m || m.deletedAt) throw naoEncontrado("Manutenção");
  if (m.status !== "agendada") throw conflito("Só uma manutenção agendada pode ser iniciada.");
  const [ativo] = await db.select().from(ativos).where(eq(ativos.id, m.ativoId));
  if (ativo && !["disponivel", "em_uso_interno"].includes(ativo.status)) {
    throw conflito(`O ativo ${ativo.nome} está ${ROTULOS_ATIVO[ativo.status]} e não pode entrar em manutenção agora.`);
  }
  // Data de início opcional (retroativo): default = agora.
  const inicio = dataInicio ? new Date(dataInicio + "T12:00:00Z") : new Date();
  await db.transaction(async (tx) => {
    await tx.update(manutencoes).set({ status: "em_andamento", dataInicio: inicio }).where(eq(manutencoes.id, id));
    await mudarStatusAtivo(tx, m.ativoId, "em_manutencao", usuarioId, "manutenção iniciada");
    await registrarEvento(tx, {
      entidadeTipo: "manutencao", entidadeId: id, evento: "status_alterado",
      descricao: "Manutenção iniciada", usuarioId,
    });
  });
  await reindexarManutencao(db, id);
  // Lido APÓS o commit (como em concluir/cancelar): ler de dentro da transação,
  // por uma 2ª conexão da pool enquanto ela segura locks de escrita, devolvia o
  // estado pré-commit e podia falhar — era a causa do "erro interno" ao iniciar.
  return obterManutencao(id);
}

export async function concluirManutencao(id: string, input: ManutencaoConcluirInput, usuarioId: string) {
  const [m] = await db.select().from(manutencoes).where(eq(manutencoes.id, id));
  if (!m || m.deletedAt) throw naoEncontrado("Manutenção");
  if (m.status !== "em_andamento") throw conflito("Só uma manutenção em andamento pode ser concluída.");

  const conclusao = input.data_conclusao ? new Date(input.data_conclusao + "T12:00:00Z") : new Date();
  await db.transaction(async (tx) => {
    await tx.update(manutencoes)
      .set({ status: "concluida", dataConclusao: conclusao, kmNoMomento: input.km_no_momento ?? m.kmNoMomento })
      .where(eq(manutencoes.id, id));
    // Ativo volta a disponível
    await mudarStatusAtivo(tx, m.ativoId, "disponivel", usuarioId, "manutenção concluída");
    // Hodômetro, se informado
    if (input.km_no_momento != null) {
      await tx.update(ativosVeiculos).set({ kmAtual: input.km_no_momento }).where(eq(ativosVeiculos.ativoId, m.ativoId));
    }
    // Custo (opcional) vira despesa prevista vinculada à manutenção
    if (input.custo && input.custo > 0) {
      await gerarLancamentosOrigem(tx, {
        origem: { manutencaoId: id },
        entidade: { tipo: "manutencao", id },
        clienteId: m.fornecedorId,
        tipo: "despesa",
        categoriaNome: "Manutenção",
        descricao: `Manutenção: ${m.descricao}`,
        valor: input.custo,
        parcelas: input.parcelas,
      }, usuarioId);
    }
    await registrarEvento(tx, {
      entidadeTipo: "manutencao", entidadeId: id, evento: "status_alterado",
      descricao: "Manutenção concluída", usuarioId,
    });
  });
  await reindexarManutencao(db, id);
  return obterManutencao(id);
}

export async function cancelarManutencao(id: string, motivo: string, usuarioId: string) {
  const [m] = await db.select().from(manutencoes).where(eq(manutencoes.id, id));
  if (!m || m.deletedAt) throw naoEncontrado("Manutenção");
  if (TERMINAIS.has(m.status as StatusManutencao)) throw conflito("Esta manutenção já está encerrada.");

  await db.transaction(async (tx) => {
    await tx.update(manutencoes).set({ status: "cancelada" }).where(eq(manutencoes.id, id));
    // Se tinha colocado o ativo em manutenção, devolve a disponível
    const [a] = await tx.select().from(ativos).where(eq(ativos.id, m.ativoId));
    if (a && a.status === "em_manutencao") {
      await mudarStatusAtivo(tx, m.ativoId, "disponivel", usuarioId, "manutenção cancelada");
    }
    await registrarEvento(tx, {
      entidadeTipo: "manutencao", entidadeId: id, evento: "status_alterado",
      descricao: `Manutenção cancelada: ${motivo}`, usuarioId,
    });
  });
  await reindexarManutencao(db, id);
  return obterManutencao(id);
}
