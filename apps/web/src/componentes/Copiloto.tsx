// Copiloto de IA (Sprint 9) — Fase 1, só leitura. Painel lateral de perguntas
// em linguagem natural sobre os dados reais do sistema. A IA mora no backend
// (POST /copiloto/perguntar); aqui só mandamos a pergunta e mostramos a resposta
// + as fontes (entidades de origem) como links clicáveis para a tela real.
import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles, Send, User, Car, Workflow, Wrench, CircleDollarSign, FileText,
  CheckCircle2, type LucideIcon,
} from "lucide-react";
import { api, ApiError } from "../api";
import { AreaTexto, Botao, Caixa, Drawer, TextoRico } from "./ui";

interface Fonte {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
}
// Registro pelo chat (Sprint 17 · decisão #79): o copiloto não escreve —
// propõe. O card mostra o resumo; o humano toca em "Confirmar e lançar" e só
// então a UI chama POST /copiloto/registrar, que grava tudo numa transação.
interface PropostaRegistro {
  acao: "registrar";
  chave: string;
  titulo: string;
  resumo: string;
  linhas: { rotulo: string; valor: string }[];
  endpoint: string;
  registro: unknown;
}
interface ResultadoRegistro {
  titulo: string;
  links: Fonte[];
  repetido: boolean;
}
interface Turno {
  pergunta: string;
  resposta?: string;
  fontes?: Fonte[];
  propostas?: PropostaRegistro[];
  /** Títulos do que foi confirmado neste turno — voltam ao copiloto no histórico. */
  registrados?: string[];
  erro?: string;
}

interface CopilotoCtx {
  abrir: (pergunta?: string) => void;
  fechar: () => void;
}
const Contexto = createContext<CopilotoCtx>({ abrir: () => {}, fechar: () => {} });
export const useCopiloto = () => useContext(Contexto);

// Cada tipo de fonte aponta para a tela real da entidade (reusa as mesmas rotas
// do sistema — a resposta nunca é um número solto, é um link verificável).
const ROTA_FONTE: Record<string, { icone: LucideIcon; rota?: (id: string) => string }> = {
  pessoa: { icone: User, rota: (id) => `/clientes/${id}` },
  ativo: { icone: Car, rota: (id) => `/ativos/${id}` },
  operacao: { icone: Workflow, rota: (id) => `/operacoes/${id}` },
  manutencao: { icone: Wrench, rota: (id) => `/manutencoes/${id}` },
  lancamento: { icone: CircleDollarSign, rota: (id) => `/financeiro?lancamento=${id}` },
  documento: { icone: FileText },
};

const EXEMPLOS = [
  "Hoje fizemos um guincho de R$ 400, lança aí",
  "Quais guinchos estão abertos?",
  "Quanto faturei este mês?",
  "Quais locações estão atrasadas?",
];

// Memória da conversa (Sprint 17): os turnos já respondidos voltam ao servidor a
// cada pergunta, para o copiloto perguntar o que falta e continuar o registro.
// O resumo das propostas entra junto — sem ele, "na verdade foram 450" não
// teria a que se referir.
const MAX_TURNOS_HISTORICO = 12;

function historicoDe(turnos: Turno[]): { pergunta: string; resposta: string }[] {
  return turnos
    .filter((t) => t.resposta !== undefined && !t.erro)
    .slice(-MAX_TURNOS_HISTORICO)
    .map((t) => {
      const propostas = (t.propostas ?? []).map((p) => `[Card de confirmação mostrado: ${p.titulo} — ${p.resumo}]`);
      const registrados = (t.registrados ?? []).map((r) => `[O usuário confirmou e foi gravado: ${r}]`);
      const resposta = [t.resposta, ...propostas, ...registrados].filter(Boolean).join("\n\n").trim();
      return { pergunta: t.pergunta, resposta: (resposta || "(sem resposta em texto)").slice(0, 8000) };
    });
}

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
      const historico = historicoDe(turnos);
      setTurnos((t) => [...t, { pergunta }]);
      try {
        const { dados } = await api.post<{ dados: { resposta: string; fontes: Fonte[]; propostas?: PropostaRegistro[] } }>(
          "/copiloto/perguntar",
          { pergunta, historico }
        );
        setTurnos((t) => atualizarUltimo(t, { resposta: dados.resposta, fontes: dados.fontes, propostas: dados.propostas }));
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Não consegui responder agora. Tente novamente.";
        setTurnos((t) => atualizarUltimo(t, { erro: msg }));
      } finally {
        setEnviando(false);
      }
    },
    [texto, enviando, turnos]
  );

  const abrir = useCallback((pergunta?: string) => {
    setAberto(true);
    if (pergunta && pergunta.trim()) pendente.current = pergunta.trim();
  }, []);

  const fecharPainel = useCallback(() => setAberto(false), []);

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

  const marcarRegistrado = (indice: number, titulo: string) =>
    setTurnos((ts) => ts.map((t, i) => (i === indice ? { ...t, registrados: [...(t.registrados ?? []), titulo] } : t)));

  const irParaFonte = (f: Fonte) => {
    const rota = ROTA_FONTE[f.entidade_tipo]?.rota;
    if (!rota) return;
    setAberto(false);
    navegar(rota(f.entidade_id));
  };

  return (
    <Contexto.Provider value={{ abrir, fechar: fecharPainel }}>
      {children}
      <Drawer aberto={aberto} aoFechar={() => setAberto(false)} titulo="Copiloto">
        <div className="flex min-h-[60vh] flex-col gap-4">
          {turnos.length > 0 && (
            <Botao
              variante="link"
              tamanho="xs"
              className="self-end"
              disabled={enviando}
              onClick={() => setTurnos([])}
            >
              Nova conversa
            </Botao>
          )}
          {turnos.length === 0 && (
            <div className="rounded-lg border border-borda bg-fundo/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-suave">
                <Sparkles className="h-4 w-4 text-ouro" /> Pergunte ou mande lançar
              </div>
              <p className="text-xs text-mudo">
                Respondo consultando os dados reais do sistema — nunca invento números.
                Conte um guincho, uma locação, uma venda, uma compra ou uma despesa: eu
                pergunto o que faltar e preparo o lançamento para você confirmar.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {EXEMPLOS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => enviar(ex)}
                    className="rounded-full bg-elevado px-3 py-1 text-xs font-medium text-suave ring-1 ring-inset ring-borda transition-colors duration-150 hover:text-ouro-claro hover:ring-ouro/60"
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
                  <TextoRico texto={t.resposta} />
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
                              "inline-flex items-center gap-1 rounded-full bg-elevado px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-borda transition-colors duration-150 " +
                              (clicavel
                                ? "text-suave hover:text-ouro-claro hover:ring-ouro/60"
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
              {/* Registro (decisão #79): o humano confirma; só então grava. */}
              {t.propostas?.map((p) => (
                <CardRegistro
                  key={p.chave}
                  proposta={p}
                  aoRegistrar={(titulo) => marcarRegistrado(i, titulo)}
                  aoAbrir={irParaFonte}
                />
              ))}
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
              placeholder="Pergunte, ou conte o que aconteceu para eu lançar…"
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

// Card de confirmação do registro (Sprint 17 · decisão #79). Mostra o que o
// copiloto entendeu, linha a linha; um toque grava tudo pelo endpoint, com a
// autoria de quem tocou. Erro aparece no card (nunca falha calado); o sucesso
// vira links para cada coisa criada — operação, cliente, ativo, lançamentos.
function CardRegistro({
  proposta, aoRegistrar, aoAbrir,
}: {
  proposta: PropostaRegistro;
  aoRegistrar: (titulo: string) => void;
  aoAbrir: (f: Fonte) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoRegistro | null>(null);

  const confirmar = async () => {
    if (confirmando || resultado) return;
    setConfirmando(true);
    setErro("");
    try {
      const { dados } = await api.post<{ dados: ResultadoRegistro }>("/copiloto/registrar", {
        chave: proposta.chave,
        registro: proposta.registro,
      });
      setResultado(dados);
      aoRegistrar(dados.titulo);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não consegui lançar agora. Tente de novo.");
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <Caixa
      tom={resultado ? "ok" : "ouro"}
      icone={resultado ? CheckCircle2 : Sparkles}
      titulo={resultado ? resultado.titulo : proposta.titulo}
      className="max-w-[92%]"
    >
      {!resultado && (
        <>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {proposta.linhas.map((l) => (
              <div key={l.rotulo} className="contents">
                <dt className="text-mudo">{l.rotulo}</dt>
                <dd className="text-texto">{l.valor}</dd>
              </div>
            ))}
          </dl>
          {erro && (
            <Caixa tom="erro" className="mt-2">
              {erro}
            </Caixa>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Botao tamanho="sm" carregando={confirmando} onClick={confirmar}>
              Confirmar e lançar
            </Botao>
            <span className="text-[11px] text-mudo">Nada foi gravado ainda. Algo errado? Me diga aqui no chat.</span>
          </div>
        </>
      )}
      {resultado && (
        <>
          {resultado.repetido && (
            <p className="mt-1 text-xs text-mudo">Isso já tinha sido lançado — nada foi duplicado.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {resultado.links.map((f) => {
              const Icone = ROTA_FONTE[f.entidade_tipo]?.icone ?? FileText;
              return (
                <button
                  key={`${f.entidade_tipo}:${f.entidade_id}`}
                  onClick={() => aoAbrir(f)}
                  className="inline-flex items-center gap-1 rounded-full bg-elevado px-2 py-0.5 text-[11px] font-medium text-suave ring-1 ring-inset ring-borda transition-colors duration-150 hover:text-ouro-claro hover:ring-ouro/60"
                >
                  <Icone className="h-3 w-3 shrink-0" />
                  <span className="max-w-[14rem] truncate">{f.titulo}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Caixa>
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
