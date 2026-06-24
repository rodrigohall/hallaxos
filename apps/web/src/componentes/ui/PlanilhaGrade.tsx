// Planilha pivotável: sticky header + primeira coluna, tabular-nums, drill-down por célula (F2+F3).
import type { MouseEvent } from "react";
import { dinheiro } from "./formato";

export interface PlanilhaResult {
  linhas: string[];
  colunas: string[];
  celulas: number[][];
  totaisLinha: number[];
  totaisColuna: number[];
  totalGeral: number;
  rotuloLinha: string;
  rotuloColuna: string;
}

interface CelulaDrillDown {
  linhaKey: string;
  colunaKey: string | null;
}

interface Props {
  dados: PlanilhaResult;
  aoDrillDown?: (celula: CelulaDrillDown) => void;
}

function cor(v: number): string {
  if (v > 0) return "text-ok";
  if (v < 0) return "text-erro";
  return "text-mudo";
}

function fmt(v: number): string {
  if (v === 0) return "—";
  return dinheiro(v);
}

export function PlanilhaGrade({ dados, aoDrillDown }: Props) {
  const { linhas, colunas, celulas, totaisLinha, totaisColuna, totalGeral, rotuloLinha } = dados;

  const clicavel = !!aoDrillDown;
  const classeCell = clicavel
    ? "px-3 py-2 text-right tabular-nums cursor-pointer hover:bg-ouro/10 transition-colors"
    : "px-3 py-2 text-right tabular-nums";

  function handleCell(e: MouseEvent, linhaKey: string, colunaKey: string | null) {
    e.stopPropagation();
    aoDrillDown?.({ linhaKey, colunaKey });
  }

  return (
    <div className="overflow-auto rounded-lg border border-borda">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-elevado">
          <tr>
            <th className="sticky left-0 z-20 bg-elevado px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-suave">
              {rotuloLinha}
            </th>
            {colunas.map((c) => (
              <th key={c} className="px-3 py-2.5 text-right text-xs font-medium text-mudo whitespace-nowrap">
                {c}
              </th>
            ))}
            <th className="px-3 py-2.5 text-right text-xs font-bold text-ouro whitespace-nowrap">
              TOTAL
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-borda">
          {linhas.map((linha, li) => (
            <tr key={linha} className="group hover:bg-elevado/40 transition-colors">
              <td
                className={`sticky left-0 bg-painel px-3 py-2 text-sm font-medium text-texto group-hover:bg-elevado/60 transition-colors ${clicavel ? "cursor-pointer" : ""}`}
                onClick={clicavel ? (e) => handleCell(e, linha, null) : undefined}
              >
                {linha}
              </td>
              {(celulas[li] ?? []).map((v, ci) => (
                <td
                  key={ci}
                  className={`${classeCell} ${cor(v)}`}
                  onClick={clicavel ? (e) => handleCell(e, linha, colunas[ci] ?? "") : undefined}
                >
                  {fmt(v)}
                </td>
              ))}
              <td
                className={`px-3 py-2 text-right tabular-nums font-semibold ${cor(totaisLinha[li] ?? 0)} ${clicavel ? "cursor-pointer hover:bg-ouro/10 transition-colors" : ""}`}
                onClick={clicavel ? (e) => handleCell(e, linha, null) : undefined}
              >
                {fmt(totaisLinha[li] ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot className="border-t-2 border-borda-forte">
          <tr className="bg-elevado">
            <td className="sticky left-0 bg-elevado px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-suave">
              TOTAL
            </td>
            {totaisColuna.map((v, ci) => (
              <td
                key={ci}
                className={`px-3 py-2.5 text-right tabular-nums font-semibold ${cor(v)} ${clicavel ? "cursor-pointer hover:bg-ouro/10 transition-colors" : ""}`}
                onClick={clicavel ? (e) => handleCell(e, "__total__", colunas[ci] ?? "") : undefined}
              >
                {fmt(v)}
              </td>
            ))}
            <td className="px-3 py-2.5 text-right tabular-nums font-bold text-ouro">
              {fmt(totalGeral)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export type { CelulaDrillDown };
