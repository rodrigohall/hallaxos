import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Workflow, AlertTriangle, Truck } from "lucide-react";
import { TIPOS_OPERACAO } from "@hallaxos/shared";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Chip, Entrada, Selo, SkeletonLinhas, EstadoVazio, Lista, ListaLinha,
  dinheiro, dataCurta,
} from "../componentes/ui";
import { ROTULO_STATUS_OP } from "../operacoes/rotulos";
import { SeletorTipoOperacao, TIPO_ICONE } from "../operacoes/SeletorTipo";

interface OperacaoLista {
  id: string;
  codigo: string;
  tipo: string;
  status: string;
  cliente: string;
  valorTotal: string;
  dataInicio: string;
  atrasada: boolean;
}

export function Operacoes() {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const { pode } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["operacoes", busca, tipo, situacao],
    queryFn: () =>
      api.get<{ dados: OperacaoLista[]; meta: { total: number } }>(
        `/operacoes?por_pagina=50` +
          (busca ? `&busca=${encodeURIComponent(busca)}` : "") +
          (tipo ? `&tipo=${tipo}` : "") +
          (situacao ? `&situacao=${situacao}` : "")
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Operações</h1>
        {pode("operacoes", "criar") && (
          <Link to="/operacoes/nova" className="ml-auto">
            <Botao tamanho="sm">
              <Plus className="h-3.5 w-3.5" /> Nova operação
            </Botao>
          </Link>
        )}
      </div>

      <Entrada
        placeholder="Buscar por código ou cliente…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {/* Filtro por tipo — a mesma peça visual do passo 1 de Nova Operação */}
      <SeletorTipoOperacao
        tipos={TIPOS_OPERACAO}
        valor={tipo}
        aoTrocar={(t) => setTipo(tipo === t ? null : t)}
      />

      {/* Situation chips */}
      <div className="flex flex-wrap gap-1.5">
        <Chip ativo={situacao === null} onClick={() => setSituacao(null)}>todas</Chip>
        <Chip ativo={situacao === "abertas"} onClick={() => setSituacao(situacao === "abertas" ? null : "abertas")}>
          em aberto
        </Chip>
        <Chip ativo={situacao === "atrasadas"} onClick={() => setSituacao(situacao === "atrasadas" ? null : "atrasadas")}>
          atrasadas
        </Chip>
      </div>

      {isLoading ? (
        <SkeletonLinhas linhas={4} />
      ) : !data || data.dados.length === 0 ? (
        <Card>
          <EstadoVazio
            icone={Workflow}
            titulo="Nenhuma operação encontrada"
            descricao="Guinchos, locações, vendas e compras aparecem aqui."
            acao={
              pode("operacoes", "criar") && (
                <Link to="/operacoes/nova">
                  <Botao variante="secundario" tamanho="sm">
                    <Plus className="h-3.5 w-3.5" /> Nova operação
                  </Botao>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          <Lista>
            {data.dados.map((o) => {
              const Icone = TIPO_ICONE[o.tipo] ?? Workflow;
              const isReceita = o.tipo !== "compra";
              return (
                <ListaLinha
                  key={o.id}
                  para={`/operacoes/${o.id}`}
                  titulo={
                    <span className="flex items-center gap-1.5">
                      <Icone className="h-3.5 w-3.5 shrink-0 text-mudo" />
                      <span className="font-display font-bold text-ouro">{o.codigo}</span>
                      <span className="text-mudo">·</span>
                      {o.cliente}
                    </span>
                  }
                  subtitulo={dataCurta(o.dataInicio)}
                  direita={
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-sm font-medium tabular-nums ${isReceita ? "text-ok" : "text-erro"}`}>
                        {dinheiro(o.valorTotal)}
                      </span>
                      <div className="flex items-center gap-1">
                        {o.atrasada && (
                          <span title="Devolução atrasada">
                            <AlertTriangle className="h-3.5 w-3.5 text-erro" />
                          </span>
                        )}
                        <Selo tom={o.status}>{ROTULO_STATUS_OP[o.status] ?? o.status.replace(/_/g, " ")}</Selo>
                      </div>
                    </div>
                  }
                />
              );
            })}
          </Lista>
          <p className="text-xs text-mudo">{data.meta.total} operação(ões)</p>
        </>
      )}
    </div>
  );
}
