import { useQuery } from "@tanstack/react-query";
import { BarChart3, CarFront } from "lucide-react";
import { api } from "../api";
import { Card, EstadoVazio, Selo, SkeletonLinhas, Tabela, dinheiro } from "../componentes/ui";

interface LinhaAtivo {
  id: string; codigo: string; nome: string; status: string;
  receita: string; despesa: string; resultado: string; roi: number | null;
}
interface Dre {
  meses: Array<{ mes: string; receitas: string; despesas: string }>;
  categorias: Array<{ nome: string; tipo: string; total: string }>;
}

export function Relatorios() {
  const ano = new Date().getFullYear();
  const { data: ativos, isLoading: carregandoAtivos } = useQuery({
    queryKey: ["rel-ativos"],
    queryFn: () => api.get<{ dados: LinhaAtivo[] }>("/relatorios/resultado-por-ativo").then((r) => r.dados),
  });
  const { data: dre, isLoading: carregandoDre } = useQuery({
    queryKey: ["rel-dre", ano],
    queryFn: () => api.get<{ dados: Dre }>(`/relatorios/dre?ano=${ano}`).then((r) => r.dados),
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-lg font-bold">Relatórios</h1>

      <Card titulo="Resultado por ativo" icone={CarFront}>
        {carregandoAtivos ? (
          <SkeletonLinhas linhas={4} />
        ) : !ativos?.length ? (
          <EstadoVazio icone={CarFront} titulo="Sem ativos" />
        ) : (
          <Tabela cabecalhos={["Ativo", "Situação", "Receita", "Despesa", "Resultado", "ROI"]}>
            {ativos.map((a) => (
              <tr key={a.id}>
                <td className="py-2 pr-4">
                  <span className="font-display text-xs font-bold text-ouro">{a.codigo}</span> {a.nome}
                </td>
                <td className="py-2 pr-4"><Selo tom={a.status}>{a.status.replace(/_/g, " ")}</Selo></td>
                <td className="py-2 pr-4 text-ok">{dinheiro(a.receita)}</td>
                <td className="py-2 pr-4 text-erro">{dinheiro(a.despesa)}</td>
                <td className={`py-2 pr-4 font-medium ${Number(a.resultado) >= 0 ? "text-texto" : "text-erro"}`}>
                  {dinheiro(a.resultado)}
                </td>
                <td className="py-2 pr-4">{a.roi !== null ? `${a.roi}%` : "—"}</td>
              </tr>
            ))}
          </Tabela>
        )}
      </Card>

      <Card titulo={`DRE ${ano} · realizado por mês`} icone={BarChart3}>
        {carregandoDre ? (
          <SkeletonLinhas linhas={3} />
        ) : !dre?.meses.length ? (
          <EstadoVazio icone={BarChart3} titulo="Nenhum lançamento pago este ano" />
        ) : (
          <Tabela cabecalhos={["Mês", "Receitas", "Despesas", "Resultado"]}>
            {dre.meses.map((m) => {
              const resultado = Number(m.receitas) - Number(m.despesas);
              return (
                <tr key={m.mes}>
                  <td className="py-2 pr-4 font-display text-xs font-bold">{m.mes}</td>
                  <td className="py-2 pr-4 text-ok">{dinheiro(m.receitas)}</td>
                  <td className="py-2 pr-4 text-erro">{dinheiro(m.despesas)}</td>
                  <td className={`py-2 pr-4 font-medium ${resultado >= 0 ? "text-ok" : "text-erro"}`}>
                    {dinheiro(resultado)}
                  </td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Card>

      {!!dre?.categorias.length && (
        <Card titulo={`Por categoria · ${ano}`} icone={BarChart3}>
          <Tabela cabecalhos={["Categoria", "Tipo", "Total"]}>
            {dre.categorias.map((c) => (
              <tr key={`${c.nome}-${c.tipo}`}>
                <td className="py-2 pr-4">{c.nome}</td>
                <td className="py-2 pr-4"><Selo tom={c.tipo === "receita" ? "ok" : "erro"}>{c.tipo}</Selo></td>
                <td className="py-2 pr-4 font-medium">{dinheiro(c.total)}</td>
              </tr>
            ))}
          </Tabela>
        </Card>
      )}
    </div>
  );
}
