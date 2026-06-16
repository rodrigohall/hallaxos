// Copiloto de IA (Sprint 9) — Fase 1, só leitura. Painel lateral de perguntas
// em linguagem natural sobre os dados reais do sistema. A IA mora no backend
// (POST /copiloto/perguntar); aqui só mandamos a pergunta e mostramos a resposta
// + as fontes (entidades de origem) como links clicáveis para a tela real.
import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, Send, User, Car, Workflow, Wrench, CircleDollarSign, FileText, type LucideIcon,
} from "lucide-react";
import { api, ApiError } from "../api";
import { AreaTexto, Botao, Drawer } from "./ui";

interface Fonte {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
}
interface Turno {
  pergunta: string;
  resposta?: string;
  fontes?: Fonte[];
  erro?: string;
}

interface CopilotoCtx {
  abrir: (pergunta?: string) => void;
}
const Contexto = createContext<CopilotoCtx>({ abrir: () => {} });
export const useCopiloto = () => useContext(Contexto);

// Cada tipo de fonte aponta para a tela real da entidade (reusa as mesmas rotas
// do sistema — a resposta nunca é um número solto, é um link verificável).
const ROTA_FONTE: Record<string, { icone: LucideIcon; rota?: (id: string) => string }> = {
  pessoa: { icone: User, rota: (id) => `/clientes/${id}` },
  ativo: { icone: Car, rota: (id) => `/ativos/${id}` },
  operacao: { icone: Workflow, rota: (id) => `/operacoes/${id}` },
  manutencao: { icone: Wrench, rota: (id) => `/manutencoes/${id}` },
  lancamento: { icone: CircleDollarSign, rota: () => `/financeiro` },
  documento: { icone: FileText },
};

const EXEMPLOS = [
  "Quais guinchos estão abertos?",
  "Quanto faturei este mês?",
  "Quais locações estão atrasadas?",
];

function atualizarUltimo(turnos: Turno[], patch: Partial<Turno>): Turno[] {
  if (turnos.length === 0) return turnos;
  const ultimo = turnos.length - 1;
  return turnos.map((t, i) => (i === ultimo ? { ...t, ...patch } : t));
}

export function ProvedorCopiloto({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const navegar = useNavigate();
  const fimRef = useRef<HTMLDivElement>(null);
  const pendente = useRef<string | null>(null);

  const enviar = useCallback(
    async (perguntaArg?: string) => {
      const pergunta = (perguntaArg ?? texto).trim();
      if (!pergunta || enviando) return;
      setTexto("");
      setEnviando(true);
      setTurnos((t) => [...t, { pergunta }]);
      try {
        const { dados } = await api.post<{ dados: { resposta: string; fontes: Fonte[] } }>(
          "/copiloto/perguntar",
          { pergunta }
        );
        setTurnos((t) => atualizarUltimo(t, { resposta: dados.resposta, fontes: dados.fontes }));
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Não consegui responder agora. Tente novamente.";
        setTurnos((t) => atualizarUltimo(t, { erro: msg }));
      } finally {
        setEnviando(false);
      }
    },
    [texto, enviando]
  );

  const abrir = useCallback((pergunta?: string) => {
    setAberto(true);
    if (pergunta && pergunta.trim()) pendente.current = pergunta.trim();
  }, []);

  // Auto-envia a pergunta que veio do ⌘K assim que o painel abre.
  useEffect(() => {
    if (aberto && pendente.current) {
      const p = pendente.current;
      pendente.current = null;
      enviar(p);
    }
  }, [aberto, enviar]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnos, enviando]);

  const irParaFonte = (f: Fonte) => {
    const rota = ROTA_FONTE[f.entidade_tipo]?.rota;
    if (!rota) return;
    setAberto(false);
    navegar(rota(f.entidade_id));
  };

  return (
    <Contexto.Provider value={{ abrir }}>
      {children}
      <Drawer aberto={aberto} aoFechar={() => setAberto(false)} titulo="Copiloto">
        <div className="flex min-h-[60vh] flex-col gap-4">
          {turnos.length === 0 && (
            <div className="rounded-lg border border-borda bg-fundo/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-suave">
                <Sparkles className="h-4 w-4 text-ouro" /> Pergunte sobre a operação
              </div>
              <p className="text-xs text-mudo">
                Respondo consultando os dados reais do sistema — nunca invento números.
                Você vê as fontes e abre a tela de origem com um clique.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {EXEMPLOS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => enviar(ex)}
                    className="rounded-full border border-borda px-2.5 py-1 text-xs text-suave hover:border-ouro/60 hover:text-ouro-claro"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turnos.map((t, i) => (
            <div key={i} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-ouro/10 px-3 py-2 text-sm text-texto">
                {t.pergunta}
              </p>
              {t.resposta !== undefined && (
                <div className="max-w-[92%] rounded-lg rounded-bl-sm border border-borda bg-fundo/40 px-3 py-2">
                  <p className="whitespace-pre-wrap text-sm text-texto">{t.resposta}</p>
                  {t.fontes && t.fontes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.fontes.slice(0, 8).map((f) => {
                        const info = ROTA_FONTE[f.entidade_tipo];
                        const Icone = info?.icone ?? FileText;
                        const clicavel = !!info?.rota;
                        return (
                          <button
                            key={`${f.entidade_tipo}:${f.entidade_id}`}
                            onClick={() => irParaFonte(f)}
                            disabled={!clicavel}
                            className={
                              "inline-flex items-center gap-1 rounded-full border border-borda px-2 py-0.5 text-[11px] " +
                              (clicavel
                                ? "text-suave hover:border-ouro/60 hover:text-ouro-claro"
                                : "cursor-default text-mudo opacity-80")
                            }
                          >
                            <Icone className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[12rem]">{f.titulo}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {t.erro && (
                <p className="max-w-[92%] rounded-lg rounded-bl-sm border border-erro/25 bg-erro/10 px-3 py-2 text-sm text-erro">
                  {t.erro}
                </p>
              )}
            </div>
          ))}

          {enviando && <p className="text-xs text-mudo">Consultando o sistema…</p>}
          <div ref={fimRef} />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
            className="sticky bottom-0 -mx-5 -mb-5 mt-auto flex items-end gap-2 border-t border-borda bg-painel px-5 py-3"
          >
            <AreaTexto
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              placeholder="Pergunte algo sobre a operação…"
              rows={1}
              className="min-h-10 flex-1 resize-none"
              autoFocus
            />
            <Botao type="submit" tamanho="sm" carregando={enviando} disabled={!texto.trim()} aria-label="Enviar">
              <Send className="h-4 w-4" />
            </Botao>
          </form>
        </div>
      </Drawer>
    </Contexto.Provider>
  );
}

// Botão do header que abre o copiloto. Só renderiza quando a IA está ligada.
export function BotaoCopiloto() {
  const { abrir } = useCopiloto();
  return (
    <button
      onClick={() => abrir()}
      className="flex h-9 items-center gap-1.5 rounded-md border border-borda bg-fundo/60 px-2.5 text-sm text-suave transition-colors hover:border-ouro/60 hover:text-ouro-claro"
      aria-label="Abrir copiloto"
      title="Copiloto"
    >
      <Sparkles className="h-4 w-4 text-ouro" />
      <span className="hidden sm:inline">Copiloto</span>
    </button>
  );
}
