export const dinheiro = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataCurta = (v: string | Date) =>
  new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export const dataHora = (v: string | Date) =>
  new Date(v).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });

export const horaCurta = (v: string | Date) =>
  new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Data relativa: "hoje", "ontem", "há 3 dias", "em 2 dias", etc. */
export function dataRelativa(v: string | Date): string {
  const d = new Date(v);
  d.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - hoje.getTime()) / 86_400_000);
  if (diff === 0) return "hoje";
  if (diff === -1) return "ontem";
  if (diff === 1) return "amanhã";
  if (diff < 0) return `há ${Math.abs(diff)} dias`;
  return `em ${diff} dias`;
}
