// Manutenções: bloqueiam o ativo enquanto acontecem (doc 03 §1). Máquina de
// estados `agendada → em_andamento → concluida` (+ `cancelada`), custo via
// lançamentos vinculados e km atualizado na conclusão.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  ManutencaoCriarInput, ManutencaoEditarInput, ManutencaoConcluirInput,
  StatusManutencao,
} from "@hallaxos/shared";
import { db, type DbConn } from "../db/client";
import { manutencoes, ativos, ativosVeiculos } from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado, regraNegocio } from "../lib/erros";
import { registrarEvento } from "./timeline";
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

export async function criarManutencao(input: ManutencaoCriarInput, usuarioId: string) {
  const [ativo] = await db.select().from(ativos).where(and(eq(ativos.id, input.ativo_id), isNull(ativos.deletedAt)));
  if (!ativo) throw naoEncontrado("Ativo");

  const id = novoId();
  return db.transaction(async (tx) => {
    const [criada] = await tx.insert(manutencoes).values({
      id,
      ativoId: input.ativo_id,
      tipo: input.tipo as never,
      status: "agendada",
      descricao: input.descricao,
      fornecedorId: input.fornecedor_id ?? null,
      dataAgendada: input.data_agendada ?? null,
      observacoes: input.observacoes ?? null,
      pecas: input.pecas ?? null,
    }).returning();
    if (input.fornecedor_id) await garantirPapel(tx, input.fornecedor_id, "fornecedor");
    await registrarEvento(tx, {
      entidadeTipo: "manutencao", entidadeId: id, evento: "criado",
      descricao: `Manutenção (${input.tipo}) agendada para ${ativo.nome}`, usuarioId,
    });
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
  if (input.tipo) mud.tipo = input.tipo;
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
  return obterManutencao(id);
}
