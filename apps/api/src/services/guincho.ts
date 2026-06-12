// Guincho (Sprint 4): primeiro fluxo completo sobre o núcleo de operações.
// Toda transição acontece em transação, move o ativo recurso, grava na timeline
// e — ao concluir — gera a receita do serviço (doc 03 §1 · Operação · Guincho).
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { GuinchoCriarInput, GuinchoConcluirInput, StatusOperacao } from "@hallaxos/shared";
import { db, type DbConn } from "../db/client";
import {
  operacoes, operacaoAtivos, operacoesGuincho, ativos, ativosVeiculos,
  pessoas, usuarios, lancamentos, categoriasFinanceiras, contas,
} from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado, regraNegocio } from "../lib/erros";
import { registrarEvento } from "./timeline";
import { garantirPapel } from "./pessoas";
import { indexar, removerDoIndice } from "./busca";

const ROTULOS: Record<string, string> = {
  solicitado: "solicitado", a_caminho: "a caminho", em_execucao: "em execução",
  concluido: "concluído", cancelada: "cancelada",
};

// Transições válidas do guincho (doc 03). O frontend nunca decide estado.
const TRANSICOES: Record<string, StatusOperacao[]> = {
  solicitado: ["a_caminho", "cancelada"],
  a_caminho: ["em_execucao", "cancelada"],
  em_execucao: ["concluido", "cancelada"],
};
const TERMINAIS = ["concluido", "cancelada"];

async function indexarGuincho(
  conn: DbConn,
  o: { id: string; codigo: string; status: string },
  cliente: string,
  g: { origemEndereco: string; destinoEndereco: string; veiculoClienteDescricao: string; veiculoClientePlaca: string | null }
) {
  await indexar(conn, {
    entidadeTipo: "operacao",
    entidadeId: o.id,
    titulo: `${o.codigo} · Guincho · ${cliente}`,
    subtitulo: `Guincho · ${ROTULOS[o.status] ?? o.status} · ${g.origemEndereco} → ${g.destinoEndereco}`,
    termos: [o.codigo, cliente, "guincho", g.origemEndereco, g.destinoEndereco, g.veiculoClienteDescricao, g.veiculoClientePlaca],
    termosNumericos: [o.codigo, g.veiculoClientePlaca],
  });
}

export async function listarGuinchos(opts: {
  status?: string;
  busca?: string;
  pagina: number;
  porPagina: number;
}) {
  const filtros = [eq(operacoes.tipo, "guincho"), isNull(operacoes.deletedAt)];
  if (opts.status) filtros.push(eq(operacoes.status, opts.status as never));
  if (opts.busca) {
    const b = `%${opts.busca}%`;
    filtros.push(sql`(
      unaccent(${operacoes.codigo}) ILIKE unaccent(${b})
      OR unaccent(${pessoas.nome}) ILIKE unaccent(${b})
      OR unaccent(${operacoesGuincho.origemEndereco}) ILIKE unaccent(${b})
      OR unaccent(${operacoesGuincho.destinoEndereco}) ILIKE unaccent(${b})
      OR unaccent(${operacoesGuincho.veiculoClienteDescricao}) ILIKE unaccent(${b})
    )`);
  }
  const where = and(...filtros);

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(operacoes)
    .innerJoin(operacoesGuincho, eq(operacoesGuincho.operacaoId, operacoes.id))
    .innerJoin(pessoas, eq(pessoas.id, operacoes.clienteId))
    .where(where)) as [{ total: number }];

  const linhas = await db
    .select({
      id: operacoes.id,
      codigo: operacoes.codigo,
      status: operacoes.status,
      valorTotal: operacoes.valorTotal,
      desconto: operacoes.desconto,
      dataInicio: operacoes.dataInicio,
      cliente: pessoas.nome,
      origem: operacoesGuincho.origemEndereco,
      destino: operacoesGuincho.destinoEndereco,
      veiculoCliente: operacoesGuincho.veiculoClienteDescricao,
    })
    .from(operacoes)
    .innerJoin(operacoesGuincho, eq(operacoesGuincho.operacaoId, operacoes.id))
    .innerJoin(pessoas, eq(pessoas.id, operacoes.clienteId))
    .where(where)
    .orderBy(desc(operacoes.dataInicio))
    .limit(opts.porPagina)
    .offset((opts.pagina - 1) * opts.porPagina);

  return { dados: linhas, total };
}

export async function obterGuincho(id: string) {
  const [linha] = await db
    .select({
      operacao: operacoes,
      guincho: operacoesGuincho,
      cliente: { id: pessoas.id, nome: pessoas.nome, telefone: pessoas.telefone },
      responsavel: usuarios.nome,
    })
    .from(operacoes)
    .innerJoin(operacoesGuincho, eq(operacoesGuincho.operacaoId, operacoes.id))
    .innerJoin(pessoas, eq(pessoas.id, operacoes.clienteId))
    .innerJoin(usuarios, eq(usuarios.id, operacoes.responsavelId))
    .where(and(eq(operacoes.id, id), eq(operacoes.tipo, "guincho")));
  if (!linha) throw naoEncontrado("Guincho");

  const [motorista] = linha.guincho.motoristaId
    ? await db.select({ id: pessoas.id, nome: pessoas.nome }).from(pessoas).where(eq(pessoas.id, linha.guincho.motoristaId))
    : [null];

  const [recurso] = await db
    .select({
      id: ativos.id, codigo: ativos.codigo, nome: ativos.nome, status: ativos.status,
      placa: ativosVeiculos.placa, kmAtual: ativosVeiculos.kmAtual,
    })
    .from(operacaoAtivos)
    .innerJoin(ativos, eq(ativos.id, operacaoAtivos.ativoId))
    .leftJoin(ativosVeiculos, eq(ativosVeiculos.ativoId, ativos.id))
    .where(and(eq(operacaoAtivos.operacaoId, id), eq(operacaoAtivos.papel, "recurso")));

  const lanc = await db
    .select({
      id: lancamentos.id, tipo: lancamentos.tipo, descricao: lancamentos.descricao,
      valor: lancamentos.valor, status: lancamentos.status,
      dataVencimento: lancamentos.dataVencimento, dataPagamento: lancamentos.dataPagamento,
    })
    .from(lancamentos)
    .where(and(eq(lancamentos.operacaoId, id), isNull(lancamentos.deletedAt)))
    .orderBy(desc(lancamentos.dataVencimento));

  return { ...linha.operacao, guincho: linha.guincho, cliente: linha.cliente, responsavel: linha.responsavel, motorista: motorista ?? null, recurso: recurso ?? null, lancamentos: lanc };
}

export async function criarGuincho(input: GuinchoCriarInput, usuarioId: string) {
  if (input.desconto > input.valor_total) {
    throw regraNegocio("O desconto não pode ser maior que o valor do serviço.");
  }
  const [cliente] = await db.select({ id: pessoas.id, nome: pessoas.nome }).from(pessoas).where(eq(pessoas.id, input.cliente_id));
  if (!cliente) throw naoEncontrado("Cliente");
  if (input.motorista_id) {
    const [m] = await db.select({ id: pessoas.id }).from(pessoas).where(eq(pessoas.id, input.motorista_id));
    if (!m) throw naoEncontrado("Motorista");
  }

  // O recurso precisa ser um veículo nosso, disponível e não preso a outro guincho aberto.
  const [recurso] = await db
    .select({ id: ativos.id, nome: ativos.nome, status: ativos.status, placa: ativosVeiculos.placa })
    .from(ativos)
    .leftJoin(ativosVeiculos, eq(ativosVeiculos.ativoId, ativos.id))
    .where(and(eq(ativos.id, input.recurso_ativo_id), isNull(ativos.deletedAt)));
  if (!recurso) throw naoEncontrado("Caminhão guincho");
  if (!recurso.placa) throw regraNegocio("O recurso de um guincho precisa ser um veículo (caminhão guincho).");
  if (recurso.status !== "disponivel") {
    throw conflito(`O ${recurso.nome} não está disponível (situação: ${recurso.status.replace(/_/g, " ")}).`);
  }
  const [{ presos }] = (
    await db.execute(sql`
      SELECT count(*)::int AS presos FROM operacao_ativos oa
      JOIN operacoes o ON o.id = oa.operacao_id
      WHERE oa.ativo_id = ${input.recurso_ativo_id} AND oa.papel = 'recurso'
        AND o.tipo = 'guincho' AND o.deleted_at IS NULL
        AND o.status NOT IN ('concluido', 'cancelada')`)
  ).rows as [{ presos: number }];
  if (presos > 0) throw conflito("Este caminhão já está designado para outro guincho em aberto.");

  const id = novoId();
  return db.transaction(async (tx) => {
    const [op] = await tx
      .insert(operacoes)
      .values({
        id,
        codigo: sql`DEFAULT` as never,
        tipo: "guincho",
        clienteId: input.cliente_id,
        responsavelId: usuarioId,
        status: "solicitado",
        valorTotal: input.valor_total.toFixed(2),
        desconto: input.desconto.toFixed(2),
        dataInicio: input.data_acionamento ?? new Date(),
        observacoes: input.observacoes ?? null,
      })
      .returning();

    const [g] = await tx
      .insert(operacoesGuincho)
      .values({
        operacaoId: id,
        motoristaId: input.motorista_id ?? null,
        origemEndereco: input.origem_endereco,
        destinoEndereco: input.destino_endereco,
        veiculoClienteDescricao: input.veiculo_cliente_descricao,
        veiculoClientePlaca: input.veiculo_cliente_placa ?? null,
        dataAcionamento: input.data_acionamento ?? new Date(),
      })
      .returning();

    await tx.insert(operacaoAtivos).values({ operacaoId: id, ativoId: input.recurso_ativo_id, papel: "recurso" });

    // Papéis de pessoa são automáticos (doc 03 regra 10)
    await garantirPapel(tx, input.cliente_id, "cliente");
    if (input.motorista_id) await garantirPapel(tx, input.motorista_id, "motorista");

    await registrarEvento(tx, {
      entidadeTipo: "operacao",
      entidadeId: id,
      evento: "criado",
      descricao: `Guincho ${op!.codigo} solicitado: ${g!.origemEndereco} → ${g!.destinoEndereco} (${g!.veiculoClienteDescricao})`,
      usuarioId,
    });
    await indexarGuincho(tx, op!, cliente.nome, g!);
    return op!;
  });
}

interface Contexto {
  operacao: typeof operacoes.$inferSelect;
  guincho: typeof operacoesGuincho.$inferSelect;
  recursoId: string;
  recursoStatus: string;
}

async function carregar(conn: DbConn, id: string): Promise<Contexto> {
  const [op] = await conn
    .select()
    .from(operacoes)
    .where(and(eq(operacoes.id, id), eq(operacoes.tipo, "guincho"), isNull(operacoes.deletedAt)));
  if (!op) throw naoEncontrado("Guincho");
  const [g] = await conn.select().from(operacoesGuincho).where(eq(operacoesGuincho.operacaoId, id));
  const [rec] = await conn
    .select({ id: ativos.id, status: ativos.status })
    .from(operacaoAtivos)
    .innerJoin(ativos, eq(ativos.id, operacaoAtivos.ativoId))
    .where(and(eq(operacaoAtivos.operacaoId, id), eq(operacaoAtivos.papel, "recurso")));
  return { operacao: op, guincho: g!, recursoId: rec!.id, recursoStatus: rec!.status };
}

function exigirTransicao(de: string, para: StatusOperacao) {
  if (TERMINAIS.includes(de)) throw conflito(`Este guincho já está ${ROTULOS[de] ?? de} e não aceita mudanças.`);
  if (!(TRANSICOES[de] ?? []).includes(para)) {
    throw regraNegocio(`Não é possível ir de "${ROTULOS[de] ?? de}" para "${ROTULOS[para] ?? para}".`);
  }
}

async function moverAtivo(conn: DbConn, ativoId: string, para: "disponivel" | "em_uso_interno", motivo: string, usuarioId: string) {
  const [a] = await conn.update(ativos).set({ status: para }).where(eq(ativos.id, ativoId)).returning();
  await registrarEvento(conn, {
    entidadeTipo: "ativo", entidadeId: ativoId, evento: "status_alterado",
    descricao: `${a!.nome}: ${motivo}`, usuarioId,
  });
}

async function registrarMudancaStatus(conn: DbConn, op: typeof operacoes.$inferSelect, novo: StatusOperacao, usuarioId: string) {
  await registrarEvento(conn, {
    entidadeTipo: "operacao", entidadeId: op.id, evento: "status_alterado",
    descricao: `Guincho ${op.codigo}: ${ROTULOS[op.status] ?? op.status} → ${ROTULOS[novo] ?? novo}`,
    dados: { de: op.status, para: novo }, usuarioId,
  });
}

/** Receita do guincho ao concluir. Sempre há onde registrar: categoria e conta
 *  são garantidas (criadas na primeira vez), preservando a regra de origem. */
async function gerarReceita(conn: DbConn, op: typeof operacoes.$inferSelect, descricaoServico: string, usuarioId: string) {
  const valor = Number(op.valorTotal) - Number(op.desconto);
  if (valor <= 0) return;

  const [cat] = await conn
    .select({ id: categoriasFinanceiras.id })
    .from(categoriasFinanceiras)
    .where(and(sql`lower(${categoriasFinanceiras.nome}) = 'guincho'`, eq(categoriasFinanceiras.tipo, "receita")));
  const categoriaId = cat?.id ??
    (await conn.insert(categoriasFinanceiras).values({ id: novoId(), nome: "Guincho", tipo: "receita" }).returning())[0]!.id;

  const [contaExistente] = await conn.select({ id: contas.id }).from(contas).orderBy(contas.createdAt).limit(1);
  const contaId = contaExistente?.id ??
    (await conn.insert(contas).values({ id: novoId(), nome: "Caixa", saldoInicial: "0" }).returning())[0]!.id;

  const hoje = new Date().toISOString().slice(0, 10);
  const lancId = novoId();
  await conn.insert(lancamentos).values({
    id: lancId,
    tipo: "receita",
    descricao: `Guincho ${op.codigo} — ${descricaoServico}`,
    categoriaId,
    contaId,
    pessoaId: op.clienteId,
    operacaoId: op.id,
    valor: valor.toFixed(2),
    dataVencimento: hoje,
    status: "previsto",
  });
  await registrarEvento(conn, {
    entidadeTipo: "operacao", entidadeId: op.id, evento: "lancamento_gerado",
    descricao: `Receita de R$ ${valor.toFixed(2)} gerada pelo guincho ${op.codigo}`, usuarioId,
  });
}

export async function transicionarGuincho(
  id: string,
  para: StatusOperacao,
  usuarioId: string,
  extra?: GuinchoConcluirInput,
  motivo?: string
) {
  return db.transaction(async (tx) => {
    const ctx = await carregar(tx, id);
    const op = ctx.operacao;
    exigirTransicao(op.status, para);

    const mudancasOp: Record<string, unknown> = { status: para };

    if (para === "a_caminho") {
      if (ctx.recursoStatus !== "disponivel") {
        throw conflito("O caminhão não está disponível para sair — verifique sua situação atual.");
      }
      await moverAtivo(tx, ctx.recursoId, "em_uso_interno", "saiu para um guincho", usuarioId);
    }

    if (para === "concluido") {
      mudancasOp.dataFim = new Date();
      const novoKm = extra?.km_percorrido ?? null;
      await tx
        .update(operacoesGuincho)
        .set({ dataConclusao: new Date(), kmPercorrido: novoKm })
        .where(eq(operacoesGuincho.operacaoId, id));
      if (extra?.observacoes) {
        mudancasOp.observacoes = [op.observacoes, extra.observacoes].filter(Boolean).join("\n");
      }
      // Acumula a quilometragem rodada no caminhão (se informada)
      if (novoKm && novoKm > 0) {
        await tx
          .update(ativosVeiculos)
          .set({ kmAtual: sql`${ativosVeiculos.kmAtual} + ${novoKm}` })
          .where(eq(ativosVeiculos.ativoId, ctx.recursoId));
      }
      await moverAtivo(tx, ctx.recursoId, "disponivel", "voltou de um guincho concluído", usuarioId);
      await gerarReceita(tx, op, `${ctx.guincho.origemEndereco} → ${ctx.guincho.destinoEndereco}`, usuarioId);
    }

    if (para === "cancelada") {
      mudancasOp.dataFim = new Date();
      if (ctx.recursoStatus === "em_uso_interno") {
        await moverAtivo(tx, ctx.recursoId, "disponivel", "liberado por cancelamento do guincho", usuarioId);
      }
    }

    const [atualizada] = await tx.update(operacoes).set(mudancasOp).where(eq(operacoes.id, id)).returning();
    await registrarMudancaStatus(tx, op, para, usuarioId);
    if (para === "cancelada" && motivo) {
      await registrarEvento(tx, {
        entidadeTipo: "operacao", entidadeId: id, evento: "status_alterado",
        descricao: `Cancelamento: ${motivo}`, usuarioId,
      });
    }

    const [cliente] = await tx.select({ nome: pessoas.nome }).from(pessoas).where(eq(pessoas.id, op.clienteId));
    if (TERMINAIS.includes(para)) {
      await removerDoIndice(tx, "operacao", id);
    } else {
      await indexarGuincho(tx, atualizada!, cliente?.nome ?? "", ctx.guincho);
    }
    return atualizada!;
  });
}

/** Ativos veiculares disponíveis para servir de caminhão guincho. */
export async function caminhoesDisponiveis() {
  return db
    .select({
      id: ativos.id, codigo: ativos.codigo, nome: ativos.nome,
      placa: ativosVeiculos.placa, categoria: sql<string>`(SELECT nome FROM ativo_categorias WHERE id = ${ativos.categoriaId})`,
    })
    .from(ativos)
    .innerJoin(ativosVeiculos, eq(ativosVeiculos.ativoId, ativos.id))
    .where(and(eq(ativos.status, "disponivel"), isNull(ativos.deletedAt)))
    .orderBy(ativos.nome);
}
