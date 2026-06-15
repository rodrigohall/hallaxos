// A página da operação: estado atual, transições nomeadas, ativos, financeiro
// e história completa. O front solicita transições; o back decide (doc 03).
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History, Workflow, CircleDollarSign, User, Package, MapPin, ArrowRight,
} from "lucide-react";
import { FORMAS_PAGAMENTO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Selo, Modal, Campo, Entrada, Selecao, AreaTexto, Timeline, useToast,
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

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito", boleto: "Boleto", transferencia: "Transferência",
};

const hojeISO = () => new Date().toISOString().slice(0, 10);

/** Vencimentos mensais a partir de uma data base (mesma lógica do back). */
function datasMensais(base: string, n: number): string[] {
  const [y, m, d] = base.split("-").map(Number);
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(y!, m! - 1 + i, d!)).toISOString().slice(0, 10)
  );
}

interface PreviaFinanceira {
  tipo: string;
  categoria: string;
  tipo_lancamento: "receita" | "despesa";
  valor_previsto: string;
  conta_padrao: { id: string; nome: string } | null;
}
interface ContaLista { id: string; nome: string }

export function OperacaoDetalhe() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [transicao, setTransicao] = useState<string | null>(null);
  const [km, setKm] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Edição dos lançamentos antes de finalizar (doc 03 §1, regra 5)
  const [contaId, setContaId] = useState("");
  const [forma, setForma] = useState("");
  const [dataBase, setDataBase] = useState(hojeISO());
  const [vencimentos, setVencimentos] = useState<string[]>([hojeISO()]);

  const geraLancamento = !!transicao && GERA_LANCAMENTO.has(transicao);

  const { data: previa } = useQuery({
    queryKey: ["operacao-previa", id, transicao],
    enabled: geraLancamento,
    queryFn: () => api.get<{ dados: PreviaFinanceira }>(`/operacoes/${id}/previa-financeira`).then((r) => r.dados),
  });
  const { data: contas } = useQuery({
    queryKey: ["contas"],
    enabled: geraLancamento,
    queryFn: () => api.get<{ dados: ContaLista[] }>(`/contas`).then((r) => r.dados),
  });

  // Ao abrir uma transição que gera financeiro, semeia a conta padrão.
  useEffect(() => {
    if (previa?.conta_padrao && !contaId) setContaId(previa.conta_padrao.id);
  }, [previa, contaId]);

  // Nº de parcelas / data base recalculam os vencimentos (editáveis em seguida).
  const definirParcelas = (n: number) => setVencimentos(datasMensais(dataBase, Math.max(1, Math.min(60, n))));
  const definirDataBase = (d: string) => {
    setDataBase(d);
    setVencimentos((v) => datasMensais(d, v.length));
  };
  const valorPrevisto = previa ? Number(previa.valor_previsto) : 0;
  const valorParcela = vencimentos.length ? valorPrevisto / vencimentos.length : 0;

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
        // Lançamentos editados pelo usuário (conta, forma, vencimento de cada parcela).
        financeiro: geraLancamento
          ? {
              conta_id: contaId || undefined,
              forma_pagamento: forma || null,
              parcelas: vencimentos.map((data_vencimento) => ({ data_vencimento })),
            }
          : undefined,
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
    setJustificativa("");
    setContaId("");
    setForma("");
    setDataBase(hojeISO());
    setVencimentos([hojeISO()]);
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
            {geraLancamento && (
              <div className="space-y-3 rounded-md border border-borda bg-elevado/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-suave">Lançamentos a gerar</span>
                  {previa && (
                    <span className={`text-sm font-medium ${previa.tipo_lancamento === "receita" ? "text-ok" : "text-erro"}`}>
                      {previa.tipo_lancamento === "receita" ? "+" : "−"} {dinheiro(previa.valor_previsto)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-mudo">
                  {previa?.categoria ? `Categoria ${previa.categoria}. ` : ""}
                  Revise antes de confirmar — só persiste ao finalizar.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Conta de destino/origem">
                    <Selecao value={contaId} onChange={(e) => setContaId(e.target.value)}>
                      <option value="">{previa?.conta_padrao ? `Padrão (${previa.conta_padrao.nome})` : "Conta padrão"}</option>
                      {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Forma de pagamento">
                    <Selecao value={forma} onChange={(e) => setForma(e.target.value)}>
                      <option value="">Não definida</option>
                      {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{ROTULO_FORMA[f] ?? f}</option>)}
                    </Selecao>
                  </Campo>
                  <Campo rotulo="Nº de parcelas">
                    <Entrada
                      type="number" min={1} max={60} value={vencimentos.length}
                      onChange={(e) => definirParcelas(Number(e.target.value || 1))}
                    />
                  </Campo>
                  <Campo rotulo="Data do lançamento">
                    <Entrada type="date" value={dataBase} onChange={(e) => definirDataBase(e.target.value)} />
                  </Campo>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-mudo">Vencimento de cada parcela</span>
                  {vencimentos.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-suave">{vencimentos.length > 1 ? `${i + 1}/${vencimentos.length}` : "Única"}</span>
                      <Entrada
                        type="date" value={v}
                        onChange={(e) => setVencimentos((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                      />
                      <span className="w-24 shrink-0 text-right text-xs text-mudo">{dinheiro(valorParcela.toFixed(2))}</span>
                    </div>
                  ))}
                </div>
              </div>
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
