import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wrench, Clock, CalendarCheck, CheckCircle2 } from "lucide-react";
import { STATUS_MANUTENCAO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Modal, Campo, Entrada, Selecao, AreaTexto,
  Selo, SkeletonLinhas, EstadoVazio, useToast, dataCurta,
} from "../componentes/ui";
import { Seletor, type ItemSeletor } from "../operacoes/Seletor";

interface ManutencaoLista {
  id: string; tipo: string; status: string; descricao: string;
  ativo: string; ativoCodigo: string; fornecedor: string | null;
  dataAgendada: string | null; dataInicio: string | null; dataConclusao: string | null;
  custo: string;
}

const ROTULO_STATUS: Record<string, string> = {
  agendada: "agendada", em_andamento: "em andamento", concluida: "concluída", cancelada: "cancelada",
};

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const hoje = new Date();
  return Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const hoje = new Date();
  return Math.floor((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function Contador({ dias, modo }: { dias: number | null; modo: "andamento" | "agenda" | "concluida" }) {
  if (dias === null) return null;
  if (modo === "andamento") {
    return (
      <span className="text-xs text-mudo">
        {dias === 0 ? "iniciada hoje" : `${dias} dia${dias !== 1 ? "s" : ""} em andamento`}
      </span>
    );
  }
  if (modo === "agenda") {
    if (dias < 0) return <span className="text-xs font-medium text-erro">{Math.abs(dias)} dia{Math.abs(dias) !== 1 ? "s" : ""} atrasada</span>;
    if (dias === 0) return <span className="text-xs font-medium text-alerta">hoje</span>;
    return <span className="text-xs text-mudo">em {dias} dia{dias !== 1 ? "s" : ""}</span>;
  }
  // concluida
  return (
    <span className="text-xs text-mudo">
      {dias === 0 ? "concluída hoje" : `há ${dias} dia${dias !== 1 ? "s" : ""}`}
    </span>
  );
}

function CardManutencao({ m }: { m: ManutencaoLista }) {
  const diasAndamento = m.status === "em_andamento" ? diasDesde(m.dataInicio) : null;
  const diasAgenda = m.status === "agendada" ? diasAte(m.dataAgendada) : null;
  const diasConcl = (m.status === "concluida" || m.status === "cancelada") ? diasDesde(m.dataConclusao) : null;

  return (
    <Link
      to={`/manutencoes/${m.id}`}
      className="animar-surgir block rounded-lg border border-borda bg-painel p-3 shadow-painel hover:border-borda-forte hover:shadow-flutuante transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{m.descricao}</p>
        <span className="shrink-0"><Selo tom={m.status}>{ROTULO_STATUS[m.status] ?? m.status}</Selo></span>
      </div>
      <p className="mt-1 text-xs text-suave">
        <span className="font-display font-bold text-ouro">{m.ativoCodigo}</span> · {m.ativo}
      </p>
      {m.fornecedor && <p className="mt-0.5 text-xs text-mudo">{m.fornecedor}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        {m.dataAgendada && m.status !== "em_andamento" && (
          <span className="text-xs text-mudo">{dataCurta(m.dataAgendada)}</span>
        )}
        <Contador
          dias={m.status === "em_andamento" ? diasAndamento : m.status === "agendada" ? diasAgenda : diasConcl}
          modo={m.status === "em_andamento" ? "andamento" : m.status === "agendada" ? "agenda" : "concluida"}
        />
      </div>
    </Link>
  );
}

export function Manutencoes() {
  const { pode } = useAuth();
  // Sprint 14 · E3: ?nova=1&ativo_id=X abre o modal com o ativo pré-selecionado
  // (atalho vindo da ficha do ativo).
  const [params, setParams] = useSearchParams();
  const [nova, setNova] = useState(params.get("nova") === "1");
  const ativoParam = params.get("ativo_id");
  const { data: ativoPre } = useQuery({
    queryKey: ["ativo-pre-manut", ativoParam],
    enabled: !!ativoParam && nova,
    queryFn: () =>
      api.get<{ dados: { id: string; nome: string; codigo: string; status: string } }>(`/ativos/${ativoParam}`)
        .then((r) => ({ id: r.dados.id, titulo: r.dados.nome, subtitulo: `${r.dados.codigo} · ${r.dados.status}` })),
  });
  const fecharNova = () => {
    setNova(false);
    setParams((p) => { p.delete("nova"); p.delete("ativo_id"); return p; }, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["manutencoes"],
    queryFn: () =>
      api.get<{ dados: ManutencaoLista[]; meta: { total: number } }>(
        `/manutencoes?por_pagina=200`
      ),
  });

  const todas = data?.dados ?? [];
  const emAndamento = todas.filter((m) => m.status === "em_andamento");
  const agendadas = todas.filter((m) => m.status === "agendada");
  const concluidas = todas.filter((m) => m.status === "concluida" || m.status === "cancelada");

  const COLUNAS = [
    {
      titulo: "Em andamento",
      icone: Clock,
      cor: "text-alerta",
      items: emAndamento,
    },
    {
      titulo: "Agendadas",
      icone: CalendarCheck,
      cor: "text-info",
      items: agendadas,
    },
    {
      titulo: "Concluídas",
      icone: CheckCircle2,
      cor: "text-ok",
      items: concluidas.slice(0, 15),
      extras: concluidas.length > 15 ? concluidas.length - 15 : 0,
    },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Manutenções</h1>
        {pode("manutencoes", "criar") && (
          <Botao tamanho="sm" className="ml-auto" onClick={() => setNova(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova manutenção
          </Botao>
        )}
      </div>

      {isLoading ? (
        <SkeletonLinhas linhas={4} />
      ) : todas.length === 0 ? (
        <div className="rounded-lg border border-borda bg-painel p-8">
          <EstadoVazio icone={Wrench} titulo="Nenhuma manutenção" descricao="Agende a manutenção de um ativo para começar." />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUNAS.map((col) => {
            const Icone = col.icone;
            return (
              <div key={col.titulo} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icone className={`h-4 w-4 ${col.cor}`} />
                  <h2 className={`text-sm font-semibold ${col.cor}`}>{col.titulo}</h2>
                  <span className="ml-auto rounded-full bg-elevado px-2 py-0.5 text-xs font-medium text-mudo">
                    {col.items.length}{"extras" in col && col.extras > 0 ? `+${col.extras}` : ""}
                  </span>
                </div>
                {col.items.length === 0 ? (
                  <div className="rounded-lg border border-borda bg-painel/50 py-6 text-center">
                    <p className="text-xs text-mudo">Nenhuma</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {col.items.map((m) => <CardManutencao key={m.id} m={m} />)}
                    {"extras" in col && col.extras > 0 && (
                      <p className="text-center text-xs text-mudo">
                        + {col.extras} concluída(s) —{" "}
                        <Link to="/manutencoes?status=concluida" className="text-ouro hover:underline">
                          ver todas
                        </Link>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {nova && (!ativoParam || ativoPre) && <ModalNova aoFechar={fecharNova} ativoInicial={ativoPre ?? null} />}
    </div>
  );
}

// Seletor de tipo com criação inline (Sprint 14 · C1): lista o registro
// manutencao_tipos e permite "+ Novo tipo" sem sair do formulário.
export function SeletorTipoManutencao({ valor, aoMudar }: { valor: string; aoMudar: (t: string) => void }) {
  const notificar = useToast();
  const fila = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const { data: tipos } = useQuery({
    queryKey: ["manutencao-tipos"],
    queryFn: () => api.get<{ dados: Array<{ id: string; nome: string }> }>("/manutencoes/tipos").then((r) => r.dados),
  });

  const criar = async () => {
    if (nome.trim().length < 2) return;
    setSalvando(true);
    try {
      const r = await api.post<{ dados: { nome: string } }>("/manutencoes/tipos", { nome: nome.trim() });
      fila.invalidateQueries({ queryKey: ["manutencao-tipos"] });
      aoMudar(r.dados.nome);
      setCriando(false);
      setNome("");
      notificar({ tipo: "ok", titulo: `Tipo "${r.dados.nome}" criado` });
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível criar o tipo", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div>
      <Selecao value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {(tipos ?? []).map((t) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
      </Selecao>
      {!criando ? (
        <button type="button" onClick={() => setCriando(true)} className="mt-1 text-xs text-ouro hover:underline">
          + Novo tipo
        </button>
      ) : (
        <div className="mt-2 flex gap-2">
          <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder='Ex.: "Compra de Peças"' className="flex-1" />
          <Botao tamanho="sm" onClick={criar} carregando={salvando} disabled={nome.trim().length < 2 || salvando}>Criar</Botao>
          <Botao tamanho="sm" variante="fantasma" onClick={() => { setCriando(false); setNome(""); }}>Cancelar</Botao>
        </div>
      )}
    </div>
  );
}

function ModalNova({ aoFechar, ativoInicial = null }: { aoFechar: () => void; ativoInicial?: ItemSeletor | null }) {
  const notificar = useToast();
  const fila = useQueryClient();
  const [ativo, setAtivo] = useState<ItemSeletor | null>(ativoInicial);
  const [fornecedor, setFornecedor] = useState<ItemSeletor | null>(null);
  const [criandoOficina, setCriandoOficina] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>({ tipo: "preventiva" });
  const [retroativa, setRetroativa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));

  const enviar = async () => {
    if (!ativo) return;
    if (retroativa && !campos.data_conclusao) {
      notificar({ tipo: "erro", titulo: "Informe a data de conclusão", descricao: "Lançamento retroativo precisa da data em que a manutenção foi concluída." });
      return;
    }
    setEnviando(true);
    try {
      await api.post("/manutencoes", {
        ativo_id: ativo.id,
        tipo: campos.tipo,
        descricao: campos.descricao,
        fornecedor_id: fornecedor?.id ?? null,
        data_agendada: campos.data_agendada || null,
        observacoes: campos.observacoes || null,
        pecas: campos.pecas || null,
        // C2 — retroativo: nasce concluída, custo vira despesa vinculada
        data_inicio: retroativa ? campos.data_inicio || null : null,
        data_conclusao: retroativa ? campos.data_conclusao || null : null,
        custo: retroativa && campos.custo ? Number(campos.custo) : null,
        km_no_momento: retroativa && campos.km_no_momento ? Number(campos.km_no_momento) : null,
      });
      fila.invalidateQueries({ queryKey: ["manutencoes"] });
      notificar({ tipo: "ok", titulo: retroativa ? "Manutenção registrada (retroativa)" : "Manutenção agendada" });
      aoFechar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível agendar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Nova manutenção">
      <div className="space-y-4">
        <Seletor rotulo="Ativo" recurso="ativos" selecionado={ativo} aoSelecionar={setAtivo} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo">
            <SeletorTipoManutencao valor={campos.tipo ?? "preventiva"} aoMudar={(t) => setCampos((c) => ({ ...c, tipo: t }))} />
          </Campo>
          <Campo rotulo="Data agendada" dica="Pode ser no passado (registro retroativo)">
            <Entrada type="date" value={campos.data_agendada ?? ""} onChange={set("data_agendada")} />
          </Campo>
        </div>

        {/* C2 — lançamento retroativo: manutenção que já aconteceu */}
        <div className="rounded-md border border-borda bg-elevado/50 p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={retroativa}
              onChange={(e) => setRetroativa(e.target.checked)}
              className="h-4 w-4 rounded border-borda-forte accent-ouro"
            />
            <span className="flex items-center gap-1.5 text-sm text-suave">
              <Clock className="h-3.5 w-3.5" /> Já realizada (lançamento retroativo)
            </span>
          </label>
          {retroativa && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Início (opcional)">
                <Entrada type="date" value={campos.data_inicio ?? ""} onChange={set("data_inicio")} />
              </Campo>
              <Campo rotulo="Concluída em">
                <Entrada type="date" value={campos.data_conclusao ?? ""} onChange={set("data_conclusao")} />
              </Campo>
              <Campo rotulo="Custo (R$, opcional)" dica="Vira despesa vinculada à manutenção">
                <Entrada type="number" step="0.01" min="0" value={campos.custo ?? ""} onChange={set("custo")} />
              </Campo>
              <Campo rotulo="Km no momento (opcional)">
                <Entrada type="number" min="0" value={campos.km_no_momento ?? ""} onChange={set("km_no_momento")} />
              </Campo>
            </div>
          )}
        </div>
        <Campo rotulo="Descrição do serviço">
          <Entrada value={campos.descricao ?? ""} onChange={set("descricao")} placeholder="Ex.: Revisão dos 30 mil km, troca de óleo" />
        </Campo>
        <Campo rotulo="Peças / material (opcional)" dica="Itens a serem utilizados ou já utilizados">
          <AreaTexto value={campos.pecas ?? ""} onChange={set("pecas")} placeholder="Ex.: Óleo 5W30, filtro de ar, pastilhas dianteiras" />
        </Campo>
        <div>
          <Seletor
            rotulo="Oficina (opcional)"
            recurso="pessoas"
            selecionado={fornecedor}
            aoSelecionar={setFornecedor}
            filtro="papel=oficina"
          />
          {!fornecedor && !criandoOficina && (
            <button type="button" onClick={() => setCriandoOficina(true)} className="mt-1 text-xs text-ouro hover:underline">
              + cadastrar oficina
            </button>
          )}
          {criandoOficina && (
            <NovaOficinaInline
              aoCriar={(item) => { setFornecedor(item); setCriandoOficina(false); }}
              aoCancelar={() => setCriandoOficina(false)}
            />
          )}
        </div>
        <Campo rotulo="Observações (opcional)">
          <AreaTexto value={campos.observacoes ?? ""} onChange={set("observacoes")} />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao onClick={enviar} carregando={enviando} disabled={!ativo || !campos.descricao || enviando}>
            {retroativa ? "Registrar" : "Agendar"}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function NovaOficinaInline({
  aoCriar, aoCancelar,
}: { aoCriar: (item: ItemSeletor) => void; aoCancelar: () => void }) {
  const notificar = useToast();
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      const { dados } = await api.post<{ dados: { id: string; nome: string } }>("/pessoas", {
        tipo: "pj", nome, cpf_cnpj: cnpj, eh_oficina: true,
      });
      notificar({ tipo: "ok", titulo: "Oficina cadastrada" });
      aoCriar({ id: dados.id, titulo: dados.nome, subtitulo: "Oficina" });
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível cadastrar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-borda bg-elevado/40 p-3">
      <Campo rotulo="Nome da oficina">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Auto Center Silva" />
      </Campo>
      <Campo rotulo="CNPJ">
        <Entrada value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Só números" />
      </Campo>
      <div className="flex justify-end gap-2">
        <Botao variante="fantasma" tamanho="sm" onClick={aoCancelar}>Cancelar</Botao>
        <Botao tamanho="sm" onClick={salvar} carregando={salvando} disabled={nome.length < 2 || cnpj.length < 11 || salvando}>
          Cadastrar
        </Botao>
      </div>
    </div>
  );
}
