// Seletor de tipo de operação — a MESMA peça na lista (filtro) e na
// criação (passo 1). Fonte única de ícone e apresentação por tipo.
import { Truck, KeyRound, TrendingUp, ShoppingCart, type LucideIcon } from "lucide-react";
import { ROTULO_TIPO } from "./rotulos";

export const TIPO_ICONE: Record<string, LucideIcon> = {
  guincho: Truck,
  locacao: KeyRound,
  venda: TrendingUp,
  compra: ShoppingCart,
};

export function SeletorTipoOperacao({
  tipos, valor, aoTrocar,
}: {
  tipos: readonly string[];
  valor: string | null;
  aoTrocar: (tipo: string) => void;
}) {
  return (
    <div className="animar-cascata grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tipos.map((t) => {
        const Icone = TIPO_ICONE[t] ?? Truck;
        const sel = valor === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => aoTrocar(t)}
            className={
              `flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all duration-150 ` +
              (sel
                ? "border-ouro/60 bg-ouro/5 text-ouro shadow-brilho-ouro"
                : "superficie elevar border-borda text-suave shadow-painel hover:text-texto")
            }
          >
            <Icone className="h-5 w-5" />
            <span className="text-sm font-medium">{ROTULO_TIPO[t] ?? t}</span>
          </button>
        );
      })}
    </div>
  );
}
