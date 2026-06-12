// Operações: núcleo + extensão por tipo (doc 01 §2). O Financeiro, a Timeline
// e os Relatórios se conectam uma única vez a `operacoes`. Toda transição de
// estado roda em transação, mexe no ativo, gera lançamentos e grava timeline
// (doc 03 §1).
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  GuinchoCriarInput, LocacaoCriarInput, VendaCriarInput, CompraCriarInput,
  TransicaoInput, StatusOperacao, TipoOperacao, StatusAtivo,
} from "@hallaxos/shared";
import { db, type DbConn } from "../db/client";
import {
  operacoes, operacaoAtivos, operacoesGuincho, operacoesLocacao,
  operacoesCompraVenda, ativos, ativosVeiculos, lancamentos, pessoas,
} from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado, regraNegocio, semPermissao } from "../lib/erros";
import { registrarEvento } from "./timeline";
import { indexar } from "./busca";
import { garantirPapel } from "./pessoas";
import { gerarLancamentosOrigem } from "./origemFinanceira";

// ── Máquina de estados por tipo (doc 03 §1) ──
const FLUXO: Record<TipoOperacao, { estados: StatusOperacao[]; inicial: StatusOperacao }> = {
  guincho: { estados: ["solicitado", "a_caminho", "em_execucao", "concluido"], inicial: "solicitado" },
  locacao: { estados: ["orcamento", "reservada", "ativa", "finalizada"], inicial: "orcamento" },
  venda: { estados: ["negociacao", "fechada", "concluida"], inicial: "negociacao" },
  compra: { estados: ["negociacao", "fechada", "concluida"], inicial: "negociacao" },
};
const TERMINAIS = new Set<StatusOperacao>(["concluido", "finalizada", "concluida", "cancelada"]);

const ROTULOS_STATUS: Record<string, string> = {
  orcamento: "orçamento", reservada: "reservada", ativa: "ativa", finalizada: "finalizada",
  solicitado: "solicitado", a_caminho: "a caminho", em_execucao: "em execução", concluido: "concluído",
  negociacao: "negociação", fechada: "fechada", concluida: "concluída", cancelada: "cancelada",
};

// Gera lançamentos previstos vinculados à operação (helper comum em
// origemFinanceira.ts — partilhado com manutenções).
async function gerarLancamentos(
  tx: DbConn,
  o: { operacaoId: string; clienteId: string; tipo: "receita" | "despesa";
       categoriaNome: string; descricao: string; valor: number; parcelas: number },
  usuarioId: string
) {
  await gerarLancamentosOrigem(
    tx,
    {
      origem: { operacaoId: o.operacaoId },
      entidade: { tipo: "operacao", id: o.operacaoId },
      clienteId: o.clienteId,
      tipo: o.tipo,
      categoriaNome: o.categoriaNome,
      descricao: o.descricao,
      valor: o.valor,
      parcelas: o.parcelas,
    },
    usuarioId
  );
}

/** Cancela lançamentos previstos da operação; pagos não somem (estorno é manual). */
async function cancelarLancamentosPrevistos(tx: DbConn, operacaoId: string, usuarioId: string) {
  const cancelados = await tx
    .update(lancamentos)
    .set({ status: "cancelado" })
    .where(and(eq(lancamentos.operacaoId, operacaoId), eq(lancamentos.status, "previsto"), isNull(lancamentos.deletedAt)))
    .returning({ id: lancamentos.id });
  if (cancelados.length) {
    await registrarEvento(tx, {
      entidadeTipo: "operacao", entidadeId: operacaoId, evento: "status_alterado",
      descricao: `${cancelados.length} lançamento(s) previsto(s) cancelado(s) com a operação`, usuarioId,
    });
  }
}

async function mudarStatusAtivo(tx: DbConn, ativoId: string, novo: StatusAtivo, usuarioId: string, nomeOp: string) {
  const [a] = await tx.select().from(ativos).where(eq(ativos.id, ativoId));
  if (!a || a.status === novo) return;
  await tx.update(ativos).set({ status: novo }).where(eq(ativos.id, ativoId));
  await registrarEvento(tx, {
    entidadeTipo: "ativo", entidadeId: ativoId, evento: "status_alterado",
    descricao: `${a.nome}: situação alterada para ${ROTULOS_ATIVO[novo] ?? novo} (${nomeOp})`, usuarioId,
  });
}
const ROTULOS_ATIVO: Record<string, string> = {
  disponivel: "disponível", reservado: "reservado", alugado: "alugado",
  em_manutencao: "em manutenção", em_uso_interno: "em uso interno", vendido: "vendido", baixado: "baixado",
};

async function indexarOperacao(tx: DbConn, id: string, codigo: string, tipo: string, clienteNome: string) {
  await indexar(tx, {
    entidadeTipo: "operacao", entidadeId: id,
    titulo: `${codigo} — ${tipo} · ${clienteNome}`,
    subtitulo: `Operação · ${tipo}`,
    termos: [codigo, tipo, clienteNome], termosNumericos: [codigo],
  });
}

// ─────────────────────────── Consultas ───────────────────────────
export async function listarOperacoes(opts: {
  tipo?: TipoOperacao; status?: StatusOperacao; clienteId?: string; ativoId?: string;
  busca?: string; situacao?: "abertas" | "atrasadas"; pagina: number; porPagina: number;
}) {
  const filtros = [isNull(operacoes.deletedAt)];
  if (opts.tipo) filtros.push(eq(operacoes.tipo, opts.tipo));
  if (opts.status) filtros.push(eq(operacoes.status, opts.status));
  if (opts.clienteId) filtros.push(eq(operacoes.clienteId, opts.clienteId));
  if (opts.situacao === "abertas") {
    filtros.push(sql`${operacoes.status} NOT IN ('finalizada','concluido','concluida','cancelada')`);
  }
  if (opts.situacao === "atrasadas") {
    filtros.push(sql`${operacoes.status} = 'ativa'`);
    filtros.push(sql`${operacoes.id} IN (SELECT operacao_id FROM operacoes_locacao WHERE data_devolucao_prevista < now() AND data_devolucao_real IS NULL)`);
  }
  if (opts.ativoId) {
    filtros.push(sql`${operacoes.id} IN (SELECT operacao_id FROM operacao_ativos WHERE ativo_id = ${opts.ativoId})`);
  }
  if (opts.busca) {
    const b = `%${opts.busca}%`;
    filtros.push(sql`(${operacoes.codigo} ILIKE ${b} OR ${operacoes.clienteId} IN (SELECT id FROM pessoas WHERE unaccent(nome) ILIKE unaccent(${b})))`);
  }
  const where = and(...filtros);

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(operacoes)
    .where(where)) as [{ total: number }];

  const linhas = await db
    .select({ o: operacoes, cliente: pessoas.nome })
    .from(operacoes)
    .innerJoin(pessoas, eq(pessoas.id, operacoes.clienteId))
    .where(where)
    .orderBy(desc(operacoes.dataInicio))
    .limit(opts.porPagina)
    .offset((opts.pagina - 1) * opts.porPagina);

  const hoje = new Date();
  // Atraso de locação é derivado (doc 03 §1): ativa + devolução prevista no passado
  const dados = await Promise.all(
    linhas.map(async ({ o, cliente }) => {
      let atrasada = false;
      if (o.tipo === "locacao" && o.status === "ativa") {
        const [loc] = await db.select().from(operacoesLocacao).where(eq(operacoesLocacao.operacaoId, o.id));
        atrasada = !!loc && !loc.dataDevolucaoReal && loc.dataDevolucaoPrevista < hoje;
      }
      return { ...o, cliente, atrasada };
    })
  );
  return { dados, total };
}

export async function obterOperacao(id: string) {
  const [linha] = await db
    .select({ o: operacoes, cliente: pessoas })
    .from(operacoes)
    .innerJoin(pessoas, eq(pessoas.id, operacoes.clienteId))
    .where(eq(operacoes.id, id));
  if (!linha) throw naoEncontrado("Operação");
  const o = linha.o;

  let extensao: Record<string, unknown> | null = null;
  if (o.tipo === "guincho") {
    const r = await db.select().from(operacoesGuincho).where(eq(operacoesGuincho.operacaoId, id));
    extensao = r[0] ?? null;
  } else if (o.tipo === "locacao") {
    const r = await db.select().from(operacoesLocacao).where(eq(operacoesLocacao.operacaoId, id));
    extensao = r[0] ?? null;
  } else {
    const r = await db.select().from(operacoesCompraVenda).where(eq(operacoesCompraVenda.operacaoId, id));
    extensao = r[0] ?? null;
  }

  const ativosVinc = (
    await db.execute(sql`
      SELECT a.id, a.codigo, a.nome, a.status, oa.papel,
             v.placa, v.marca, v.modelo
      FROM operacao_ativos oa
      JOIN ativos a ON a.id = oa.ativo_id
      LEFT JOIN ativos_veiculos v ON v.ativo_id = a.id
      WHERE oa.operacao_id = ${id}`)
  ).rows;

  const lancs = (
    await db.execute(sql`
      SELECT l.id, l.tipo, l.descricao, l.valor, l.status, l.data_vencimento, l.data_pagamento
      FROM lancamentos l
      WHERE l.operacao_id = ${id} AND l.deleted_at IS NULL
      ORDER BY coalesce(l.data_pagamento, l.data_vencimento)`)
  ).rows;

  const proximos = proximasTransicoes(o.tipo, o.status);
  return { ...o, cliente: linha.cliente, extensao, ativos: ativosVinc, lancamentos: lancs, proximasTransicoes: proximos };
}

/** Transições oferecidas pela UI a partir do estado atual (próximo + cancelar). */
export function proximasTransicoes(tipo: TipoOperacao, status: StatusOperacao): StatusOperacao[] {
  if (TERMINAIS.has(status)) return [];
  const { estados } = FLUXO[tipo];
  const i = estados.indexOf(status);
  const proximos: StatusOperacao[] = [];
  if (i >= 0 && i < estados.length - 1) proximos.push(estados[i + 1]!);
  proximos.push("cancelada");
  return proximos;
}

// ─────────────────────────── Criação ───────────────────────────
async function inserirNucleo(
  tx: DbConn, tipo: TipoOperacao, clienteId: string, responsavelId: string,
  status: StatusOperacao, valorTotal: number, observacoes: string | undefined
) {
  const id = novoId();
  const [op] = await tx
    .insert(operacoes)
    .values({
      id, codigo: sql`DEFAULT` as never, tipo, clienteId, responsavelId,
      status, valorTotal: valorTotal.toFixed(2), observacoes: observacoes ?? null,
    })
    .returning();
  await garantirPapel(tx, clienteId, "cliente");
  await registrarEvento(tx, {
    entidadeTipo: "operacao", entidadeId: id, evento: "criado",
    descricao: `Operação ${op!.codigo} (${tipo}) criada`, usuarioId: responsavelId,
  });
  return op!;
}

async function vincularAtivo(tx: DbConn, operacaoId: string, ativoId: string, papel: "objeto" | "recurso") {
  await tx.insert(operacaoAtivos).values({ operacaoId, ativoId, papel });
}

async function exigirAtivoLivre(ativoId: string) {
  const [a] = await db.select().from(ativos).where(and(eq(ativos.id, ativoId), isNull(ativos.deletedAt)));
  if (!a) throw naoEncontrado("Ativo");
  return a;
}

export async function criarGuincho(input: GuinchoCriarInput, usuarioId: string) {
  return db.transaction(async (tx) => {
    const op = await inserirNucleo(tx, "guincho", input.cliente_id, usuarioId, "solicitado", input.valor_total, input.observacoes);
    await tx.insert(operacoesGuincho).values({
      operacaoId: op.id,
      motoristaId: input.motorista_id ?? null,
      origemEndereco: input.origem_endereco,
      destinoEndereco: input.destino_endereco,
      veiculoClienteDescricao: input.veiculo_cliente_descricao,
      veiculoClientePlaca: input.veiculo_cliente_placa ?? null,
    });
    if (input.motorista_id) await garantirPapel(tx, input.motorista_id, "motorista");
    if (input.caminhao_id) await vincularAtivo(tx, op.id, input.caminhao_id, "recurso");
    const [{ nome }] = (await tx.execute(sql`SELECT nome FROM pessoas WHERE id = ${input.cliente_id}`)).rows as [{ nome: string }];
    await indexarOperacao(tx, op.id, op.codigo, "guincho", nome);
    return op;
  });
}

export async function criarLocacao(input: LocacaoCriarInput, usuarioId: string) {
  const ativo = await exigirAtivoLivre(input.ativo_id);
  if (ativo.status !== "disponivel") {
    throw conflito(`O ativo ${ativo.nome} não está disponível (situação: ${ROTULOS_ATIVO[ativo.status] ?? ativo.status}).`);
  }
  return db.transaction(async (tx) => {
    const op = await inserirNucleo(tx, "locacao", input.cliente_id, usuarioId, "orcamento", 0, input.observacoes);
    await tx.insert(operacoesLocacao).values({
      operacaoId: op.id,
      condutorId: input.condutor_id ?? null,
      valorDiaria: input.valor_diaria.toFixed(2),
      caucao: input.caucao.toFixed(2),
      dataDevolucaoPrevista: new Date(input.data_devolucao_prevista),
    });
    await vincularAtivo(tx, op.id, input.ativo_id, "objeto");
    if (input.condutor_id) await garantirPapel(tx, input.condutor_id, "motorista");
    const [{ nome }] = (await tx.execute(sql`SELECT nome FROM pessoas WHERE id = ${input.cliente_id}`)).rows as [{ nome: string }];
    await indexarOperacao(tx, op.id, op.codigo, "locacao", nome);
    return op;
  });
}

export async function criarVenda(input: VendaCriarInput, usuarioId: string) {
  const ativo = await exigirAtivoLivre(input.ativo_id);
  if (["vendido", "baixado"].includes(ativo.status)) {
    throw conflito(`O ativo ${ativo.nome} já está ${ROTULOS_ATIVO[ativo.status]}.`);
  }
  return db.transaction(async (tx) => {
    const op = await inserirNucleo(tx, "venda", input.cliente_id, usuarioId, "negociacao", input.valor_total, input.observacoes);
    await tx.insert(operacoesCompraVenda).values({ operacaoId: op.id, kmNoAto: input.km_no_ato ?? null });
    await vincularAtivo(tx, op.id, input.ativo_id, "objeto");
    const [{ nome }] = (await tx.execute(sql`SELECT nome FROM pessoas WHERE id = ${input.cliente_id}`)).rows as [{ nome: string }];
    await indexarOperacao(tx, op.id, op.codigo, "venda", nome);
    return op;
  });
}

export async function criarCompra(input: CompraCriarInput, usuarioId: string) {
  const ativo = await exigirAtivoLivre(input.ativo_id);
  return db.transaction(async (tx) => {
    const op = await inserirNucleo(tx, "compra", input.cliente_id, usuarioId, "negociacao", input.valor_total, input.observacoes);
    await tx.insert(operacoesCompraVenda).values({ operacaoId: op.id, kmNoAto: input.km_no_ato ?? null });
    await vincularAtivo(tx, op.id, input.ativo_id, "objeto");
    await garantirPapel(tx, input.cliente_id, "fornecedor");
    const [{ nome }] = (await tx.execute(sql`SELECT nome FROM pessoas WHERE id = ${input.cliente_id}`)).rows as [{ nome: string }];
    await indexarOperacao(tx, op.id, op.codigo, "compra", nome);
    void ativo;
    return op;
  });
}

// ─────────────────────────── Transição ───────────────────────────
export async function transicionar(
  id: string, input: TransicaoInput, usuario: { id: string; papel: string }
) {
  const [op] = await db.select().from(operacoes).where(and(eq(operacoes.id, id), isNull(operacoes.deletedAt)));
  if (!op) throw naoEncontrado("Operação");
  const destino = input.status;
  const permitidas = proximasTransicoes(op.tipo, op.status);
  if (!permitidas.includes(destino)) {
    throw conflito(`Transição inválida: ${ROTULOS_STATUS[op.status]} → ${ROTULOS_STATUS[destino]}.`);
  }

  // Ativos da operação por papel
  const vinculos = (
    await db.execute(sql`SELECT ativo_id, papel FROM operacao_ativos WHERE operacao_id = ${id}`)
  ).rows as Array<{ ativo_id: string; papel: string }>;
  const objeto = vinculos.find((v) => v.papel === "objeto")?.ativo_id;
  const recurso = vinculos.find((v) => v.papel === "recurso")?.ativo_id;

  await db.transaction(async (tx) => {
    const mudancasOp: Record<string, unknown> = { status: destino };
    if (TERMINAIS.has(destino)) mudancasOp.dataFim = new Date();

    if (destino === "cancelada") {
      await cancelarLancamentosPrevistos(tx, id, usuario.id);
      // Devolve ativos bloqueados ao estado disponível
      for (const v of vinculos) {
        const [a] = await tx.select().from(ativos).where(eq(ativos.id, v.ativo_id));
        if (a && ["reservado", "alugado", "em_uso_interno"].includes(a.status)) {
          await mudarStatusAtivo(tx, v.ativo_id, "disponivel", usuario.id, op.codigo);
        }
      }
    } else {
      await aplicarEfeitos(tx, op.tipo, destino, { op, objeto, recurso, input, usuario });
    }

    await tx.update(operacoes).set(mudancasOp).where(eq(operacoes.id, id));
    await registrarEvento(tx, {
      entidadeTipo: "operacao", entidadeId: id, evento: "status_alterado",
      descricao: `Operação ${op.codigo}: ${ROTULOS_STATUS[op.status]} → ${ROTULOS_STATUS[destino]}`,
      dados: { de: op.status, para: destino }, usuarioId: usuario.id,
    });
  });
  // Lido após o commit para refletir o estado final (e não a transação aberta)
  return obterOperacao(id);
}

interface CtxEfeito {
  op: typeof operacoes.$inferSelect;
  objeto?: string;
  recurso?: string;
  input: TransicaoInput;
  usuario: { id: string; papel: string };
}

/** Efeitos colaterais de cada transição não-cancelada (doc 03 §1). */
async function aplicarEfeitos(tx: DbConn, tipo: TipoOperacao, destino: StatusOperacao, c: CtxEfeito) {
  const valor = Number(c.op.valorTotal);
  if (tipo === "locacao") {
    if (destino === "reservada" && c.objeto) {
      await mudarStatusAtivo(tx, c.objeto, "reservado", c.usuario.id, c.op.codigo);
    }
    if (destino === "ativa" && c.objeto) {
      await exigirCnhValida(c.op.id, c.usuario, c.input);
      await mudarStatusAtivo(tx, c.objeto, "alugado", c.usuario.id, c.op.codigo);
      await tx.update(operacoesLocacao)
        .set({ dataRetirada: new Date(), kmSaida: c.input.km ?? null })
        .where(eq(operacoesLocacao.operacaoId, c.op.id));
    }
    if (destino === "finalizada" && c.objeto) {
      await mudarStatusAtivo(tx, c.objeto, "disponivel", c.usuario.id, c.op.codigo);
      await tx.update(operacoesLocacao)
        .set({ dataDevolucaoReal: new Date(), kmRetorno: c.input.km ?? null })
        .where(eq(operacoesLocacao.operacaoId, c.op.id));
      if (c.input.km != null) {
        await tx.update(ativosVeiculos).set({ kmAtual: c.input.km }).where(eq(ativosVeiculos.ativoId, c.objeto));
      }
      // Receita: diárias × dias decorridos, mínimo 1 (ajustável depois pelo financeiro)
      const total = await totalLocacao(tx, c.op.id, valor);
      await gerarLancamentos(tx, {
        operacaoId: c.op.id, clienteId: c.op.clienteId, tipo: "receita",
        categoriaNome: "Locação", descricao: `Locação ${c.op.codigo}`, valor: total, parcelas: c.input.parcelas,
      }, c.usuario.id);
      await tx.update(operacoes).set({ valorTotal: total.toFixed(2) }).where(eq(operacoes.id, c.op.id));
    }
  } else if (tipo === "guincho") {
    if (destino === "a_caminho" && c.recurso) {
      await mudarStatusAtivo(tx, c.recurso, "em_uso_interno", c.usuario.id, c.op.codigo);
    }
    if (destino === "concluido") {
      if (c.recurso) await mudarStatusAtivo(tx, c.recurso, "disponivel", c.usuario.id, c.op.codigo);
      await tx.update(operacoesGuincho)
        .set({ dataConclusao: new Date(), kmPercorrido: c.input.km ?? null })
        .where(eq(operacoesGuincho.operacaoId, c.op.id));
      await gerarLancamentos(tx, {
        operacaoId: c.op.id, clienteId: c.op.clienteId, tipo: "receita",
        categoriaNome: "Guincho", descricao: `Guincho ${c.op.codigo}`, valor, parcelas: c.input.parcelas,
      }, c.usuario.id);
    }
  } else if (tipo === "venda") {
    if (destino === "fechada") {
      await gerarLancamentos(tx, {
        operacaoId: c.op.id, clienteId: c.op.clienteId, tipo: "receita",
        categoriaNome: "Venda de Ativos", descricao: `Venda ${c.op.codigo}`, valor, parcelas: c.input.parcelas,
      }, c.usuario.id);
    }
    if (destino === "concluida" && c.objeto) {
      await mudarStatusAtivo(tx, c.objeto, "vendido", c.usuario.id, c.op.codigo);
      await tx.update(operacoesCompraVenda)
        .set({ dataTransferencia: new Date().toISOString().slice(0, 10), statusDocumentacao: "concluida" })
        .where(eq(operacoesCompraVenda.operacaoId, c.op.id));
    }
  } else if (tipo === "compra") {
    if (destino === "fechada") {
      await gerarLancamentos(tx, {
        operacaoId: c.op.id, clienteId: c.op.clienteId, tipo: "despesa",
        categoriaNome: "Compra de Ativos", descricao: `Compra ${c.op.codigo}`, valor, parcelas: c.input.parcelas,
      }, c.usuario.id);
    }
    if (destino === "concluida" && c.objeto) {
      // Ativo adquirido entra/permanece no patrimônio disponível, vinculado à origem
      await mudarStatusAtivo(tx, c.objeto, "disponivel", c.usuario.id, c.op.codigo);
      await tx.update(operacoesCompraVenda)
        .set({ dataTransferencia: new Date().toISOString().slice(0, 10), statusDocumentacao: "concluida" })
        .where(eq(operacoesCompraVenda.operacaoId, c.op.id));
    }
  }
}

/** Valor da locação ao finalizar: diárias × dias decorridos (mínimo 1 dia). */
async function totalLocacao(tx: DbConn, operacaoId: string, fallback: number): Promise<number> {
  const [loc] = await tx.select().from(operacoesLocacao).where(eq(operacoesLocacao.operacaoId, operacaoId));
  if (!loc) return fallback;
  const inicio = loc.dataRetirada ?? new Date();
  const fim = loc.dataDevolucaoReal ?? new Date();
  const dias = Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / 86400_000));
  return Number(loc.valorDiaria) * dias;
}

/** CNH vencida do condutor bloqueia ativação; admin sobrepõe com justificativa (doc 03 §9). */
async function exigirCnhValida(operacaoId: string, usuario: { id: string; papel: string }, input: TransicaoInput) {
  const [loc] = await db.select().from(operacoesLocacao).where(eq(operacoesLocacao.operacaoId, operacaoId));
  const condutorId = loc?.condutorId;
  if (!condutorId) return;
  const [p] = await db.select().from(pessoas).where(eq(pessoas.id, condutorId));
  if (!p?.cnhValidade) return;
  const hoje = new Date().toISOString().slice(0, 10);
  if (p.cnhValidade >= hoje) return;
  // Vencida: só admin pode sobrepor, e com justificativa
  if (!input.justificativa) {
    throw regraNegocio(`A CNH do condutor ${p.nome} está vencida (${p.cnhValidade}). Renove ou sobreponha com justificativa.`);
  }
  if (usuario.papel !== "admin") throw semPermissao();
  await registrarEvento(db, {
    entidadeTipo: "operacao", entidadeId: operacaoId, evento: "status_alterado",
    descricao: `Ativação com CNH vencida sobreposta por ${usuario.papel}: ${input.justificativa}`, usuarioId: usuario.id,
  });
}
