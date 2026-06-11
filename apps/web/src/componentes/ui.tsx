import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ titulo, children, acao }: { titulo?: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="rounded-xl border border-borda bg-painel p-4">
      {(titulo || acao) && (
        <header className="mb-3 flex items-center justify-between">
          {titulo && <h2 className="text-sm font-semibold uppercase tracking-wide text-suave">{titulo}</h2>}
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function Botao({
  variante = "primario",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "perigo" }) {
  const estilos = {
    primario: "bg-marca hover:bg-marca-forte text-white",
    secundario: "border border-borda bg-transparent hover:bg-borda/40 text-texto",
    perigo: "bg-erro/15 text-erro hover:bg-erro/25",
  };
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${estilos[variante]} ${props.className ?? ""}`}
    />
  );
}

export function Campo({
  rotulo, erro, children,
}: { rotulo: string; erro?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-suave">{rotulo}</span>
      {children}
      {erro && <span className="mt-1 block text-xs text-erro">{erro}</span>}
    </label>
  );
}

const estiloEntrada =
  "w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto " +
  "placeholder:text-suave/60 focus:border-marca focus:outline-none";

export function Entrada(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${estiloEntrada} ${props.className ?? ""}`} />;
}

export function Selecao(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${estiloEntrada} ${props.className ?? ""}`} />;
}

const CORES_STATUS: Record<string, string> = {
  disponivel: "text-ok bg-ok/10",
  alugado: "text-marca-forte bg-marca/10",
  reservado: "text-alerta bg-alerta/10",
  em_manutencao: "text-alerta bg-alerta/10",
  em_uso_interno: "text-marca-forte bg-marca/10",
  vendido: "text-suave bg-borda/40",
  baixado: "text-suave bg-borda/40",
};

export function Selo({ children, tom }: { children: ReactNode; tom?: string }) {
  const cor = (tom && CORES_STATUS[tom]) || "text-suave bg-borda/40";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>
      {children}
    </span>
  );
}

export const dinheiro = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataCurta = (v: string | Date) =>
  new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const dataHora = (v: string | Date) =>
  new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
