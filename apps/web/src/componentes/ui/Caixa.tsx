// Caixa: painel de destaque embutido — avisos, validação, resumos, banners.
// Único lugar que decide raio/fundo/borda de "caixa dentro de card".
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

const TONS = {
  neutro: "border-borda bg-elevado/50",
  info: "border-info/25 bg-info/10",
  ok: "border-ok/25 bg-ok/5",
  alerta: "border-alerta/25 bg-alerta/5",
  erro: "border-erro/30 bg-erro/5",
  ouro: "border-ouro/30 bg-ouro/5",
} as const;

export function Caixa({
  tom = "neutro", icone: Icone, titulo, acao, children, className = "",
}: {
  tom?: keyof typeof TONS;
  icone?: LucideIcon;
  titulo?: ReactNode;
  acao?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`animar-surgir rounded-md border p-3 text-sm ${TONS[tom]} ${className}`}>
      {(titulo || Icone || acao) && (
        <div className="flex items-center gap-2">
          {Icone && <Icone className="h-4 w-4 shrink-0" />}
          {titulo && <span className="font-medium">{titulo}</span>}
          {acao && <span className="ml-auto">{acao}</span>}
        </div>
      )}
      {children && <div className={titulo || Icone ? "mt-1.5" : ""}>{children}</div>}
    </div>
  );
}
