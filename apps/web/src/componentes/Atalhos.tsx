// Atalhos de teclado — um único dono do `keydown` global.
//
// Antes o único atalho do sistema (⌘K) vivia dentro do BuscaGlobal, com o
// estado "paleta aberta" preso lá. Para o `/` focar a busca esse estado
// precisava subir; e com dois listeners disputando as mesmas teclas o
// resultado seria imprevisível. Então o provedor assume o teclado inteiro e a
// busca vira consumidora.
//
// Os destinos do `g` + letra saem de componentes/navegacao.ts: o atalho nunca
// leva a uma tela que o papel não enxerga.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Modal } from "./ui";
import { itensVisiveis } from "./navegacao";

interface Atalhos {
  buscaAberta: boolean;
  abrirBusca(): void;
  fecharBusca(): void;
}

const Contexto = createContext<Atalhos>({
  buscaAberta: false,
  abrirBusca: () => {},
  fecharBusca: () => {},
});

export const useAtalhos = () => useContext(Contexto);

/** Digitando num campo, as teclas são do campo — não da navegação. */
function escrevendo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return (
    alvo.tagName === "INPUT" ||
    alvo.tagName === "TEXTAREA" ||
    alvo.tagName === "SELECT" ||
    alvo.isContentEditable
  );
}

/** Janela para completar a sequência `g` + letra. */
const JANELA_PREFIXO_MS = 1000;

export function ProvedorAtalhos({ children }: { children: ReactNode }) {
  const navegar = useNavigate();
  const { pode } = useAuth();
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const prefixo = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const abrirBusca = useCallback(() => setBuscaAberta(true), []);
  const fecharBusca = useCallback(() => setBuscaAberta(false), []);

  const itens = useMemo(() => itensVisiveis(pode), [pode]);
  // Mapa tecla → rota, só do que este papel enxerga.
  const destinos = useMemo(() => {
    const m = new Map<string, string>();
    itens.forEach((i) => { if (i.atalho) m.set(i.atalho, i.para); });
    return m;
  }, [itens]);

  useEffect(() => {
    const limparPrefixo = () => {
      prefixo.current = false;
      clearTimeout(timer.current);
    };

    const tecla = (e: KeyboardEvent) => {
      // ⌘K/Ctrl+K funciona em qualquer lugar — o modificador já evita conflito
      // com a digitação.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscaAberta((a) => !a);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        limparPrefixo();
        return;
      }

      // A partir daqui são teclas nuas: nunca roubar de quem está digitando.
      if (escrevendo(e.target)) return;

      if (prefixo.current) {
        const destino = destinos.get(e.key.toLowerCase());
        limparPrefixo();
        if (destino) {
          e.preventDefault();
          navegar(destino);
        }
        return;
      }

      if (e.key === "g") {
        prefixo.current = true;
        clearTimeout(timer.current);
        timer.current = setTimeout(limparPrefixo, JANELA_PREFIXO_MS);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        setBuscaAberta(true);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setAjudaAberta(true);
      }
    };

    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      clearTimeout(timer.current);
    };
  }, [destinos, navegar]);

  const valor = useMemo(
    () => ({ buscaAberta, abrirBusca, fecharBusca }),
    [buscaAberta, abrirBusca, fecharBusca]
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      <Modal aberto={ajudaAberta} aoFechar={() => setAjudaAberta(false)} titulo="Atalhos de teclado">
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-mudo">Geral</p>
            <LinhaAtalho teclas={["⌘", "K"]} descricao="Abrir a busca global" />
            <LinhaAtalho teclas={["/"]} descricao="Abrir a busca global" />
            <LinhaAtalho teclas={["?"]} descricao="Mostrar estes atalhos" />
            <LinhaAtalho teclas={["Esc"]} descricao="Fechar o que estiver aberto" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-mudo">
              Ir para (pressione g, depois a letra)
            </p>
            {itens
              .filter((i) => i.atalho)
              .map((i) => (
                <LinhaAtalho key={i.para} teclas={["g", i.atalho!]} descricao={i.rotulo} />
              ))}
          </div>
        </div>
      </Modal>
    </Contexto.Provider>
  );
}

function LinhaAtalho({ teclas, descricao }: { teclas: string[]; descricao: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex gap-1">
        {teclas.map((t) => (
          <kbd
            key={t}
            className="min-w-[1.5rem] rounded border border-borda bg-elevado px-1.5 py-0.5 text-center font-display text-xs text-suave"
          >
            {t}
          </kbd>
        ))}
      </span>
      <span className="text-suave">{descricao}</span>
    </div>
  );
}
