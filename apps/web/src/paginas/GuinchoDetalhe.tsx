// A página do guincho: o chamado inteiro em uma visão — do acionamento à receita.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Truck, MapPin, ArrowRight, History, CircleDollarSign, User, Car, Navigation,
  PlayCircle, CheckCircle2, XCircle, MessageSquare,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Campo, Card, Entrada, AreaTexto, Selo, Modal, Timeline, useToast,
  dinheiro, dataHora, SkeletonLinhas, EstadoVazio, Lista, ListaLinha, type EventoTimeline,
} from "../componentes/ui";
import { Documentos } from "../componentes/Anexos";
import { Comentarios } from "../componentes/Comentarios";

interface GuinchoDetalheDados {
  id: string;
  codigo: string;
  status: string;
  valorTotal: string;
  desconto: string;
  dataInicio: string;
  dataFim: string | null;
  observacoes: string | null;
  responsavel: string;
  cliente: { id: string; nome: string; telefone: string | null };
  motorista: { id: string; nome: string } | null;
  recurso: { id: string; codigo: string; nome: string; status: string; placa: string | null; kmAtual: number } | null;
  guincho: {
    origemEndereco: string; destinoEndereco: string; veiculoClienteDescricao: string;
    veiculoClientePlaca: string | null; kmPercorrido: number | null;
    dataAcionamento: string; dataConclusao: string | null;
  };
  lancamentos: Array<{ id: string; tipo: string; descricao: string; valor: string; status: string; dataVencimento: string; dataPagamento: string | null }>;
}

const ROTULOS: Record<string, string> = {
  solicitado: "solicitado", a_caminho: "a caminho", em_execucao: "em execução",
  concluido: "concluído", cancelada: "cancelada",
};

// Próxima(s) transição(ões) por estado — espelha a máquina do backend (doc 03).
const PROXIMAS: Record<string, "a_caminho" | "em_execucao" | "concluir"> = {
  solicitado: "a_caminho",
  a_caminho: "em_execucao",
  em_execucao: "concluir",
};

export function GuinchoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [concluir, setConcluir] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [km, setKm] = useState("");
  const [obsConclusao, setObsConclusao] = useState("");
  const [motivo, setMotivo] = useState("");

  const { data: g } = useQuery({
    queryKey: ["guincho", id],
    queryFn: () => api.get<{ dados: GuinchoDetalheDados }>(`/guinchos/${id}`).then((r) => r.dados),
  });
  const { data: eventos, isLoading: carregandoTimeline } = useQuery({
    queryKey: ["guincho-timeline", id],
    queryFn: () => api.get<{ dados: EventoTimeline[] }>(`/guinchos/${id}/timeline`).then((r) => r.dados),
  });

  if (!g) return <SkeletonLinhas linhas={8} />;

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["guincho", id] });
    fila.invalidateQueries({ queryKey: ["guincho-timeline", id] });
    fila.invalidateQueries({ queryKey: ["guinchos"] });
    fila.invalidateQueries({ queryKey: ["ativos"] });
    fila.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const transicionar = async (rota: string, corpo?: unknown) => {
    try {
      await api.post(`/guinchos/${id}/${rota}`, corpo);
      invalidar();
      notificar({ tipo: "ok", titulo: "Guincho atualizado" });
      setConcluir(false);
      setCancelar(false);
      setKm("");
      setObsConclusao("");
      setMotivo("");
    } catch (e) {
      notificar({
        tipo: "erro",
        titulo: "Não foi possível",
        descricao: e instanceof ApiError ? e.message : undefined,
      });
    }
  };

  const podeTransicionar = pode("operacoes", "transicionar");
  const proxima = PROXIMAS[g.status];
  const liquido = Number(g.valorTotal) - Number(g.desconto);
  const terminal = g.status === "concluido" || g.status === "cancelada";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/guinchos" className="text-sm text-suave hover:text-texto">Guinchos</Link>
        <span className="text-mudo">/</span>
        <h1 className="font-display text-lg font-bold">Guincho</h1>
        <span className="font-display text-sm font-bold text-ouro">{g.codigo}</span>
        <Selo tom={g.status}>{ROTULOS[g.status] ?? g.status}</Selo>
        {podeTransicionar && !terminal && (
          <div className="ml-auto flex flex-wrap gap-2">
            {proxima === "a_caminho" && (
              <Botao tamanho="sm" onClick={() => transicionar("a-caminho")}>
                <Navigation className="h-3.5 w-3.5" /> Despachar (a caminho)
              </Botao>
            )}
            {proxima === "em_execucao" && (
              <Botao tamanho="sm" onClick={() => transicionar("em-execucao")}>
                <PlayCircle className="h-3.5 w-3.5" /> Iniciar execução
              </Botao>
            )}
            {proxima === "concluir" && (
              <Botao tamanho="sm" onClick={() => setConcluir(true)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
              </Botao>
            )}
            <Botao variante="perigo" tamanho="sm" onClick={() => setCancelar(true)}>
              <XCircle className="h-3.5 w-3.5" /> Cancelar
            </Botao>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card titulo="Trajeto" icone={Truck}>
            <div className="space-y-2 text-sm">
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-suave" />
                <span><span className="text-suave">Origem: </span>{g.guincho.origemEndereco}</span>
              </p>
              <p className="flex items-start gap-2">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-suave" />
                <span><span className="text-suave">Destino: </span>{g.guincho.destinoEndereco}</span>
              </p>
              <p className="flex items-start gap-2">
                <Car className="mt-0.5 h-4 w-4 shrink-0 text-suave" />
                <span>
                  {g.guincho.veiculoClienteDescricao}
                  {g.guincho.veiculoClientePlaca && <span className="text-mudo"> · {g.guincho.veiculoClientePlaca}</span>}
                </span>
              </p>
              {g.guincho.kmPercorrido != null && (
                <p className="text-suave">Percorrido: {g.guincho.kmPercorrido.toLocaleString("pt-BR")} km</p>
              )}
            </div>
          </Card>

          <Card titulo="Envolvidos" icone={User}>
            <dl className="space-y-1.5 text-sm">
              <div>
                <dt className="inline text-suave">Cliente: </dt>
                <dd className="inline">
                  <Link to={`/clientes/${g.cliente.id}`} className="font-medium hover:text-ouro">{g.cliente.nome}</Link>
                  {g.cliente.telefone && <span className="text-mudo"> · {g.cliente.telefone}</span>}
                </dd>
              </div>
              {g.recurso && (
                <div>
                  <dt className="inline text-suave">Caminhão: </dt>
                  <dd className="inline">
                    <Link to={`/ativos/${g.recurso.id}`} className="font-medium hover:text-ouro">{g.recurso.nome}</Link>
                    {g.recurso.placa && <span className="text-mudo"> · {g.recurso.placa}</span>}
                  </dd>
                </div>
              )}
              {g.motorista && (
                <div>
                  <dt className="inline text-suave">Motorista: </dt>
                  <dd className="inline">
                    <Link to={`/clientes/${g.motorista.id}`} className="font-medium hover:text-ouro">{g.motorista.nome}</Link>
                  </dd>
                </div>
              )}
              <div><dt className="inline text-suave">Responsável: </dt><dd className="inline">{g.responsavel}</dd></div>
              <div><dt className="inline text-suave">Acionado em: </dt><dd className="inline">{dataHora(g.guincho.dataAcionamento)}</dd></div>
              {g.guincho.dataConclusao && (
                <div><dt className="inline text-suave">Concluído em: </dt><dd className="inline">{dataHora(g.guincho.dataConclusao)}</dd></div>
              )}
            </dl>
          </Card>

          <Card titulo="Valor" icone={CircleDollarSign}>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-suave">Serviço</dt><dd>{dinheiro(g.valorTotal)}</dd></div>
              {Number(g.desconto) > 0 && (
                <div className="flex justify-between"><dt className="text-suave">Desconto</dt><dd className="text-erro">− {dinheiro(g.desconto)}</dd></div>
              )}
              <div className="flex justify-between border-t border-borda pt-1 font-medium">
                <dt>Total</dt><dd className="text-ouro">{dinheiro(liquido)}</dd>
              </div>
            </dl>
          </Card>

          {g.observacoes && (
            <Card titulo="Observações" icone={MessageSquare}>
              <p className="whitespace-pre-line text-sm text-suave">{g.observacoes}</p>
            </Card>
          )}

          <Documentos entidadeTipo="operacao" entidadeId={g.id} />
          <Comentarios entidadeTipo="operacao" entidadeId={g.id} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card titulo="História" icone={History}>
            {carregandoTimeline ? <SkeletonLinhas linhas={4} /> : <Timeline eventos={eventos ?? []} />}
          </Card>

          <Card titulo="Financeiro gerado" icone={CircleDollarSign}>
            {g.lancamentos.length === 0 ? (
              <EstadoVazio icone={CircleDollarSign} titulo="Nenhuma receita ainda"
                descricao="Ao concluir o guincho, a receita do serviço é gerada automaticamente." />
            ) : (
              <Lista>
                {g.lancamentos.map((l) => (
                  <ListaLinha
                    key={l.id}
                    titulo={l.descricao}
                    subtitulo={l.dataPagamento ? `pago em ${dataHora(l.dataPagamento)}` : `vence ${l.dataVencimento}`}
                    direita={
                      <>
                        <span className={`text-sm font-medium ${l.tipo === "receita" ? "text-ok" : "text-erro"}`}>
                          {l.tipo === "receita" ? "+" : "−"} {dinheiro(l.valor)}
                        </span>
                        <Selo tom={l.status === "pago" ? "ok" : l.status === "cancelado" ? "erro" : "alerta"}>{l.status}</Selo>
                      </>
                    }
                  />
                ))}
              </Lista>
            )}
          </Card>
        </div>
      </div>

      <Modal aberto={concluir} aoFechar={() => setConcluir(false)} titulo="Concluir guincho">
        <div className="space-y-4">
          <p className="text-sm text-suave">
            O caminhão volta a ficar disponível e a receita de{" "}
            <span className="font-medium text-ouro">{dinheiro(liquido)}</span> é gerada para o financeiro.
          </p>
          <Campo rotulo="Km percorrido" dica="Opcional — soma ao hodômetro do caminhão">
            <Entrada type="number" min="0" value={km} onChange={(e) => setKm(e.target.value)} />
          </Campo>
          <Campo rotulo="Observações da conclusão" dica="Opcional">
            <AreaTexto rows={2} value={obsConclusao} onChange={(e) => setObsConclusao(e.target.value)} />
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setConcluir(false)}>Voltar</Botao>
            <Botao onClick={() => transicionar("concluir", {
              km_percorrido: km ? Number(km) : null,
              observacoes: obsConclusao || null,
            })}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Concluir guincho
            </Botao>
          </div>
        </div>
      </Modal>

      <Modal aberto={cancelar} aoFechar={() => setCancelar(false)} titulo="Cancelar guincho">
        <div className="space-y-4">
          <p className="text-sm text-suave">
            O guincho será encerrado sem cobrança e o caminhão liberado. Esta ação fica registrada na história.
          </p>
          <Campo rotulo="Motivo">
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setCancelar(false)}>Voltar</Botao>
            <Botao variante="perigo" disabled={motivo.trim().length < 3} onClick={() => transicionar("cancelar", { motivo })}>
              <XCircle className="h-3.5 w-3.5" /> Cancelar guincho
            </Botao>
          </div>
        </div>
      </Modal>
    </div>
  );
}
