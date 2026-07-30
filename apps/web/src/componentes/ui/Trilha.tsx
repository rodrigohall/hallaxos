// Trilha (breadcrumb) — onde estou e como volto.
//
// Nas fichas de detalhe a única saída era o botão voltar do navegador, que não
// diz de onde você veio. A trilha nomeia o caminho e o torna clicável.
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface PassoTrilha {
  rotulo: string;
  /** Sem `para`, o passo é o lugar atual — texto, não link. */
  para?: string;
}

export function Trilha({ passos }: { passos: PassoTrilha[] }) {
  return (
    <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1 text-xs text-mudo">
      {passos.map((p, i) => (
        <span key={`${p.rotulo}-${i}`} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 shrink-0" />}
          {p.para ? (
            <Link to={p.para} className="shrink-0 transition-colors hover:text-ouro">
              {p.rotulo}
            </Link>
          ) : (
            <span className="truncate text-suave" aria-current="page">
              {p.rotulo}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
