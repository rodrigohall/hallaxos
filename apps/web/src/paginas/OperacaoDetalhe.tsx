// A página da operação: estado atual, transições nomeadas, ativos, financeiro
// e história completa. O front solicita transições; o back decide (doc 03).
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History, Workflow, CircleDollarSign, User, Package, MapPin, ArrowRight,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Selo, Modal, Campo, Entrada, AreaTexto, Timeline, useToast,
  dinheiro, dataCurta, dataHora, SkeletonLinhas, EstadoVazio, Lista, ListaLinha,
  type EventoTimeline,
} from "../componentes/ui";
import { Comentarios } from "../componentes/Comentarios";
import { Documentos } from "../componentes/Anexos";
import { ROTULO_TIPO, ROTULO_STATUS_OP, ACAO_TRANSICAO } from "../operacoes/rotulos";

interface OperacaoDetalhe {
  id: string; codigo: string; tipo: string; status: string;
  valorTotal: string; observacoes: string | null; dataInicio: string; dataFim: string | null;
  cliente: { id: string; nome: string };
  extensao: Record<string, unknown> | null;
  ativos: Array<{ id: string; codigo: string; nome: string; status: string; papel: string; placa: string | null }>;
  lancamentos: Array<{ id: string; tipo: string; descricao: string; valor: string; status: string; data_vencimento: string; data_pagamento: string | null }>;
  proximasTransicoes: string[];
}

// Status que geram lançamentos pedem nº de parcelas; transições de locação pedem km.
const GERA_LANCAMENTO = new Set(["finalizada", "concluido", "fechada"]);
const PEDE_KM = new Set(["ativa", "finalizada", "concluido"]);

export function OperacaoDetalhe() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [transicao, setTransicao] = useState<string | null>(null);
  const [km, setKm] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: op } = useQuery({
    queryKey: ["operacao", id],
    queryFn: () => api.get<{ dados: OperacaoDetalhe }>(`/operacoes/${id}`).then((r) => r.dados),
  });
  const { data: eventos, isLoading: carregandoTL } = useQuery({
    queryKey: ["operacao-timeline", id],
    queryFn: () => api.get<{ dados: EventoTimeline[] }>(`/operacoes/${id}/timeline`).then((r) => r.dados),
  });

  if (!op) return <SkeletonLinhas linhas={8} />;

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["operacao", id] });
    fila.invalidateQueries({ queryKey: ["operacao-timeline", id] });
    fila.invalidateQueries({ queryKey: ["operacoes"] });
    fila.invalidateQueries({ queryKey: ["ativo"] });
    fila.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const confirmarTransicao = async () => {
    if (!transicao) return;
    setEnviando(true);
    try {
      await api.post(`/operacoes/${id}/transicao`, {
        status: transicao,
        km: PEDE_KM.has(transicao) && km ? Number(km) : undefined,
        parcelas: GERA_LANCAMENTO.has(transicao) ? Number(parcelas || 1) : undefined,
        justificativa: justificativa || undefined,
      });
      invalidar();
      notificar({ tipo: "ok", titulo: `Operação ${ROTULO_STATUS_OP[transicao] ?? transicao}` });
      fecharModal();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Transição recusada", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };
  const fecharModal = () => {
    setTransicao(null);
    setKm("");
    setParcelas("1");
    setJustificativa("");
  };

  const ext = op.extensao ?? {};
  const podeTransicionar = usuario && ["admin", "gestor", "operador"].includes(usuario.papel);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{ROTULO_TIPO[op.tipo] ?? op.tipo}</h1>
        <span className="font-display text-sm font-bold text-ouro">{op.codigo}</span>
        <Selo tom={op.status}>{ROTULO_STATUS_OP[op.status] ?? op.status}</Selo>
        <Link to={`/clientes/${op.cliente.id}`} className="text-sm text-suave hover:text-ouro">
          · {op.cliente.nome}
        </Link>
      </div>

      {/* Transições nomeadas */}
      {podeTransicionar && op.proximasTransicoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {op.proximasTransicoes.map((t) => (
            <Botao
              key={t}
              variante={t === "cancelada" ? "perigo" : "primario"}
              tamanho="sm"
              onClick={() => setTransicao(t)}
            >
              {t !== "cancelada" && <ArrowRight className="h-3.5 w-3.5" />}
              {ACAO_TRANSICAO[t] ?? t}
            </Botao>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card titulo="Dados" icone={Workflow}>
            <dl className="space-y-1.5 text-sm">
              <div><dt className="inline text-suave">Cliente: </dt><dd className="inline">{op.cliente.nome}</dd></div>
              <div><dt className="inline text-suave">Início: </dt><dd className="inline">{dataHora(op.dataInicio)}</dd></div>
              {op.dataFim && <div><dt className="inline text-suave">Encerrada: </dt><dd className="inline">{dataHora(op.dataFim)}</dd></div>}
              <div><dt className="inline text-suave">Valor: </dt><dd className="inline font-medium">{dinheiro(op.valorTotal)}</dd></div>

              {op.tipo === "guincho" && (
                <>
                  <div className="flex items-start gap-1.5 pt-1"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mudo" /><span>{String(ext.origemEndereco ?? "")} → {String(ext.destinoEndereco ?? "")}</span></div>
                  <div><dt className="inline text-suave">Veículo: </dt><dd className="inline">{String(ext.veiculoClienteDescricao ?? "")}{ext.veiculoClientePlaca ? ` · ${ext.veiculoClientePlaca}` : ""}</dd></div>
                  {ext.kmPercorrido != null && <div><dt className="inline text-suave">Km percorrido: </dt><dd className="inline">{String(ext.kmPercorrido)}</dd></div>}
                </>
              )}
              {op.tipo === "locacao" && (
                <>
                  <div><dt className="inline text-suave">Diária: </dt><dd className="inline">{dinheiro(String(ext.valorDiaria ?? "0"))}</dd></div>
                  {Number(ext.caucao ?? 0) > 0 && <div><dt className="inline text-suave">Caução: </dt><dd className="inline">{dinheiro(String(ext.caucao))}</dd></div>}
                  {ext.dataRetirada != null && <div><dt className="inline text-suave">Retirada: </dt><dd className="inline">{dataHora(String(ext.dataRetirada))}</dd></div>}
                  <div><dt className="inline text-suave">Devolução prevista: </dt><dd className="inline">{dataHora(String(ext.dataDevolucaoPrevista))}</dd></div>
                  {ext.dataDevolucaoReal != null && <div><dt className="inline text-suave">Devolvido: </dt><dd className="inline">{dataHora(String(ext.dataDevolucaoReal))}</dd></div>}
                  {ext.kmSaida != null && <div><dt className="inline text-suave">Km saída/retorno: </dt><dd className="inline">{String(ext.kmSaida)}{ext.kmRetorno != null ? ` → ${String(ext.kmRetorno)}` : ""}</dd></div>}
                </>
              )}
              {(op.tipo === "venda" || op.tipo === "compra") && (
                <>
                  {ext.kmNoAto != null && <div><dt className="inline text-suave">Km no ato: </dt><dd className="inline">{String(ext.kmNoAto)}</dd></div>}
                  {ext.dataTransferencia != null && <div><dt className="inline text-suave">Transferência: </dt><dd className="inline">{dataCurta(String(ext.dataTransferencia))}</dd></div>}
                  <div><dt className="inline text-suave">Documentação: </dt><dd className="inline">{String(ext.statusDocumentacao ?? "pendente")}</dd></div>
                </>
              )}
              {op.observacoes && <p className="pt-2 text-suave">{op.observacoes}</p>}
            </dl>
          </Card>

          <Card titulo="Ativos" icone={Package}>
            {op.ativos.length === 0 ? (
              <EstadoVazio icone={Package} titulo="Nenhum ativo vinculado" />
            ) : (
              <Lista>
                {op.ativos.map((a) => (
                  <ListaLinha
                    key={a.id}
                    para={`/ativos/${a.id}`}
                    titulo={<><span className="font-display font-bold text-ouro">{a.codigo}</span> · {a.nome}</>}
                    subtitulo={`${a.papel}${a.placa ? ` · ${a.placa}` : ""}`}
                    direita={<Selo tom={a.status}>{a.status.replace(/_/g, " ")}</Selo>}
                  />
                ))}
              </Lista>
            )}
          </Card>

          <Documentos entidadeTipo="operacao" entidadeId={op.id} />
          <Comentarios entidadeTipo="operacao" entidadeId={op.id} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card titulo="História completa" icone={History}>
            {carregandoTL ? <SkeletonLinhas linhas={4} /> : <Timeline eventos={eventos ?? []} />}
          </Card>

          <Card titulo="Financeiro da operação" icone={CircleDollarSign}>
            {op.lancamentos.length === 0 ? (
              <EstadoVazio icone={CircleDollarSign} titulo="Nenhum lançamento" descricao="Lançamentos são gerados ao avançar a operação." />
            ) : (
              <Lista>
                {op.lancamentos.map((l) => (
                  <ListaLinha
                    key={l.id}
                    titulo={l.descricao}
                    subtitulo={l.data_pagamento ? `pago em ${dataCurta(l.data_pagamento)}` : `vence ${dataCurta(l.data_vencimento)} · ${l.status}`}
                    direita={
                      <span className={`text-sm font-medium ${l.tipo === "receita" ? "text-ok" : "text-erro"}`}>
                        {l.tipo === "receita" ? "+" : "−"} {dinheiro(l.valor)}
                      </span>
                    }
                  />
                ))}
              </Lista>
            )}
          </Card>
        </div>
      </div>

      {/* Modal de transição */}
      <Modal aberto={!!transicao} aoFechar={fecharModal} titulo={transicao ? (ACAO_TRANSICAO[transicao] ?? transicao) : ""}>
        {transicao && (
          <div className="space-y-4">
            {transicao === "cancelada" ? (
              <p className="text-sm text-suave">
                Cancelar libera o ativo e cancela os lançamentos previstos. Lançamentos já pagos não somem (estorno é manual).
              </p>
            ) : (
              <p className="text-sm text-suave">
                Confirmar a transição para <span className="font-medium text-texto">{ROTULO_STATUS_OP[transicao] ?? transicao}</span>.
              </p>
            )}
            {PEDE_KM.has(transicao) && op.tipo !== "venda" && op.tipo !== "compra" && (
              <Campo rotulo="Quilometragem (opcional)">
                <Entrada type="number" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Km atual do veículo" />
              </Campo>
            )}
            {GERA_LANCAMENTO.has(transicao) && (
              <Campo rotulo="Parcelas" dica="Gera lançamentos previstos com vencimentos mensais.">
                <Entrada type="number" min={1} max={60} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
              </Campo>
            )}
            {transicao === "ativa" && (
              <Campo rotulo="Justificativa (apenas se a CNH do condutor estiver vencida)">
                <AreaTexto value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Obrigatória para sobrepor CNH vencida (admin)." />
              </Campo>
            )}
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fecharModal}>Voltar</Botao>
              <Botao
                variante={transicao === "cancelada" ? "perigo" : "primario"}
                onClick={confirmarTransicao}
                carregando={enviando}
              >
                {ACAO_TRANSICAO[transicao] ?? "Confirmar"}
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
