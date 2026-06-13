import { and, eq, isNull, lt, gte, lte, sql, desc, inArray } from "drizzle-orm";
import type { TipoNotificacao, ReferenciaEntidade } from "@hallaxos/shared";
import { db } from "../db/client";
import {
  notificacoes, operacoes, operacoesLocacao, lancamentos, pessoas, documentos, manutencoes, usuarios,
} from "../db/schema";
import { novoId } from "../lib/ids";
import { naoEncontrado } from "../lib/erros";

type TxOrDb = typeof db;

export async function criarNotificacao(
  conn: TxOrDb,
  dados: {
    usuarioId: string;
    tipo: TipoNotificacao;
    titulo: string;
    entidadeTipo: ReferenciaEntidade;
    entidadeId: string;
  }
) {
  await conn.insert(notificacoes).values({ id: novoId(), ...dados });
}

export async function listarNotificacoes(usuarioId: string) {
  const linhas = await db
    .select()
    .from(notificacoes)
    .where(eq(notificacoes.usuarioId, usuarioId))
    .orderBy(desc(notificacoes.createdAt))
    .limit(50);
  return linhas.map((n) => ({ ...n, lida: n.lidaEm !== null }));
}

export async function contarNaoLidas(usuarioId: string): Promise<number> {
  const [res] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(notificacoes)
    .where(and(eq(notificacoes.usuarioId, usuarioId), isNull(notificacoes.lidaEm)));
  return res?.total ?? 0;
}

export async function marcarLida(id: string, usuarioId: string) {
  const [n] = await db
    .select()
    .from(notificacoes)
    .where(and(eq(notificacoes.id, id), eq(notificacoes.usuarioId, usuarioId)));
  if (!n) throw naoEncontrado("Notificação");
  if (!n.lidaEm) {
    await db.update(notificacoes).set({ lidaEm: new Date() }).where(eq(notificacoes.id, id));
  }
}

export async function marcarTodasLidas(usuarioId: string) {
  await db
    .update(notificacoes)
    .set({ lidaEm: new Date() })
    .where(and(eq(notificacoes.usuarioId, usuarioId), isNull(notificacoes.lidaEm)));
}

// Verifica se já existe notificação do mesmo tipo para a mesma entidade hoje (dedup).
async function jaNotificadoHoje(tipo: TipoNotificacao, entidadeId: string): Promise<boolean> {
  const [res] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(notificacoes)
    .where(
      and(
        eq(notificacoes.tipo, tipo),
        eq(notificacoes.entidadeId, entidadeId),
        sql`date_trunc('day', ${notificacoes.createdAt}) = current_date`
      )
    );
  return (res?.c ?? 0) > 0;
}

// Retorna IDs de todos os usuários com papel admin ou gestor.
async function idsAdminGestor(): Promise<string[]> {
  const us = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(inArray(usuarios.papel, ["admin", "gestor"]), eq(usuarios.ativo, true)));
  return us.map((u) => u.id);
}

// Retorna IDs de usuários com papel financeiro.
async function idsFinanceiro(): Promise<string[]> {
  const us = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.papel, "financeiro"), eq(usuarios.ativo, true)));
  return us.map((u) => u.id);
}

/** Job idempotente: verifica prazos e cria notificações sem duplicar no mesmo dia. */
export async function verificarPrazos(): Promise<number> {
  let criadas = 0;
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const em30Dias = new Date(hoje.getTime() + 30 * 86400_000);
  const amanha = new Date(hoje.getTime() + 86400_000);

  const destinosGestor = await idsAdminGestor();
  const destinosFinanceiro = await idsFinanceiro();

  // Locações ativas atrasadas (join com operacoes_locacao para pegar data de devolução)
  const locacoesAtrasadas = await db
    .select({ id: operacoes.id, codigo: operacoes.codigo })
    .from(operacoes)
    .innerJoin(operacoesLocacao, eq(operacoesLocacao.operacaoId, operacoes.id))
    .where(
      and(
        eq(operacoes.tipo, "locacao"),
        eq(operacoes.status, "ativa"),
        lt(operacoesLocacao.dataDevolucaoPrevista, agora),
        isNull(operacoesLocacao.dataDevolucaoReal)
      )
    );
  for (const op of locacoesAtrasadas) {
    if (await jaNotificadoHoje("devolucao_atrasada", op.id)) continue;
    for (const uid of destinosGestor) {
      await criarNotificacao(db, {
        usuarioId: uid,
        tipo: "devolucao_atrasada",
        titulo: `Devolução atrasada: ${op.codigo}`,
        entidadeTipo: "operacao",
        entidadeId: op.id,
      });
    }
    criadas += destinosGestor.length;
  }

  // Lançamentos vencidos
  if (destinosFinanceiro.length > 0) {
    const vencidos = await db
      .select({ id: lancamentos.id, descricao: lancamentos.descricao })
      .from(lancamentos)
      .where(
        and(
          eq(lancamentos.status, "previsto"),
          lt(lancamentos.dataVencimento, hoje.toISOString().slice(0, 10)),
          isNull(lancamentos.deletedAt)
        )
      );
    for (const l of vencidos) {
      if (await jaNotificadoHoje("lancamento_vencido", l.id)) continue;
      for (const uid of destinosFinanceiro) {
        await criarNotificacao(db, {
          usuarioId: uid,
          tipo: "lancamento_vencido",
          titulo: `Lançamento vencido: ${l.descricao}`,
          entidadeTipo: "lancamento",
          entidadeId: l.id,
        });
      }
      criadas += destinosFinanceiro.length;
    }
  }

  // CNH vencendo em até 30 dias
  const cnhVencendo = await db
    .select({ id: pessoas.id, nome: pessoas.nome })
    .from(pessoas)
    .where(
      and(
        gte(pessoas.cnhValidade, hoje.toISOString().slice(0, 10)),
        lte(pessoas.cnhValidade, em30Dias.toISOString().slice(0, 10))
      )
    );
  for (const p of cnhVencendo) {
    if (await jaNotificadoHoje("cnh_vencendo", p.id)) continue;
    for (const uid of destinosGestor) {
      await criarNotificacao(db, {
        usuarioId: uid,
        tipo: "cnh_vencendo",
        titulo: `CNH vencendo: ${p.nome}`,
        entidadeTipo: "pessoa",
        entidadeId: p.id,
      });
    }
    criadas += destinosGestor.length;
  }

  // Documentos vencendo em até 30 dias
  const docsVencendo = await db
    .select({ id: documentos.id, nome: documentos.nome })
    .from(documentos)
    .where(
      and(
        isNull(documentos.deletedAt),
        gte(documentos.dataValidade, hoje.toISOString().slice(0, 10)),
        lte(documentos.dataValidade, em30Dias.toISOString().slice(0, 10))
      )
    );
  for (const d of docsVencendo) {
    if (await jaNotificadoHoje("documento_vencendo", d.id)) continue;
    for (const uid of destinosGestor) {
      await criarNotificacao(db, {
        usuarioId: uid,
        tipo: "documento_vencendo",
        titulo: `Documento vencendo: ${d.nome}`,
        entidadeTipo: "documento",
        entidadeId: d.id,
      });
    }
    criadas += destinosGestor.length;
  }

  // Manutenções agendadas para amanhã
  const manutAmanha = await db
    .select({ id: manutencoes.id, descricao: manutencoes.descricao })
    .from(manutencoes)
    .where(
      and(
        eq(manutencoes.status, "agendada"),
        eq(manutencoes.dataAgendada, amanha.toISOString().slice(0, 10))
      )
    );
  for (const m of manutAmanha) {
    if (await jaNotificadoHoje("manutencao_agendada", m.id)) continue;
    for (const uid of destinosGestor) {
      await criarNotificacao(db, {
        usuarioId: uid,
        tipo: "manutencao_agendada",
        titulo: `Manutenção amanhã: ${m.descricao}`,
        entidadeTipo: "manutencao",
        entidadeId: m.id,
      });
    }
    criadas += destinosGestor.length;
  }

  return criadas;
}
