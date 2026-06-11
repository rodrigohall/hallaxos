import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Card, Selo, dinheiro, dataHora, dataCurta } from "../componentes/ui";

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
  disponivel: "Disponíveis", reservado: "Reservados", alugado: "Alugados",
  em_manutencao: "Em manutenção", em_uso_interno: "Em uso interno",
  vendido: "Vendidos", baixado: "Baixados",
};

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<{ dados: DadosDashboard }>("/dashboard").then((r) => r.dados),
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-suave">Carregando o dia…</p>;
  if (!data) return null;

  const fin = data.financeiro;

  return (
    <div className="space-y-4">
      {(data.locacoes_atrasadas > 0 || data.alertas.length > 0 || (fin && fin.contas_vencidas.quantidade > 0)) && (
        <Card titulo="Atenção agora">
          <ul className="space-y-1 text-sm">
            {data.locacoes_atrasadas > 0 && (
              <li className="text-erro">⏰ {data.locacoes_atrasadas} locação(ões) com devolução atrasada</li>
            )}
            {fin && fin.contas_vencidas.quantidade > 0 && (
              <li className="text-erro">
                💸 {fin.contas_vencidas.quantidade} conta(s) vencida(s) — {dinheiro(fin.contas_vencidas.total)}
              </li>
            )}
            {data.alertas.map((a, i) => (
              <li key={i} className="text-alerta">⚠️ {a.texto}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Object.entries(data.ativos_por_status ?? {}).map(([status, total]) => (
          <Card key={status}>
            <p className="text-3xl font-bold">{total}</p>
            <Selo tom={status}>{ROTULOS_STATUS[status] ?? status}</Selo>
          </Card>
        ))}
      </div>

      {fin && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card titulo="Receitas hoje">
            <p className="text-2xl font-bold text-ok">{dinheiro(fin.receitas_dia)}</p>
          </Card>
          <Card titulo="Despesas hoje">
            <p className="text-2xl font-bold text-erro">{dinheiro(fin.despesas_dia)}</p>
          </Card>
          <Card titulo="A vencer (7 dias)">
            <p className="text-2xl font-bold">{dinheiro(fin.a_vencer_7d.total)}</p>
            <p className="text-xs text-suave">{fin.a_vencer_7d.quantidade} lançamento(s)</p>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card titulo="Agenda do dia">
          {data.agenda_do_dia.length === 0 && <p className="text-sm text-suave">Nada para hoje.</p>}
          <ul className="space-y-2">
            {data.agenda_do_dia.map((e, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className={e.concluido ? "text-suave line-through" : ""}>{e.titulo}</span>
                <span className="text-xs text-suave">{dataHora(e.data_inicio)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card titulo="Guinchos em andamento">
          {data.guinchos_em_andamento.length === 0 && <p className="text-sm text-suave">Nenhum guincho em andamento.</p>}
          <ul className="space-y-2">
            {data.guinchos_em_andamento.map((g) => (
              <li key={g.codigo} className="text-sm">
                <span className="font-medium">{g.codigo}</span> · {g.cliente}{" "}
                <Selo>{g.status.replace("_", " ")}</Selo>
                <p className="text-xs text-suave">{g.origem_endereco} → {g.destino_endereco}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card titulo="Reservas futuras">
          {data.reservas_futuras.length === 0 && <p className="text-sm text-suave">Sem reservas.</p>}
          <ul className="space-y-2">
            {data.reservas_futuras.map((r) => (
              <li key={r.codigo} className="flex items-center justify-between text-sm">
                <span>{r.ativo} · {r.cliente}</span>
                <span className="text-xs text-suave">{dataCurta(r.data_inicio)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card titulo="Próximas manutenções">
          {data.proximas_manutencoes.length === 0 && <p className="text-sm text-suave">Nenhuma agendada.</p>}
          <ul className="space-y-2">
            {data.proximas_manutencoes.map((m, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{m.ativo} — {m.descricao}</span>
                <span className="text-xs text-suave">{dataCurta(m.data_agendada)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {fin && (
        <Card titulo="Fluxo de caixa — últimos 7 dias">
          <div className="grid grid-cols-7 gap-2">
            {fin.fluxo_caixa_7d.map((d) => {
              const receitas = Number(d.receitas);
              const despesas = Number(d.despesas);
              const max = Math.max(receitas, despesas, 1);
              return (
                <div key={d.dia} className="text-center">
                  <div className="flex h-24 items-end justify-center gap-1">
                    <div className="w-3 rounded-t bg-ok/70" style={{ height: `${(receitas / max) * 100}%` }} />
                    <div className="w-3 rounded-t bg-erro/70" style={{ height: `${(despesas / max) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-suave">
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
