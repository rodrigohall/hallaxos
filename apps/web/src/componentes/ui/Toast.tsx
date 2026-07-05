import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type TipoToast = "ok" | "alerta" | "erro" | "info";

interface Toast {
  id: number;
  tipo: TipoToast;
  titulo: string;
  descricao?: string;
}

const ICONES = { ok: CheckCircle2, alerta: AlertTriangle, erro: XCircle, info: Info };
const CORES = { ok: "text-ok", alerta: "text-alerta", erro: "text-erro", info: "text-info" };

const Contexto = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notificar = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((atual) => [...atual, { ...t, id }]);
    setTimeout(() => setToasts((atual) => atual.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <Contexto.Provider value={notificar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((t) => {
          const Icone = ICONES[t.tipo];
          return (
            <div
              key={t.id}
              className="animar-deslizar vidro pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-borda-forte p-3.5 shadow-flutuante"
            >
              <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${CORES[t.tipo]}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.titulo}</p>
                {t.descricao && <p className="mt-0.5 text-xs text-suave">{t.descricao}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Contexto.Provider>
  );
}

export const useToast = () => useContext(Contexto);
