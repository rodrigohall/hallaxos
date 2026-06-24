// Modal e Drawer: as duas superfícies flutuantes do sistema.
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

function Fundo({ aoFechar, children }: { aoFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
    };
  }, [aoFechar]);
  return (
    <div
      className="animar-surgir fixed inset-0 z-50 bg-fundo/70 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      {children}
    </div>
  );
}

export function Modal({
  aberto, aoFechar, titulo, children, largura = "max-w-lg",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: string;
  children: ReactNode;
  largura?: string;
}) {
  if (!aberto) return null;
  return (
    <Fundo aoFechar={aoFechar}>
      {/* Mobile: bottom sheet que sobe. sm+: modal centrado. */}
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <div
          className={`animar-folha w-full ${largura} rounded-t-2xl border border-borda bg-painel shadow-flutuante sm:rounded-xl sm:animar-deslizar`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Handle visual no topo (mobile only) */}
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-borda-forte sm:hidden" />
          <header className="flex items-center justify-between border-b border-borda px-5 py-4">
            <h2 className="font-display text-sm font-bold">{titulo}</h2>
            <button onClick={aoFechar} className="rounded-md p-1.5 text-mudo hover:bg-elevado hover:text-texto" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="max-h-[80dvh] overflow-y-auto p-5 safe-b">{children}</div>
        </div>
      </div>
    </Fundo>
  );
}

export function Drawer({
  aberto, aoFechar, titulo, children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo?: string;
  children: ReactNode;
}) {
  if (!aberto) return null;
  return (
    <Fundo aoFechar={aoFechar}>
      <aside
        className="animar-deslizar fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-borda bg-painel shadow-flutuante"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-borda bg-painel px-5 py-4">
          <h2 className="font-display text-sm font-bold">{titulo}</h2>
          <button onClick={aoFechar} className="rounded-md p-1 text-mudo hover:bg-elevado hover:text-texto" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </aside>
    </Fundo>
  );
}
