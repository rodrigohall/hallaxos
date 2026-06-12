// Geração de lançamentos a partir de uma origem (operação ou manutenção).
// "Todo dinheiro tem origem" (doc 01 §1.3): operações e manutenções geram
// lançamentos; nunca o contrário. Helpers compartilhados entre os dois
// consumidores (extraídos do guincho/operações quando manutenções chegou).
import { sql } from "drizzle-orm";
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
}

/** Gera lançamentos previstos vinculados à origem (com parcelas mensais). */
export async function gerarLancamentosOrigem(tx: DbConn, o: GerarLancamentos, usuarioId: string) {
  if (o.valor <= 0) return;
  const contaId = await contaPadrao(tx);
  const categoriaId = await categoriaPadrao(tx, o.categoriaNome, o.tipo);
  const totalCentavos = Math.round(o.valor * 100);
  const n = Math.max(1, o.parcelas);
  const baseCent = Math.floor(totalCentavos / n);
  const resto = totalCentavos - baseCent * n;
  const grupoId = n > 1 ? novoId() : null;
  const primeiro = new Date();
  for (let i = 0; i < n; i++) {
    const venc = new Date(primeiro);
    venc.setUTCMonth(venc.getUTCMonth() + i);
    await tx.insert(lancamentos).values({
      id: novoId(),
      tipo: o.tipo,
      descricao: n > 1 ? `${o.descricao} (${i + 1}/${n})` : o.descricao,
      categoriaId,
      contaId,
      pessoaId: o.clienteId ?? null,
      operacaoId: o.origem.operacaoId ?? null,
      manutencaoId: o.origem.manutencaoId ?? null,
      valor: ((baseCent + (i === 0 ? resto : 0)) / 100).toFixed(2),
      dataVencimento: venc.toISOString().slice(0, 10),
      status: "previsto",
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
