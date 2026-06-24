// Centro de comando da Hallax (doc 01 §1.9). Dois blocos independentes:
// operacional (refetch 30s) e financeiro (refetch ao trocar período).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Scale, CalendarClock, Truck, Wrench,
  AlertTriangle, KeyRound, CarFront, CheckCircle2, Clock, Car,
  BarChart3, ChevronRight, MapPin,
} from "lucide-react";
import { api } from "../api";
import {
  Card, Kpi, Selo, dinheiro, dataCurta, horaCurta,
  Skeleton, EstadoVazio, EstadoErro,
} from "../componentes/ui";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Periodo = "hoje" | "semana" | "mes" | "ano" | "ultimos30";
type Avencer = 7 | 15 | 30;

interface DadosOperacional {
  patrimonio: {
    total: number;
    valor_patrimonial: string;
    disponiveis: number;
    em_operacao: number;
    em_manutencao: number;
  } | null;
  guinchos_em_andamento: Array<{
    id: string; codigo: string; cliente: string; status: string;
    data_inicio: string; origem_endereco: string; destino_endereco: string;
  }>;
  locacoes_em_andamento: Array<{
    id: string; codigo: string; cliente: string; ativo: string; data_inicio: string;
  }>;
  agenda_do_dia: Array<{
    id: string | null; titulo: string; data_inicio: string; concluido: boolean;
    link?: string;
  }>;
  proximas_manutencoes: Array<{
    id: string; ativo: string; descricao: string; data_agendada: string;
  }>;
  reservas_futuras: Array<{
    id: string; codigo: string; cliente: string; ativo: string; data_inicio: string;
  }>;
  locacoes_atrasadas: number;
  alertas: Array<{ tipo: string; texto: string; entidade_id?: string; entidade_tipo?: string }>;
}

interface DadosFinanceiro {
  receitas: string;
  despesas: string;
  fluxo_caixa_7d: Array<{ dia: string; receitas: string; despesas: string }>;
  contas_vencidas: { quantidade: number; total: string };
  a_vencer: { quantidade: number; total: string };
}

// ─── Labels de período ───────────────────────────────────────────────────────

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "ano", rotulo: "Ano" },
  { valor: "ultimos30", rotulo: "30 dias" },
];

// ─── Relógio hero ────────────────────────────────────────────────────────────

function RelogioHero() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hms = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const data = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-4xl font-extrabold text-ouro tabular-nums leading-none tracking-tight">
        {hms}
      </span>
      <span className="text-xs text-suave capitalize">{data}</span>
    </div>
  );
}

// ─── Contador de tempo em andamento ──────────────────────────────────────────

function TempoDecorrido({ desde }: { desde: string }) {
  const [seg, setSeg] = useState(() => {
    const diff = Math.floor((Date.now() - new Date(desde).getTime()) / 1000);
    return Math.max(0, diff);
  });
  useEffect(() => {
    const id = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return <span className="tabular-nums text-xs text-mudo">{h}h{String(m).padStart(2, "0")}m</span>;
  return <span className="tabular-nums text-xs text-mudo">{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>;
}

// ─── Seletor de período ───────────────────────────────────────────────────────

function SeletorPeriodo({ valor, onChange }: { valor: Periodo; onChange: (p: Periodo) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PERIODOS.map((p) => (
        <button
          key={p.valor}
          onClick={() => onChange(p.valor)}
          className={
            `rounded px-2.5 py-1 text-xs font-medium transition-colors ` +
            (valor === p.valor ? "bg-ouro/20 text-ouro" : "text-mudo hover:text-suave hover:bg-elevado")
          }
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );
}

// ─── Seletor "a vencer" ───────────────────────────────────────────────────────

function SeletorAvencer({ valor, onChange }: { valor: Avencer; onChange: (v: Avencer) => void }) {
  return (
    <div className="flex gap-1">
      {([7, 15, 30] as Avencer[]).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={
            `rounded px-2 py-0.5 text-xs font-medium transition-colors ` +
            (valor === d ? "bg-ouro/20 text-ouro" : "text-mudo hover:text-suave hover:bg-elevado")
          }
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

// ─── Mapa interativo (OpenStreetMap embed) ────────────────────────────────────
// Centralizado em Dourados – MS, Brasil.

function MapaDourados({ guinchos }: { guinchos: number }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-borda/60 bg-painel shadow-painel">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 border-b border-borda px-4 py-3">
        <MapPin className="h-4 w-4 text-ouro" />
        <span className="text-sm font-semibold text-texto">Dourados — MS</span>
        {guinchos > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-ouro/30 bg-ouro/10 px-2.5 py-0.5 text-xs font-semibold text-ouro">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ouro opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ouro" />
            </span>
            {guinchos} guincho{guinchos !== 1 ? "s" : ""} na rua
          </span>
        )}
      </div>
      {/* iframe do OpenStreetMap */}
      <div className="relative h-64 md:h-80">
        <iframe
          title="Mapa Dourados MS"
          src="https://www.openstreetmap.org/export/embed.html?bbox=-54.9%2C-22.35%2C-54.7%2C-22.15&layer=mapnik&marker=-22.2216%2C-54.8056"
          className="h-full w-full border-0"
          style={{ filter: "invert(90%) hue-rotate(200deg) saturate(0.6) brightness(0.85)" }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        {/* Overlay de gradiente nas bordas para integrar com o tema */}
        <div className="pointer-events-none absolute inset-0 rounded-b-xl ring-1 ring-inset ring-ouro/10" />
      </div>
    </div>
  );
}

// ─── Mini-gráfico de barra inline ────────────────────────────────────────────

function MiniBarras({ dados }: { dados: Array<{ dia: string; receitas: string; despesas: string }> }) {
  const max = Math.max(
    ...dados.map((d) => Math.max(Number(d.receitas), Number(d.despesas))),
    1,
  );
  return (
    <div className="flex items-end gap-1 h-10">
      {dados.map((d) => {
        const r = Number(d.receitas);
        const e = Number(d.despesas);
        const isHoje = new Date(d.dia).toDateString() === new Date().toDateString();
        return (
          <div key={d.dia} className="flex flex-1 items-end gap-px">
            <div
              className="w-full rounded-sm transition-all"
              style={{ height: `${(r / max) * 100}%`, background: isHoje ? "rgb(61 214 140)" : "rgb(61 214 140 / 0.5)" }}
            />
            <div
              className="w-full rounded-sm transition-all"
              style={{ height: `${(e / max) * 100}%`, background: isHoje ? "rgb(240 80 110)" : "rgb(240 80 110 / 0.4)" }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton do dashboard ───────────────────────────────────────────────────

function SkeletonDashboard() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export function Dashboard() {
  const nav = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [avencer, setAvencer] = useState<Avencer>(7);

  const op = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<{ dados: DadosOperacional }>("/dashboard").then((r) => r.dados),
    refetchInterval: 30_000,
  });

  const fin = useQuery({
    queryKey: ["dashboard/financeiro", periodo, avencer],
    queryFn: () =>
      api
        .get<{ dados: DadosFinanceiro | null }>(
          `/dashboard/financeiro?periodo=${periodo}&avencer=${avencer}`
        )
        .then((r) => r.dados),
  });

  if (op.isLoading) return <SkeletonDashboard />;
  if (op.isError || !op.data) return <EstadoErro aoTentar={() => op.refetch()} />;

  const data = op.data;
  const financeiro = fin.data;
  const receitas = financeiro ? Number(financeiro.receitas) : 0;
  const despesas = financeiro ? Number(financeiro.despesas) : 0;
  const lucro = receitas - despesas;

  const temAtencao =
    data.locacoes_atrasadas > 0 ||
    data.alertas.length > 0 ||
    (financeiro?.contas_vencidas.quantidade ?? 0) > 0;

  return (
    <div className="space-y-4">

      {/* ── Hero: Relógio + Resumo rápido ── */}
      <div className="rounded-xl border border-ouro/20 bg-gradient-to-br from-painel to-elevado p-5 shadow-painel">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <RelogioHero />
          {financeiro && (
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-mudo uppercase tracking-wider">Receita {PERIODOS.find((p) => p.valor === periodo)?.rotulo}</p>
                <p className="font-display text-xl font-bold text-ok">{dinheiro(receitas)}</p>
              </div>
              <div className="h-8 w-px bg-borda" />
              <div className="text-right">
                <p className="text-xs text-mudo uppercase tracking-wider">Despesas</p>
                <p className="font-display text-xl font-bold text-erro">{dinheiro(despesas)}</p>
              </div>
              <div className="h-8 w-px bg-borda" />
              <div className="text-right">
                <p className="text-xs text-mudo uppercase tracking-wider">Resultado</p>
                <p className={`font-display text-xl font-bold ${lucro >= 0 ? "text-ouro" : "text-erro"}`}>
                  {dinheiro(lucro)}
                </p>
              </div>
            </div>
          )}
        </div>
        {/* Mini barras de fluxo */}
        {financeiro?.fluxo_caixa_7d && financeiro.fluxo_caixa_7d.length > 0 && (
          <div className="mt-4">
            <MiniBarras dados={financeiro.fluxo_caixa_7d} />
            <p className="mt-1 text-[10px] text-mudo">Fluxo 7 dias — verde: receita · vermelho: despesa</p>
          </div>
        )}
      </div>

      {/* ── Alertas ── */}
      {temAtencao && (
        <Card titulo="Atenção agora" icone={AlertTriangle} className="border-alerta/30">
          <ul className="space-y-1.5 text-sm">
            {data.locacoes_atrasadas > 0 && (
              <li className="flex items-center gap-2 text-erro">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {data.locacoes_atrasadas} locação(ões) com devolução atrasada
              </li>
            )}
            {financeiro && financeiro.contas_vencidas.quantidade > 0 && (
              <li className="flex items-center gap-2 text-erro">
                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                {financeiro.contas_vencidas.quantidade} conta(s) vencida(s) — {dinheiro(financeiro.contas_vencidas.total)}
              </li>
            )}
            {data.alertas.map((a, i) => {
              const ROTA: Record<string, (id: string) => string> = {
                pessoa: (id) => `/clientes/${id}`,
                ativo: (id) => `/ativos/${id}`,
                operacao: (id) => `/operacoes/${id}`,
                manutencao: (id) => `/manutencoes/${id}`,
              };
              const rota = a.entidade_tipo && a.entidade_id ? ROTA[a.entidade_tipo]?.(a.entidade_id) : null;
              return (
                <li key={i} className="flex items-center gap-2 text-alerta">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-sm">{a.texto}</span>
                  {rota && (
                    <button
                      onClick={() => nav(rota)}
                      className="shrink-0 rounded px-2 py-0.5 text-xs text-suave transition-colors hover:bg-elevado hover:text-ouro"
                    >
                      Ver →
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── KPIs financeiros + seletor de período ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <SeletorPeriodo valor={periodo} onChange={setPeriodo} />
        </div>

        {fin.isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : fin.isError || financeiro == null ? null : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <button
              onClick={() => nav("/financeiro?tipo=receita&status=pago")}
              className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel text-left transition-all hover:border-ok/40 group"
              style={{ animationDelay: "0ms" }}
            >
              <div className="flex items-center justify-between text-mudo">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-ok" />
                  <span className="text-xs font-medium uppercase tracking-wider">Receita</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-ok">{dinheiro(receitas)}</p>
              <p className="mt-1 text-xs text-mudo">receitas pagas</p>
            </button>

            <button
              onClick={() => nav("/financeiro?tipo=despesa&status=pago")}
              className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel text-left transition-all hover:border-erro/40 group"
              style={{ animationDelay: "40ms" }}
            >
              <div className="flex items-center justify-between text-mudo">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-erro" />
                  <span className="text-xs font-medium uppercase tracking-wider">Despesas</span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-erro">{dinheiro(despesas)}</p>
              <p className="mt-1 text-xs text-mudo">despesas pagas</p>
            </button>

            <div
              className="animar-surgir rounded-lg border bg-painel p-4 shadow-painel"
              style={{
                animationDelay: "80ms",
                borderColor: lucro >= 0 ? "rgb(var(--color-ouro) / 0.25)" : "rgb(var(--color-erro) / 0.25)",
              }}
            >
              <div className="flex items-center gap-2 text-mudo">
                <Scale className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Resultado</span>
              </div>
              <p className={`mt-2 font-display text-2xl font-bold ${lucro >= 0 ? "text-ouro" : "text-erro"}`}>
                {dinheiro(lucro)}
              </p>
              <p className="mt-1 text-xs text-mudo">{lucro >= 0 ? "lucro estimado" : "prejuízo estimado"}</p>
            </div>

            <div
              className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel"
              style={{ animationDelay: "120ms" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-mudo">
                  <CalendarClock className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">A vencer</span>
                </div>
                <SeletorAvencer valor={avencer} onChange={setAvencer} />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-texto">
                {dinheiro(financeiro.a_vencer.total)}
              </p>
              <p className="mt-1 text-xs text-mudo">
                {financeiro.a_vencer.quantidade} lançamento(s) · {avencer}d
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Frota ── */}
      {data.patrimonio && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel">
            <div className="flex items-center gap-2 text-mudo">
              <CarFront className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Patrimônio</span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ouro">{data.patrimonio.total}</p>
            <p className="mt-1 text-xs text-mudo">{dinheiro(data.patrimonio.valor_patrimonial)} em ativos (FIPE)</p>
            <button
              disabled
              className="mt-3 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-mudo border border-borda disabled:opacity-40 cursor-not-allowed"
              title="Em breve"
            >
              <BarChart3 className="h-3 w-3" />
              Relatório — Em breve
            </button>
          </div>

          <button
            onClick={() => nav("/ativos?status=disponivel")}
            className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel text-left transition-all hover:border-ok/40 group"
          >
            <div className="flex items-center justify-between gap-2 text-mudo">
              <div className="flex items-center gap-2">
                <CarFront className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Disponíveis</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ok">{data.patrimonio.disponiveis}</p>
            <p className="mt-1 text-xs text-mudo">Ver ativos →</p>
          </button>

          <button
            onClick={() => nav("/operacoes?status=ativa")}
            className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel text-left transition-all hover:border-info/40 group"
          >
            <div className="flex items-center justify-between gap-2 text-mudo">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Em Operação</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-texto">{data.patrimonio.em_operacao}</p>
            <p className="mt-1 text-xs text-mudo">Ver operações →</p>
          </button>

          <button
            onClick={() => nav("/ativos?status=em_manutencao")}
            className={
              `animar-surgir rounded-lg border bg-painel p-4 shadow-painel text-left ` +
              `transition-all hover:border-alerta/40 group ` +
              (data.patrimonio.em_manutencao > 0 ? "border-alerta/20" : "border-borda")
            }
          >
            <div className="flex items-center justify-between gap-2 text-mudo">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Manutenção</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className={`mt-2 font-display text-2xl font-bold ${data.patrimonio.em_manutencao > 0 ? "text-alerta" : "text-texto"}`}>
              {data.patrimonio.em_manutencao}
            </p>
            <p className="mt-1 text-xs text-mudo">Ver ativos →</p>
          </button>
        </div>
      )}

      {/* ── Mapa + Agenda lado a lado ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <MapaDourados guinchos={data.guinchos_em_andamento.length} />

        <Card titulo="Agenda do dia" icone={CalendarClock}>
          {data.agenda_do_dia.length === 0 ? (
            <EstadoVazio icone={CheckCircle2} titulo="Dia livre" descricao="Nenhum compromisso para hoje." />
          ) : (
            <ul className="space-y-2.5">
              {data.agenda_do_dia.map((e, i) => (
                <li
                  key={i}
                  className={
                    `flex items-center gap-3 text-sm ` +
                    (e.link ? "cursor-pointer rounded px-1 -mx-1 hover:bg-elevado transition-colors" : "")
                  }
                  onClick={() => e.link && nav(e.link)}
                >
                  <span className="font-display text-xs font-bold text-ouro shrink-0">{horaCurta(e.data_inicio)}</span>
                  <span className={`min-w-0 truncate ${e.concluido ? "text-mudo line-through" : ""}`}>{e.titulo}</span>
                  {e.link && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-mudo" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Guinchos + Aluguéis ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card titulo="Guinchos na rua" icone={Truck}>
          {data.guinchos_em_andamento.length === 0 ? (
            <EstadoVazio icone={Truck} titulo="Nenhum guincho em andamento" />
          ) : (
            <ul className="space-y-3">
              {data.guinchos_em_andamento.map((g) => (
                <li
                  key={g.id}
                  className="cursor-pointer rounded px-1 -mx-1 hover:bg-elevado transition-colors"
                  onClick={() => nav(`/operacoes/${g.id}`)}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-display text-xs font-bold text-ouro">{g.codigo}</span>
                    <span className="truncate">{g.cliente}</span>
                    <Selo tom={g.status}>{g.status.replace(/_/g, " ")}</Selo>
                    <TempoDecorrido desde={g.data_inicio ?? new Date().toISOString()} />
                    <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-mudo" />
                  </div>
                  <p className="mt-0.5 text-xs text-suave">
                    {g.origem_endereco} <span className="text-ouro">→</span> {g.destino_endereco}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Aluguéis em andamento" icone={Car}>
          {data.locacoes_em_andamento.length === 0 ? (
            <EstadoVazio icone={Car} titulo="Nenhuma locação ativa" />
          ) : (
            <ul className="space-y-3">
              {data.locacoes_em_andamento.map((l) => (
                <li
                  key={l.id}
                  className="cursor-pointer rounded px-1 -mx-1 hover:bg-elevado transition-colors"
                  onClick={() => nav(`/operacoes/${l.id}`)}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-display text-xs font-bold text-ouro">{l.codigo}</span>
                    <span className="truncate">{l.cliente}</span>
                    <TempoDecorrido desde={l.data_inicio} />
                    <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-mudo" />
                  </div>
                  <p className="mt-0.5 text-xs text-suave">{l.ativo}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Reservas + Manutenções ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card titulo="Reservas futuras" icone={KeyRound}>
          {data.reservas_futuras.length === 0 ? (
            <EstadoVazio icone={KeyRound} titulo="Sem reservas no horizonte" />
          ) : (
            <ul className="space-y-2.5">
              {data.reservas_futuras.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 text-sm cursor-pointer rounded px-1 -mx-1 hover:bg-elevado transition-colors"
                  onClick={() => nav(`/operacoes/${r.id}`)}
                >
                  <span className="font-display text-xs font-bold text-ouro shrink-0">{dataCurta(r.data_inicio)}</span>
                  <span className="min-w-0 truncate">
                    {r.ativo} <span className="text-suave">· {r.cliente}</span>
                  </span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-mudo" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Próximas manutenções" icone={Wrench}>
          {data.proximas_manutencoes.length === 0 ? (
            <EstadoVazio icone={Wrench} titulo="Nada agendado" descricao="Nenhuma manutenção nos próximos 14 dias." />
          ) : (
            <ul className="space-y-2.5">
              {data.proximas_manutencoes.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 text-sm cursor-pointer rounded px-1 -mx-1 hover:bg-elevado transition-colors"
                  onClick={() => nav(`/manutencoes/${m.id}`)}
                >
                  <span className="font-display text-xs font-bold text-ouro shrink-0">{dataCurta(m.data_agendada)}</span>
                  <span className="min-w-0 truncate">
                    {m.ativo} <span className="text-suave">— {m.descricao}</span>
                  </span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-mudo" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

    </div>
  );
}
