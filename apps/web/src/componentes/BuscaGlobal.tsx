// Busca global: paleta de comando (⌘K / Ctrl+K). Sempre acessível — é a
// porta de entrada para qualquer registro, e futuramente para a IA.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User, Car, FileText, Wrench, CircleDollarSign, Workflow, Sparkles, type LucideIcon } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useCopiloto } from "./Copiloto";
import { Modal } from "./ui";

interface Resultado {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
  subtitulo: string;
}

const TIPOS: Record<string, { icone: LucideIcon; rotulo: string; rota?: (id: string) => string }> = {
  pessoa: { icone: User, rotulo: "Pessoas", rota: (id) => `/clientes/${id}` },
  ativo: { icone: Car, rotulo: "Ativos", rota: (id) => `/ativos/${id}` },
  operacao: { icone: Workflow, rotulo: "Operações" },
  manutencao: { icone: Wrench, rotulo: "Manutenções" },
  lancamento: { icone: CircleDollarSign, rotulo: "Financeiro" },
  documento: { icone: FileText, rotulo: "Documentos" },
};

export function BuscaGlobal() {
  const [aberta, setAberta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [selecionado, setSelecionado] = useState(0);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navegar = useNavigate();
  const { copilotoAtivo } = useAuth();
  const { abrir: abrirCopiloto } = useCopiloto();

  // Atalho global ⌘K / Ctrl+K
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberta((a) => !a);
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    clearTimeout(temporizador.current);
    if (consulta.trim().length < 2) {
      setResultados([]);
      return;
    }
    temporizador.current = setTimeout(() => {
      api
        .get<{ dados: Resultado[] }>(`/busca?q=${encodeURIComponent(consulta)}`)
        .then(({ dados }) => {
          setResultados(dados);
          setSelecionado(0);
        })
        .catch(() => setResultados([]));
    }, 200);
  }, [consulta]);

  const fechar = useCallback(() => {
    setAberta(false);
    setConsulta("");
    setResultados([]);
  }, []);

  const abrir = useCallback(
    (r: Resultado) => {
      fechar();
      const rota = TIPOS[r.entidade_tipo]?.rota;
      if (rota) navegar(rota(r.entidade_id));
    },
    [fechar, navegar]
  );

  const perguntarCopiloto = useCallback(() => {
    const q = consulta;
    fechar();
    abrirCopiloto(q);
  }, [consulta, fechar, abrirCopiloto]);

  const navegarTeclado = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (copilotoAtivo) {
        e.preventDefault();
        perguntarCopiloto();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelecionado((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelecionado((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && resultados[selecionado]) {
      abrir(resultados[selecionado]);
    }
  };

  // Agrupa por tipo de entidade
  const grupos = resultados.reduce<Record<string, Resultado[]>>((acc, r) => {
    (acc[r.entidade_tipo] ??= []).push(r);
    return acc;
  }, {});
  let indice = -1;

  return (
    <>
      <button
        onClick={() => setAberta(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-borda bg-fundo/60 px-3 text-sm text-mudo transition-colors hover:border-borda-forte hover:text-suave"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Buscar qualquer coisa…</span>
        <kbd className="hidden rounded border border-borda bg-elevado px-1.5 py-0.5 text-[10px] font-medium sm:block">
          ⌘K
        </kbd>
      </button>

      <Modal aberto={aberta} aoFechar={fechar} largura="max-w-xl" titulo="Busca global">
        <div className="-m-5">
          <div className="flex items-center gap-2 border-b border-borda px-4">
            <Search className="h-4 w-4 text-mudo" />
            <input
              autoFocus
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              onKeyDown={navegarTeclado}
              placeholder="Placa, nome, CPF, telefone, código da operação…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-mudo"
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {consulta.length >= 2 && resultados.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-mudo">Nada encontrado para “{consulta}”.</p>
            )}
            {consulta.length < 2 && (
              <p className="px-3 py-6 text-center text-sm text-mudo">
                Digite ao menos 2 caracteres. A busca encontra pessoas, ativos, operações e documentos.
              </p>
            )}
            {Object.entries(grupos).map(([tipo, itens]) => {
              const info = TIPOS[tipo] ?? { icone: Search, rotulo: tipo };
              const Icone = info.icone;
              return (
                <div key={tipo} className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-mudo">
                    {info.rotulo}
                  </p>
                  {itens.map((r) => {
                    indice += 1;
                    const ativo = indice === selecionado;
                    return (
                      <button
                        key={r.entidade_id}
                        onClick={() => abrir(r)}
                        className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                          ativo ? "bg-ouro/10 text-texto" : "hover:bg-elevado"
                        }`}
                      >
                        <Icone className={`h-4 w-4 shrink-0 ${ativo ? "text-ouro" : "text-mudo"}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{r.titulo}</span>
                          <span className="block truncate text-xs text-suave">{r.subtitulo}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {copilotoAtivo && consulta.trim().length >= 2 && (
            <div className="border-t border-borda p-2">
              <button
                onClick={perguntarCopiloto}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-suave hover:bg-elevado"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-ouro" />
                <span className="min-w-0 truncate">
                  Perguntar ao copiloto: <span className="text-texto">“{consulta}”</span>
                </span>
                <kbd className="ml-auto hidden rounded border border-borda bg-elevado px-1.5 py-0.5 text-[10px] sm:block">
                  ⌘↵
                </kbd>
              </button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
