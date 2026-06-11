// O centro de comando da Hallax: fotografia completa do dia em uma tela.
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Scale, CalendarClock, Truck, Wrench,
  AlertTriangle, KeyRound, CarFront, CheckCircle2, Clock,
} from "lucide-react";
import { api } from "../api";
import {
  Card, Kpi, Selo, dinheiro, dataCurta, horaCurta,
  Skeleton, EstadoVazio, EstadoErro,
} from "../componentes/ui";

interface DadosDashboard {
  ativos_por_status: Record<string, number> | null;
  guinchos_em_andamento: Array<{
    codigo: string; cliente: string; status: string; origem_endereco: string; destino_endereco: string;
  }>;
  agenda_do_dia: Array<{ titulo: string; data_inicio: string; concluido: boolean }>;
  proximas_manutencoes: Array<{ ativo: string; descricao: string; data_agendada: string }>;
  reservas_futuras: Array<{ codigo: string; cliente: string; ativo: string; data_inicio: string }>;
  locacoes_atrasadas: number;
  alertas: Array<{ tipo: string; texto: string }>;
  financeiro: null | {
    receitas_dia: string;
    despesas_dia: string;
    fluxo_caixa_7d: Array<{ dia: string; receitas: string; despesas: string }>;
    contas_vencidas: { quantidade: number; total: string };
    a_vencer_7d: { quantidade: number; total: string };
  };
}

const ROTULOS_STATUS: Record<string, string> = {
  disponivel: "disponíveis", reservado: "reservados", alugado: "alugados",
  em_manutencao: "em manutenção", em_uso_interno: "em uso interno",
  vendido: "vendidos", baixado: "baixados",
};

function SkeletonDashboard() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<{ dados: DadosDashboard }>("/dashboard").then((r) => r.dados),
    refetchInterval: 30_000,
  });

  if (isLoading) return <SkeletonDashboard />;
  if (isError || !data) return <EstadoErro aoTentar={() => refetch()} />;

  const fin = data.financeiro;
  const lucroDia = fin ? Number(fin.receitas_dia) - Number(fin.despesas_dia) : 0;
  const temAtencao =
    data.locacoes_atrasadas > 0 || data.alertas.length > 0 || (fin?.contas_vencidas.quantidade ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Pendências críticas — primeiro, sempre */}
      {temAtencao && (
        <Card titulo="Atenção agora" icone={AlertTriangle} className="border-alerta/30">
          <ul className="space-y-1.5 text-sm">
            {data.locacoes_atrasadas > 0 && (
              <li className="flex items-center gap-2 text-erro">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {data.locacoes_atrasadas} locação(ões) com devolução atrasada
              </li>
            )}
            {fin && fin.contas_vencidas.quantidade > 0 && (
              <li className="flex items-center gap-2 text-erro">
                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                {fin.contas_vencidas.quantidade} conta(s) vencida(s) somando {dinheiro(fin.contas_vencidas.total)}
              </li>
            )}
            {data.alertas.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-alerta">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {a.texto}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Indicadores financeiros do dia */}
      {fin && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi rotulo="Receita hoje" valor={dinheiro(fin.receitas_dia)} icone={TrendingUp} tom="ok" />
          <Kpi rotulo="Despesa hoje" valor={dinheiro(fin.despesas_dia)} icone={TrendingDown} tom="erro" />
          <Kpi
            rotulo="Lucro estimado hoje"
            valor={dinheiro(lucroDia)}
            icone={Scale}
            tom={lucroDia >= 0 ? "ouro" : "erro"}
          />
          <Kpi
            rotulo="A vencer · 7 dias"
            valor={dinheiro(fin.a_vencer_7d.total)}
            icone={CalendarClock}
            detalhe={`${fin.a_vencer_7d.quantidade} lançamento(s)`}
          />
        </div>
      )}

      {/* Frota / patrimônio em um relance */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Object.entries(data.ativos_por_status ?? {}).map(([status, total]) => (
          <Kpi
            key={status}
            rotulo={`Ativos ${ROTULOS_STATUS[status] ?? status}`}
            valor={total}
            icone={status === "alugado" ? KeyRound : CarFront}
            tom={status === "disponivel" ? "ok" : "neutro"}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card titulo="Agenda do dia" icone={CalendarClock}>
          {data.agenda_do_dia.length === 0 ? (
            <EstadoVazio icone={CheckCircle2} titulo="Dia livre" descricao="Nenhum compromisso para hoje." />
          ) : (
            <ul className="space-y-2.5">
              {data.agenda_do_dia.map((e, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="font-display text-xs font-bold text-ouro">{horaCurta(e.data_inicio)}</span>
                  <span className={e.concluido ? "text-mudo line-through" : ""}>{e.titulo}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Guinchos em andamento" icone={Truck}>
          {data.guinchos_em_andamento.length === 0 ? (
            <EstadoVazio icone={Truck} titulo="Nenhum guincho na rua" />
          ) : (
            <ul className="space-y-3">
              {data.guinchos_em_andamento.map((g) => (
                <li key={g.codigo} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-xs font-bold text-ouro">{g.codigo}</span>
                    <span>{g.cliente}</span>
                    <Selo tom={g.status}>{g.status.replace(/_/g, " ")}</Selo>
                  </div>
                  <p className="mt-0.5 text-xs text-suave">
                    {g.origem_endereco} <span className="text-ouro">→</span> {g.destino_endereco}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Reservas futuras" icone={KeyRound}>
          {data.reservas_futuras.length === 0 ? (
            <EstadoVazio icone={KeyRound} titulo="Sem reservas no horizonte" />
          ) : (
            <ul className="space-y-2.5">
              {data.reservas_futuras.map((r) => (
                <li key={r.codigo} className="flex items-center gap-3 text-sm">
                  <span className="font-display text-xs font-bold text-ouro">{dataCurta(r.data_inicio)}</span>
                  <span className="min-w-0 truncate">
                    {r.ativo} <span className="text-suave">· {r.cliente}</span>
                  </span>
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
              {data.proximas_manutencoes.map((m, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="font-display text-xs font-bold text-ouro">{dataCurta(m.data_agendada)}</span>
                  <span className="min-w-0 truncate">
                    {m.ativo} <span className="text-suave">— {m.descricao}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Fluxo de caixa */}
      {fin && (
        <Card titulo="Fluxo de caixa · últimos 7 dias" icone={Scale}>
          <div className="grid grid-cols-7 gap-2">
            {fin.fluxo_caixa_7d.map((d) => {
              const receitas = Number(d.receitas);
              const despesas = Number(d.despesas);
              const max = Math.max(
                ...fin.fluxo_caixa_7d.map((x) => Math.max(Number(x.receitas), Number(x.despesas))),
                1
              );
              return (
                <div key={d.dia} className="group text-center">
                  <div className="flex h-28 items-end justify-center gap-1">
                    <div
                      className="w-3.5 rounded-t-sm bg-ok/60 transition-colors group-hover:bg-ok"
                      style={{ height: `${(receitas / max) * 100}%` }}
                      title={`Receitas: ${dinheiro(receitas)}`}
                    />
                    <div
                      className="w-3.5 rounded-t-sm bg-erro/50 transition-colors group-hover:bg-erro"
                      style={{ height: `${(despesas / max) * 100}%` }}
                      title={`Despesas: ${dinheiro(despesas)}`}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-mudo">
                    {new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
