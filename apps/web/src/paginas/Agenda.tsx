// Agenda: calendário mensal. Eventos derivados das origens (devoluções,
// manutenções, vencimentos, CNH/documentos) + compromissos manuais.
import { useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Plus, Truck, Wrench, CircleDollarSign,
  IdCard, FileText, CalendarClock, Check, Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Botao, Card, Modal, Campo, Entrada, AreaTexto, useToast, SkeletonLinhas } from "../componentes/ui";

interface ItemAgenda {
  tipo: string; titulo: string; data: string;
  link: string | null; manualId: string | null; concluido: boolean;
}

const PADRAO = { icone: CalendarClock, cor: "text-suave" };
const ESTILO: Record<string, { icone: LucideIcon; cor: string }> = {
  devolucao: { icone: Truck, cor: "text-info" },
  manutencao: { icone: Wrench, cor: "text-alerta" },
  vencimento: { icone: CircleDollarSign, cor: "text-ouro" },
  cnh: { icone: IdCard, cor: "text-erro" },
  documento: { icone: FileText, cor: "text-erro" },
  compromisso: PADRAO,
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function Agenda() {
  const { pode } = useAuth();
  const [refMes, setRefMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [novo, setNovo] = useState(false);
  const [diaSel, setDiaSel] = useState<string | null>(null);

  // Grade do mês: começa no domingo da semana do dia 1
  const { de, ate, semanas } = useMemo(() => {
    const inicio = new Date(refMes.getFullYear(), refMes.getMonth(), 1);
    const fim = new Date(refMes.getFullYear(), refMes.getMonth() + 1, 0);
    const gridIni = new Date(inicio); gridIni.setDate(1 - inicio.getDay());
    const gridFim = new Date(fim); gridFim.setDate(fim.getDate() + (6 - fim.getDay()));
    const dias: Date[] = [];
    for (let d = new Date(gridIni); d <= gridFim; d.setDate(d.getDate() + 1)) dias.push(new Date(d));
    const sem: Date[][] = [];
    for (let i = 0; i < dias.length; i += 7) sem.push(dias.slice(i, i + 7));
    return { de: ymd(gridIni), ate: ymd(gridFim), semanas: sem };
  }, [refMes]);

  const { data, isLoading } = useQuery({
    queryKey: ["agenda", de, ate],
    queryFn: () => api.get<{ dados: ItemAgenda[] }>(`/agenda?de=${de}&ate=${ate}`).then((r) => r.dados),
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
  const mudarMes = (n: number) => setRefMes(new Date(refMes.getFullYear(), refMes.getMonth() + n, 1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-lg font-bold">Agenda</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => mudarMes(-1)} className="rounded-md p-1.5 text-suave hover:bg-elevado" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-40 text-center text-sm font-medium capitalize">{NOMES_MES[refMes.getMonth()]} {refMes.getFullYear()}</span>
          <button onClick={() => mudarMes(1)} className="rounded-md p-1.5 text-suave hover:bg-elevado" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {pode("agenda", "criar") && (
          <Botao tamanho="sm" className="ml-auto" onClick={() => { setDiaSel(null); setNovo(true); }}>
            <Plus className="h-3.5 w-3.5" /> Compromisso
          </Botao>
        )}
      </div>

      {isLoading ? (
        <SkeletonLinhas linhas={6} />
      ) : (
        <Card>
          <div className="grid grid-cols-7 gap-px text-center text-xs font-semibold uppercase tracking-wider text-mudo">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((d) => <div key={d} className="pb-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md bg-borda">
            {semanas.flat().map((dia) => {
              const k = ymd(dia);
              const itens = porDia.get(k) ?? [];
              const foraMes = dia.getMonth() !== refMes.getMonth();
              return (
                <div
                  key={k}
                  className={`min-h-24 cursor-pointer bg-painel p-1.5 transition-colors hover:bg-elevado/50 ${foraMes ? "opacity-40" : ""}`}
                  onClick={() => { if (pode("agenda", "criar")) { setDiaSel(k); setNovo(true); } }}
                >
                  <div className={`mb-1 text-right text-xs ${k === hoje ? "font-bold text-ouro" : "text-suave"}`}>{dia.getDate()}</div>
                  <div className="space-y-0.5">
                    {itens.slice(0, 4).map((it, i) => {
                      const est = ESTILO[it.tipo] ?? PADRAO;
                      return (
                        <ItemDia key={i} item={it} icone={est.icone} cor={est.cor} />
                      );
                    })}
                    {itens.length > 4 && <p className="text-[10px] text-mudo">+{itens.length - 4} mais</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {novo && <ModalNovo dia={diaSel} aoFechar={() => setNovo(false)} />}
    </div>
  );
}

function ItemDia({ item, icone: Icone, cor }: { item: ItemAgenda; icone: LucideIcon; cor: string }) {
  const navegar = useNavigate();
  const fila = useQueryClient();
  const notificar = useToast();

  const alternar = async (e: MouseEvent) => {
    e.stopPropagation();
    if (item.manualId) {
      await api.post(`/agenda/${item.manualId}/concluir`);
      fila.invalidateQueries({ queryKey: ["agenda"] });
    } else if (item.link) navegar(item.link);
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
      onClick={alternar}
      title={item.titulo}
      className={`group flex items-center gap-1 rounded px-1 py-0.5 text-[11px] hover:bg-fundo/60 ${item.concluido ? "opacity-50 line-through" : ""}`}
    >
      <Icone className={`h-3 w-3 shrink-0 ${cor}`} />
      <span className="min-w-0 flex-1 truncate">{item.titulo}</span>
      {item.manualId && (
        <>
          {item.concluido ? <Check className="h-3 w-3 shrink-0 text-ok" /> : null}
          <button onClick={remover} className="hidden shrink-0 text-mudo hover:text-erro group-hover:block" aria-label="Remover"><Trash2 className="h-3 w-3" /></button>
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

  const enviar = async () => {
    setEnviando(true);
    try {
      await api.post("/agenda", { titulo, descricao: descricao || null, data_inicio: data, dia_inteiro: true });
      fila.invalidateQueries({ queryKey: ["agenda"] });
      notificar({ tipo: "ok", titulo: "Compromisso criado" });
      aoFechar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível criar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Novo compromisso">
      <div className="space-y-4">
        <Campo rotulo="Título"><Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Vistoria do Corolla" /></Campo>
        <Campo rotulo="Data"><Entrada type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Descrição (opcional)"><AreaTexto value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao onClick={enviar} carregando={enviando} disabled={titulo.trim().length < 2 || enviando}>Criar</Botao>
        </div>
      </div>
    </Modal>
  );
}
