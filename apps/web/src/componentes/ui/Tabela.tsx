// Lista e Tabela padronizadas. Em mobile-first, listas de registros são
// linhas tocáveis (ListaLinha); tabelas densas ficam para relatórios.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-borda">{children}</ul>;
}

export function ListaLinha({
  para, titulo, subtitulo, direita,
}: {
  para?: string;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  direita?: ReactNode;
}) {
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{titulo}</div>
        {subtitulo && <div className="mt-0.5 truncate text-xs text-suave">{subtitulo}</div>}
      </div>
      {direita && <div className="flex shrink-0 items-center gap-1.5">{direita}</div>}
      {para && <ChevronRight className="h-4 w-4 shrink-0 text-mudo" />}
    </>
  );
  const classe =
    "flex items-center gap-3 px-1 py-3 transition-colors duration-100";
  return (
    <li>
      {para ? (
        <Link to={para} className={`${classe} -mx-1 rounded-md hover:bg-elevado/60`}>
          {conteudo}
        </Link>
      ) : (
        <div className={classe}>{conteudo}</div>
      )}
    </li>
  );
}

export function Tabela({ cabecalhos, children }: { cabecalhos: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borda text-left">
            {cabecalhos.map((c) => (
              <th key={c} className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-mudo">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">{children}</tbody>
      </table>
    </div>
  );
}
