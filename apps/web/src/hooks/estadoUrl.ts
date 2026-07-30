// Estado de tela na URL — um lugar só para "qual aba" e "qual filtro".
//
// A URL é a fonte da verdade: o valor é derivado de useSearchParams a cada
// render (nunca copiado para useState), então voltar/avançar no navegador,
// recarregar a página e compartilhar o link levam ao mesmo lugar.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Aba sincronizada com a URL.
 *
 * @param abas   ids válidos, na ordem de exibição — valor fora da lista cai no padrão
 * @param padrao aba usada quando o param está ausente ou inválido
 * @param manter predicado que decide quais OUTROS params sobrevivem à troca de
 *               aba. Por omissão todos sobrevivem; o hub financeiro usa isso
 *               para descartar os filtros da aba que ficou para trás.
 */
export function useAbaUrl<T extends string>(
  abas: readonly T[],
  padrao: T,
  opcoes: { param?: string; manter?: (chave: string, destino: T) => boolean } = {}
): [T, (destino: T) => void] {
  const { param = "aba", manter } = opcoes;
  const [params, setParams] = useSearchParams();

  const bruto = params.get(param) as T | null;
  const aba = bruto && abas.includes(bruto) ? bruto : padrao;

  const trocar = useCallback(
    (destino: T) => {
      setParams(
        (anterior) => {
          const proximo = new URLSearchParams();
          anterior.forEach((valor, chave) => {
            if (chave === param) return;
            if (!manter || manter(chave, destino)) proximo.append(chave, valor);
          });
          // A aba padrão não precisa aparecer na URL — link limpo por omissão.
          if (destino !== padrao) proximo.set(param, destino);
          return proximo;
        },
        { replace: true }
      );
    },
    [setParams, param, padrao, manter]
  );

  return [aba, trocar];
}

/**
 * Um filtro isolado na URL. Valor igual ao padrão sai do endereço, para o link
 * de uma tela sem filtro continuar sendo `/ativos` e não `/ativos?status=`.
 */
export function useParamUrl(
  nome: string,
  padrao: string | null = null
): [string | null, (valor: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const valor = params.has(nome) ? params.get(nome) : padrao;

  const definir = useCallback(
    (novo: string | null) => {
      setParams(
        (anterior) => {
          const proximo = new URLSearchParams(anterior);
          if (novo === null || novo === padrao) proximo.delete(nome);
          else proximo.set(nome, novo);
          return proximo;
        },
        { replace: true }
      );
    },
    [setParams, nome, padrao]
  );

  return [valor, definir];
}
