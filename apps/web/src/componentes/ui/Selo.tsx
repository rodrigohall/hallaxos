import type { ReactNode } from "react";
import { X } from "lucide-react";

/** Mapa central de status → cor. Telas nunca escolhem cores de status. */
const TONS: Record<string, string> = {
  // ativos
  disponivel: "text-ok bg-ok/10 ring-ok/20",
  reservado: "text-alerta bg-alerta/10 ring-alerta/20",
  alugado: "text-info bg-info/10 ring-info/20",
  em_manutencao: "text-alerta bg-alerta/10 ring-alerta/20",
  em_uso_interno: "text-info bg-info/10 ring-info/20",
  vendido: "text-suave bg-elevado ring-borda",
  baixado: "text-suave bg-elevado ring-borda",
  // operações
  ativa: "text-ok bg-ok/10 ring-ok/20",
  reservada: "text-alerta bg-alerta/10 ring-alerta/20",
  em_execucao: "text-info bg-info/10 ring-info/20",
  a_caminho: "text-info bg-info/10 ring-info/20",
  solicitado: "text-alerta bg-alerta/10 ring-alerta/20",
  concluido: "text-ok bg-ok/10 ring-ok/20",
  concluida: "text-ok bg-ok/10 ring-ok/20",
  finalizada: "text-suave bg-elevado ring-borda",
  cancelada: "text-erro bg-erro/10 ring-erro/20",
  orcamento: "text-suave bg-elevado ring-borda",
  negociacao: "text-suave bg-elevado ring-borda",
  fechada: "text-info bg-info/10 ring-info/20",
  // manutenções
  agendada: "text-alerta bg-alerta/10 ring-alerta/20",
  em_andamento: "text-info bg-info/10 ring-info/20",
  // genéricos
  ouro: "text-ouro bg-ouro/10 ring-ouro/25",
  ok: "text-ok bg-ok/10 ring-ok/20",
  alerta: "text-alerta bg-alerta/10 ring-alerta/20",
  erro: "text-erro bg-erro/10 ring-erro/20",
  info: "text-info bg-info/10 ring-info/20",
};

export function Selo({ children, tom }: { children: ReactNode; tom?: string }) {
  const cor = (tom && TONS[tom]) || "text-suave bg-elevado ring-borda";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cor}`}
    >
      {children}
    </span>
  );
}

/** Chip: selo interativo (filtros, tags removíveis). */
export function Chip({
  children, ativo = false, onClick, onRemover,
}: {
  children: ReactNode;
  ativo?: boolean;
  onClick?: () => void;
  onRemover?: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className={
        `inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ` +
        `ring-1 ring-inset transition-colors duration-150 ` +
        (ativo
          ? "bg-ouro/15 text-ouro ring-ouro/30"
          : "bg-elevado text-suave ring-borda hover:text-texto hover:ring-borda-forte")
      }
    >
      {children}
      {onRemover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemover();
          }}
          className="-mr-1 rounded-full p-0.5 hover:bg-borda"
          aria-label="Remover"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
