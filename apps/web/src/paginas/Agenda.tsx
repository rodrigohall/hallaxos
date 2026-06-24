// Agenda: calendário mensal derivado. Eventos das origens (devoluções de
// locação, manutenções, vencimentos, CNH/documentos) + compromissos manuais.
// Sprint 11: filtros por tipo e período, modal estendido (linkar/gerar),
// itens clicáveis em todos os tipos, visual repaginado.
import { useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Truck, Wrench, CircleDollarSign,
  IdCard, FileText, CalendarClock, Check, Trash2, Filter, Link2,
  ReceiptText, UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Chip, Modal, Campo, Entrada, AreaTexto, Selecao,
  useToast, SkeletonLinhas,
} from "../componentes/ui";

interface ItemAgenda {
  tipo: string; titulo: string; data: string;
  link: string | null; manualId: string | null; concluido: boolean;
  entidadeTipo: string | null; entidadeId: string | null;
}
interface Conta { id: string; nome: string }
interface Categoria { id: string; nome: string; tipo: string }

const PADRAO = { icone: CalendarClock, cor: "text-suave", fundo: "bg-suave/10" };
const ESTILO: Record<string, { icone: LucideIcon; cor: string; fundo: string }> = {
  devolucao:   { icone: Truck,              cor: "text-info",   fundo: "bg-info/10" },
  manutencao:  { icone: Wrench,             cor: "text-alerta", fundo: "bg-alerta/10" },
  vencimento:  { icone: CircleDollarSign,   cor: "text-ouro",   fundo: "bg-ouro/10" },
  cnh:         { icone: IdCard,             cor: "text-erro",   fundo: "bg-erro/10" },
  documento:   { icone: FileText,           cor: "text-erro",   fundo: "bg-erro/10" },
  compromisso: PADRAO,
};

const TIPOS_FILTRO = [
  { id: "devolucao",   rotulo: "Devoluções" },
  { id: "manutencao",  rotulo: "Manutenções" },
  { id: "vencimento",  rotulo: "Vencimentos" },
  { id: "cnh",         rotulo: "CNH" },
  { id: "documento",   rotulo: "Documentos" },
  { id: "compromisso", rotulo: "Compromissos" },
];

type Periodo = "semana" | "mes" | "trimestre" | "semestre";
const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "semana",    rotulo: "Semana" },
  { id: "mes",       rotulo: "Mês" },
  { id: "trimestre", rotulo: "Trimestre" },
  { id: "semestre",  rotulo: "Semestre" },
];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const NOMES_MES_COMPLETO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function calcularRange(periodo: Periodo, refMes: Date): { de: Date; ate: Date } {
  const hoje = new Date();
  switch (periodo) {
    case "semana": {
      const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay());
      const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
      return { de: dom, ate: sab };
    }
    case "mes": {
      const ini = new Date(refMes.getFullYear(), refMes.getMonth(), 1);
      const fim = new Date(refMes.getFullYear(), refMes.getMonth() + 1, 0);
      return { de: ini, ate: fim };
    }
    case "trimestre": {
      const trim = Math.floor(hoje.getMonth() / 3);
      const ini = new Date(hoje.getFullYear(), trim * 3, 1);
      const fim = new Date(hoje.getFullYear(), trim * 3 + 3, 0);
      return { de: ini, ate: fim };
    }
    case "semestre": {
      const sem = hoje.getMonth() < 6 ? 0 : 1;
      const ini = new Date(hoje.getFullYear(), sem * 6, 1);
      const fim = new Date(hoje.getFullYear(), sem * 6 + 6, 0);
      return { de: ini, ate: fim };
    }
  }
}

export function Agenda() {
  const { pode } = useAuth();
  const [refMes, setRefMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [tiposAtivos, setTiposAtivos] = useState<Set<string>>(new Set());
  const [soMeus, setSoMeus] = useState(false);
  const [novo, setNovo] = useState(false);
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const range = useMemo(() => calcularRange(periodo, refMes), [periodo, refMes]);

  // Grade do calendário (sempre baseada no mês de referência)
  const { semanas } = useMemo(() => {
    const inicio = new Date(refMes.getFullYear(), refMes.getMonth(), 1);
    const fim = new Date(refMes.getFullYear(), refMes.getMonth() + 1, 0);
    const gridIni = new Date(inicio); gridIni.setDate(1 - inicio.getDay());
    const gridFim = new Date(fim); gridFim.setDate(fim.getDate() + (6 - fim.getDay()));
    const dias: Date[] = [];
    for (let d = new Date(gridIni); d <= gridFim; d.setDate(d.getDate() + 1)) dias.push(new Date(d));
    const sem: Date[][] = [];
    for (let i = 0; i < dias.length; i += 7) sem.push(dias.slice(i, i + 7));
    return { semanas: sem };
  }, [refMes]);

  // API: usa o range calculado pelo seletor de período
  const de = ymd(range.de);
  const ate = ymd(range.ate);
  const tipoParams = tiposAtivos.size > 0
    ? "&" + Array.from(tiposAtivos).map((t) => `tipo=${t}`).join("&")
    : "";
  const soMeusParam = soMeus ? "&so_meus=true" : "";

  const { data, isLoading } = useQuery({
    queryKey: ["agenda", de, ate, tipoParams, soMeus],
    queryFn: () =>
      api.get<{ dados: ItemAgenda[] }>(`/agenda?de=${de}&ate=${ate}${tipoParams}${soMeusParam}`).then((r) => r.dados),
  });

  const porDia = useMemo(() => {
    const mapa = new Map<string, ItemAgenda[]>();
    for (const it of data ?? []) {
      const k = it.data.slice(0, 10);
      mapa.set(k, [...(mapa.get(k) ?? []), it]);
    }
    return mapa;
  }, [data]);

  const hoje = ymd(new Date());
  const mudarMes = (n: number) => {
    setRefMes(new Date(refMes.getFullYear(), refMes.getMonth() + n, 1));
  };

  const alternarTipo = (id: string) => {
    setTiposAtivos((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  // Ao mudar para período não-mês, ainda mostramos o calendário do mês atual
  const mostrarNavMes = periodo === "mes";

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-bold">Agenda</h1>
          <p className="text-sm text-suave mt-0.5">
            {periodo === "mes"
              ? `${NOMES_MES_COMPLETO[refMes.getMonth()]} ${refMes.getFullYear()}`
              : `${de} → ${ate}`}
          </p>
        </div>
        {pode("agenda", "criar") && (
          <Botao tamanho="sm" onClick={() => { setDiaSel(null); setNovo(true); }}>
            <Plus className="h-3.5 w-3.5" /> Compromisso
          </Botao>
        )}
      </div>

      {/* Controles: período + navegação mês */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de período */}
          <div className="flex items-center gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors
                  ${periodo === p.id
                    ? "bg-ouro text-navy font-bold"
                    : "text-suave hover:bg-elevado hover:text-primario"}`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>

          {/* Navegação de mês (só no modo "mês") */}
          {mostrarNavMes && (
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => mudarMes(-1)} className="rounded p-1.5 text-suave hover:bg-elevado" aria-label="Mês anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-32 text-center text-sm font-medium capitalize">
                {NOMES_MES[refMes.getMonth()]} {refMes.getFullYear()}
              </span>
              <button onClick={() => mudarMes(1)} className="rounded p-1.5 text-suave hover:bg-elevado" aria-label="Próximo mês">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Filtros por tipo */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="flex items-center gap-1 text-xs text-suave self-center">
            <Filter className="h-3 w-3" /> Exibir:
          </span>
          {TIPOS_FILTRO.map((t) => {
            const est = ESTILO[t.id] ?? PADRAO;
            const ativo = tiposAtivos.size === 0 || tiposAtivos.has(t.id);
            return (
              <button
                key={t.id}
                onClick={() => alternarTipo(t.id)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors
                  ${ativo
                    ? `${est.fundo} ${est.cor}`
                    : "bg-fundo text-mudo opacity-50"}`}
              >
                <est.icone className="h-3 w-3" />
                {t.rotulo}
              </button>
            );
          })}
          {/* "Só os meus" — filtra operações e compromissos pelo usuário logado */}
          <button
            onClick={() => setSoMeus((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ml-2
              ${soMeus
                ? "bg-info/20 text-info"
                : "text-suave hover:bg-elevado hover:text-primario"}`}
          >
            <UserCheck className="h-3 w-3" />
            Só os meus
          </button>
          {tiposAtivos.size > 0 && (
            <button
              onClick={() => setTiposAtivos(new Set())}
              className="rounded-full px-2.5 py-1 text-xs text-suave hover:text-primario underline"
            >
              limpar
            </button>
          )}
        </div>
      </Card>

      {/* Calendário */}
      {isLoading ? (
        <SkeletonLinhas linhas={6} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 gap-px text-center text-[11px] font-semibold uppercase tracking-wider text-mudo border-b border-borda">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-borda">
            {semanas.flat().map((dia) => {
              const k = ymd(dia);
              const itens = porDia.get(k) ?? [];
              const foraMes = dia.getMonth() !== refMes.getMonth();
              const eHoje = k === hoje;
              const noRange = k >= de && k <= ate;
              return (
                <div
                  key={k}
                  className={`min-h-24 bg-painel p-1.5 transition-colors
                    ${foraMes ? "opacity-35" : ""}
                    ${noRange && !foraMes ? "ring-inset ring-1 ring-ouro/20" : ""}
                    ${pode("agenda", "criar") ? "cursor-pointer hover:bg-elevado/40" : ""}`}
                  onClick={() => { if (pode("agenda", "criar")) { setDiaSel(k); setNovo(true); } }}
                >
                  <div className={`mb-1 flex items-center justify-end`}>
                    <span className={`text-xs h-5 w-5 flex items-center justify-center rounded-full
                      ${eHoje ? "bg-ouro text-navy font-bold text-[11px]" : "text-suave"}`}>
                      {dia.getDate()}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {itens.slice(0, 3).map((it, i) => {
                      const est = ESTILO[it.tipo] ?? PADRAO;
                      return <ItemDia key={i} item={it} icone={est.icone} cor={est.cor} />;
                    })}
                    {itens.length > 3 && (
                      <p className="text-[10px] text-mudo pl-1">+{itens.length - 3} mais</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Legenda rápida */}
      <div className="flex flex-wrap gap-3 text-[11px] text-suave">
        {TIPOS_FILTRO.map((t) => {
          const est = ESTILO[t.id] ?? PADRAO;
          return (
            <span key={t.id} className={`flex items-center gap-1 ${est.cor}`}>
              <est.icone className="h-3 w-3" /> {t.rotulo}
            </span>
          );
        })}
      </div>

      {novo && <ModalNovo dia={diaSel} aoFechar={() => setNovo(false)} />}
    </div>
  );
}

function ItemDia({ item, icone: Icone, cor }: { item: ItemAgenda; icone: LucideIcon; cor: string }) {
  const navegar = useNavigate();
  const fila = useQueryClient();
  const notificar = useToast();

  const ir = (e: MouseEvent) => {
    e.stopPropagation();
    if (item.link) navegar(item.link);
    else if (item.manualId && !item.link) {
      // compromisso sem link: alterna concluído
      api.post(`/agenda/${item.manualId}/concluir`).then(() => {
        fila.invalidateQueries({ queryKey: ["agenda"] });
      });
    }
  };

  const remover = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!item.manualId) return;
    await api.delete(`/agenda/${item.manualId}`);
    fila.invalidateQueries({ queryKey: ["agenda"] });
    notificar({ tipo: "ok", titulo: "Compromisso removido" });
  };

  return (
    <div
      onClick={ir}
      title={item.titulo}
      className={`group flex items-center gap-1 rounded px-1 py-0.5 text-[11px] cursor-pointer
        hover:bg-fundo/70 ${item.concluido ? "opacity-50 line-through" : ""}`}
    >
      <Icone className={`h-3 w-3 shrink-0 ${cor}`} />
      <span className="min-w-0 flex-1 truncate">{item.titulo}</span>
      {item.manualId && (
        <>
          {item.concluido && <Check className="h-3 w-3 shrink-0 text-ok" />}
          <button
            onClick={remover}
            className="shrink-0 text-mudo hover:text-erro opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Remover"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

function ModalNovo({ dia, aoFechar }: { dia: string | null; aoFechar: () => void }) {
  const notificar = useToast();
  const fila = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(dia ?? ymd(new Date()));
  const [enviando, setEnviando] = useState(false);

  // Opção: gerar lançamento junto
  const [gerarLanc, setGerarLanc] = useState(false);
  const [tipoLanc, setTipoLanc] = useState<"receita" | "despesa">("despesa");
  const [descLanc, setDescLanc] = useState("");
  const [valorLanc, setValorLanc] = useState("");
  const [vencLanc, setVencLanc] = useState(dia ?? ymd(new Date()));
  const [contaId, setContaId] = useState("");
  const [catId, setCatId] = useState("");

  const { data: contas } = useQuery({
    queryKey: ["contas"],
    queryFn: () => api.get<{ dados: Conta[] }>("/contas").then((r) => r.dados),
    enabled: gerarLanc,
  });
  const { data: categorias } = useQuery({
    queryKey: ["categorias-financeiras"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/categorias-financeiras").then((r) => r.dados),
    enabled: gerarLanc,
  });
  const catsFiltradas = (categorias ?? []).filter((c) => c.tipo === tipoLanc);

  const enviar = async () => {
    setEnviando(true);
    try {
      const body: Record<string, unknown> = {
        titulo, descricao: descricao || null, data_inicio: data, dia_inteiro: true,
      };
      if (gerarLanc && valorLanc && contaId && catId) {
        body.gerar_lancamento = {
          tipo: tipoLanc,
          descricao: descLanc || titulo,
          categoria_id: catId,
          conta_id: contaId,
          valor: parseFloat(valorLanc),
          data_vencimento: vencLanc,
        };
      }
      await api.post("/agenda", body);
      fila.invalidateQueries({ queryKey: ["agenda"] });
      if (gerarLanc) fila.invalidateQueries({ queryKey: ["lancamentos"] });
      notificar({ tipo: "ok", titulo: "Compromisso criado" });
      aoFechar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível criar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  const valido = titulo.trim().length >= 2 && (!gerarLanc || (valorLanc && contaId && catId));

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Novo compromisso">
      <div className="space-y-4">
        <Campo rotulo="Título">
          <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Vistoria do Corolla" autoFocus />
        </Campo>
        <Campo rotulo="Data">
          <Entrada type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <Campo rotulo="Descrição (opcional)">
          <AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
        </Campo>

        {/* Toggle: gerar lançamento financeiro */}
        <div className="rounded-lg border border-borda bg-fundo p-3 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gerarLanc}
              onChange={(e) => setGerarLanc(e.target.checked)}
              className="h-4 w-4 rounded border-borda accent-ouro"
            />
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <ReceiptText className="h-4 w-4 text-suave" />
              Gerar lançamento financeiro junto
            </span>
          </label>

          {gerarLanc && (
            <div className="space-y-3 pt-1">
              <div className="flex gap-2">
                {(["receita", "despesa"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTipoLanc(t); setCatId(""); }}
                    className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors
                      ${tipoLanc === t
                        ? t === "receita" ? "bg-ok/20 text-ok" : "bg-erro/20 text-erro"
                        : "bg-fundo text-suave hover:bg-elevado"}`}
                  >
                    {t === "receita" ? "Receita" : "Despesa"}
                  </button>
                ))}
              </div>
              <Campo rotulo="Descrição do lançamento">
                <Entrada value={descLanc} onChange={(e) => setDescLanc(e.target.value)} placeholder={titulo || "Ex.: Conserto de pneu"} />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Valor (R$)">
                  <Entrada type="number" step="0.01" min="0.01" value={valorLanc} onChange={(e) => setValorLanc(e.target.value)} />
                </Campo>
                <Campo rotulo="Vencimento">
                  <Entrada type="date" value={vencLanc} onChange={(e) => setVencLanc(e.target.value)} />
                </Campo>
              </div>
              <Campo rotulo="Categoria">
                <Selecao value={catId} onChange={(e) => setCatId(e.target.value)}>
                  <option value="">Escolha a categoria</option>
                  {catsFiltradas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Conta">
                <Selecao value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  <option value="">Escolha a conta</option>
                  {(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </Campo>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao onClick={enviar} carregando={enviando} disabled={!valido || enviando}>
            Criar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
