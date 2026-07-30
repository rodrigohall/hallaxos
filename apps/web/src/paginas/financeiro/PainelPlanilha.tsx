// Aba "Planilha" do hub financeiro — pivô com drill-down por célula.
//
// Os controles vivem na URL com prefixo `pl_` porque a aba de Lançamentos, no
// mesmo endereço, já usa `status` e `tipo` com outro significado (ver o
// contrato de params em HubFinanceiro.tsx).
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, TableProperties } from "lucide-react";
import {
  DIMENSOES_LINHA, DIMENSOES_COLUNA, MEDIDAS_PLANILHA,
  type DimensaoLinha, type DimensaoColuna, type MedidaPlanilha,
} from "@hallaxos/shared";
import { api } from "../../api";
import {
  Botao, Drawer, EstadoVazio, Lista, ListaLinha, PlanilhaGrade, Selecao, Selo,
  SkeletonLinhas, dinheiro, dataCurta,
  type PlanilhaResult, type CelulaDrillDown,
} from "../../componentes/ui";
import { useParamUrl } from "../../hooks/estadoUrl";

interface Categoria { id: string; nome: string; tipo: string }
interface Conta { id: string; nome: string; saldo: string }
interface LancDrill {
  id: string; tipo: string; descricao: string; valor: string; status: string;
  dataVencimento: string; dataPagamento: string | null; vencido: boolean;
  categoria: string; conta: string; pessoa: string | null;
}

const ROTULO_LINHA: Record<DimensaoLinha, string> = {
  categoria: "Categoria", origem: "Origem", conta: "Conta", tipo: "Tipo",
};
const ROTULO_COLUNA: Record<DimensaoColuna, string> = {
  mes: "Mês", trimestre: "Trimestre", ativo: "Ativo", status: "Status",
};
const ROTULO_MEDIDA: Record<MedidaPlanilha, string> = {
  liquido: "Líquido (R - D)", receita: "Receita", despesa: "Despesa",
};

function intervaloParaColuna(coluna: DimensaoColuna, colunaKey: string): { de: string; ate: string } | null {
  if (coluna === "mes") {
    const parts = colunaKey.split("-");
    const ano = Number(parts[0]);
    const mes = Number(parts[1] ?? 1);
    const de = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const ultimo = new Date(ano, mes, 0).getDate();
    const ate = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
    return { de, ate };
  }
  if (coluna === "trimestre") {
    const parts = colunaKey.split("-T");
    const ano = Number(parts[0]);
    const t = Number(parts[1] ?? 1);
    const mesInicio = (t - 1) * 3 + 1;
    const mesFim = t * 3;
    const de = `${ano}-${String(mesInicio).padStart(2, "0")}-01`;
    const ultimo = new Date(ano, mesFim, 0).getDate();
    const ate = `${ano}-${String(mesFim).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
    return { de, ate };
  }
  return null;
}

function exportarCSV(dados: PlanilhaResult, opts: { linha: string; coluna: string; medida: string }) {
  const sep = ";";
  const linhas: string[] = [];
  linhas.push([dados.rotuloLinha, ...dados.colunas, "TOTAL"].join(sep));
  dados.linhas.forEach((lk, li) => {
    const cells = (dados.celulas[li] ?? []).map((v) => String(v).replace(".", ","));
    linhas.push([lk, ...cells, String(dados.totaisLinha[li] ?? 0).replace(".", ",")].join(sep));
  });
  linhas.push(
    ["TOTAL", ...dados.totaisColuna.map((v) => String(v).replace(".", ",")), String(dados.totalGeral).replace(".", ",")].join(sep)
  );

  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `planilha-${opts.linha}-por-${opts.coluna}-${opts.medida}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PainelPlanilha() {
  const anoAtual = new Date().getFullYear();

  const [linhaParam, setLinha] = useParamUrl("pl_linha", "categoria");
  const [colunaParam, setColuna] = useParamUrl("pl_coluna", "mes");
  const [medidaParam, setMedida] = useParamUrl("pl_medida", "liquido");
  const [anoParam, setAno] = useParamUrl("pl_ano", String(anoAtual));
  const [statusParam, setStatusFiltro] = useParamUrl("pl_status", "pago");

  const linha = (linhaParam ?? "categoria") as DimensaoLinha;
  const coluna = (colunaParam ?? "mes") as DimensaoColuna;
  const medida = (medidaParam ?? "liquido") as MedidaPlanilha;
  const ano = Number(anoParam) || anoAtual;
  const statusFiltro = statusParam ?? "pago";

  const [drillCelula, setDrillCelula] = useState<CelulaDrillDown | null>(null);
  const [drillTitulo, setDrillTitulo] = useState("");

  const { data: planilha, isLoading: carregandoPlanilha } = useQuery({
    queryKey: ["rel-planilha", linha, coluna, medida, ano, statusFiltro],
    queryFn: () =>
      api
        .get<{ dados: PlanilhaResult }>(
          `/relatorios/planilha?linha=${linha}&coluna=${coluna}&medida=${medida}&ano=${ano}&status=${statusFiltro}`
        )
        .then((r) => r.dados),
  });

  // Categorias e contas servem só para traduzir nome → id no drill-down.
  const { data: categorias } = useQuery<Categoria[]>({
    queryKey: ["categorias-financeiras"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/categorias-financeiras").then((r) => r.dados),
  });
  const { data: contas } = useQuery<Conta[]>({
    queryKey: ["contas"],
    queryFn: () => api.get<{ dados: Conta[] }>("/contas").then((r) => r.dados),
  });

  const drillParams = useCallback(
    (celula: CelulaDrillDown): Record<string, string> => {
      const p: Record<string, string> = { status: statusFiltro, por_pagina: "50" };

      if (celula.linhaKey !== "__total__") {
        if (linha === "tipo") p.tipo = celula.linhaKey;
        else if (linha === "origem") p.operacao_tipo = celula.linhaKey;
        else if (linha === "categoria") {
          const cat = categorias?.find((c) => c.nome === celula.linhaKey);
          if (cat) p.categoria_id = cat.id;
        } else if (linha === "conta") {
          const ct = contas?.find((c) => c.nome === celula.linhaKey);
          if (ct) p.conta_id = ct.id;
        }
      }

      if (celula.colunaKey) {
        if (coluna === "mes" || coluna === "trimestre") {
          const intervalo = intervaloParaColuna(coluna, celula.colunaKey);
          if (intervalo) { p.de = intervalo.de; p.ate = intervalo.ate; }
        } else if (coluna === "status") {
          p.status = celula.colunaKey;
        }
        // coluna = "ativo" não tem filtro disponível na API de lancamentos
      }

      return p;
    },
    [linha, coluna, statusFiltro, categorias, contas]
  );

  const { data: lancDrill, isLoading: carregandoDrill } = useQuery({
    queryKey: ["drill", "planilha", drillCelula, linha, coluna, statusFiltro],
    queryFn: () => {
      if (!drillCelula) return null;
      const params = new URLSearchParams(drillParams(drillCelula));
      return api.get<{ dados: LancDrill[]; meta: { total: number } }>(`/lancamentos?${params}`).then((r) => r);
    },
    enabled: !!drillCelula,
  });

  function abrirDrill(celula: CelulaDrillDown) {
    const linhaLabel = celula.linhaKey === "__total__" ? "Total" : celula.linhaKey;
    const colunaLabel = celula.colunaKey ?? "Todos os períodos";
    setDrillTitulo(`${linhaLabel} · ${colunaLabel}`);
    setDrillCelula(celula);
  }

  return (
    <div className="space-y-3">
      {/* Controles */}
      <div className="animar-surgir superficie flex flex-wrap items-center gap-2 rounded-lg border border-borda px-4 py-3 shadow-painel">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-mudo">Linha</span>
          <Selecao tamanho="sm" value={linha} onChange={(e) => setLinha(e.target.value)}>
            {DIMENSOES_LINHA.map((d) => <option key={d} value={d}>{ROTULO_LINHA[d]}</option>)}
          </Selecao>
        </div>
        <span className="text-mudo">×</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-mudo">Coluna</span>
          <Selecao tamanho="sm" value={coluna} onChange={(e) => setColuna(e.target.value)}>
            {DIMENSOES_COLUNA.map((d) => <option key={d} value={d}>{ROTULO_COLUNA[d]}</option>)}
          </Selecao>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-mudo">Medida</span>
          <Selecao tamanho="sm" value={medida} onChange={(e) => setMedida(e.target.value)}>
            {MEDIDAS_PLANILHA.map((m) => <option key={m} value={m}>{ROTULO_MEDIDA[m]}</option>)}
          </Selecao>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-mudo">Ano</span>
          <Selecao tamanho="sm" value={ano} onChange={(e) => setAno(e.target.value)}>
            {[anoAtual - 1, anoAtual, anoAtual + 1].map((a) => <option key={a} value={a}>{a}</option>)}
          </Selecao>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-mudo">Status</span>
          <Selecao tamanho="sm" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
            <option value="pago">Pago</option>
            <option value="previsto">Previsto</option>
          </Selecao>
        </div>
        <div className="ml-auto">
          <Botao
            variante="secundario"
            tamanho="sm"
            disabled={!planilha || planilha.linhas.length === 0}
            onClick={() => planilha && exportarCSV(planilha, { linha, coluna, medida })}
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </Botao>
        </div>
      </div>

      <p className="text-xs text-mudo">
        Clique em qualquer célula para ver os lançamentos detalhados.
      </p>

      {carregandoPlanilha ? (
        <SkeletonLinhas linhas={6} />
      ) : !planilha || planilha.linhas.length === 0 ? (
        <EstadoVazio
          icone={TableProperties}
          titulo="Nenhum dado"
          descricao={`Não há lançamentos com status "${statusFiltro}" em ${ano}.`}
        />
      ) : (
        <PlanilhaGrade dados={planilha} aoDrillDown={abrirDrill} />
      )}

      <Drawer aberto={!!drillCelula} aoFechar={() => setDrillCelula(null)} titulo={drillTitulo}>
        {carregandoDrill ? (
          <SkeletonLinhas linhas={5} />
        ) : !lancDrill?.dados.length ? (
          <EstadoVazio
            icone={TableProperties}
            titulo="Nenhum lançamento"
            descricao="Nenhum lançamento encontrado para este filtro."
          />
        ) : (
          <div className="space-y-2">
            {lancDrill.meta.total > lancDrill.dados.length && (
              <p className="text-xs text-suave">
                Mostrando {lancDrill.dados.length} de {lancDrill.meta.total}.
              </p>
            )}
            <Lista>
              {lancDrill.dados.map((l) => {
                const vencido = l.status === "previsto" && new Date(l.dataVencimento) < new Date();
                return (
                  <ListaLinha
                    key={l.id}
                    titulo={
                      <span className="flex items-center gap-2">
                        <span className={l.tipo === "receita" ? "text-ok font-semibold" : "text-erro font-semibold"}>
                          {l.tipo === "receita" ? "+" : "-"}{dinheiro(Number(l.valor))}
                        </span>
                        <span className="truncate">{l.descricao}</span>
                      </span>
                    }
                    subtitulo={
                      <span className="flex flex-wrap gap-x-2">
                        <span>{l.categoria}</span>
                        <span>{l.conta}</span>
                        <span>
                          {l.status === "pago" && l.dataPagamento
                            ? `Pago ${dataCurta(l.dataPagamento)}`
                            : `Vence ${dataCurta(l.dataVencimento)}`}
                        </span>
                      </span>
                    }
                    direita={
                      <Selo tom={l.status === "pago" ? "ok" : vencido ? "erro" : "info"}>
                        {l.status === "pago" ? "pago" : vencido ? "vencido" : l.status}
                      </Selo>
                    }
                  />
                );
              })}
            </Lista>
          </div>
        )}
      </Drawer>
    </div>
  );
}
