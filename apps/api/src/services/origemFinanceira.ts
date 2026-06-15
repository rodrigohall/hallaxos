// Geração de lançamentos a partir de uma origem (operação ou manutenção).
// "Todo dinheiro tem origem" (doc 01 §1.3): operações e manutenções geram
// lançamentos; nunca o contrário. Helpers compartilhados entre os dois
// consumidores (extraídos do guincho/operações quando manutenções chegou).
import { sql } from "drizzle-orm";
import type { FormaPagamento } from "@hallaxos/shared";
import type { DbConn } from "../db/client";
import { lancamentos } from "../db/schema";
import { novoId } from "../lib/ids";
import { regraNegocio } from "../lib/erros";
import { registrarEvento } from "./timeline";

export async function contaPadrao(tx: DbConn): Promise<string> {
  const r = await tx.execute(sql`SELECT id FROM contas ORDER BY created_at LIMIT 1`);
  const linha = r.rows[0] as { id: string } | undefined;
  if (!linha) throw regraNegocio("Cadastre uma conta financeira antes de gerar lançamentos.");
  return linha.id;
}

export async function categoriaPadrao(
  tx: DbConn, nome: string, tipo: "receita" | "despesa"
): Promise<string> {
  const r = await tx.execute(
    sql`SELECT id FROM categorias_financeiras WHERE nome = ${nome} AND tipo = ${tipo} LIMIT 1`
  );
  const linha = r.rows[0] as { id: string } | undefined;
  if (linha) return linha.id;
  const id = novoId();
  await tx.execute(
    sql`INSERT INTO categorias_financeiras (id, nome, tipo) VALUES (${id}, ${nome}, ${tipo})`
  );
  return id;
}

/** Plano de parcelas escolhido pelo usuário na finalização (doc 06 §financeiro). */
export interface ParcelaPlano {
  dataVencimento: string; // YYYY-MM-DD
  valor?: number; // opcional; quando ausente, o total é rateado igualmente
}

export interface GerarLancamentos {
  origem: { operacaoId?: string; manutencaoId?: string };
  /** Entidade que recebe o evento de timeline (operacao ou manutencao). */
  entidade: { tipo: "operacao" | "manutencao"; id: string };
  clienteId?: string | null;
  tipo: "receita" | "despesa";
  categoriaNome: string;
  descricao: string;
  valor: number;
  parcelas: number;
  // ── Sobreposições opcionais (edição antes de finalizar) ──
  /** Conta de destino/origem; default = primeira conta cadastrada. */
  contaId?: string;
  /** Forma de pagamento aplicada a todas as parcelas. */
  formaPagamento?: FormaPagamento | null;
  /**
   * Plano explícito de parcelas (datas e, opcionalmente, valores). Tem
   * precedência sobre `parcelas`. Sem ele, gera `parcelas` mensais a partir de hoje.
   */
  plano?: ParcelaPlano[];
}

/** Vencimentos e valores de cada parcela: do plano do usuário ou o padrão mensal. */
export function montarParcelas(o: GerarLancamentos): Array<{ valorCent: number; dataVencimento: string }> {
  const totalCentavos = Math.round(o.valor * 100);

  if (o.plano && o.plano.length > 0) {
    const explicitos = o.plano.filter((p) => p.valor != null);
    if (explicitos.length > 0) {
      // Valores informados parcela a parcela: exigimos todos e que a soma bata.
      if (explicitos.length !== o.plano.length) {
        throw regraNegocio("Informe o valor de todas as parcelas ou de nenhuma.");
      }
      const somaCent = o.plano.reduce((s, p) => s + Math.round((p.valor as number) * 100), 0);
      if (somaCent !== totalCentavos) {
        throw regraNegocio(
          `A soma das parcelas (${(somaCent / 100).toFixed(2)}) não confere com o total (${o.valor.toFixed(2)}).`
        );
      }
      return o.plano.map((p) => ({ valorCent: Math.round((p.valor as number) * 100), dataVencimento: p.dataVencimento }));
    }
    // Só datas: rateia o total igualmente, sobra de centavos na 1ª.
    return ratear(totalCentavos, o.plano.map((p) => p.dataVencimento));
  }

  // Padrão: N parcelas mensais a partir de hoje.
  const n = Math.max(1, o.parcelas);
  const hoje = new Date();
  const datas = Array.from({ length: n }, (_, i) => {
    const venc = new Date(hoje);
    venc.setUTCMonth(venc.getUTCMonth() + i);
    return venc.toISOString().slice(0, 10);
  });
  return ratear(totalCentavos, datas);
}

function ratear(totalCentavos: number, datas: string[]): Array<{ valorCent: number; dataVencimento: string }> {
  const n = datas.length;
  const baseCent = Math.floor(totalCentavos / n);
  const resto = totalCentavos - baseCent * n;
  return datas.map((dataVencimento, i) => ({ valorCent: baseCent + (i === 0 ? resto : 0), dataVencimento }));
}

/** Gera lançamentos previstos vinculados à origem (com parcelas e datas/conta/forma escolhidas). */
export async function gerarLancamentosOrigem(tx: DbConn, o: GerarLancamentos, usuarioId: string) {
  if (o.valor <= 0) return;
  const contaId = o.contaId ?? (await contaPadrao(tx));
  const categoriaId = await categoriaPadrao(tx, o.categoriaNome, o.tipo);
  const parcelas = montarParcelas(o);
  const n = parcelas.length;
  const grupoId = n > 1 ? novoId() : null;
  for (let i = 0; i < n; i++) {
    const p = parcelas[i]!;
    await tx.insert(lancamentos).values({
      id: novoId(),
      tipo: o.tipo,
      descricao: n > 1 ? `${o.descricao} (${i + 1}/${n})` : o.descricao,
      categoriaId,
      contaId,
      pessoaId: o.clienteId ?? null,
      operacaoId: o.origem.operacaoId ?? null,
      manutencaoId: o.origem.manutencaoId ?? null,
      valor: (p.valorCent / 100).toFixed(2),
      dataVencimento: p.dataVencimento,
      status: "previsto",
      formaPagamento: o.formaPagamento ?? null,
      parcelaNumero: n > 1 ? i + 1 : null,
      parcelaTotal: n > 1 ? n : null,
      grupoParcelasId: grupoId,
    });
    await registrarEvento(tx, {
      entidadeTipo: o.entidade.tipo,
      entidadeId: o.entidade.id,
      evento: "lancamento_gerado",
      descricao: `${o.tipo === "receita" ? "Receita" : "Despesa"} prevista gerada: ${o.descricao}`,
      usuarioId,
    });
  }
}
