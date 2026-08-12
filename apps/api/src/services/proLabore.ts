// Pró-labore — quanto o Rodrigo recebe no período, pelo acordo salarial.
//
//   pró-labore = fixo mensal
//              + 30% do lucro das vendas de ativos
//              + 20% do que o lucro de guincho+locação passar de 10.000/mês
//
// Nenhuma tabela nova (REGRA MÁXIMA): tudo é leitura sobre `lancamentos`,
// `operacoes` e `ativos`. Só os PARÂMETROS do acordo moram em `meta_sistema`,
// porque são combinado entre pessoas — não derivam de nenhum dado do sistema.
//
// ── As quatro definições do acordo (decididas pelo Rodrigo) ────────────────
// 1. Base dos 20%: LUCRO (receita − despesa) de guincho+locação, não receita bruta.
// 2. Lucro da venda: preço de venda − preço de compra − despesas do ativo.
// 3. Piso de 10.000: POR MÊS. Um trimestre tem piso de 30.000, e o total do
//    trimestre bate com a soma dos três meses vistos separadamente.
// 4. Regime: COMPETÊNCIA — conta previsto + pago (só `cancelado` fica de fora),
//    pela data de competência COALESCE(pagamento, vencimento), igual à planilha.
//
// ── Atribuição: cada lançamento entra UMA vez ──────────────────────────────
// `ativo_id` COEXISTE com `operacao_id` (decisão #53), então somar por vínculo
// contaria o mesmo dinheiro duas vezes. A classificação abaixo é uma cascata
// de precedência — o primeiro vínculo que casar define o balde, e os demais
// nem são olhados:
//   1º operação guincho/locação  →  balde da operação
//   2º manutenção de ativo que serviu no período  →  balde do ativo
//   3º lançamento direto no ativo (IPVA, seguro, multa)  →  balde do ativo
// Lançamento de operação de venda/compra cai fora daqui de propósito: venda
// tem linha própria (os 30%), e contá-la também no excedente pagaria duas vezes.
import { sql } from "drizzle-orm";
import { db } from "../db/client";

export interface ParametrosProLabore {
  /** Parte fixa, por mês do período. */
  fixoMensal: number;
  /** % sobre o lucro das vendas de ativos. */
  pctVenda: number;
  /** % sobre o excedente de guincho+locação. */
  pctExcedente: number;
  /** Piso mensal a partir do qual o excedente conta. */
  pisoMensal: number;
}

export const PARAMETROS_PADRAO: ParametrosProLabore = {
  fixoMensal: 1200,
  pctVenda: 30,
  pctExcedente: 20,
  pisoMensal: 10000,
};

const CHAVES: Record<keyof ParametrosProLabore, string> = {
  fixoMensal: "pro_labore.fixo_mensal",
  pctVenda: "pro_labore.pct_venda",
  pctExcedente: "pro_labore.pct_excedente",
  pisoMensal: "pro_labore.piso_mensal",
};

/** Parâmetros do acordo; o que nunca foi salvo cai no padrão. */
export async function lerParametros(): Promise<ParametrosProLabore> {
  const r = await db.execute(
    sql`SELECT chave, valor FROM meta_sistema WHERE chave LIKE 'pro_labore.%'`
  );
  const salvos = new Map((r.rows as { chave: string; valor: string }[]).map((l) => [l.chave, l.valor]));
  const ler = (campo: keyof ParametrosProLabore) => {
    const bruto = salvos.get(CHAVES[campo]);
    const n = bruto === undefined ? NaN : Number(bruto);
    return Number.isFinite(n) ? n : PARAMETROS_PADRAO[campo];
  };
  return {
    fixoMensal: ler("fixoMensal"),
    pctVenda: ler("pctVenda"),
    pctExcedente: ler("pctExcedente"),
    pisoMensal: ler("pisoMensal"),
  };
}

/** Salva os parâmetros informados; o que vier ausente fica como estava. */
export async function salvarParametros(
  entrada: Partial<ParametrosProLabore>
): Promise<ParametrosProLabore> {
  for (const [campo, valor] of Object.entries(entrada) as [keyof ParametrosProLabore, number | undefined][]) {
    if (valor === undefined) continue;
    await db.execute(sql`
      INSERT INTO meta_sistema (chave, valor) VALUES (${CHAVES[campo]}, ${String(valor)})
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`);
  }
  return lerParametros();
}

const cent = (n: number) => Math.round(n * 100) / 100;

export interface LinhaAtivoLocado {
  /** null quando o dinheiro da locação não aponta para nenhum ativo. */
  id: string | null;
  codigo: string;
  nome: string;
  receita: number;
  despesa: number;
  lucro: number;
}

export interface LinhaVenda {
  operacaoId: string;
  codigo: string;
  data: string | null;
  cliente: string;
  ativoId: string | null;
  ativoCodigo: string | null;
  ativoNome: string | null;
  valorVenda: number;
  valorCompra: number;
  despesasAtivo: number;
  lucro: number;
}

export interface LinhaMes {
  mes: string;
  /** Fração do mês coberta pelo período — período parcial rateia fixo e piso. */
  fracao: number;
  lucroGuincho: number;
  lucroLocacao: number;
  lucro: number;
  piso: number;
  excedente: number;
}

export interface SaldoMes {
  mes: string;
  /** Fração do mês coberta pelo período (1 = mês inteiro). */
  fracao: number;
  lucroGuincho: number;
  lucroLocacao: number;
}

export interface Parcelas {
  linhas: LinhaMes[];
  /** Soma das frações — quantos meses cheios o período equivale. */
  mesesEquivalentes: number;
  fixo: number;
  comissaoVendas: number;
  comissaoExcedente: number;
  excedenteTotal: number;
  total: number;
}

/**
 * As três parcelas do acordo — aritmética pura, sem banco, para ser testável.
 *
 * O piso é aplicado MÊS A MÊS (decisão do acordo): um mês forte não cobre o
 * piso de um mês fraco. Mês parcial rateia fixo e piso pela fração de dias.
 */
export function calcularParcelas(
  meses: SaldoMes[],
  lucroVendas: number,
  p: ParametrosProLabore
): Parcelas {
  const linhas: LinhaMes[] = meses.map((m) => {
    const lucro = m.lucroGuincho + m.lucroLocacao;
    const piso = cent(p.pisoMensal * m.fracao);
    return {
      mes: m.mes,
      fracao: Number(m.fracao.toFixed(4)),
      lucroGuincho: cent(m.lucroGuincho),
      lucroLocacao: cent(m.lucroLocacao),
      lucro: cent(lucro),
      piso,
      excedente: cent(Math.max(0, lucro - piso)),
    };
  });

  // Soma as frações CRUAS: o arredondamento de `linhas[].fracao` existe para a
  // tela, e não pode vazar para o dinheiro.
  const mesesEquivalentes = meses.reduce((s, m) => s + m.fracao, 0);
  const fixo = cent(p.fixoMensal * mesesEquivalentes);

  // Venda no prejuízo abate o lucro de outra venda, mas a base nunca fica
  // negativa: mês ruim não gera dívida com a empresa.
  const comissaoVendas = cent((Math.max(0, lucroVendas) * p.pctVenda) / 100);

  const excedenteTotal = cent(linhas.reduce((s, m) => s + m.excedente, 0));
  const comissaoExcedente = cent((excedenteTotal * p.pctExcedente) / 100);

  return {
    linhas,
    mesesEquivalentes: Number(mesesEquivalentes.toFixed(4)),
    fixo,
    comissaoVendas,
    comissaoExcedente,
    excedenteTotal,
    total: cent(fixo + comissaoVendas + comissaoExcedente),
  };
}

/**
 * Monta o extrato do pró-labore no período.
 *
 * @param de  data inicial (YYYY-MM-DD), inclusiva
 * @param ate data final (YYYY-MM-DD), inclusiva
 */
export async function montarProLabore(de: string, ate: string) {
  const p = await lerParametros();

  // ── Meses do período, com a fração de cada um ────────────────────────────
  // O piso e o fixo são MENSAIS, mas o período é livre: 01/08 a 12/08 é 12/31
  // de um mês. Ratear evita tanto cobrar piso cheio de meio mês quanto pagar
  // fixo cheio por ele.
  const meses = (
    await db.execute(sql`
      WITH m AS (
        SELECT g::date AS inicio,
               (g + interval '1 month - 1 day')::date AS fim
        FROM generate_series(
          date_trunc('month', ${de}::date),
          date_trunc('month', ${ate}::date),
          interval '1 month') g
      )
      SELECT to_char(inicio, 'YYYY-MM') AS mes,
        (LEAST(fim, ${ate}::date) - GREATEST(inicio, ${de}::date) + 1)::numeric
          / (fim - inicio + 1)::numeric AS fracao
      FROM m ORDER BY inicio`)
  ).rows as { mes: string; fracao: string }[];

  // ── Guincho + locação: receita e despesa por mês, balde e ativo ──────────
  const movimento = (
    await db.execute(sql`
      WITH ops AS (
        SELECT o.id, o.tipo::text AS tipo
        FROM operacoes o
        WHERE o.deleted_at IS NULL AND o.status <> 'cancelada'
          AND o.tipo IN ('guincho', 'locacao')
          -- Operação que ENCOSTA no período (locação atravessa meses).
          AND o.data_inicio::date <= ${ate}::date
          AND COALESCE(o.data_fim, now())::date >= ${de}::date
      ),
      op_objeto AS (
        SELECT oa.operacao_id, oa.ativo_id
        FROM operacao_ativos oa JOIN ops o ON o.id = oa.operacao_id
        WHERE oa.papel = 'objeto'
      ),
      -- Ativo → balde. Quem serviu locação conta como locação (o guincho usa
      -- o ativo como recurso; a locação é o que se cobra por ele).
      ativos_env AS (
        SELECT oa.ativo_id,
          CASE WHEN bool_or(o.tipo = 'locacao') THEN 'locacao' ELSE 'guincho' END AS balde
        FROM operacao_ativos oa JOIN ops o ON o.id = oa.operacao_id
        GROUP BY oa.ativo_id
      ),
      base AS (
        SELECT l.tipo AS tipo_lanc, l.valor,
          to_char(COALESCE(l.data_pagamento, l.data_vencimento), 'YYYY-MM') AS mes,
          CASE
            WHEN l.operacao_id IS NOT NULL
              THEN (SELECT o.tipo FROM ops o WHERE o.id = l.operacao_id)
            WHEN l.manutencao_id IS NOT NULL
              THEN (SELECT ae.balde FROM manutencoes m
                    JOIN ativos_env ae ON ae.ativo_id = m.ativo_id
                    WHERE m.id = l.manutencao_id)
            ELSE (SELECT ae.balde FROM ativos_env ae WHERE ae.ativo_id = l.ativo_id)
          END AS balde,
          CASE
            WHEN l.operacao_id IS NOT NULL
              THEN (SELECT oo.ativo_id FROM op_objeto oo WHERE oo.operacao_id = l.operacao_id LIMIT 1)
            WHEN l.manutencao_id IS NOT NULL
              THEN (SELECT m.ativo_id FROM manutencoes m WHERE m.id = l.manutencao_id)
            ELSE l.ativo_id
          END AS ativo_id
        FROM lancamentos l
        WHERE l.deleted_at IS NULL AND l.status IN ('previsto', 'pago')
          AND COALESCE(l.data_pagamento, l.data_vencimento) BETWEEN ${de}::date AND ${ate}::date
      )
      SELECT b.mes, b.balde, b.ativo_id, a.codigo, a.nome,
        coalesce(sum(b.valor) FILTER (WHERE b.tipo_lanc = 'receita'), 0) AS receita,
        coalesce(sum(b.valor) FILTER (WHERE b.tipo_lanc = 'despesa'), 0) AS despesa
      FROM base b
      LEFT JOIN ativos a ON a.id = b.ativo_id
      WHERE b.balde IS NOT NULL
      GROUP BY b.mes, b.balde, b.ativo_id, a.codigo, a.nome`)
  ).rows as {
    mes: string; balde: "guincho" | "locacao"; ativo_id: string | null;
    codigo: string | null; nome: string | null; receita: string; despesa: string;
  }[];

  // ── Guincho: operações do período, para a lista clicável ─────────────────
  const operacoesGuincho = (
    await db.execute(sql`
      SELECT o.id, o.codigo, o.status::text AS status, o.data_inicio, p.nome AS cliente,
        coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita'), 0) AS receita,
        coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa'), 0) AS despesa
      FROM operacoes o
      JOIN pessoas p ON p.id = o.cliente_id
      LEFT JOIN lancamentos l ON l.operacao_id = o.id AND l.deleted_at IS NULL
        AND l.status IN ('previsto', 'pago')
        AND COALESCE(l.data_pagamento, l.data_vencimento) BETWEEN ${de}::date AND ${ate}::date
      WHERE o.deleted_at IS NULL AND o.status <> 'cancelada' AND o.tipo = 'guincho'
        AND o.data_inicio::date <= ${ate}::date
        AND COALESCE(o.data_fim, now())::date >= ${de}::date
      GROUP BY o.id, o.codigo, o.status, o.data_inicio, p.nome
      HAVING coalesce(sum(l.valor), 0) > 0
      ORDER BY o.data_inicio DESC`)
  ).rows as {
    id: string; codigo: string; status: string; data_inicio: string;
    cliente: string; receita: string; despesa: string;
  }[];

  // ── Vendas do período, com o lucro de cada uma ───────────────────────────
  // Despesas do ativo aqui são as da VIDA INTEIRA dele (mesma consulta da ficha
  // do ativo), não as do período: o lucro da venda é o resultado do ciclo todo.
  const vendas = (
    await db.execute(sql`
      SELECT o.id AS operacao_id, o.codigo, COALESCE(o.data_fim, o.data_inicio) AS data,
        p.nome AS cliente, a.id AS ativo_id, a.codigo AS ativo_codigo, a.nome AS ativo_nome,
        coalesce((SELECT sum(l.valor) FROM lancamentos l
                  WHERE l.operacao_id = o.id AND l.deleted_at IS NULL
                    AND l.status IN ('previsto', 'pago') AND l.tipo = 'receita'), 0) AS valor_venda,
        coalesce((SELECT c.valor_total FROM operacoes c
                  JOIN operacao_ativos ca ON ca.operacao_id = c.id AND ca.ativo_id = a.id
                  WHERE c.tipo = 'compra' AND c.status <> 'cancelada' AND c.deleted_at IS NULL
                  ORDER BY c.data_inicio DESC LIMIT 1),
                 a.valor_aquisicao, 0) AS valor_compra,
        coalesce((SELECT sum(l.valor) FROM lancamentos l
                  WHERE l.deleted_at IS NULL AND l.status IN ('previsto', 'pago')
                    AND l.tipo = 'despesa'
                    AND (l.ativo_id = a.id
                         OR l.manutencao_id IN (SELECT m.id FROM manutencoes m WHERE m.ativo_id = a.id)
                         OR l.operacao_id IN (SELECT oa.operacao_id FROM operacao_ativos oa
                                              WHERE oa.ativo_id = a.id AND oa.papel = 'objeto'))), 0)
          AS despesas_ativo
      FROM operacoes o
      JOIN pessoas p ON p.id = o.cliente_id
      LEFT JOIN operacao_ativos oa ON oa.operacao_id = o.id AND oa.papel = 'objeto'
      LEFT JOIN ativos a ON a.id = oa.ativo_id
      WHERE o.deleted_at IS NULL AND o.status <> 'cancelada' AND o.tipo = 'venda'
        AND COALESCE(o.data_fim, o.data_inicio)::date BETWEEN ${de}::date AND ${ate}::date
      ORDER BY COALESCE(o.data_fim, o.data_inicio) DESC`)
  ).rows as {
    operacao_id: string; codigo: string; data: string | null; cliente: string;
    ativo_id: string | null; ativo_codigo: string | null; ativo_nome: string | null;
    valor_venda: string; valor_compra: string; despesas_ativo: string;
  }[];

  // ── Agregações ──────────────────────────────────────────────────────────
  const porMes = new Map<string, { guincho: number; locacao: number }>();
  const porAtivo = new Map<string, LinhaAtivoLocado>();
  let receitaGuincho = 0;
  let despesaGuincho = 0;

  for (const linha of movimento) {
    const receita = Number(linha.receita);
    const despesa = Number(linha.despesa);
    const saldo = receita - despesa;

    const mes = porMes.get(linha.mes) ?? { guincho: 0, locacao: 0 };
    mes[linha.balde] += saldo;
    porMes.set(linha.mes, mes);

    if (linha.balde === "guincho") {
      receitaGuincho += receita;
      despesaGuincho += despesa;
      continue;
    }
    // Locação sem ativo vinculado ganha linha própria em vez de sumir: assim o
    // rodapé da tabela fecha com o total do mês, e o buraco fica visível.
    const chave = linha.ativo_id ?? "sem-ativo";
    const ativo = porAtivo.get(chave) ?? {
      id: linha.ativo_id,
      codigo: linha.codigo ?? "—",
      nome: linha.ativo_id ? "Ativo removido" : "Sem ativo vinculado",
      receita: 0, despesa: 0, lucro: 0,
    };
    ativo.receita += receita;
    ativo.despesa += despesa;
    ativo.lucro = ativo.receita - ativo.despesa;
    porAtivo.set(chave, ativo);
  }

  const saldosMes: SaldoMes[] = meses.map((m) => {
    const saldo = porMes.get(m.mes) ?? { guincho: 0, locacao: 0 };
    return {
      mes: m.mes,
      fracao: Number(m.fracao),
      lucroGuincho: saldo.guincho,
      lucroLocacao: saldo.locacao,
    };
  });

  const ativosLocados = [...porAtivo.values()]
    .map((a) => ({ ...a, receita: cent(a.receita), despesa: cent(a.despesa), lucro: cent(a.lucro) }))
    .sort((a, b) => b.lucro - a.lucro);

  const linhasVenda: LinhaVenda[] = vendas.map((v) => {
    const valorVenda = Number(v.valor_venda);
    const valorCompra = Number(v.valor_compra);
    const despesasAtivo = Number(v.despesas_ativo);
    return {
      operacaoId: v.operacao_id,
      codigo: v.codigo,
      data: v.data,
      cliente: v.cliente,
      ativoId: v.ativo_id,
      ativoCodigo: v.ativo_codigo,
      ativoNome: v.ativo_nome,
      valorVenda: cent(valorVenda),
      valorCompra: cent(valorCompra),
      despesasAtivo: cent(despesasAtivo),
      lucro: cent(valorVenda - valorCompra - despesasAtivo),
    };
  });

  // ── As três parcelas ────────────────────────────────────────────────────
  const lucroVendas = cent(linhasVenda.reduce((s, v) => s + v.lucro, 0));
  const parcelas = calcularParcelas(saldosMes, lucroVendas, p);

  const totalGuincho = cent(receitaGuincho - despesaGuincho);
  const totalLocacao = cent(ativosLocados.reduce((s, a) => s + a.lucro, 0));

  return {
    periodo: { de, ate, mesesEquivalentes: parcelas.mesesEquivalentes },
    parametros: p,
    guincho: {
      receita: cent(receitaGuincho),
      despesa: cent(despesaGuincho),
      lucro: totalGuincho,
      operacoes: operacoesGuincho.map((o) => ({
        id: o.id, codigo: o.codigo, status: o.status, data: o.data_inicio,
        cliente: o.cliente, receita: cent(Number(o.receita)), despesa: cent(Number(o.despesa)),
      })),
    },
    locacao: {
      receita: cent(ativosLocados.reduce((s, a) => s + a.receita, 0)),
      despesa: cent(ativosLocados.reduce((s, a) => s + a.despesa, 0)),
      lucro: totalLocacao,
      ativos: ativosLocados,
    },
    vendas: { lucro: lucroVendas, itens: linhasVenda },
    meses: parcelas.linhas,
    calculo: {
      fixo: parcelas.fixo,
      comissaoVendas: parcelas.comissaoVendas,
      comissaoExcedente: parcelas.comissaoExcedente,
      excedenteTotal: parcelas.excedenteTotal,
      total: parcelas.total,
    },
  };
}
