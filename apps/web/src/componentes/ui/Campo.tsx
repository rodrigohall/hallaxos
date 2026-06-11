import type {
  InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from "react";

export function Campo({
  rotulo, erro, dica, children,
}: { rotulo: string; erro?: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-suave">{rotulo}</span>
      {children}
      {erro && <span className="mt-1.5 block text-xs text-erro">{erro}</span>}
      {!erro && dica && <span className="mt-1.5 block text-xs text-mudo">{dica}</span>}
    </label>
  );
}

const BASE =
  "w-full rounded-md border border-borda bg-fundo/60 px-3 text-sm text-texto " +
  "placeholder:text-mudo transition-colors duration-150 " +
  "hover:border-borda-forte focus:border-ouro/70 focus:outline-none " +
  "focus:ring-2 focus:ring-ouro/15 disabled:opacity-50";

export function Entrada(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${BASE} h-10 ${props.className ?? ""}`} />;
}

export function Selecao(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${BASE} h-10 appearance-none ${props.className ?? ""}`} />
  );
}

export function AreaTexto(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${BASE} min-h-20 py-2 ${props.className ?? ""}`} />;
}
