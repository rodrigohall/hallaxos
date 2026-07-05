// Relatório de Patrimônio — consulta derivada do núcleo, sem dados próprios.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CarFront, TrendingUp, TrendingDown, Scale, ArrowUpDown } from "lucide-react";
import { api } from "../api";
import { Card, Kpi, Segmentado, dinheiro, EstadoVazio, SkeletonLinhas, Selecao } from "../componentes/ui";

interface LinhaPatrimonio {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  categoria: string;
  preco_compra: number;
  fipe: number;
  custos_acumulados: number;
  receita_acumulada: number;
  lucro_presumido: number | null;
  valor_diaria: string | null;
}

interface Categoria { id: string; nome: string }

type Ordenar = "nome" | "fipe" | "receita" | "lucro" | "custo";

const COLUNAS: { campo: Ordenar; rotulo: string }[] = [
  { campo: "nome", rotulo: "Ativo" },
  { campo: "custo", rotulo: "Custos" },
  { campo: "fipe", rotulo: "FIPE" },
  { campo: "lucro", rotulo: "Lucro Presumido" },
  { campo: "receita", rotulo: "Receita" },
];

function moeda(v: number | null) {
  if (v === null) return <span className="text-mudo">—</span>;
  return <span className={v < 0 ? "text-erro" : ""}>{dinheiro(v)}</span>;
}

export function RelatorioPatrimonio({ categorias }: { categorias: Categoria[] }) {
  const [categoriaId, setCategoriaId] = useState("");
  const [ordenar, setOrdenar] = useState<Ordenar>("nome");

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-patrimonio", categoriaId, ordenar],
    queryFn: () =>
      api
        .get<{ dados: LinhaPatrimonio[] }>(
          `/ativos/relatorio-patrimonio` +
            (categoriaId ? `?categoria_id=${categoriaId}` : "")
        )
        .then((r) => r.dados),
  });

  const linhas = data ?? [];

  // Ordenação client-side (dados já vêm por nome do backend)
  const ordenadas = [...linhas].sort((a, b) => {
    switch (ordenar) {
      case "fipe": return b.fipe - a.fipe;
      case "receita": return b.receita_acumulada - a.receita_acumulada;
      case "lucro": return (b.lucro_presumido ?? -Infinity) - (a.lucro_presumido ?? -Infinity);
      case "custo": return b.custos_acumulados - a.custos_acumulados;
      default: return a.nome.localeCompare(b.nome, "pt-BR");
    }
  });

  // Totais
  const totalFipe = linhas.reduce((s, l) => s + l.fipe, 0);
  const totalCompra = linhas.reduce((s, l) => s + l.preco_compra, 0);
  const totalReceita = linhas.reduce((s, l) => s + l.receita_acumulada, 0);
  const totalCusto = linhas.reduce((s, l) => s + l.custos_acumulados, 0);

  // Totais por categoria
  const porCategoria = linhas.reduce<Record<string, { fipe: number; compra: number; qtd: number }>>((acc, l) => {
    if (!acc[l.categoria]) acc[l.categoria] = { fipe: 0, compra: 0, qtd: 0 };
    acc[l.categoria]!.fipe += l.fipe;
    acc[l.categoria]!.compra += l.preco_compra;
    acc[l.categoria]!.qtd += 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Sumário */}
      <div className="animar-cascata grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Ativos no portfólio" valor={linhas.length} icone={CarFront} tom="ouro" />
        <Kpi rotulo="Patrimônio FIPE" valor={dinheiro(totalFipe)} icone={Scale} />
        <Kpi rotulo="Total investido" valor={dinheiro(totalCompra)} icone={TrendingDown} />
        <Kpi rotulo="Receita total" valor={dinheiro(totalReceita)} icone={TrendingUp} tom="ok" />
      </div>

      {/* Por categoria */}
      {Object.keys(porCategoria).length > 1 && (
        <Card titulo="Por categoria">
          <div className="flex flex-wrap gap-4">
            {Object.entries(porCategoria).map(([cat, val]) => (
              <div key={cat} className="min-w-[120px]">
                <p className="text-xs font-medium text-suave">{cat}</p>
                <p className="text-sm font-bold">{val.qtd} ativo(s)</p>
                <p className="text-xs text-mudo">FIPE {dinheiro(val.fipe)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filtros + ordenação */}
      <div className="flex flex-wrap items-center gap-3">
        {categorias.length > 0 && (
          <div className="w-52">
            <Selecao value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Selecao>
          </div>
        )}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-mudo" />
          <span className="text-xs text-mudo">Ordenar por:</span>
          <Segmentado
            opcoes={COLUNAS.slice(1).map((c) => ({ id: c.campo, rotulo: c.rotulo }))}
            valor={ordenar}
            aoTrocar={setOrdenar}
          />
        </div>
      </div>

      {/* Tabela */}
      {isLoading ? (
        <SkeletonLinhas linhas={6} />
      ) : ordenadas.length === 0 ? (
        <Card>
          <EstadoVazio icone={CarFront} titulo="Nenhum ativo no portfólio" descricao="Ativos vendidos e baixados não aparecem aqui." />
        </Card>
      ) : (
        <div className="animar-surgir superficie overflow-x-auto rounded-lg border border-borda shadow-painel">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda">
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-mudo">Ativo</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-mudo">Categoria</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-mudo">Preço compra</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-mudo">Custos acum.</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-mudo">FIPE</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-mudo">
                  <span className="flex items-center justify-end gap-1">
                    <Scale className="h-3 w-3" /> Lucro Presumido
                  </span>
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-mudo">Receita acum.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {ordenadas.map((l) => (
                <tr key={l.id} className="hover:bg-elevado/50 transition-colors">
                  <td className="px-3 py-2.5">
                    <Link
                      to={`/ativos/${l.id}`}
                      className="font-medium hover:text-ouro transition-colors"
                    >
                      {l.nome}
                    </Link>
                    <p className="font-display text-xs text-mudo">{l.codigo}</p>
                  </td>
                  <td className="px-3 py-2.5 text-suave">{l.categoria}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {l.preco_compra > 0 ? dinheiro(l.preco_compra) : <span className="text-mudo">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-erro">
                    {dinheiro(l.custos_acumulados)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {l.fipe > 0 ? dinheiro(l.fipe) : <span className="text-mudo">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                    {moeda(l.lucro_presumido)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ok">
                    {l.receita_acumulada > 0 ? dinheiro(l.receita_acumulada) : <span className="text-mudo">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-borda-forte bg-elevado font-semibold">
                <td className="px-3 py-2.5 text-xs text-mudo" colSpan={2}>Totais</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs">{dinheiro(totalCompra)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs text-erro">{dinheiro(totalCusto)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs">{dinheiro(totalFipe)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-xs" />
                <td className="px-3 py-2.5 text-right tabular-nums text-xs text-ok">{dinheiro(totalReceita)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
