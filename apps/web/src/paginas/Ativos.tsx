import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, CarFront } from "lucide-react";
import { STATUS_ATIVO } from "@hallaxos/shared";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Card, Chip, Entrada, Selo, SkeletonLinhas, EstadoVazio, dinheiro } from "../componentes/ui";

interface AtivoLista {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  categoria: string;
  valorAquisicao: string | null;
  localizacao: string | null;
  fotoPrincipal: string | null;
  veiculo: { placa: string; marca: string; modelo: string; kmAtual: number } | null;
}

const ROTULOS: Record<string, string> = {
  disponivel: "disponível", reservado: "reservado", alugado: "alugado",
  em_manutencao: "manutenção", em_uso_interno: "em uso", vendido: "vendido", baixado: "baixado",
};

export function Ativos() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const { pode } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["ativos", busca, status],
    queryFn: () =>
      api.get<{ dados: AtivoLista[]; meta: { total: number } }>(
        `/ativos?por_pagina=50` +
          (busca ? `&busca=${encodeURIComponent(busca)}` : "") +
          (status ? `&status=${status}` : "")
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Ativos</h1>
        {pode("ativos", "criar") && (
          <Link to="/ativos/novo" className="ml-auto">
            <Botao tamanho="sm">
              <Plus className="h-3.5 w-3.5" /> Novo ativo
            </Botao>
          </Link>
        )}
      </div>

      <Entrada
        placeholder="Buscar por nome, código, placa, marca ou modelo…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="flex flex-wrap gap-1.5">
        <Chip ativo={status === null} onClick={() => setStatus(null)}>todos</Chip>
        {STATUS_ATIVO.map((s) => (
          <Chip key={s} ativo={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {ROTULOS[s]}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <SkeletonLinhas linhas={4} />
      ) : !data || data.dados.length === 0 ? (
        <Card>
          <EstadoVazio
            icone={CarFront}
            titulo={busca || status ? "Nenhum ativo encontrado" : "Nenhum ativo cadastrado"}
            descricao="O patrimônio da Hallax aparece aqui — de carros a equipamentos."
            acao={
              pode("ativos", "criar") && (
                <Link to="/ativos/novo">
                  <Botao variante="secundario" tamanho="sm">
                    <Plus className="h-3.5 w-3.5" /> Cadastrar ativo
                  </Botao>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.dados.map((a) => (
              <Link
                key={a.id}
                to={`/ativos/${a.id}`}
                className="animar-surgir group overflow-hidden rounded-lg border border-borda bg-painel shadow-painel transition-colors hover:border-borda-forte"
              >
                <div className="flex aspect-[16/7] items-center justify-center bg-elevado/60">
                  {a.fotoPrincipal ? (
                    <img
                      src={`/api/v1/documentos/${a.fotoPrincipal}/arquivo`}
                      alt={a.nome}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <CarFront className="h-8 w-8 text-mudo" />
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium group-hover:text-ouro">{a.nome}</span>
                    <span className="ml-auto shrink-0">
                      <Selo tom={a.status}>{ROTULOS[a.status] ?? a.status}</Selo>
                    </span>
                  </div>
                  <p className="text-xs text-suave">
                    <span className="font-display font-bold text-ouro">{a.codigo}</span>
                    {a.veiculo && ` · ${a.veiculo.placa}`} · {a.categoria}
                  </p>
                  <p className="text-xs text-mudo">
                    {a.veiculo
                      ? `${a.veiculo.marca} ${a.veiculo.modelo} · ${a.veiculo.kmAtual.toLocaleString("pt-BR")} km`
                      : (a.localizacao ?? "")}
                    {a.valorAquisicao && ` · ${dinheiro(a.valorAquisicao)}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          <p className="text-xs text-mudo">{data.meta.total} ativo(s)</p>
        </>
      )}
    </div>
  );
}
