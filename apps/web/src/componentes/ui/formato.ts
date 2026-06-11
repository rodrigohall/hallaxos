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
