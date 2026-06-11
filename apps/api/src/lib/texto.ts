/** Normalização única usada na indexação E na consulta da busca global. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const soDigitosTexto = (v: string) => v.replace(/\D/g, "");
