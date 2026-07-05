// A página da operação: estado atual, transições nomeadas, ativos, financeiro
// e história completa. O front solicita transições; o back decide (doc 03).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  History, Workflow, CircleDollarSign, User, Package, MapPin, ArrowRight, Pencil,
  Sparkles, CheckCircle, ChevronDown, Link2, Plus,
} from "lucide-react";
import { FORMAS_PAGAMENTO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useCopiloto } from "../componentes/Copiloto";
import {
  Botao, Card, Selo, Modal, Campo, Entrada, Selecao, AreaTexto, Timeline, useToast,
  dinheiro, dataCurta, dataHora, SkeletonLinhas, EstadoVazio, Lista, ListaLinha,
  type EventoTimeline,
} from "../componentes/ui";
import { Comentarios } from "../componentes/Comentarios";
import { Documentos } from "../componentes/Anexos";
import { Seletor, type ItemSeletor } from "../operacoes/Seletor";
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

// Endereço do guincho com facetas geográficas (Sprint 14 · B3): texto sempre;
// vira link quando o usuário colou uma URL do Maps; e com coordenadas salvas
// um clique abre o mini-mapa OSM (mesmo padrão do mapa do dashboard).
function EnderecoGeo({ rotulo, endereco, link, lat, lng }: {
  rotulo: string; endereco: string; link: string | null; lat: number | null; lng: number | null;
}) {
  const [mapaAberto, setMapaAberto] = useState(false);
  const temCoords = lat != null && lng != null;
  const d = 0.004; // ~400m de raio no enquadramento
  return (
    <div className="pt-1">
      <div className="flex items-start gap-1.5">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mudo" />
        <span className="min-w-0">
          <span className="text-suave">{rotulo}: </span>
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="break-all text-ouro hover:underline">{endereco}</a>
          ) : (
            <span className="break-words">{endereco}</span>
          )}
          {temCoords && (
            <button
              type="button"
              onClick={() => setMapaAberto((v) => !v)}
              className="ml-2 inline-flex items-center gap-0.5 rounded border border-borda px-1.5 py-px text-[11px] text-suave hover:border-ouro/60 hover:text-ouro"
            >
              {mapaAberto ? "fechar mapa" : "ver mapa"}
            </button>
          )}
        </span>
      </div>
      {temCoords && mapaAberto && (
        <iframe
          title={`Mapa — ${rotulo}`}
          className="mt-2 h-48 w-full rounded-md border border-borda"
          style={{ filter: "invert(90%) hue-rotate(200deg)" }}
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng! - d}%2C${lat! - d}%2C${lng! + d}%2C${lat! + d}&layer=mapnik&marker=${lat}%2C${lng}`}
        />
      )}
    </div>
  );
}

const hojeISO = () => new Date().toISOString().slice(0, 10);
const LIMITE_LISTA = 5;

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
  const { usuario, copilotoAtivo } = useAuth();
  const { abrir: abrirCopiloto } = useCopiloto();
  const navegar = useNavigate();
  const fila = useQueryClient();
  const notificar = useToast();
  const [transicao, setTransicao] = useState<string | null>(null);
  const [km, setKm] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Edição depois de lançada: descritivos + datas (decisão #49).
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState({
    observacoes: "", data_inicio: "", data_fim: "",
    origem_endereco: "", destino_endereco: "", veiculo_cliente_descricao: "",
    veiculo_cliente_placa: "", data_devolucao_prevista: "", km_no_ato: "",
  });
  const [salvandoEd, setSalvandoEd] = useState(false);
  // Edição dos lançamentos antes de finalizar (doc 03 §1, regra 5)
  const [contaId, setContaId] = useState("");
  const [forma, setForma] = useState("");
  const [dataBase, setDataBase] = useState(hojeISO());
  const [vencimentos, setVencimentos] = useState<string[]>([hojeISO()]);
  const [verMaisLanc, setVerMaisLanc] = useState(false);
  // Sprint 14 · D1 — linkar ativo à operação já lançada
  const [linkandoAtivo, setLinkandoAtivo] = useState(false);
  const [ativoLink, setAtivoLink] = useState<ItemSeletor | null>(null);
  const [linkEnviando, setLinkEnviando] = useState(false);
  const [pagandoLanc, setPagandoLanc] = useState<{ id: string; descricao: string; valor: string } | null>(null);
  const [pagForma, setPagForma] = useState("");
  const [pagData, setPagData] = useState(hojeISO());
  const [pagConta, setPagConta] = useState("");
  const [pagEnviando, setPagEnviando] = useState(false);

  const geraLancamento = !!transicao && GERA_LANCAMENTO.has(transicao);

  const { data: previa } = useQuery({
    queryKey: ["operacao-previa", id, transicao],
    enabled: geraLancamento,
    queryFn: () => api.get<{ dados: PreviaFinanceira }>(`/operacoes/${id}/previa-financeira`).then((r) => r.dados),
  });
  const { data: contas } = useQuery({
    queryKey: ["contas"],
    enabled: geraLancamento || pagandoLanc !== null,
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

  const confirmarLinkAtivo = async () => {
    if (!ativoLink) return;
    setLinkEnviando(true);
    try {
      await api.post(`/operacoes/${id}/ativos`, { ativo_id: ativoLink.id });
      notificar({ tipo: "ok", titulo: "Ativo vinculado", descricao: "Lançamentos da operação herdaram o vínculo." });
      setLinkandoAtivo(false);
      setAtivoLink(null);
      invalidar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível vincular", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setLinkEnviando(false);
    }
  };

  const confirmarTransicao = async () => {
    if (!transicao) return;
    setEnviando(true);
    try {
      await api.post(`/operacoes/${id}/transicao`, {
        status: transicao,
        km: PEDE_KM.has(transicao) && km ? Number(km) : undefined,
        // Retroativo: data do evento (retirada/devolução/conclusão/encerramento).
        data: dataEvento || undefined,
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
    setDataEvento("");
    setContaId("");
    setForma("");
    setDataBase(hojeISO());
    setVencimentos([hojeISO()]);
  };

  const ext = op.extensao ?? {};
  const podeTransicionar = !!usuario && ["admin", "gestor", "operador"].includes(usuario.papel);

  const abrirEdicao = () => {
    setEd({
      observacoes: op.observacoes ?? "",
      data_inicio: op.dataInicio ? op.dataInicio.slice(0, 10) : "",
      data_fim: op.dataFim ? op.dataFim.slice(0, 10) : "",
      origem_endereco: String(ext.origemEndereco ?? ""),
      destino_endereco: String(ext.destinoEndereco ?? ""),
      veiculo_cliente_descricao: String(ext.veiculoClienteDescricao ?? ""),
      veiculo_cliente_placa: String(ext.veiculoClientePlaca ?? ""),
      data_devolucao_prevista: ext.dataDevolucaoPrevista ? String(ext.dataDevolucaoPrevista).slice(0, 10) : "",
      km_no_ato: ext.kmNoAto != null ? String(ext.kmNoAto) : "",
    });
    setEditando(true);
  };
  const salvarEdicao = async () => {
    setSalvandoEd(true);
    try {
      const payload: Record<string, unknown> = { observacoes: ed.observacoes || null, data_fim: ed.data_fim || null };
      if (ed.data_inicio) payload.data_inicio = ed.data_inicio;
      if (op.tipo === "guincho") {
        payload.origem_endereco = ed.origem_endereco;
        payload.destino_endereco = ed.destino_endereco;
        payload.veiculo_cliente_descricao = ed.veiculo_cliente_descricao;
        payload.veiculo_cliente_placa = ed.veiculo_cliente_placa || null;
      } else if (op.tipo === "locacao") {
        if (ed.data_devolucao_prevista) payload.data_devolucao_prevista = ed.data_devolucao_prevista;
      } else {
        payload.km_no_ato = ed.km_no_ato ? Number(ed.km_no_ato) : null;
      }
      await api.patch(`/operacoes/${id}`, payload);
      invalidar();
      notificar({ tipo: "ok", titulo: "Operação atualizada" });
      setEditando(false);
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível salvar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSalvandoEd(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{ROTULO_TIPO[op.tipo] ?? op.tipo}</h1>
        <span className="font-display text-sm font-bold text-ouro">{op.codigo}</span>
        <Selo tom={op.status}>{ROTULO_STATUS_OP[op.status] ?? op.status}</Selo>
        <Link to={`/clientes/${op.cliente.id}`} className="text-sm text-suave hover:text-ouro">
          · {op.cliente.nome}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {copilotoAtivo && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => abrirCopiloto(`Resuma a operação ${op.codigo} (${ROTULO_TIPO[op.tipo] ?? op.tipo}) do cliente ${op.cliente.nome}: status atual, valor, lançamentos pendentes e próximas etapas.`)}>
              <Sparkles className="h-3.5 w-3.5" /> Copiloto
            </Botao>
          )}
          {podeTransicionar && (
            <Botao tamanho="sm" variante="secundario" onClick={abrirEdicao}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Botao>
          )}
        </div>
      </div>

      {/* Transições nomeadas */}
      {podeTransicionar && op.proximasTransicoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {/* Sprint 14 · D3: cancelar operação é ação de admin */}
          {op.proximasTransicoes.filter((t) => t !== "cancelada" || usuario?.papel === "admin").map((t) => (
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
              <div><dt className="inline text-suave">Cliente: </dt><dd className="inline"><Link to={`/clientes/${op.cliente.id}`} className="hover:text-ouro">{op.cliente.nome}</Link></dd></div>
              <div><dt className="inline text-suave">Início: </dt><dd className="inline">{dataHora(op.dataInicio)}</dd></div>
              {op.dataFim && <div><dt className="inline text-suave">Encerrada: </dt><dd className="inline">{dataHora(op.dataFim)}</dd></div>}
              <div><dt className="inline text-suave">Valor: </dt><dd className="inline font-medium">{dinheiro(op.valorTotal)}</dd></div>

              {op.tipo === "guincho" && (
                <>
                  <EnderecoGeo
                    rotulo="Origem"
                    endereco={String(ext.origemEndereco ?? "")}
                    link={ext.origemLink ? String(ext.origemLink) : null}
                    lat={ext.origemLat != null ? Number(ext.origemLat) : null}
                    lng={ext.origemLng != null ? Number(ext.origemLng) : null}
                  />
                  <EnderecoGeo
                    rotulo="Destino"
                    endereco={String(ext.destinoEndereco ?? "")}
                    link={ext.destinoLink ? String(ext.destinoLink) : null}
                    lat={ext.destinoLat != null ? Number(ext.destinoLat) : null}
                    lng={ext.destinoLng != null ? Number(ext.destinoLng) : null}
                  />
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
            {podeTransicionar && (
              <div className="mt-3">
                {!linkandoAtivo ? (
                  <Botao variante="fantasma" tamanho="sm" onClick={() => setLinkandoAtivo(true)}>
                    <Link2 className="h-3.5 w-3.5" /> Linkar ativo
                  </Botao>
                ) : (
                  <div className="space-y-2 rounded-md border border-borda bg-elevado/40 p-3">
                    <Seletor rotulo="Ativo a vincular" recurso="ativos" selecionado={ativoLink} aoSelecionar={setAtivoLink} />
                    <p className="text-xs text-mudo">
                      Os lançamentos desta operação sem ativo herdam o vínculo automaticamente.
                    </p>
                    <div className="flex justify-end gap-2">
                      <Botao variante="fantasma" tamanho="sm" onClick={() => { setLinkandoAtivo(false); setAtivoLink(null); }}>Cancelar</Botao>
                      <Botao tamanho="sm" onClick={confirmarLinkAtivo} carregando={linkEnviando} disabled={!ativoLink || linkEnviando}>
                        Vincular
                      </Botao>
                    </div>
                  </div>
                )}
              </div>
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
              <>
                <Lista>
                  {(verMaisLanc ? op.lancamentos : op.lancamentos.slice(0, LIMITE_LISTA)).map((l) => (
                    <ListaLinha
                      key={l.id}
                      para={`/financeiro?lancamento=${l.id}`}
                      titulo={l.descricao}
                      subtitulo={l.data_pagamento ? `pago em ${dataCurta(l.data_pagamento)}` : `vence ${dataCurta(l.data_vencimento)} · ${l.status}`}
                      direita={
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${l.tipo === "receita" ? "text-ok" : "text-erro"}`}>
                            {l.tipo === "receita" ? "+" : "−"} {dinheiro(l.valor)}
                          </span>
                          {l.status === "previsto" && podeTransicionar && (
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPagandoLanc({ id: l.id, descricao: l.descricao, valor: l.valor }); setPagData(hojeISO()); setPagForma(""); setPagConta(""); }}
                              title="Registrar pagamento"
                              className="text-mudo hover:text-ok transition-colors"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      }
                    />
                  ))}
                </Lista>
                {op.lancamentos.length > LIMITE_LISTA && (
                  <button
                    onClick={() => setVerMaisLanc((v) => !v)}
                    className="mt-3 flex items-center gap-1 text-xs text-suave hover:text-ouro transition-colors"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verMaisLanc ? "rotate-180" : ""}`} />
                    {verMaisLanc ? "Ver menos" : `Ver mais ${op.lancamentos.length - LIMITE_LISTA}`}
                  </button>
                )}
              </>
            )}
            {/* Sprint 14 · D2: novo lançamento já pré-vinculado à operação (e ao ativo dela) */}
            <div className="mt-3">
              <Botao
                variante="fantasma"
                tamanho="sm"
                onClick={() => {
                  const objeto = op.ativos.find((a) => a.papel === "objeto") ?? op.ativos[0];
                  navegar(`/financeiro?novo=1&operacao_id=${op.id}${objeto ? `&ativo_id=${objeto.id}` : ""}`);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Novo lançamento
              </Botao>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal de transição */}
      <Modal aberto={!!transicao} aoFechar={fecharModal} titulo={transicao ? (ACAO_TRANSICAO[transicao] ?? transicao) : ""}>
        {transicao && (
          <div className="space-y-4">
            {transicao === "cancelada" ? (
              <p className="text-sm text-suave">
                Cancelar libera o ativo, anula os lançamentos pendentes e estorna automaticamente
                os já pagos (contrapartida — dinheiro nunca some). Nada é apagado: o motivo,
                quem cancelou e quando ficam registrados na timeline.
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
            {transicao !== "cancelada" && (
              <Campo rotulo="Data do evento" dica="Opcional — retroativo (padrão: agora)">
                <Entrada type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} />
              </Campo>
            )}
            {transicao === "ativa" && (
              <Campo rotulo="Justificativa (apenas se a CNH do condutor estiver vencida)">
                <AreaTexto value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Obrigatória para sobrepor CNH vencida (admin)." />
              </Campo>
            )}
            {transicao === "cancelada" && (
              <Campo rotulo="Motivo do cancelamento (obrigatório)">
                <AreaTexto
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Ex.: cliente desistiu; operação lançada em duplicidade…"
                />
              </Campo>
            )}
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fecharModal}>Voltar</Botao>
              <Botao
                variante={transicao === "cancelada" ? "perigo" : "primario"}
                onClick={confirmarTransicao}
                carregando={enviando}
                disabled={enviando || (transicao === "cancelada" && justificativa.trim().length < 3)}
              >
                {ACAO_TRANSICAO[transicao] ?? "Confirmar"}
              </Botao>
            </div>
          </div>
        )}
      </Modal>

      {/* Mini-modal: registrar pagamento de lançamento */}
      <Modal aberto={!!pagandoLanc} aoFechar={() => setPagandoLanc(null)} titulo="Registrar pagamento">
        {pagandoLanc && (
          <div className="space-y-4">
            <p className="text-sm text-suave">
              {pagandoLanc.descricao} · <span className="font-medium text-texto">{dinheiro(pagandoLanc.valor)}</span>
            </p>
            <Campo rotulo="Forma de pagamento">
              <Selecao value={pagForma} onChange={(e) => setPagForma(e.target.value)}>
                <option value="">Selecione</option>
                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{ROTULO_FORMA[f] ?? f}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Data do pagamento">
              <Entrada type="date" value={pagData} onChange={(e) => setPagData(e.target.value)} />
            </Campo>
            <Campo rotulo="Conta (opcional)">
              <Selecao value={pagConta} onChange={(e) => setPagConta(e.target.value)}>
                <option value="">Conta padrão</option>
                {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            </Campo>
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={() => setPagandoLanc(null)}>Cancelar</Botao>
              <Botao
                onClick={async () => {
                  if (!pagForma) return;
                  setPagEnviando(true);
                  try {
                    await api.post(`/lancamentos/${pagandoLanc.id}/pagar`, {
                      data_pagamento: pagData,
                      forma_pagamento: pagForma,
                      ...(pagConta ? { conta_id: pagConta } : {}),
                    });
                    fila.invalidateQueries({ queryKey: ["operacao", id] });
                    fila.invalidateQueries({ queryKey: ["lancamentos"] });
                    notificar({ tipo: "ok", titulo: "Pagamento registrado" });
                    setPagandoLanc(null);
                  } catch (e) {
                    notificar({ tipo: "erro", titulo: "Não foi possível registrar", descricao: e instanceof ApiError ? e.message : undefined });
                  } finally {
                    setPagEnviando(false);
                  }
                }}
                carregando={pagEnviando}
                disabled={!pagForma || pagEnviando}
              >
                Confirmar pagamento
              </Botao>
            </div>
          </div>
        )}
      </Modal>

      {/* Edição depois de lançada: descritivos + datas. O valor vai pelo lançamento. */}
      <Modal aberto={editando} aoFechar={() => setEditando(false)} titulo={`Editar ${ROTULO_TIPO[op.tipo] ?? op.tipo} ${op.codigo}`}>
        <div className="space-y-4">
          <p className="rounded-md border border-info/25 bg-info/10 px-3 py-2 text-xs text-suave">
            Corrige descritivos e datas (início/fim, retroativo). O valor financeiro
            ajusta-se pelo lançamento vinculado, no Financeiro.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Início" dica="Retroativo"><Entrada type="date" value={ed.data_inicio} onChange={(e) => setEd({ ...ed, data_inicio: e.target.value })} /></Campo>
            <Campo rotulo="Encerramento" dica="Retroativo"><Entrada type="date" value={ed.data_fim} onChange={(e) => setEd({ ...ed, data_fim: e.target.value })} /></Campo>
          </div>
          {op.tipo === "guincho" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Origem"><Entrada value={ed.origem_endereco} onChange={(e) => setEd({ ...ed, origem_endereco: e.target.value })} /></Campo>
                <Campo rotulo="Destino"><Entrada value={ed.destino_endereco} onChange={(e) => setEd({ ...ed, destino_endereco: e.target.value })} /></Campo>
                <Campo rotulo="Veículo do cliente"><Entrada value={ed.veiculo_cliente_descricao} onChange={(e) => setEd({ ...ed, veiculo_cliente_descricao: e.target.value })} /></Campo>
                <Campo rotulo="Placa do veículo"><Entrada value={ed.veiculo_cliente_placa} onChange={(e) => setEd({ ...ed, veiculo_cliente_placa: e.target.value })} /></Campo>
              </div>
            </>
          )}
          {op.tipo === "locacao" && (
            <Campo rotulo="Devolução prevista"><Entrada type="date" value={ed.data_devolucao_prevista} onChange={(e) => setEd({ ...ed, data_devolucao_prevista: e.target.value })} /></Campo>
          )}
          {(op.tipo === "venda" || op.tipo === "compra") && (
            <Campo rotulo="Km no ato"><Entrada type="number" value={ed.km_no_ato} onChange={(e) => setEd({ ...ed, km_no_ato: e.target.value })} /></Campo>
          )}
          <Campo rotulo="Observações"><AreaTexto value={ed.observacoes} onChange={(e) => setEd({ ...ed, observacoes: e.target.value })} /></Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setEditando(false)}>Cancelar</Botao>
            <Botao onClick={salvarEdicao} carregando={salvandoEd}>Salvar</Botao>
          </div>
        </div>
      </Modal>
    </div>
  );
}
