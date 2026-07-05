import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, CarFront, BarChart3, Table2, SlidersHorizontal } from "lucide-react";
import { STATUS_ATIVO } from "@hallaxos/shared";
import { api } from "../api";
import { useAuth } from "../auth";
import { Abas, Botao, Card, Chip, Entrada, Selecao, Selo, SkeletonLinhas, EstadoVazio, dinheiro } from "../componentes/ui";
import { RelatorioPatrimonio } from "./RelatorioPatrimonio";

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

interface Categoria { id: string; nome: string; ehVeicular: boolean }

const ROTULOS: Record<string, string> = {
  disponivel: "disponível", reservado: "reservado", alugado: "alugado",
  em_manutencao: "manutenção", em_uso_interno: "em uso", vendido: "vendido", baixado: "baixado",
};

type Aba = "lista" | "relatorio" | "fipe";

export function Ativos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const abaInicial = (searchParams.get("aba") as Aba) ?? "lista";
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [busca, setBusca] = useState(searchParams.get("busca") ?? "");
  const [status, setStatus] = useState<string | null>(searchParams.get("status") ?? null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const { pode } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["ativos", busca, status, categoriaId],
    queryFn: () =>
      api.get<{ dados: AtivoLista[]; meta: { total: number } }>(
        `/ativos?por_pagina=60` +
          (busca ? `&busca=${encodeURIComponent(busca)}` : "") +
          (status ? `&status=${status}` : "") +
          (categoriaId ? `&categoria_id=${categoriaId}` : "")
      ),
    enabled: aba === "lista",
  });

  const { data: categorias } = useQuery({
    queryKey: ["ativo-categorias"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/ativos/categorias").then((r) => r.dados),
  });

  const mudarAba = (a: Aba) => {
    setAba(a);
    setSearchParams(a === "lista" ? {} : { aba: a }, { replace: true });
  };

  const ABAS: { id: Aba; rotulo: string; icone: typeof CarFront; breve?: boolean }[] = [
    { id: "lista", rotulo: "Ativos", icone: CarFront },
    { id: "relatorio", rotulo: "Relatório de Patrimônio", icone: BarChart3 },
    { id: "fipe", rotulo: "Tabela FIPE", icone: Table2, breve: true },
  ];

  return (
    <div className="space-y-4">
      {/* Cabeçalho + tabs */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Ativos</h1>
        {pode("ativos", "criar") && aba === "lista" && (
          <Link to="/ativos/novo" className="ml-auto">
            <Botao tamanho="sm">
              <Plus className="h-3.5 w-3.5" /> Novo ativo
            </Botao>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <Abas
        abas={ABAS.map((a) => ({
          id: a.id,
          rotulo: a.rotulo,
          icone: a.icone,
          selo: a.breve ? <Selo>em breve</Selo> : undefined,
        }))}
        ativa={aba}
        aoTrocar={(id) => mudarAba(id as Aba)}
      />

      {/* Conteúdo da aba */}
      {aba === "relatorio" && <RelatorioPatrimonio categorias={categorias ?? []} />}

      {aba === "fipe" && (
        <Card>
          <EstadoVazio
            icone={Table2}
            titulo="Tabela FIPE"
            descricao="Integração com fonte externa de FIPE e atualização em massa dos ativos. Em desenvolvimento para um próximo sprint."
          />
        </Card>
      )}

      {aba === "lista" && (
        <>
          {/* Filtros */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Entrada
                placeholder="Buscar por nome, código, placa, marca ou modelo…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="flex-1"
              />
              <Botao
                type="button"
                variante="secundario"
                tamanho="sm"
                onClick={() => setMostrarFiltros((v) => !v)}
                className={mostrarFiltros ? "border-ouro/60 text-ouro" : ""}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filtros
              </Botao>
            </div>

            {/* Filtros avançados */}
            {mostrarFiltros && (
              <div className="animar-surgir rounded-lg border border-borda bg-elevado p-3 space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-suave">Situação</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip ativo={status === null} onClick={() => setStatus(null)}>todos</Chip>
                    {STATUS_ATIVO.map((s) => (
                      <Chip key={s} ativo={status === s} onClick={() => setStatus(status === s ? null : s)}>
                        {ROTULOS[s]}
                      </Chip>
                    ))}
                  </div>
                </div>
                {categorias && categorias.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-suave">Categoria</p>
                    <Selecao
                      value={categoriaId ?? ""}
                      onChange={(e) => setCategoriaId(e.target.value || null)}
                      className="w-full max-w-xs"
                    >
                      <option value="">Todas as categorias</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </Selecao>
                  </div>
                )}
              </div>
            )}

            {/* Chips de status rápidos (quando filtros fechados) */}
            {!mostrarFiltros && (
              <div className="flex flex-wrap gap-1.5">
                <Chip ativo={status === null} onClick={() => setStatus(null)}>todos</Chip>
                {STATUS_ATIVO.slice(0, 4).map((s) => (
                  <Chip key={s} ativo={status === s} onClick={() => setStatus(status === s ? null : s)}>
                    {ROTULOS[s]}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {/* Grade de ativos */}
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
              <div className="animar-cascata grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.dados.map((a) => (
                  <Link
                    key={a.id}
                    to={`/ativos/${a.id}`}
                    className="animar-surgir superficie elevar group overflow-hidden rounded-lg border border-borda shadow-painel"
                  >
                    <div className="flex aspect-[16/7] items-center justify-center bg-elevado/60 overflow-hidden">
                      {a.fotoPrincipal ? (
                        <img
                          src={`/api/v1/documentos/${a.fotoPrincipal}/arquivo`}
                          alt={a.nome}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <CarFront className="h-8 w-8 text-mudo" />
                      )}
                    </div>
                    <div className="space-y-1 p-4">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium group-hover:text-ouro transition-colors">
                          {a.nome}
                        </span>
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
        </>
      )}
    </div>
  );
}
