import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

type Variante = "primario" | "secundario" | "fantasma" | "perigo";
type Tamanho = "sm" | "md";

const VARIANTES: Record<Variante, string> = {
  // Dourado da marca: o CTA é o momento Hallax da tela
  primario:
    "bg-ouro text-navy font-semibold hover:bg-ouro-claro active:bg-ouro-escuro " +
    "shadow-painel",
  secundario:
    "border border-borda-forte bg-transparent text-texto hover:border-ouro/60 hover:text-ouro-claro",
  fantasma: "text-suave hover:bg-elevado hover:text-texto",
  perigo: "bg-erro/10 text-erro border border-erro/25 hover:bg-erro/20",
};

const TAMANHOS: Record<Tamanho, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamanho?: Tamanho;
  carregando?: boolean;
}

export function Botao({
  variante = "primario",
  tamanho = "md",
  carregando = false,
  children,
  disabled,
  className = "",
  ...props
}: BotaoProps) {
  return (
    <button
      {...props}
      disabled={disabled || carregando}
      className={
        `inline-flex items-center justify-center rounded-md transition-all duration-150 ` +
        `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ouro ` +
        `disabled:pointer-events-none disabled:opacity-50 ` +
        `${VARIANTES[variante]} ${TAMANHOS[tamanho]} ${className}`
      }
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
