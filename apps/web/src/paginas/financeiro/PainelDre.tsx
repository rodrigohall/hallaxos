// Aba "DRE" do hub financeiro — realizado por mês e por categoria.
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { api } from "../../api";
import {
  Card, EstadoVazio, Selecao, Selo, SkeletonLinhas, Tabela, dinheiro,
} from "../../componentes/ui";
import { useParamUrl } from "../../hooks/estadoUrl";

interface Dre {
  meses: Array<{ mes: string; receitas: string; despesas: string }>;
  categorias: Array<{ nome: string; tipo: string; total: string }>;
}

export function PainelDre() {
  const anoAtual = new Date().getFullYear();
  const [anoParam, setAno] = useParamUrl("dre_ano", String(anoAtual));
  const ano = Number(anoParam) || anoAtual;

  const { data: dre, isLoading } = useQuery({
    queryKey: ["rel-dre", ano],
    queryFn: () => api.get<{ dados: Dre }>(`/relatorios/dre?ano=${ano}`).then((r) => r.dados),
  });

  return (
    <div className="space-y-4">
      <div className="animar-surgir superficie flex flex-wrap items-center gap-2 rounded-lg border border-borda px-4 py-3 shadow-painel">
        <span className="text-xs text-mudo">Ano</span>
        <Selecao tamanho="sm" value={ano} onChange={(e) => setAno(e.target.value)}>
          {[anoAtual - 1, anoAtual, anoAtual + 1].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Selecao>
      </div>

      <Card titulo={`DRE ${ano} · realizado por mês`} icone={BarChart3}>
        {isLoading ? (
          <SkeletonLinhas linhas={3} />
        ) : !dre?.meses.length ? (
          <EstadoVazio icone={BarChart3} titulo={`Nenhum lançamento pago em ${ano}`} />
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
                <td className="py-2 pr-4">
                  <Selo tom={c.tipo === "receita" ? "ok" : "erro"}>{c.tipo}</Selo>
                </td>
                <td className="py-2 pr-4 font-medium">{dinheiro(c.total)}</td>
              </tr>
            ))}
          </Tabela>
        </Card>
      )}
    </div>
  );
}
