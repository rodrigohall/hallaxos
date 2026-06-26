import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CarFront, Download, TableProperties, ChevronRight } from "lucide-react";
import {
  DIMENSOES_LINHA, DIMENSOES_COLUNA, MEDIDAS_PLANILHA,
  type DimensaoLinha, type DimensaoColuna, type MedidaPlanilha,
} from "@hallaxos/shared";
import { api } from "../api";
import {
  Card, EstadoVazio, PlanilhaGrade, Selo, SkeletonLinhas, Tabela,
  Drawer, Lista, ListaLinha,
  dinheiro, dataCurta,
  type PlanilhaResult, type CelulaDrillDown,
} from "../componentes/ui";

// ─────────────────────────────── Tipos ────────────────────────────────────

interface LinhaAtivo {
  id: string; codigo: string; nome: string; status: string;
  receita: string; despesa: string; resultado: string; roi: number | null;
}
interface Dre {
  meses: Array<{ mes: string; receitas: string; despesas: string }>;
  categorias: Array<{ nome: string; tipo: string; total: string }>;
}
interface Categoria { id: string; nome: string; tipo: string }
interface Conta { id: string; nome: string; saldo: string }
interface LancDrill {
  id: string; tipo: string; descricao: string; valor: string; status: string;
  dataVencimento: string; dataPagamento: string | null; vencido: boolean;
  categoria: string; conta: string; pessoa: string | null;
}

// ─────────────────────────────── Abas ────────────────────────────────────

type Aba = "roi" | "dre" | "planilha";

const ROTULO_LINHA: Record<DimensaoLinha, string> = {
  categoria: "Categoria", origem: "Origem", conta: "Conta", tipo: "Tipo",
};
const ROTULO_COLUNA: Record<DimensaoColuna, string> = {
  mes: "Mês", trimestre: "Trimestre", ativo: "Ativo", status: "Status",
};
const ROTULO_MEDIDA: Record<MedidaPlanilha, string> = {
  liquido: "Líquido (R - D)", receita: "Receita", despesa: "Despesa",
};

// ──────────────────────── Helper: datas de drill-down ───────────────────

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

// ──────────────────────── Helper: CSV ─────────────────────────────────

function exportarCSV(dados: PlanilhaResult, opts: { linha: string; coluna: string; medida: string }) {
  const sep = ";";
  const linhas: string[] = [];
  const cabecalho = [dados.rotuloLinha, ...dados.colunas, "TOTAL"].join(sep);
  linhas.push(cabecalho);
  dados.linhas.forEach((lk, li) => {
    const cells = (dados.celulas[li] ?? []).map((v) => String(v).replace(".", ","));
    linhas.push([lk, ...cells, String(dados.totaisLinha[li] ?? 0).replace(".", ",")].join(sep));
  });
  const totais = ["TOTAL", ...dados.totaisColuna.map((v) => String(v).replace(".", ",")), String(dados.totalGeral).replace(".", ",")].join(sep);
  linhas.push(totais);

  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `planilha-${opts.linha}-por-${opts.coluna}-${opts.medida}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────── Main ────────────────────────────────────

export function Relatorios() {
  const anoAtual = new Date().getFullYear();
  const [aba, setAba] = useState<Aba>("planilha");

  // Controles da planilha
  const [linha, setLinha] = useState<DimensaoLinha>("categoria");
  const [coluna, setColuna] = useState<DimensaoColuna>("mes");
  const [medida, setMedida] = useState<MedidaPlanilha>("liquido");
  const [ano, setAno] = useState(anoAtual);
  const [statusFiltro, setStatusFiltro] = useState("pago");

  // Drill-down
  const [drillCelula, setDrillCelula] = useState<CelulaDrillDown | null>(null);
  const [drillTitulo, setDrillTitulo] = useState("");

  // Queries
  const { data: ativos, isLoading: carregandoAtivos } = useQuery({
    queryKey: ["rel-ativos"],
    queryFn: () => api.get<{ dados: LinhaAtivo[] }>("/relatorios/resultado-por-ativo").then((r) => r.dados),
    enabled: aba === "roi",
  });
  const { data: dre, isLoading: carregandoDre } = useQuery({
    queryKey: ["rel-dre", anoAtual],
    queryFn: () => api.get<{ dados: Dre }>(`/relatorios/dre?ano=${anoAtual}`).then((r) => r.dados),
    enabled: aba === "dre",
  });
  const { data: planilha, isLoading: carregandoPlanilha } = useQuery({
    queryKey: ["rel-planilha", linha, coluna, medida, ano, statusFiltro],
    queryFn: () =>
      api
        .get<{ dados: PlanilhaResult }>(
          `/relatorios/planilha?linha=${linha}&coluna=${coluna}&medida=${medida}&ano=${ano}&status=${statusFiltro}`
        )
        .then((r) => r.dados),
    enabled: aba === "planilha",
  });

  // Categorias e contas para lookup de ID (drill-down)
  const { data: categorias } = useQuery<Categoria[]>({
    queryKey: ["categorias-financeiras"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/categorias-financeiras").then((r) => r.dados),
  });
  const { data: contas } = useQuery<Conta[]>({
    queryKey: ["contas"],
    queryFn: () => api.get<{ dados: Conta[] }>("/contas").then((r) => r.dados),
  });

  // Drill-down lancamentos
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
    queryKey: ["drill-lancamentos", drillCelula, linha, coluna, statusFiltro],
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

  const classeAba = (a: Aba) =>
    `px-4 py-2 text-sm font-medium transition-colors rounded-md ${
      aba === a ? "bg-ouro/15 text-ouro" : "text-suave hover:text-texto hover:bg-elevado"
    }`;

  const selectClasse =
    "rounded-md border border-borda bg-painel px-2.5 py-1.5 text-sm text-texto focus:border-ouro focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-lg font-bold">Relatórios</h1>
        <div className="flex gap-1 rounded-lg border border-borda bg-painel p-1">
          <button className={classeAba("planilha")} onClick={() => setAba("planilha")}>
            <TableProperties className="mr-1.5 inline h-3.5 w-3.5" />Planilha
          </button>
          <button className={classeAba("roi")} onClick={() => setAba("roi")}>
            <CarFront className="mr-1.5 inline h-3.5 w-3.5" />Por Ativo
          </button>
          <button className={classeAba("dre")} onClick={() => setAba("dre")}>
            <BarChart3 className="mr-1.5 inline h-3.5 w-3.5" />DRE
          </button>
        </div>
      </div>

      {/* ───── ABA PLANILHA ───── */}
      {aba === "planilha" && (
        <div className="space-y-3">
          {/* Controles */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borda bg-painel px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-mudo">Linha</span>
              <select className={selectClasse} value={linha} onChange={(e) => setLinha(e.target.value as DimensaoLinha)}>
                {DIMENSOES_LINHA.map((d) => <option key={d} value={d}>{ROTULO_LINHA[d]}</option>)}
              </select>
            </div>
            <span className="text-mudo">×</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-mudo">Coluna</span>
              <select className={selectClasse} value={coluna} onChange={(e) => setColuna(e.target.value as DimensaoColuna)}>
                {DIMENSOES_COLUNA.map((d) => <option key={d} value={d}>{ROTULO_COLUNA[d]}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-mudo">Medida</span>
              <select className={selectClasse} value={medida} onChange={(e) => setMedida(e.target.value as MedidaPlanilha)}>
                {MEDIDAS_PLANILHA.map((m) => <option key={m} value={m}>{ROTULO_MEDIDA[m]}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-mudo">Ano</span>
              <select className={selectClasse} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
                {[anoAtual - 1, anoAtual, anoAtual + 1].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-mudo">Status</span>
              <select className={selectClasse} value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
                <option value="pago">Pago</option>
                <option value="previsto">Previsto</option>
              </select>
            </div>
            <div className="ml-auto">
              <button
                className="flex items-center gap-1.5 rounded-md border border-borda px-3 py-1.5 text-sm text-suave hover:border-borda-forte hover:text-texto transition-colors disabled:opacity-40"
                disabled={!planilha || planilha.linhas.length === 0}
                onClick={() => planilha && exportarCSV(planilha, { linha, coluna, medida })}
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* Legenda */}
          <p className="text-xs text-mudo">
            Clique em qualquer célula para ver os lançamentos detalhados.
          </p>

          {/* Grade */}
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
        </div>
      )}

      {/* ───── ABA ROI ───── */}
      {aba === "roi" && (
        <Card titulo="Resultado por ativo" icone={CarFront}>
          {carregandoAtivos ? (
            <SkeletonLinhas linhas={4} />
          ) : !ativos?.length ? (
            <EstadoVazio icone={CarFront} titulo="Sem ativos" />
          ) : (
            <Tabela cabecalhos={["Ativo", "Situação", "Receita", "Despesa", "Resultado", "ROI"]}>
              {ativos.map((a) => (
                <tr key={a.id}>
                  <td className="py-2 pr-4">
                    <Link to={`/ativos/${a.id}`} className="hover:text-ouro">
                      <span className="font-display text-xs font-bold text-ouro">{a.codigo}</span>{" "}
                      {a.nome}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    <Selo tom={a.status}>{a.status.replace(/_/g, " ")}</Selo>
                  </td>
                  <td className="py-2 pr-4 text-ok">{dinheiro(a.receita)}</td>
                  <td className="py-2 pr-4 text-erro">{dinheiro(a.despesa)}</td>
                  <td className={`py-2 pr-4 font-medium ${Number(a.resultado) >= 0 ? "text-texto" : "text-erro"}`}>
                    {dinheiro(a.resultado)}
                  </td>
                  <td className="py-2 pr-4">{a.roi !== null ? `${a.roi}%` : "—"}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </Card>
      )}

      {/* ───── ABA DRE ───── */}
      {aba === "dre" && (
        <div className="space-y-4">
          <Card titulo={`DRE ${anoAtual} · realizado por mês`} icone={BarChart3}>
            {carregandoDre ? (
              <SkeletonLinhas linhas={3} />
            ) : !dre?.meses.length ? (
              <EstadoVazio icone={BarChart3} titulo="Nenhum lançamento pago este ano" />
            ) : (
              <Tabela cabecalhos={["Mês", "Receitas", "Despesas", "Resultado"]}>
                {dre.meses.map((m) => {
                  const resultado = Number(m.receitas) - Number(m.despesas);
                  return (
                    <tr key={m.mes}>
                      <td className="py-2 pr-4 font-display text-xs font-bold">{m.mes}</td>
                      <td className="py-2 pr-4 text-ok">{dinheiro(m.receitas)}</td>
                      <td className="py-2 pr-4 text-erro">{dinheiro(m.despesas)}</td>
                      <td className={`py-2 pr-4 font-medium ${resultado >= 0 ? "text-ok" : "text-erro"}`}>
                        {dinheiro(resultado)}
                      </td>
                    </tr>
                  );
                })}
              </Tabela>
            )}
          </Card>
          {!!dre?.categorias.length && (
            <Card titulo={`Por categoria · ${anoAtual}`} icone={BarChart3}>
              <Tabela cabecalhos={["Categoria", "Tipo", "Total"]}>
                {dre.categorias.map((c) => (
                  <tr key={`${c.nome}-${c.tipo}`}>
                    <td className="py-2 pr-4">{c.nome}</td>
                    <td className="py-2 pr-4">
                      <Selo tom={c.tipo === "receita" ? "ok" : "erro"}>{c.tipo}</Selo>
                    </td>
                    <td className="py-2 pr-4 font-medium">{dinheiro(c.total)}</td>
                  </tr>
                ))}
              </Tabela>
            </Card>
          )}
        </div>
      )}

      {/* ───── DRAWER DE DRILL-DOWN ───── */}
      <Drawer
        aberto={!!drillCelula}
        aoFechar={() => setDrillCelula(null)}
        titulo={drillTitulo}
      >
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
