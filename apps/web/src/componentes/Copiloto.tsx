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
import { AreaTexto, Botao, Campo, Entrada, Selecao, Drawer } from "./ui";

interface Fonte {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
}
// Fase 2: proposta de ação. O copiloto não escreve — propõe; o humano confirma
// aqui, e só então a UI dispara o endpoint existente (decisão #43).
interface Proposta {
  acao: "criar_lancamento";
  titulo: string;
  resumo: string;
  endpoint: string;
  payload: { tipo: "receita" | "despesa"; descricao: string; valor: number; data_vencimento: string | null };
}
interface Turno {
  pergunta: string;
  resposta?: string;
  fontes?: Fonte[];
  propostas?: Proposta[];
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
        const { dados } = await api.post<{ dados: { resposta: string; fontes: Fonte[]; propostas?: Proposta[] } }>(
          "/copiloto/perguntar",
          { pergunta }
        );
        setTurnos((t) => atualizarUltimo(t, { resposta: dados.resposta, fontes: dados.fontes, propostas: dados.propostas }));
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
              {/* Propostas de ação (Fase 2): o humano confirma; só então cria. */}
              {t.propostas?.map((p, j) => (
                <PropostaLancamento key={j} proposta={p} />
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

// Card de proposta (Fase 2): o copiloto sugere, o humano revisa (conta/categoria/
// vencimento) e confirma — só então dispara POST /lancamentos, com a própria
// autoria. A criação fica na timeline/auditoria como qualquer outro lançamento.
interface ContaOpt { id: string; nome: string }
interface CategoriaOpt { id: string; nome: string; tipo: string }

function PropostaLancamento({ proposta }: { proposta: Proposta }) {
  const navegar = useNavigate();
  const [contas, setContas] = useState<ContaOpt[]>([]);
  const [categorias, setCategorias] = useState<CategoriaOpt[]>([]);
  const [contaId, setContaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const hoje = new Date().toISOString().slice(0, 10);
  const [vencimento, setVencimento] = useState(proposta.payload.data_vencimento ?? hoje);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ dados: ContaOpt[] }>("/contas").then((r) => r.dados).catch(() => []),
      api.get<{ dados: CategoriaOpt[] }>("/categorias-financeiras").then((r) => r.dados).catch(() => []),
    ]).then(([c, cat]) => {
      setContas(c);
      setCategorias(cat);
    });
  }, []);

  const cats = categorias.filter((c) => c.tipo === proposta.payload.tipo);

  const confirmar = async () => {
    if (!contaId || !categoriaId) {
      setErro("Escolha a conta e a categoria.");
      return;
    }
    setConfirmando(true);
    setErro("");
    try {
      await api.post("/lancamentos", {
        tipo: proposta.payload.tipo,
        descricao: proposta.payload.descricao,
        valor: proposta.payload.valor,
        data_vencimento: vencimento,
        parcelas: 1,
        pago: false,
        conta_id: contaId,
        categoria_id: categoriaId,
      });
      setFeito(true);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível criar o lançamento.");
    } finally {
      setConfirmando(false);
    }
  };

  if (feito) {
    return (
      <div className="max-w-[92%] rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-sm">
        <div className="flex items-center gap-2 text-ok">
          <CheckCircle2 className="h-4 w-4" /> Lançamento criado.
        </div>
        <button
          onClick={() => navegar("/financeiro")}
          className="mt-1 text-xs text-suave underline hover:text-ouro-claro"
        >
          Ver no financeiro
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[92%] space-y-2 rounded-lg border border-ouro/30 bg-ouro/5 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-texto">
        <Sparkles className="h-3.5 w-3.5 text-ouro" /> {proposta.titulo}
      </div>
      <p className="text-xs text-mudo">{proposta.resumo}</p>
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Conta">
          <Selecao value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">Escolher…</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Categoria">
          <Selecao value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Escolher…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        </Campo>
      </div>
      <Campo rotulo="Vencimento">
        <Entrada type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
      </Campo>
      {erro && <p className="text-xs text-erro">{erro}</p>}
      <div className="flex justify-end">
        <Botao tamanho="sm" carregando={confirmando} onClick={confirmar}>Confirmar e criar</Botao>
      </div>
    </div>
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
