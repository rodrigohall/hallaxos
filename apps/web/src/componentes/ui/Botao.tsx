import type { ButtonHTMLAttributes } from "react";
import { Loader2, ChevronDown, type LucideIcon } from "lucide-react";

type Variante = "primario" | "secundario" | "fantasma" | "perigo" | "link";
type Tamanho = "xs" | "sm" | "md";

const VARIANTES: Record<Variante, string> = {
  // Ouro como luz: gradiente + glow no hover — o CTA é o momento Hallax da tela
  primario:
    "bg-gradient-to-b from-ouro-claro to-ouro text-navy font-semibold " +
    "shadow-painel hover:shadow-brilho-ouro hover:to-ouro-claro active:from-ouro active:to-ouro-escuro",
  secundario:
    "border border-borda-forte bg-transparent text-texto hover:border-ouro/60 hover:text-ouro-claro",
  fantasma: "text-suave hover:bg-elevado hover:text-texto",
  perigo: "bg-erro/10 text-erro border border-erro/25 hover:bg-erro/20",
  link: "text-ouro underline-offset-4 hover:text-ouro-claro hover:underline",
};

const TAMANHOS: Record<Tamanho, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5",
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

// Link não tem caixa: só tipografia.
const TAMANHOS_LINK: Record<Tamanho, string> = {
  xs: "text-xs gap-1",
  sm: "text-xs gap-1",
  md: "text-sm gap-1.5",
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
  const eLink = variante === "link";
  return (
    <button
      {...props}
      disabled={disabled || carregando}
      className={
        `inline-flex items-center justify-center rounded-md transition-all duration-150 ` +
        `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ouro ` +
        `disabled:pointer-events-none disabled:opacity-50 ` +
        (eLink ? "" : "active:scale-[0.98] ") +
        `${VARIANTES[variante]} ${eLink ? TAMANHOS_LINK[tamanho] : TAMANHOS[tamanho]} ${className}`
      }
    >
      {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Botão quadrado só-ícone (ações de linha, fechar, utilidades de topbar). */
export function BotaoIcone({
  rotulo, icone: Icone, tamanho = "md", tom = "neutro", className = "", ...props
}: {
  rotulo: string;
  icone: LucideIcon;
  tamanho?: "sm" | "md";
  tom?: "neutro" | "ok" | "erro" | "alerta" | "ouro";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const TOM = {
    neutro: "text-suave hover:text-texto",
    ok: "text-mudo hover:text-ok",
    erro: "text-mudo hover:text-erro",
    alerta: "text-mudo hover:text-alerta",
    ouro: "text-mudo hover:text-ouro",
  };
  return (
    <button
      type="button"
      {...props}
      aria-label={rotulo}
      title={rotulo}
      className={
        `inline-flex items-center justify-center rounded-md transition-colors duration-150 ` +
        `hover:bg-elevado active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 ` +
        `focus-visible:outline-ouro disabled:pointer-events-none disabled:opacity-50 ` +
        `${tamanho === "sm" ? "h-7 w-7" : "h-9 w-9"} ${TOM[tom]} ${className}`
      }
    >
      <Icone className={tamanho === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </button>
  );
}

/** Expansor "Ver mais/menos" com chevron rotativo — padrão das fichas. */
export function VerMais({
  aberto, aoAlternar, rotulo = "Ver mais", rotuloAberto = "Ver menos",
}: {
  aberto: boolean;
  aoAlternar: () => void;
  rotulo?: string;
  rotuloAberto?: string;
}) {
  return (
    <button
      type="button"
      onClick={aoAlternar}
      className="mt-3 flex items-center gap-1 text-xs text-suave transition-colors duration-150 hover:text-ouro"
    >
      <ChevronDown
        className={`h-3.5 w-3.5 transition-transform duration-200 ${aberto ? "rotate-180" : ""}`}
      />
      {aberto ? rotuloAberto : rotulo}
    </button>
  );
}
