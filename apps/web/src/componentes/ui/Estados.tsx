// Skeleton, estado vazio e estado de erro — os três estados não-felizes,
// padronizados para o sistema inteiro.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { SearchX, RefreshCw } from "lucide-react";
import { Botao } from "./Botao";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animar-cintilar rounded-md ${className}`} />;
}

export function SkeletonLinhas({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
    </div>
  );
}

export function EstadoVazio({
  icone: Icone = SearchX, titulo, descricao, acao,
}: {
  icone?: LucideIcon;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="rounded-full bg-elevado p-3">
        <Icone className="h-5 w-5 text-mudo" />
      </span>
      <p className="text-sm font-medium">{titulo}</p>
      {descricao && <p className="max-w-xs text-xs text-suave">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

export function EstadoErro({ aoTentar }: { aoTentar?: () => void }) {
  return (
    <EstadoVazio
      icone={RefreshCw}
      titulo="Algo deu errado"
      descricao="Não foi possível carregar estes dados."
      acao={
        aoTentar && (
          <Botao variante="secundario" tamanho="sm" onClick={aoTentar}>
            Tentar de novo
          </Botao>
        )
      }
    />
  );
}
