import { and, desc, eq, isNull, or, ilike, sql } from "drizzle-orm";
import type { AtivoCriarInput, AtivoEditarInput, StatusAtivo } from "@hallaxos/shared";
import { db, type DbConn } from "../db/client";
import { ativos, ativosVeiculos, ativoCategorias } from "../db/schema";
import { novoId } from "../lib/ids";
import { conflito, naoEncontrado, regraNegocio } from "../lib/erros";
import { diff, registrarEvento } from "./timeline";
import { indexar, removerDoIndice } from "./busca";

type Ativo = typeof ativos.$inferSelect;
type Veiculo = typeof ativosVeiculos.$inferSelect | null;

const ROTULOS_STATUS: Record<string, string> = {
  disponivel: "disponível", reservado: "reservado", alugado: "alugado",
  em_manutencao: "em manutenção", em_uso_interno: "em uso interno",
  vendido: "vendido", baixado: "baixado",
};

async function reindexarAtivo(conn: DbConn, a: Ativo, v: Veiculo) {
  await indexar(conn, {
    entidadeTipo: "ativo",
    entidadeId: a.id,
    titulo: v ? `${a.nome} · ${v.placa}` : a.nome,
    subtitulo: `Ativo · ${ROTULOS_STATUS[a.status] ?? a.status} · ${a.codigo}`,
    termos: [a.nome, a.codigo, a.observacoes, v?.placa, v?.marca, v?.modelo, v?.chassi, v?.cor],
    termosNumericos: [a.codigo, v?.placa, v?.renavam, v?.chassi],
  });
}

export async function listarAtivos(opts: {
  busca?: string;
  status?: StatusAtivo;
  categoriaId?: string;
  categoriaNome?: string;
  incluirArquivados?: boolean;
  pagina: number;
  porPagina: number;
}) {
  const filtros = [];
  if (!opts.incluirArquivados) filtros.push(isNull(ativos.deletedAt));
  if (opts.status) filtros.push(eq(ativos.status, opts.status));
  if (opts.categoriaId) filtros.push(eq(ativos.categoriaId, opts.categoriaId));
  if (opts.categoriaNome) filtros.push(ilike(ativoCategorias.nome, `%${opts.categoriaNome}%`));
  if (opts.busca) {
    const b = `%${opts.busca}%`;
    const placa = opts.busca.toUpperCase().replace(/[^A-Z0-9]/g, "");
    filtros.push(
      or(
        sql`unaccent(${ativos.nome}) ILIKE unaccent(${b})`,
        ilike(ativos.codigo, b),
        placa ? sql`${ativos.id} IN (SELECT ativo_id FROM ativos_veiculos
          WHERE placa LIKE ${"%" + placa + "%"} OR upper(marca) LIKE ${"%" + placa + "%"}
             OR upper(modelo) LIKE ${"%" + placa + "%"})` : undefined
      )
    );
  }
  const where = filtros.length ? and(...filtros) : undefined;

  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(ativos)
    .where(where)) as [{ total: number }];

  const linhas = await db
    .select({
      ativo: ativos,
      veiculo: ativosVeiculos,
      categoria: ativoCategorias.nome,
      fotoPrincipal: sql<string | null>`(
        SELECT d.id::text FROM documentos d
        WHERE d.entidade_tipo = 'ativo' AND d.entidade_id = ${ativos.id}
          AND d.tipo = 'foto' AND d.deleted_at IS NULL
        ORDER BY d.principal DESC, d.ordem, d.created_at LIMIT 1)`,
    })
    .from(ativos)
    .leftJoin(ativosVeiculos, eq(ativosVeiculos.ativoId, ativos.id))
    .innerJoin(ativoCategorias, eq(ativoCategorias.id, ativos.categoriaId))
    .where(where)
    .orderBy(desc(ativos.createdAt))
    .limit(opts.porPagina)
    .offset((opts.pagina - 1) * opts.porPagina);

  return {
    dados: linhas.map((l) => ({ ...l.ativo, veiculo: l.veiculo, categoria: l.categoria, fotoPrincipal: l.fotoPrincipal })),
    total,
  };
}

export async function obterAtivo(id: string) {
  const [linha] = await db
    .select({ ativo: ativos, veiculo: ativosVeiculos, categoria: ativoCategorias })
    .from(ativos)
    .leftJoin(ativosVeiculos, eq(ativosVeiculos.ativoId, ativos.id))
    .innerJoin(ativoCategorias, eq(ativoCategorias.id, ativos.categoriaId))
    .where(eq(ativos.id, id));
  if (!linha) throw naoEncontrado("Ativo");

  // Financeiro derivado: receitas/custos realizados ligados ao ativo via
  // operações (objeto) e manutenções — origem rastreável de ponta a ponta
  const fin = (
    await db.execute(sql`
      WITH ops AS (
        SELECT operacao_id FROM operacao_ativos WHERE ativo_id = ${id} AND papel = 'objeto'
      ),
      lanc AS (
        SELECT l.tipo, l.valor FROM lancamentos l
        WHERE l.deleted_at IS NULL AND l.status = 'pago'
          AND (l.ativo_id = ${id}
               OR l.operacao_id IN (SELECT operacao_id FROM ops)
               OR l.manutencao_id IN (SELECT id FROM manutencoes WHERE ativo_id = ${id}))
      )
      SELECT
        coalesce(sum(valor) FILTER (WHERE tipo = 'receita'), 0) AS receita,
        coalesce(sum(valor) FILTER (WHERE tipo = 'despesa'), 0) AS custos
      FROM lanc`)
  ).rows[0] as { receita: string; custos: string };

  const receita = Number(fin.receita);
  const custos = Number(fin.custos);
  const base = Number(linha.ativo.valorAquisicao ?? 0);
  const lucro = receita - custos;

  const fipe = Number(linha.ativo.valorFipe ?? 0);
  const precoVendaEstimado = fipe > 0 ? Number((fipe * 0.95).toFixed(2)) : null;
  // Lucro Presumido = (95% FIPE + receita já gerada) − custos acumulados (decisão #59)
  const lucroPresumido =
    precoVendaEstimado !== null
      ? Number((precoVendaEstimado + receita - custos).toFixed(2))
      : null;
  // ROI clássico: só exibido quando o ativo for vendido (decisão #59)
  const roi =
    linha.ativo.status === "vendido" && base > 0
      ? Number(((lucro / base) * 100).toFixed(1))
      : null;

  const operacoes = (
    await db.execute(sql`
      SELECT o.id, o.codigo, o.tipo, o.status, o.valor_total, o.data_inicio, p.nome AS cliente
      FROM operacoes o
      JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.ativo_id = ${id}
      JOIN pessoas p ON p.id = o.cliente_id
      WHERE o.deleted_at IS NULL
      ORDER BY o.data_inicio DESC LIMIT 20`)
  ).rows;

  const manutencoes = (
    await db.execute(sql`
      SELECT m.id, m.tipo, m.status, m.descricao, m.data_agendada, m.data_conclusao,
             p.nome AS fornecedor,
             coalesce((SELECT sum(l.valor) FROM lancamentos l
                       WHERE l.manutencao_id = m.id AND l.deleted_at IS NULL
                         AND l.status != 'cancelado'), 0) AS custo
      FROM manutencoes m
      LEFT JOIN pessoas p ON p.id = m.fornecedor_id
      WHERE m.ativo_id = ${id} AND m.deleted_at IS NULL
      ORDER BY coalesce(m.data_agendada, m.created_at::date) DESC LIMIT 20`)
  ).rows;

  // Lançamentos vinculados (diretos + herdados), com `origem` para distinguir e
  // navegar — uma só consulta canônica, reusada pelo endpoint dedicado.
  const lancamentos = await lancamentosDoAtivo(id);

  return {
    ...linha.ativo,
    veiculo: linha.veiculo,
    categoria: linha.categoria,
    valorDiaria: linha.ativo.valorDiaria,
    dataFipeAtualizacao: linha.ativo.dataFipeAtualizacao,
    financeiro: {
      receita,
      custos,
      lucro,
      roi,               // só não-null quando vendido
      precoVendaEstimado,
      lucroPresumido,    // substitui lucroVendaEsperado (decisão #59)
    },
    operacoes,
    manutencoes,
    lancamentos,
  };
}

export async function criarAtivo(input: AtivoCriarInput, usuarioId: string) {
  const [categoria] = await db
    .select()
    .from(ativoCategorias)
    .where(eq(ativoCategorias.id, input.categoria_id));
  if (!categoria) throw naoEncontrado("Categoria");
  if (categoria.ehVeicular && !input.veiculo) {
    throw regraNegocio(`A categoria ${categoria.nome} exige os dados do veículo (placa, marca, modelo).`);
  }
  if (input.veiculo?.placa) {
    const [placaExistente] = await db
      .select({ ativoId: ativosVeiculos.ativoId })
      .from(ativosVeiculos)
      .where(eq(ativosVeiculos.placa, input.veiculo.placa));
    if (placaExistente) throw conflito("Já existe um ativo com esta placa.");
  }

  const id = novoId();
  return db.transaction(async (tx) => {
    const [criado] = await tx
      .insert(ativos)
      .values({
        id,
        codigo: sql`DEFAULT` as never,
        categoriaId: input.categoria_id,
        nome: input.nome,
        valorAquisicao: input.valor_aquisicao?.toString() ?? null,
        valorFipe: input.valor_fipe?.toString() ?? null,
        valorDiaria: input.valor_diaria?.toString() ?? null,
        dataFipeAtualizacao: input.data_fipe_atualizacao
          ? input.data_fipe_atualizacao.toISOString().slice(0, 10)
          : null,
        dataAquisicao: input.data_aquisicao
          ? input.data_aquisicao.toISOString().slice(0, 10)
          : null,
        localizacao: input.localizacao ?? null,
        observacoes: input.observacoes ?? null,
      })
      .returning();

    let veiculo: Veiculo = null;
    if (input.veiculo) {
      const v = input.veiculo;
      const inseridos = await tx
        .insert(ativosVeiculos)
        .values({
          ativoId: id,
          placa: v.placa ?? "",
          renavam: v.renavam ?? null,
          chassi: v.chassi ?? null,
          marca: v.marca,
          modelo: v.modelo,
          anoFabricacao: v.ano_fabricacao ?? null,
          anoModelo: v.ano_modelo ?? null,
          cor: v.cor ?? null,
          combustivel: v.combustivel ?? null,
          kmAtual: v.km_atual ?? 0,
        })
        .returning();
      veiculo = inseridos[0] ?? null;
    }

    await registrarEvento(tx, {
      entidadeTipo: "ativo",
      entidadeId: id,
      evento: "criado",
      descricao: `Ativo ${input.nome} (${criado!.codigo}) cadastrado na categoria ${categoria.nome}`,
      usuarioId,
    });
    await reindexarAtivo(tx, criado!, veiculo);

    // Guard anti-duplicação (#58): criação vinda por "novo ativo" pode gerar
    // a operação de compra e o lançamento numa única transação, de mão única.
    // A compra criada aqui NÃO recria o ativo (sem recursão).
    if (input.gerar_compra && input.valor_aquisicao && input.valor_aquisicao > 0) {
      const categoriaCompraRes = await tx.execute(sql`
        SELECT id FROM categorias_financeiras
        WHERE nome = 'Compra de Ativos' LIMIT 1`);
      const categoriaCompra = (categoriaCompraRes.rows[0] as { id: string } | undefined)?.id;

      const contaRes = await tx.execute(sql`
        SELECT id FROM contas WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
      const contaId = (contaRes.rows[0] as { id: string } | undefined)?.id;

      // Cria operação de compra sem acionar criarAtivo (guard de mão única)
      const opId = novoId();
      const opCodigo = await tx.execute(sql`
        SELECT nextval('operacoes_codigo_seq')::text AS codigo`).then(r => (r.rows[0] as {codigo:string}).codigo);
      await tx.execute(sql`
        INSERT INTO operacoes (id, codigo, tipo, cliente_id, responsavel_id, status, valor_total, observacoes, data_inicio)
        VALUES (${opId}, ${'OP-' + opCodigo}, 'compra',
                (SELECT id FROM pessoas WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1),
                ${usuarioId},
                'concluida', ${input.valor_aquisicao.toString()},
                ${'Compra de ' + input.nome}, now())`);
      await tx.execute(sql`
        INSERT INTO operacoes_compra_venda (operacao_id)
        VALUES (${opId})
        ON CONFLICT DO NOTHING`);
      await tx.execute(sql`
        INSERT INTO operacao_ativos (operacao_id, ativo_id, papel)
        VALUES (${opId}, ${id}, 'objeto')`);

      // Gera lançamento de despesa vinculado ao ativo e à operação
      if (contaId && categoriaCompra) {
        const lancId = novoId();
        await tx.execute(sql`
          INSERT INTO lancamentos (id, tipo, descricao, valor, status, data_vencimento, data_pagamento,
                                   conta_id, categoria_id, operacao_id, ativo_id)
          VALUES (${lancId}, 'despesa', ${'Compra: ' + input.nome},
                  ${input.valor_aquisicao.toString()}, 'pago', current_date, current_date,
                  ${contaId}, ${categoriaCompra}, ${opId}, ${id})`);
      }
    }

    return { ...criado!, veiculo, categoria: categoria.nome };
  });
}

const CAMPO_COLUNA: Record<string, string> = {
  nome: "nome", categoria_id: "categoriaId", valor_aquisicao: "valorAquisicao",
  valor_fipe: "valorFipe", data_aquisicao: "dataAquisicao",
  localizacao: "localizacao", observacoes: "observacoes", status: "status",
  valor_diaria: "valorDiaria",
  data_fipe_atualizacao: "dataFipeAtualizacao",
};
const CAMPO_VEICULO: Record<string, string> = {
  placa: "placa", renavam: "renavam", chassi: "chassi", marca: "marca",
  modelo: "modelo", ano_fabricacao: "anoFabricacao", ano_modelo: "anoModelo",
  cor: "cor", combustivel: "combustivel", km_atual: "kmAtual",
};

export async function editarAtivo(id: string, input: AtivoEditarInput, usuarioId: string) {
  const [atual] = await db.select().from(ativos).where(eq(ativos.id, id));
  if (!atual) throw naoEncontrado("Ativo");
  const [veiculoAtual] = await db
    .select()
    .from(ativosVeiculos)
    .where(eq(ativosVeiculos.ativoId, id));

  const mudancas: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(input)) {
    if (valor === undefined || campo === "veiculo") continue;
    const coluna = CAMPO_COLUNA[campo];
    if (!coluna) continue;
    mudancas[coluna] =
      valor instanceof Date
        ? valor.toISOString().slice(0, 10)
        : typeof valor === "number"
          ? valor.toString()
          : valor;
  }
  const mudancasVeiculo: Record<string, unknown> = {};
  if (input.veiculo && veiculoAtual) {
    for (const [campo, valor] of Object.entries(input.veiculo)) {
      if (valor === undefined) continue;
      const coluna = CAMPO_VEICULO[campo];
      if (coluna) mudancasVeiculo[coluna] = valor;
    }
  }

  return db.transaction(async (tx) => {
    const [editado] = Object.keys(mudancas).length
      ? await tx.update(ativos).set(mudancas).where(eq(ativos.id, id)).returning()
      : [atual];
    let veiculo: Veiculo = veiculoAtual ?? null;
    if (Object.keys(mudancasVeiculo).length) {
      const atualizados = await tx
        .update(ativosVeiculos)
        .set(mudancasVeiculo)
        .where(eq(ativosVeiculos.ativoId, id))
        .returning();
      veiculo = atualizados[0] ?? null;
    }

    const mudou = {
      ...diff(atual as Record<string, unknown>, editado as Record<string, unknown>),
      ...(veiculoAtual && veiculo
        ? diff(veiculoAtual as Record<string, unknown>, veiculo as Record<string, unknown>)
        : {}),
    };
    delete mudou.updatedAt;

    if (Object.keys(mudou).length > 0) {
      const mudouStatus = "status" in mudou;
      await registrarEvento(tx, {
        entidadeTipo: "ativo",
        entidadeId: id,
        evento: mudouStatus ? "status_alterado" : "atualizado",
        descricao: mudouStatus
          ? `${editado!.nome}: situação alterada para ${ROTULOS_STATUS[editado!.status] ?? editado!.status}`
          : `Ativo ${editado!.nome} atualizado`,
        dados: mudou,
        usuarioId,
      });
    }
    await reindexarAtivo(tx, editado!, veiculo);
    return { ...editado!, veiculo };
  });
}

export async function arquivarAtivo(id: string, usuarioId: string) {
  const [a] = await db.select().from(ativos).where(eq(ativos.id, id));
  if (!a || a.deletedAt) throw naoEncontrado("Ativo");

  const [{ abertas }] = (
    await db.execute(sql`
      SELECT count(*)::int AS abertas FROM operacoes o
      JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.ativo_id = ${id}
      WHERE o.deleted_at IS NULL
        AND o.status NOT IN ('finalizada', 'concluido', 'concluida', 'cancelada')`)
  ).rows as [{ abertas: number }];
  if (abertas > 0) throw conflito("Este ativo participa de operações em aberto e não pode ser arquivado.");

  await db.transaction(async (tx) => {
    await tx.update(ativos).set({ deletedAt: new Date() }).where(eq(ativos.id, id));
    await registrarEvento(tx, {
      entidadeTipo: "ativo",
      entidadeId: id,
      evento: "status_alterado",
      descricao: `Ativo ${a.nome} arquivado`,
      usuarioId,
    });
    await removerDoIndice(tx, "ativo", id);
  });
}

export async function reativarAtivo(id: string, usuarioId: string) {
  const [a] = await db.select().from(ativos).where(eq(ativos.id, id));
  if (!a) throw naoEncontrado("Ativo");
  if (!a.deletedAt) throw regraNegocio("Este ativo já está ativo.");

  return db.transaction(async (tx) => {
    const [reativado] = await tx
      .update(ativos)
      .set({ deletedAt: null })
      .where(eq(ativos.id, id))
      .returning();
    await registrarEvento(tx, {
      entidadeTipo: "ativo",
      entidadeId: id,
      evento: "status_alterado",
      descricao: `Ativo ${a.nome} reativado`,
      usuarioId,
    });
    const [veiculo] = await tx.select().from(ativosVeiculos).where(eq(ativosVeiculos.ativoId, id));
    await reindexarAtivo(tx, reativado!, veiculo ?? null);
    return reativado!;
  });
}

/** Timeline agregada: eventos do ativo + das operações e manutenções dele. */
export async function timelineDoAtivo(id: string, antesDe?: string, limite = 50) {
  const r = await db.execute(sql`
    SELECT t.id, t.evento, t.descricao, t.dados, t.created_at AS "createdAt",
           t.entidade_tipo AS "origemTipo", u.nome AS usuario_nome
    FROM timeline t
    LEFT JOIN usuarios u ON u.id = t.usuario_id
    WHERE (
      (t.entidade_tipo = 'ativo' AND t.entidade_id = ${id})
      OR (t.entidade_tipo = 'operacao' AND t.entidade_id IN
          (SELECT operacao_id FROM operacao_ativos WHERE ativo_id = ${id}))
      OR (t.entidade_tipo = 'manutencao' AND t.entidade_id IN
          (SELECT id FROM manutencoes WHERE ativo_id = ${id}))
    )
    ${antesDe ? sql`AND t.id < ${antesDe}` : sql``}
    ORDER BY t.id DESC LIMIT ${limite}`);
  return r.rows.map((l) => {
    const { usuario_nome, ...e } = l as Record<string, unknown> & { usuario_nome: string | null };
    return { ...e, usuario: usuario_nome ? { nome: usuario_nome } : null };
  });
}

/**
 * Lançamentos vinculados ao ativo — por consulta, nunca cópia (doc 02 §9, mesmo
 * padrão da timeline agregada). Inclui os **diretos** (`ativo_id` = custo do
 * ativo, ex.: IPVA/seguro/multa) e os **herdados** via operação-objeto e
 * manutenção. `origem` distingue como o lançamento chegou até aqui.
 */
export async function lancamentosDoAtivo(id: string) {
  const r = await db.execute(sql`
    SELECT l.id, l.tipo, l.descricao, l.valor, l.status,
           l.data_vencimento AS "dataVencimento", l.data_pagamento AS "dataPagamento",
           l.operacao_id AS "operacaoId", l.manutencao_id AS "manutencaoId",
           l.ativo_id AS "ativoId",
           CASE
             WHEN l.ativo_id = ${id} THEN 'direto'
             WHEN l.operacao_id IS NOT NULL THEN 'operacao'
             WHEN l.manutencao_id IS NOT NULL THEN 'manutencao'
             ELSE 'direto'
           END AS origem,
           op.codigo AS "operacaoCodigo"
    FROM lancamentos l
    LEFT JOIN operacoes op ON op.id = l.operacao_id
    WHERE l.deleted_at IS NULL
      AND (l.ativo_id = ${id}
           OR l.operacao_id IN (SELECT operacao_id FROM operacao_ativos WHERE ativo_id = ${id} AND papel = 'objeto')
           OR l.manutencao_id IN (SELECT m.id FROM manutencoes m WHERE m.ativo_id = ${id}))
    ORDER BY coalesce(l.data_pagamento, l.data_vencimento) DESC, l.created_at DESC
    LIMIT 50`);
  return r.rows;
}

export async function listarCategorias() {
  return db.select().from(ativoCategorias).orderBy(ativoCategorias.nome);
}

export async function criarCategoria(nome: string, ehVeicular: boolean) {
  const [existente] = await db
    .select({ id: ativoCategorias.id })
    .from(ativoCategorias)
    .where(sql`lower(${ativoCategorias.nome}) = lower(${nome})`);
  if (existente) throw conflito("Já existe uma categoria com este nome.");
  const [criada] = await db
    .insert(ativoCategorias)
    .values({ id: novoId(), nome, ehVeicular })
    .returning();
  return criada!;
}

export async function listarRelatorioPatrimonio(opts: {
  categoriaId?: string;
  ordenar?: "fipe" | "receita" | "lucro" | "custo";
}) {
  const r = await db.execute(sql`
    SELECT
      a.id,
      a.codigo,
      a.nome,
      a.status,
      ac.nome AS categoria,
      a.valor_aquisicao::numeric                                        AS preco_compra,
      COALESCE(a.valor_fipe, 0)::numeric                                AS fipe,
      a.data_fipe_atualizacao,
      a.valor_diaria,
      -- Custos acumulados: lançamentos diretos + via operação + via manutenção
      COALESCE((
        SELECT sum(l.valor)
        FROM lancamentos l
        WHERE l.deleted_at IS NULL AND l.status != 'cancelado'
          AND l.tipo = 'despesa'
          AND (l.ativo_id = a.id
               OR l.operacao_id IN (SELECT operacao_id FROM operacao_ativos oa WHERE oa.ativo_id = a.id AND oa.papel = 'objeto')
               OR l.manutencao_id IN (SELECT id FROM manutencoes m WHERE m.ativo_id = a.id))
      ), 0)::numeric                                                    AS custos_acumulados,
      -- Receita acumulada: só operações (aluguel, guincho, venda)
      COALESCE((
        SELECT sum(l.valor)
        FROM lancamentos l
        WHERE l.deleted_at IS NULL AND l.status = 'pago'
          AND l.tipo = 'receita'
          AND l.operacao_id IN (SELECT operacao_id FROM operacao_ativos oa WHERE oa.ativo_id = a.id AND oa.papel = 'objeto')
      ), 0)::numeric                                                    AS receita_acumulada
    FROM ativos a
    JOIN ativo_categorias ac ON ac.id = a.categoria_id
    WHERE a.deleted_at IS NULL
      AND a.status NOT IN ('vendido', 'baixado')
      ${opts.categoriaId ? sql`AND a.categoria_id = ${opts.categoriaId}` : sql``}
    ORDER BY a.nome
  `);

  type Linha = {
    id: string; codigo: string; nome: string; status: string; categoria: string;
    preco_compra: string; fipe: string; data_fipe_atualizacao: string | null;
    valor_diaria: string | null; custos_acumulados: string; receita_acumulada: string;
  };

  const linhas = r.rows as Linha[];
  return linhas.map((l) => {
    const fipe = Number(l.fipe);
    const custos = Number(l.custos_acumulados);
    const receita = Number(l.receita_acumulada);
    // Lucro Presumido = (95% FIPE + receita já gerada) − custos (decisão #59)
    const lucroPresumido = fipe > 0 ? (fipe * 0.95 + receita - custos) : null;
    return {
      ...l,
      preco_compra: Number(l.preco_compra),
      fipe,
      custos_acumulados: custos,
      receita_acumulada: receita,
      lucro_presumido: lucroPresumido,
    };
  });
}
