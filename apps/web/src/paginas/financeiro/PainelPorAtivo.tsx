// Aba "Por Ativo" do hub financeiro — resultado e ROI de cada ativo.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CarFront } from "lucide-react";
import { api } from "../../api";
import {
  Card, EstadoVazio, Selo, SkeletonLinhas, Tabela, dinheiro,
} from "../../componentes/ui";

interface LinhaAtivo {
  id: string; codigo: string; nome: string; status: string;
  receita: string; despesa: string; resultado: string; roi: number | null;
}

export function PainelPorAtivo() {
  const { data: ativos, isLoading } = useQuery({
    queryKey: ["rel-ativos"],
    queryFn: () =>
      api.get<{ dados: LinhaAtivo[] }>("/relatorios/resultado-por-ativo").then((r) => r.dados),
  });

  return (
    <Card titulo="Resultado por ativo" icone={CarFront}>
      {isLoading ? (
        <SkeletonLinhas linhas={4} />
      ) : !ativos?.length ? (
        <EstadoVazio icone={CarFront} titulo="Sem ativos" />
      ) : (
        <Tabela cabecalhos={["Ativo", "Situação", "Receita", "Despesa", "Resultado", "ROI"]}>
          {ativos.map((a) => (
            <tr key={a.id}>
              <td className="py-2 pr-4">
                <Link to={`/ativos/${a.id}`} className="hover:text-ouro">
                  <span className="font-display text-xs font-bold text-ouro">{a.codigo}</span>{" "}
                  {a.nome}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <Selo tom={a.status}>{a.status.replace(/_/g, " ")}</Selo>
              </td>
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
  );
}
