// Abas e Segmentado: os dois únicos controles de seleção do sistema.
// Abas = navegação entre painéis de uma página (sublinhado dourado animado).
// Segmentado = toggle compacto entre 2-5 opções curtas (período, R$/%…).
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface Aba {
  id: string;
  rotulo: string;
  icone?: LucideIcon;
  desabilitada?: boolean;
  selo?: ReactNode;
}

export function Abas({
  abas, ativa, aoTrocar,
}: {
  abas: Aba[];
  ativa: string;
  aoTrocar: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-borda">
      {abas.map((a) => {
        const sel = a.id === ativa;
        return (
          <button
            key={a.id}
            role="tab"
            aria-selected={sel}
            disabled={a.desabilitada}
            onClick={() => aoTrocar(a.id)}
            className={
              `relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium ` +
              `transition-colors duration-150 disabled:cursor-not-allowed disabled:text-mudo ` +
              (sel ? "text-ouro" : "text-suave hover:text-texto")
            }
          >
            {a.icone && <a.icone className="h-4 w-4" />}
            {a.rotulo}
            {a.selo}
            {sel && (
              <span
                aria-hidden
                className="animar-riscar absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ouro"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Segmentado<T extends string>({
  opcoes, valor, aoTrocar, tamanho = "sm", className = "",
}: {
  opcoes: { id: T; rotulo: ReactNode; tom?: "ouro" | "ok" | "erro" }[];
  valor: T;
  aoTrocar: (id: T) => void;
  tamanho?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-0.5 rounded-md border border-borda bg-fundo/60 p-0.5 ${className}`}
    >
      {opcoes.map((o) => {
        const sel = o.id === valor;
        const corSel =
          o.tom === "ok" ? "bg-ok/20 text-ok"
          : o.tom === "erro" ? "bg-erro/20 text-erro"
          : "bg-ouro text-navy";
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={sel}
            onClick={() => aoTrocar(o.id)}
            className={
              `rounded-sm font-medium transition-all duration-150 ` +
              (tamanho === "sm" ? "h-6 px-2.5 text-xs " : "h-8 px-3 text-sm ") +
              (sel ? `${corSel} font-semibold shadow-painel` : "text-suave hover:text-texto")
            }
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
