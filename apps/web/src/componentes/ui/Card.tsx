import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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
      className={`animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel ${className}`}
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

/** Indicador-chave do dashboard: número grande, leitura em 1 segundo. */
export function Kpi({
  rotulo, valor, icone: Icone, tom = "neutro", detalhe,
}: {
  rotulo: string;
  valor: ReactNode;
  icone: LucideIcon;
  tom?: "neutro" | "ok" | "erro" | "ouro";
  detalhe?: string;
}) {
  const cores = {
    neutro: "text-texto",
    ok: "text-ok",
    erro: "text-erro",
    ouro: "text-ouro",
  };
  return (
    <div className="animar-surgir rounded-lg border border-borda bg-painel p-4 shadow-painel">
      <div className="flex items-center gap-2 text-mudo">
        <Icone className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{rotulo}</span>
      </div>
      <p className={`mt-2 font-display text-2xl font-bold ${cores[tom]}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-mudo">{detalhe}</p>}
    </div>
  );
}
