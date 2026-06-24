// Centro de comando da Hallax (doc 01 §1.9). Dois blocos independentes:
// operacional (refetch 30s) e financeiro (refetch ao trocar período).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Scale, CalendarClock, Truck, Wrench,
  AlertTriangle, KeyRound, CarFront, CheckCircle2, Clock, Car,
  BarChart3, ChevronRight,
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
  { valor: "semana", rotulo: "Esta semana" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "ano", rotulo: "Este ano" },
  { valor: "ultimos30", rotulo: "Últimos 30 dias" },
];

// ─── Relógio ao vivo ─────────────────────────────────────────────────────────

function RelogioVivo() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="font-display text-3xl font-bold text-ouro tabular-nums">
        {agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
      <span className="text-xs text-suave">
        {agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
      </span>
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

function SeletorPeriodo({
  valor, onChange,
}: {
  valor: Periodo;
  onChange: (p: Periodo) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {PERIODOS.map((p) => (
        <button
          key={p.valor}
          onClick={() => onChange(p.valor)}
          className={
            `rounded px-2 py-0.5 text-xs font-medium transition-colors ` +
            (valor === p.valor
              ? "bg-ouro/20 text-ouro"
              : "text-mudo hover:text-suave hover:bg-elevado")
          }
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );
}

// ─── Seletor "a vencer" ───────────────────────────────────────────────────────

function SeletorAvencer({
  valor, onChange,
}: {
  valor: Avencer;
  onChange: (v: Avencer) => void;
}) {
  return (
    <div className="flex gap-1">
      {([7, 15, 30] as Avencer[]).map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={
            `rounded px-2 py-0.5 text-xs font-medium transition-colors ` +
            (valor === d
              ? "bg-ouro/20 text-ouro"
              : "text-mudo hover:text-suave hover:bg-elevado")
          }
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

// ─── Skeleton do dashboard ───────────────────────────────────────────────────

function SkeletonDashboard() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export function Dashboard() {
  const nav = useNavigate();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [avencer, setAvencer] = useState<Avencer>(7);

  // Bloco operacional — estável, refetch a cada 30s
  const op = useQuery({
    queryKey: ["dashboard"],
    queryFn: () =>
      api.get<{ dados: DadosOperacional }>("/dashboard").then((r) => r.dados),
    refetchInterval: 30_000,
  });

  // Bloco financeiro — recarrega quando período/avencer muda
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
  if (op.isError || !op.data)
    return <EstadoErro aoTentar={() => op.refetch()} />;

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
      {/* Pendências críticas */}
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
                {financeiro.contas_vencidas.quantidade} conta(s) vencida(s) —{" "}
                {dinheiro(financeiro.contas_vencidas.total)}
              </li>
            )}
            {data.alertas.map((a, i) => {
              const ROTA: Record<string, (id: string) => string> = {
                pessoa: (id) => `/clientes/${id}`,
                ativo: (id) => `/ativos/${id}`,
                operacao: (id) => `/operacoes/${id}`,
                manutencao: (id) => `/manutencoes/${id}`,
              };
              const rota = a.entidade_tipo && a.entidade_id
                ? ROTA[a.entidade_tipo]?.(a.entidade_id)
                : null;
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

      {/* ── Linha 1: KPIs financeiros com seletor de período ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <SeletorPeriodo valor={periodo} onChange={setPeriodo} />
        </div>

        {fin.isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : fin.isError || financeiro == null ? null : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div style={{ animationDelay: "0ms" }} className="animar-surgir">
              <Kpi
                rotulo="Receita"
                valor={dinheiro(receitas)}
                icone={TrendingUp}
                tom="ok"
              />
            </div>
            <div style={{ animationDelay: "40ms" }} className="animar-surgir">
              <Kpi
                rotulo="Despesas"
                valor={dinheiro(despesas)}
                icone={TrendingDown}
                tom="erro"
              />
            </div>
            <div style={{ animationDelay: "80ms" }} className="animar-surgir">
              <Kpi
                rotulo="Lucro estimado"
                valor={dinheiro(lucro)}
                icone={Scale}
                tom={lucro >= 0 ? "ouro" : "erro"}
              />
            </div>
            <div
              style={{ animationDelay: "120ms" }}
              className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-mudo">
                  <CalendarClock className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wider">
                    A vencer
                  </span>
                </div>
                <SeletorAvencer valor={avencer} onChange={setAvencer} />
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-texto">
                {dinheiro(financeiro.a_vencer.total)}
              </p>
              <p className="mt-1 text-xs text-mudo">
                {financeiro.a_vencer.quantidade} lançamento(s) · {avencer} dias
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Linha 2: Frota ── */}
      {data.patrimonio && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* Patrimônio */}
          <div className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel">
            <div className="flex items-center gap-2 text-mudo">
              <CarFront className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Patrimônio</span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ouro">
              {data.patrimonio.total}
            </p>
            <p className="mt-1 text-xs text-mudo">
              {dinheiro(data.patrimonio.valor_patrimonial)} em ativos (FIPE)
            </p>
            <button
              disabled
              className="mt-3 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-mudo border border-borda disabled:opacity-40 cursor-not-allowed"
              title="Em breve"
            >
              <BarChart3 className="h-3 w-3" />
              Relatório de Patrimônio — Em breve
            </button>
          </div>

          {/* Disponíveis */}
          <button
            onClick={() => nav("/ativos?status=disponivel")}
            className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel text-left transition-all hover:border-ok/40 hover:shadow-[0_0_0_1px_rgb(61_214_140/0.2)] group"
          >
            <div className="flex items-center justify-between gap-2 text-mudo">
              <div className="flex items-center gap-2">
                <CarFront className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Disponíveis</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-ok">
              {data.patrimonio.disponiveis}
            </p>
            <p className="mt-1 text-xs text-mudo">Ver ativos disponíveis</p>
          </button>

          {/* Em Operação */}
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
            <p className="mt-2 font-display text-2xl font-bold text-texto">
              {data.patrimonio.em_operacao}
            </p>
            <p className="mt-1 text-xs text-mudo">Ver operações</p>
          </button>

          {/* Em Manutenção */}
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
                <span className="text-xs font-medium uppercase tracking-wider">Em Manutenção</span>
              </div>
              <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className={`mt-2 font-display text-2xl font-bold ${data.patrimonio.em_manutencao > 0 ? "text-alerta" : "text-texto"}`}>
              {data.patrimonio.em_manutencao}
            </p>
            <p className="mt-1 text-xs text-mudo">Ver ativos em manutenção</p>
          </button>
        </div>
      )}

      {/* ── Linha 3: Agenda + Guinchos + Aluguéis em andamento ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Agenda do dia */}
        <Card titulo="Agenda do dia" icone={CalendarClock}>
          <RelogioVivo />
          {data.agenda_do_dia.length === 0 ? (
            <EstadoVazio icone={CheckCircle2} titulo="Dia livre" descricao="Nenhum compromisso para hoje." />
          ) : (
            <ul className="space-y-2.5">
              {data.agenda_do_dia.map((e, i) => (
                <li
                  key={i}
                  className={
                    `flex items-center gap-3 text-sm ` +
                    (e.link
                      ? "cursor-pointer rounded px-1 -mx-1 hover:bg-elevado transition-colors"
                      : "")
                  }
                  onClick={() => e.link && nav(e.link)}
                >
                  <span className="font-display text-xs font-bold text-ouro shrink-0">
                    {horaCurta(e.data_inicio)}
                  </span>
                  <span className={`min-w-0 truncate ${e.concluido ? "text-mudo line-through" : ""}`}>
                    {e.titulo}
                  </span>
                  {e.link && <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-mudo" />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Guinchos em andamento */}
        <Card titulo="Guinchos em andamento" icone={Truck}>
          {data.guinchos_em_andamento.length === 0 ? (
            <EstadoVazio icone={Truck} titulo="Nenhum guincho na rua" />
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
                  <p className="mt-0.5 text-xs text-suave pl-0">
                    {g.origem_endereco} <span className="text-ouro">→</span> {g.destino_endereco}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Aluguéis em andamento */}
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

      {/* ── Linha 4: Reservas + Próximas manutenções ── */}
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
                  <span className="font-display text-xs font-bold text-ouro shrink-0">
                    {dataCurta(r.data_inicio)}
                  </span>
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
                  <span className="font-display text-xs font-bold text-ouro shrink-0">
                    {dataCurta(m.data_agendada)}
                  </span>
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

      {/* ── Linha 5: Fluxo de caixa ── */}
      {financeiro && (
        <Card titulo="Fluxo de caixa · últimos 7 dias" icone={Scale}>
          <div className="overflow-x-auto -mx-1 px-1">
          <div className="grid grid-cols-7 gap-3 min-w-[380px]">
            {financeiro.fluxo_caixa_7d.map((d) => {
              const receitas = Number(d.receitas);
              const despesas = Number(d.despesas);
              const max = Math.max(
                ...financeiro.fluxo_caixa_7d.map((x) =>
                  Math.max(Number(x.receitas), Number(x.despesas))
                ),
                1
              );
              const isHoje =
                new Date(d.dia).toDateString() === new Date().toDateString();
              return (
                <div key={d.dia} className="flex flex-col gap-1">
                  {/* Barras */}
                  <div className="flex h-24 items-end justify-center gap-1">
                    <div
                      className="w-4 rounded-t transition-all"
                      style={{
                        height: `${(receitas / max) * 100}%`,
                        background: "rgb(61 214 140 / 0.7)",
                      }}
                    />
                    <div
                      className="w-4 rounded-t transition-all"
                      style={{
                        height: `${(despesas / max) * 100}%`,
                        background: "rgb(240 80 110 / 0.6)",
                      }}
                    />
                  </div>
                  {/* Valores explícitos */}
                  <div className="space-y-0.5 text-center">
                    {receitas > 0 && (
                      <p className="text-[10px] font-semibold text-ok leading-tight">
                        {dinheiro(receitas)}
                      </p>
                    )}
                    {despesas > 0 && (
                      <p className="text-[10px] font-semibold text-erro leading-tight">
                        {dinheiro(despesas)}
                      </p>
                    )}
                    {receitas === 0 && despesas === 0 && (
                      <p className="text-[10px] text-mudo leading-tight">—</p>
                    )}
                  </div>
                  {/* Data */}
                  <p className={`text-center text-[10px] ${isHoje ? "text-ouro font-bold" : "text-mudo"}`}>
                    {new Date(d.dia).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </p>
                </div>
              );
            })}
          </div>
          </div>
          {/* Legenda */}
          <div className="mt-3 flex items-center gap-4 text-xs text-mudo">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-ok/70" />
              Receitas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-erro/60" />
              Despesas
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
