// Seletor com busca: escolher uma pessoa ou ativo digitando nome/código/placa.
// Reflete a regra "busca antes de cadastro" (doc 03 §8) nos formulários de operação.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import { api } from "../api";
import { Entrada } from "../componentes/ui";

interface Item {
  id: string;
  titulo: string;
  subtitulo: string;
}

export function Seletor({
  rotulo, recurso, selecionado, aoSelecionar, filtro,
}: {
  rotulo: string;
  recurso: "pessoas" | "ativos";
  selecionado: Item | null;
  aoSelecionar: (item: Item | null) => void;
  /** Query extra (ex.: status=disponivel para locação). */
  filtro?: string;
}) {
  const [busca, setBusca] = useState("");
  const aberta = !selecionado && busca.trim().length >= 2;

  const { data } = useQuery({
    queryKey: [recurso, "seletor", busca, filtro],
    enabled: aberta,
    queryFn: () =>
      api
        .get<{ dados: Array<Record<string, unknown>> }>(
          `/${recurso}?por_pagina=8&busca=${encodeURIComponent(busca)}${filtro ? `&${filtro}` : ""}`
        )
        .then((r) =>
          r.dados.map((d): Item => {
            if (recurso === "pessoas") {
              return { id: d.id as string, titulo: d.nome as string, subtitulo: (d.cpfCnpj as string) ?? "" };
            }
            const v = d.veiculo as { placa?: string } | null;
            return {
              id: d.id as string,
              titulo: d.nome as string,
              subtitulo: `${d.codigo as string}${v?.placa ? ` · ${v.placa}` : ""} · ${(d.status as string) ?? ""}`,
            };
          })
        ),
  });

  return (
    <div className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-suave">{rotulo}</span>
      {selecionado ? (
        <div className="flex items-center gap-2 rounded-md border border-ouro/40 bg-ouro/5 px-3 py-2">
          <Check className="h-4 w-4 shrink-0 text-ouro" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selecionado.titulo}</p>
            <p className="truncate text-xs text-mudo">{selecionado.subtitulo}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              aoSelecionar(null);
              setBusca("");
            }}
            className="rounded p-1 text-suave hover:text-erro"
            aria-label="Trocar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mudo" />
          <Entrada
            placeholder="Digite para buscar…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
          {aberta && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-borda bg-painel shadow-flutuante">
              {data && data.length > 0 ? (
                data.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => aoSelecionar(item)}
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-elevado"
                    >
                      <span className="text-sm font-medium">{item.titulo}</span>
                      <span className="text-xs text-mudo">{item.subtitulo}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-xs text-mudo">Nenhum resultado.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export type { Item as ItemSeletor };
