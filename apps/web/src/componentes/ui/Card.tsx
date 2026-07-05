import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, type LucideIcon } from "lucide-react";

export function Card({
  titulo, icone: Icone, acao, children, className = "",
}: {
  titulo?: string;
  icone?: LucideIcon;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`animar-surgir superficie rounded-lg border border-borda p-4 shadow-painel ${className}`}
    >
      {(titulo || acao) && (
        <header className="mb-3 flex items-center gap-2">
          {Icone && <Icone className="h-4 w-4 text-mudo" />}
          {titulo && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-suave">{titulo}</h2>
          )}
          {acao && <div className="ml-auto">{acao}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Indicador-chave do dashboard: número grande, leitura em 1 segundo.
 *  Com `para`, vira link com lift no hover e chevron que acende. */
export function Kpi({
  rotulo, valor, icone: Icone, tom = "neutro", detalhe, para, acao, atraso, children, className = "",
}: {
  rotulo: string;
  valor: ReactNode;
  icone: LucideIcon;
  tom?: "neutro" | "ok" | "erro" | "ouro" | "alerta" | "info";
  detalhe?: string;
  para?: string;
  acao?: ReactNode;
  atraso?: number;
  children?: ReactNode;
  className?: string;
}) {
  const cores = {
    neutro: "text-texto",
    ok: "text-ok",
    erro: "text-erro",
    ouro: "text-ouro",
    alerta: "text-alerta",
    info: "text-info",
  };
  const corpo = (
    <>
      <div className="flex items-center gap-2 text-mudo">
        <Icone className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{rotulo}</span>
        {para && (
          <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        )}
        {!para && acao && <span className="ml-auto">{acao}</span>}
      </div>
      <p className={`mt-2 font-display text-2xl font-bold ${cores[tom]}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-mudo">{detalhe}</p>}
      {children}
    </>
  );
  const classe =
    `animar-surgir superficie rounded-lg border border-borda p-4 shadow-painel ` +
    `${para ? "group elevar block text-left " : ""}${className}`;
  const estilo: CSSProperties | undefined = atraso ? { animationDelay: `${atraso}ms` } : undefined;
  return para ? (
    <Link to={para} className={classe} style={estilo}>
      {corpo}
    </Link>
  ) : (
    <div className={classe} style={estilo}>
      {corpo}
    </div>
  );
}
