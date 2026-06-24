import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Wrench, CircleDollarSign, Play, CheckCircle2, XCircle, Pencil, CheckCircle, ChevronDown } from "lucide-react";
import { TIPOS_MANUTENCAO, FORMAS_PAGAMENTO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Selo, Modal, Campo, Entrada, Selecao, AreaTexto, Timeline, useToast,
  dinheiro, dataCurta, dataHora, SkeletonLinhas, EstadoVazio, Lista, ListaLinha,
  type EventoTimeline,
} from "../componentes/ui";
import { Comentarios } from "../componentes/Comentarios";
import { Documentos } from "../componentes/Anexos";

interface ManutencaoDetalheDados {
  id: string; tipo: string; status: string; descricao: string;
  ativo_id: string; ativo_nome: string; ativo_codigo: string; ativo_status: string;
  fornecedor_nome: string | null; data_agendada: string | null;
  data_inicio: string | null; data_conclusao: string | null;
  km_no_momento: number | null; observacoes: string | null;
  pecas: string | null;
  lancamentos: Array<{ id: string; tipo: string; descricao: string; valor: string; status: string; data_vencimento: string; data_pagamento: string | null }>;
  proximasTransicoes: string[];
}

const ROTULO_STATUS: Record<string, string> = {
  agendada: "agendada", em_andamento: "em andamento", concluida: "concluída", cancelada: "cancelada",
};
const ROTULO_FORMA: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito", boleto: "Boleto", transferencia: "Transferência",
};
const LIMITE_LISTA = 5;
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function ManutencaoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [acao, setAcao] = useState<"concluir" | "cancelar" | null>(null);
  const [km, setKm] = useState("");
  const [custo, setCusto] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [dataConcl, setDataConcl] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [verMaisLanc, setVerMaisLanc] = useState(false);
  const [pagandoLanc, setPagandoLanc] = useState<{ id: string; descricao: string; valor: string } | null>(null);
  const [pagForma, setPagForma] = useState("");
  const [pagData, setPagData] = useState(hojeISO());
  const [pagConta, setPagConta] = useState("");
  const [pagEnviando, setPagEnviando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState({
    tipo: "", descricao: "", observacoes: "", data_agendada: "",
    data_inicio: "", data_conclusao: "", km_no_momento: "", pecas: "",
  });
  const [salvandoEd, setSalvandoEd] = useState(false);

  const { data: m } = useQuery({
    queryKey: ["manutencao", id],
    queryFn: () => api.get<{ dados: ManutencaoDetalheDados }>(`/manutencoes/${id}`).then((r) => r.dados),
  });
  const { data: contas } = useQuery({
    queryKey: ["contas"],
    enabled: pagandoLanc !== null,
    queryFn: () => api.get<{ dados: Array<{ id: string; nome: string }> }>(`/contas`).then((r) => r.dados),
  });
  const { data: eventos, isLoading: carregandoTL } = useQuery({
    queryKey: ["manutencao-timeline", id],
    queryFn: () => api.get<{ dados: EventoTimeline[] }>(`/manutencoes/${id}/timeline`).then((r) => r.dados),
  });

  if (!m) return <SkeletonLinhas linhas={8} />;

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["manutencao", id] });
    fila.invalidateQueries({ queryKey: ["manutencao-timeline", id] });
    fila.invalidateQueries({ queryKey: ["manutencoes"] });
    fila.invalidateQueries({ queryKey: ["ativo"] });
    fila.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const iniciar = async () => {
    try {
      await api.post(`/manutencoes/${id}/iniciar`);
      invalidar();
      notificar({ tipo: "ok", titulo: "Manutenção iniciada" });
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível iniciar", descricao: e instanceof ApiError ? e.message : undefined });
    }
  };

  const confirmar = async () => {
    setEnviando(true);
    try {
      if (acao === "concluir") {
        await api.post(`/manutencoes/${id}/concluir`, {
          km_no_momento: km ? Number(km) : null,
          custo: custo ? Number(custo) : null,
          parcelas: Number(parcelas || 1),
          data_conclusao: dataConcl || null,
        });
      } else if (acao === "cancelar") {
        await api.post(`/manutencoes/${id}/cancelar`, { motivo });
      }
      invalidar();
      notificar({ tipo: "ok", titulo: acao === "concluir" ? "Manutenção concluída" : "Manutenção cancelada" });
      fechar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Ação recusada", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };
  const fechar = () => { setAcao(null); setKm(""); setCusto(""); setParcelas("1"); setMotivo(""); setDataConcl(""); };

  // Edição depois de lançada: corrige dados e datas (incl. retroativo), com
  // auditoria no servidor (decisão #50). Disponível em qualquer status, exceto cancelada.
  const abrirEdicao = () => {
    setEd({
      tipo: m.tipo,
      descricao: m.descricao,
      observacoes: m.observacoes ?? "",
      data_agendada: m.data_agendada ? m.data_agendada.slice(0, 10) : "",
      data_inicio: m.data_inicio ? m.data_inicio.slice(0, 10) : "",
      data_conclusao: m.data_conclusao ? m.data_conclusao.slice(0, 10) : "",
      km_no_momento: m.km_no_momento != null ? String(m.km_no_momento) : "",
      pecas: m.pecas ?? "",
    });
    setEditando(true);
  };
  const salvarEdicao = async () => {
    setSalvandoEd(true);
    try {
      await api.patch(`/manutencoes/${id}`, {
        tipo: ed.tipo,
        descricao: ed.descricao,
        observacoes: ed.observacoes || null,
        data_agendada: ed.data_agendada || null,
        data_inicio: ed.data_inicio || null,
        data_conclusao: ed.data_conclusao || null,
        km_no_momento: ed.km_no_momento ? Number(ed.km_no_momento) : null,
        pecas: ed.pecas || null,
      });
      invalidar();
      notificar({ tipo: "ok", titulo: "Manutenção atualizada" });
      setEditando(false);
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível salvar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSalvandoEd(false);
    }
  };

  const podeTransicionar = pode("manutencoes", "transicionar");
  const podeEditar = pode("manutencoes", "editar") && m.status !== "cancelada";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{m.descricao}</h1>
        <Selo tom={m.status}>{ROTULO_STATUS[m.status] ?? m.status}</Selo>
        <Link to={`/ativos/${m.ativo_id}`} className="text-sm text-suave hover:text-ouro">
          · <span className="font-display font-bold text-ouro">{m.ativo_codigo}</span> {m.ativo_nome}
        </Link>
        {podeEditar && (
          <Botao tamanho="sm" variante="secundario" className="ml-auto" onClick={abrirEdicao}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Botao>
        )}
      </div>

      {podeTransicionar && m.proximasTransicoes.length > 0 && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-borda bg-painel p-3">
          {m.proximasTransicoes.includes("em_andamento") && (
            <Botao onClick={iniciar} className="flex-1 justify-center">
              <Play className="h-4 w-4" /> Iniciar manutenção
            </Botao>
          )}
          {m.proximasTransicoes.includes("concluida") && (
            <Botao onClick={() => setAcao("concluir")} className="flex-1 justify-center">
              <CheckCircle2 className="h-4 w-4" /> Concluir manutenção
            </Botao>
          )}
          {m.proximasTransicoes.includes("cancelada") && (
            <Botao variante="perigo" tamanho="sm" onClick={() => setAcao("cancelar")}>
              <XCircle className="h-3.5 w-3.5" /> Cancelar
            </Botao>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card titulo="Dados" icone={Wrench}>
            <dl className="space-y-1.5 text-sm">
              <div><dt className="inline text-suave">Tipo: </dt><dd className="inline">{m.tipo}</dd></div>
              <div><dt className="inline text-suave">Ativo: </dt><dd className="inline">{m.ativo_nome}</dd></div>
              {m.fornecedor_nome && <div><dt className="inline text-suave">Fornecedor: </dt><dd className="inline">{m.fornecedor_nome}</dd></div>}
              {m.data_agendada && <div><dt className="inline text-suave">Agendada: </dt><dd className="inline">{dataCurta(m.data_agendada)}</dd></div>}
              {m.data_inicio && <div><dt className="inline text-suave">Iniciada: </dt><dd className="inline">{dataHora(m.data_inicio)}</dd></div>}
              {m.data_conclusao && <div><dt className="inline text-suave">Concluída: </dt><dd className="inline">{dataHora(m.data_conclusao)}</dd></div>}
              {m.km_no_momento != null && <div><dt className="inline text-suave">Km: </dt><dd className="inline">{m.km_no_momento.toLocaleString("pt-BR")}</dd></div>}
              {m.observacoes && <p className="pt-2 text-suave">{m.observacoes}</p>}
              {m.pecas && (
                <div className="pt-2">
                  <dt className="text-xs font-medium text-suave">Peças / material</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-sm">{m.pecas}</dd>
                </div>
              )}
            </dl>
          </Card>
          <Documentos entidadeTipo="manutencao" entidadeId={m.id} />
          <Comentarios entidadeTipo="manutencao" entidadeId={m.id} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card titulo="História completa" icone={History}>
            {carregandoTL ? <SkeletonLinhas linhas={4} /> : <Timeline eventos={eventos ?? []} />}
          </Card>
          <Card titulo="Custos" icone={CircleDollarSign}>
            {m.lancamentos.length === 0 ? (
              <EstadoVazio icone={CircleDollarSign} titulo="Nenhum custo lançado" descricao="O custo é informado na conclusão." />
            ) : (
              <>
                <Lista>
                  {(verMaisLanc ? m.lancamentos : m.lancamentos.slice(0, LIMITE_LISTA)).map((l) => (
                    <ListaLinha
                      key={l.id}
                      titulo={l.descricao}
                      subtitulo={l.data_pagamento ? `pago em ${dataCurta(l.data_pagamento)}` : `vence ${dataCurta(l.data_vencimento)} · ${l.status}`}
                      direita={
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-erro">− {dinheiro(l.valor)}</span>
                          {l.status === "previsto" && podeTransicionar && (
                            <button
                              onClick={() => { setPagandoLanc({ id: l.id, descricao: l.descricao, valor: l.valor }); setPagData(hojeISO()); setPagForma(""); setPagConta(""); }}
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
                {m.lancamentos.length > LIMITE_LISTA && (
                  <button
                    onClick={() => setVerMaisLanc((v) => !v)}
                    className="mt-3 flex items-center gap-1 text-xs text-suave hover:text-ouro transition-colors"
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verMaisLanc ? "rotate-180" : ""}`} />
                    {verMaisLanc ? "Ver menos" : `Ver mais ${m.lancamentos.length - LIMITE_LISTA}`}
                  </button>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

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
                    fila.invalidateQueries({ queryKey: ["manutencao", id] });
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

      <Modal aberto={!!acao} aoFechar={fechar} titulo={acao === "concluir" ? "Concluir manutenção" : "Cancelar manutenção"}>
        {acao === "concluir" ? (
          <div className="space-y-4">
            <p className="text-sm text-suave">O ativo volta a <span className="font-medium text-texto">disponível</span>. Informe o custo para gerar a despesa.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Km no momento (opcional)"><Entrada type="number" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
              <Campo rotulo="Custo (R$, opcional)"><Entrada type="number" value={custo} onChange={(e) => setCusto(e.target.value)} /></Campo>
            </div>
            {Number(custo) > 0 && (
              <Campo rotulo="Parcelas" dica="Vencimentos mensais."><Entrada type="number" min={1} max={60} value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></Campo>
            )}
            <Campo rotulo="Data da conclusão" dica="Opcional — retroativo (padrão: hoje)">
              <Entrada type="date" value={dataConcl} onChange={(e) => setDataConcl(e.target.value)} />
            </Campo>
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fechar}>Voltar</Botao>
              <Botao onClick={confirmar} carregando={enviando}>Concluir</Botao>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Campo rotulo="Motivo do cancelamento"><AreaTexto value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fechar}>Voltar</Botao>
              <Botao variante="perigo" onClick={confirmar} carregando={enviando} disabled={motivo.trim().length < 3}>Cancelar manutenção</Botao>
            </div>
          </div>
        )}
      </Modal>

      <Modal aberto={editando} aoFechar={() => setEditando(false)} titulo="Editar manutenção">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <Selecao value={ed.tipo} onChange={(e) => setEd({ ...ed, tipo: e.target.value })}>
                {TIPOS_MANUTENCAO.map((t) => <option key={t} value={t}>{t}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Km no momento">
              <Entrada type="number" value={ed.km_no_momento} onChange={(e) => setEd({ ...ed, km_no_momento: e.target.value })} />
            </Campo>
          </div>
          <Campo rotulo="Descrição">
            <Entrada value={ed.descricao} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Agendada"><Entrada type="date" value={ed.data_agendada} onChange={(e) => setEd({ ...ed, data_agendada: e.target.value })} /></Campo>
            <Campo rotulo="Início" dica="Retroativo"><Entrada type="date" value={ed.data_inicio} onChange={(e) => setEd({ ...ed, data_inicio: e.target.value })} /></Campo>
            <Campo rotulo="Conclusão" dica="Retroativo"><Entrada type="date" value={ed.data_conclusao} onChange={(e) => setEd({ ...ed, data_conclusao: e.target.value })} /></Campo>
          </div>
          <Campo rotulo="Observações">
            <AreaTexto value={ed.observacoes} onChange={(e) => setEd({ ...ed, observacoes: e.target.value })} />
          </Campo>
          <Campo rotulo="Peças / material">
            <AreaTexto value={ed.pecas} onChange={(e) => setEd({ ...ed, pecas: e.target.value })} placeholder="Itens utilizados ou previstos" />
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setEditando(false)}>Cancelar</Botao>
            <Botao onClick={salvarEdicao} carregando={salvandoEd} disabled={ed.descricao.trim().length < 3}>Salvar</Botao>
          </div>
        </div>
      </Modal>
    </div>
  );
}
