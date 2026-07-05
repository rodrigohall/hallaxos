// Dashboard Financeiro: dois cortes do mesmo dado — por CONTA (onde está o
// dinheiro) e por ORIGEM/TIPO (de onde veio). Tudo é consulta sobre o núcleo;
// nenhum dado próprio. Decisão #60 (endpoint separado do operacional).
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, TrendingUp, TrendingDown, ArrowDownToLine, ArrowUpFromLine,
  AlertCircle, Truck, KeyRound, ShoppingCart, Wrench, ReceiptText,
  ChevronDown, Link2, Pencil, Ban, Search, X, ChevronRight,
  BarChart3, CircleDollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FORMAS_PAGAMENTO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, BotaoIcone, Caixa, Card, Campo, Entrada, Selecao, Modal, Segmentado,
  Skeleton, SkeletonLinhas, EstadoVazio, Selo, dinheiro, dataCurta, useToast,
} from "../componentes/ui";

// ─────────────────────────────── Tipos ────────────────────────────────────

interface Conta { id: string; nome: string; saldo: string }

interface TipoOrigem {
  receita_paga: number; despesa_paga: number;
  receita_prevista: number; despesa_prevista: number;
  vencido_receitas: number; vencido_despesas: number;
  liquido: number; qtd: number;
}
interface FinanceiroPorOrigem {
  periodo: string;
  tipos: Record<string, TipoOrigem>;
  total: {
    receita_paga: number; despesa_paga: number; liquido: number;
    a_receber: number; a_pagar: number;
    vencido_receitas: number; vencido_despesas: number;
  };
}

interface Lancamento {
  id: string; tipo: string; descricao: string; valor: string; status: string;
  dataVencimento: string; dataPagamento: string | null; vencido: boolean;
  categoria: string; conta: string; pessoa: string | null;
  categoriaId: string; contaId: string; ativoId: string | null;
  formaPagamento: string | null; temOrigem: boolean;
  operacaoId: string | null; manutencaoId: string | null;
}
interface Categoria { id: string; nome: string; tipo: string }
interface LancamentosResp { dados: Lancamento[]; meta: { total: number } }

interface AtivoLancamento extends Lancamento { origem: string }
interface AtivoInfo { id: string; nome: string; codigo: string }
interface BuscaResultado { entidade_tipo: string; entidade_id: string; titulo: string; subtitulo: string }

// ─────────────────────────────── Constantes ───────────────────────────────

type Periodo = "hoje" | "semana" | "mes" | "ano" | "ultimos30";
const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "hoje",      rotulo: "Hoje" },
  { id: "semana",    rotulo: "Semana" },
  { id: "mes",       rotulo: "Mês" },
  { id: "ano",       rotulo: "Ano" },
  { id: "ultimos30", rotulo: "30 dias" },
];

type Indicador = "receita_paga" | "despesa_paga" | "liquido" | "receita_prevista" | "despesa_prevista" | "vencido_receitas" | "vencido_despesas";
const INDICADORES: { id: Indicador; rotulo: string; icone: LucideIcon; tom: "ok" | "erro" | "ouro" | "neutro" }[] = [
  { id: "receita_paga",       rotulo: "Receita paga",       icone: TrendingUp,        tom: "ok" },
  { id: "despesa_paga",       rotulo: "Despesa paga",       icone: TrendingDown,      tom: "erro" },
  { id: "liquido",            rotulo: "Líquido",            icone: BarChart3,          tom: "ouro" },
  { id: "receita_prevista",   rotulo: "A receber",          icone: ArrowDownToLine,   tom: "ok" },
  { id: "despesa_prevista",   rotulo: "A pagar",            icone: ArrowUpFromLine,   tom: "erro" },
  { id: "vencido_receitas",   rotulo: "Vencido (receita)",  icone: AlertCircle,       tom: "erro" },
  { id: "vencido_despesas",   rotulo: "Vencido (despesa)",  icone: AlertCircle,       tom: "erro" },
];

const ORIGENS: { id: string; rotulo: string; icone: LucideIcon }[] = [
  { id: "guincho",   rotulo: "Guincho",   icone: Truck },
  { id: "locacao",   rotulo: "Locação",   icone: KeyRound },
  { id: "manutencao", rotulo: "Manutenção", icone: Wrench },
  { id: "avulso",    rotulo: "Avulso",    icone: ReceiptText },
  { id: "venda",     rotulo: "Venda",     icone: TrendingUp },
  { id: "compra",    rotulo: "Compra",    icone: ShoppingCart },
];

const LS_CONTAS = "hallax_dashboard_fin_contas"; // chave localStorage

// ─────────────────────────────── Componente ───────────────────────────────

export function DashboardFinanceiro() {
  const { pode, usuario } = useAuth();
  const ehAdmin = usuario?.papel === "admin";
  const notificar = useToast();
  const fila = useQueryClient();

  const [periodo, setPeriodo] = useState<Periodo | "custom">("mes");
  // Sprint 14 · F1 — intervalo customizado: do 1º dia do mês até hoje por padrão
  const hoje = new Date().toISOString().slice(0, 10);
  const [deCustom, setDeCustom] = useState(hoje.slice(0, 8) + "01");
  const [ateCustom, setAteCustom] = useState(hoje);
  const customValido = periodo === "custom" && !!deCustom && !!ateCustom;

  // Linha 1: conta escolhida por caixa (localStorage, não banco)
  const [contasCaixas, setContasCaixas] = useState<(string | null)[]>(() => {
    try {
      const s = localStorage.getItem(LS_CONTAS);
      return s ? JSON.parse(s) : [null, null, null, null];
    } catch { return [null, null, null, null]; }
  });
  const salvarContas = (arr: (string | null)[]) => {
    setContasCaixas(arr);
    localStorage.setItem(LS_CONTAS, JSON.stringify(arr));
  };

  // Linha 2: indicador global alternável
  const [indicador, setIndicador] = useState<Indicador>("receita_paga");

  // Drill-down: qual caixa está expandida e o tipo de drill-down
  const [drill, setDrill] = useState<
    | { tipo: "conta"; contaId: string; nome: string }
    | { tipo: "origem"; origemId: string; rotulo: string }
    | { tipo: "ativo"; ativoId: string; nome: string }
    | null
  >(null);

  // Seção de ativos: busca + lançamentos do ativo selecionado
  const [buscaAtivo, setBuscaAtivo] = useState("");
  const [resAtivos, setResAtivos] = useState<BuscaResultado[]>([]);
  const timerBusca = useRef<ReturnType<typeof setTimeout>>();

  // Modal de edição de lançamento
  const [editarLanc, setEditarLanc] = useState<Lancamento | null>(null);
  const [formEd, setFormEd] = useState({ descricao: "", valor: "", data_vencimento: "", categoria_id: "", conta_id: "", forma_pagamento: "", data_pagamento: "" });
  const [erroEd, setErroEd] = useState("");
  const [salvandoEd, setSalvandoEd] = useState(false);

  // Modal de linkar lançamento → ativo
  const [linkarLanc, setLinkarLanc] = useState<Lancamento | null>(null);
  const [buscaAtivLink, setBuscaAtivLink] = useState("");
  const [resAtivLink, setResAtivLink] = useState<BuscaResultado[]>([]);
  const timerLink = useRef<ReturnType<typeof setTimeout>>();
  const [salvandoLink, setSalvandoLink] = useState(false);

  // ── Dados ──

  const { data: contas, isLoading: loadContas } = useQuery({
    queryKey: ["contas"],
    queryFn: () => api.get<{ dados: Conta[] }>("/contas").then((r) => r.dados),
  });

  const { data: categorias } = useQuery({
    queryKey: ["categorias-financeiras"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/categorias-financeiras").then((r) => r.dados),
  });

  const { data: porOrigem, isLoading: loadOrigem } = useQuery({
    queryKey: ["dashboard-fin-por-origem", periodo, deCustom, ateCustom],
    queryFn: () =>
      api.get<{ dados: FinanceiroPorOrigem }>(
        periodo === "custom"
          ? `/dashboard/financeiro/por-origem?de=${deCustom}&ate=${ateCustom}`
          : `/dashboard/financeiro/por-origem?periodo=${periodo}`
      ).then((r) => r.dados),
    // Custom só consulta com as duas datas preenchidas (sem falha silenciosa:
    // os inputs ficam visíveis aguardando preenchimento).
    enabled: pode("dashboard_financeiro", "ler") && (periodo !== "custom" || customValido),
  });

  // Drill-down lancamentos
  const { data: drillLanc, isLoading: loadDrill } = useQuery({
    queryKey: ["drill-lancamentos", drill],
    queryFn: async () => {
      if (!drill) return null;
      if (drill.tipo === "conta") {
        return api.get<LancamentosResp>(`/lancamentos?conta_id=${drill.contaId}&por_pagina=50`).then((r) => r);
      }
      if (drill.tipo === "origem") {
        return api.get<LancamentosResp>(`/lancamentos?operacao_tipo=${drill.origemId}&por_pagina=50`).then((r) => r);
      }
      if (drill.tipo === "ativo") {
        return api.get<{ dados: AtivoLancamento[]; meta: { total: number } }>(`/ativos/${drill.ativoId}/lancamentos`).then((r) => r);
      }
      return null;
    },
    enabled: !!drill,
  });

  // Busca de ativos para a seção de ativos
  useEffect(() => {
    clearTimeout(timerBusca.current);
    if (buscaAtivo.trim().length < 2) { setResAtivos([]); return; }
    timerBusca.current = setTimeout(() => {
      api.get<{ dados: BuscaResultado[] }>(`/busca?q=${encodeURIComponent(buscaAtivo)}`)
        .then(({ dados }) => setResAtivos(dados.filter((r) => r.entidade_tipo === "ativo")))
        .catch(() => setResAtivos([]));
    }, 250);
  }, [buscaAtivo]);

  // Busca de ativos para linkar lançamento
  useEffect(() => {
    clearTimeout(timerLink.current);
    if (buscaAtivLink.trim().length < 2) { setResAtivLink([]); return; }
    timerLink.current = setTimeout(() => {
      api.get<{ dados: BuscaResultado[] }>(`/busca?q=${encodeURIComponent(buscaAtivLink)}`)
        .then(({ dados }) => setResAtivLink(dados.filter((r) => r.entidade_tipo === "ativo")))
        .catch(() => setResAtivLink([]));
    }, 250);
  }, [buscaAtivLink]);

  const abrirDrill = (d: typeof drill) => {
    setDrill((prev) => (prev?.tipo === d?.tipo && (prev as any)?.contaId === (d as any)?.contaId
      && (prev as any)?.origemId === (d as any)?.origemId
      && (prev as any)?.ativoId === (d as any)?.ativoId) ? null : d);
  };

  const efetuarLink = async (lancId: string, ativoId: string) => {
    setSalvandoLink(true);
    try {
      await api.patch(`/lancamentos/${lancId}`, { ativo_id: ativoId });
      fila.invalidateQueries({ queryKey: ["drill-lancamentos"] });
      notificar({ tipo: "ok", titulo: "Lançamento vinculado ao ativo" });
      setLinkarLanc(null);
      setBuscaAtivLink("");
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Erro ao vincular", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSalvandoLink(false);
    }
  };

  const abrirEdicao = (l: Lancamento) => {
    setEditarLanc(l);
    setErroEd("");
    setFormEd({
      descricao: l.descricao,
      valor: l.valor,
      data_vencimento: l.dataVencimento,
      categoria_id: l.categoriaId,
      conta_id: l.contaId,
      forma_pagamento: l.formaPagamento ?? "",
      data_pagamento: l.dataPagamento ?? "",
    });
  };

  const salvarEdicao = async (e: FormEvent) => {
    e.preventDefault();
    if (!editarLanc) return;
    setErroEd("");
    setSalvandoEd(true);
    try {
      const payload: Record<string, unknown> = {
        descricao: formEd.descricao,
        valor: Number(formEd.valor),
        data_vencimento: formEd.data_vencimento,
        categoria_id: formEd.categoria_id,
        conta_id: formEd.conta_id,
        forma_pagamento: formEd.forma_pagamento || null,
      };
      if (editarLanc.status === "pago" && formEd.data_pagamento) payload.data_pagamento = formEd.data_pagamento;
      await api.patch(`/lancamentos/${editarLanc.id}`, payload);
      fila.invalidateQueries({ queryKey: ["drill-lancamentos"] });
      fila.invalidateQueries({ queryKey: ["dashboard-fin-por-origem"] });
      notificar({ tipo: "ok", titulo: "Lançamento atualizado" });
      setEditarLanc(null);
    } catch (err) {
      setErroEd(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSalvandoEd(false);
    }
  };

  // ── Render ──

  const indInfo = INDICADORES.find((i) => i.id === indicador)!;

  if (!pode("dashboard_financeiro", "ler")) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-lg font-bold">Dashboard Financeiro</h1>
        <EstadoVazio titulo="Sem permissão" descricao="Seu perfil não tem acesso ao financeiro." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-lg font-bold">Dashboard Financeiro</h1>
          <p className="text-sm text-suave">Dois cortes do mesmo dado: por conta e por origem.</p>
        </div>
        {/* Seletor de período */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmentado
            opcoes={[...PERIODOS, { id: "custom" as const, rotulo: "Personalizado" }].map((p) => ({
              id: p.id,
              rotulo: p.rotulo,
            }))}
            valor={periodo}
            aoTrocar={(v) => setPeriodo(v as Periodo | "custom")}
          />
          {/* Sprint 14 · F1 — intervalo de data X a data Y */}
          {periodo === "custom" && (
            <span className="animar-surgir flex items-center gap-1.5">
              <span className="w-34">
                <Entrada
                  type="date"
                  value={deCustom}
                  max={ateCustom || undefined}
                  onChange={(e) => setDeCustom(e.target.value)}
                  className="h-8 px-2 text-xs"
                  aria-label="Data inicial"
                />
              </span>
              <span className="text-xs text-mudo">a</span>
              <span className="w-34">
                <Entrada
                  type="date"
                  value={ateCustom}
                  min={deCustom || undefined}
                  onChange={(e) => setAteCustom(e.target.value)}
                  className="h-8 px-2 text-xs"
                  aria-label="Data final"
                />
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ─── Linha 1: 4 caixas por CONTA ─── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-suave flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" /> Por conta — onde o dinheiro está
        </h2>
        {loadContas ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          <div className="animar-cascata grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <CaixaConta
                key={i}
                indice={i}
                contaId={contasCaixas[i] ?? null}
                contas={contas ?? []}
                periodo={periodo}
                ativa={drill?.tipo === "conta" && drill.contaId === (contasCaixas[i] ?? "")}
                aoEscolher={(id) => {
                  const novo = [...contasCaixas];
                  novo[i] = id;
                  salvarContas(novo);
                }}
                aoAbrir={(contaId, nome) => abrirDrill({ tipo: "conta", contaId, nome })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ─── Linha 2: 4 caixas por ORIGEM ─── */}
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-suave flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Por origem — de onde veio
          </h2>
          {/* Alternador de indicador */}
          <Segmentado
            className="ml-auto flex-wrap"
            opcoes={INDICADORES.map((ind) => ({
              id: ind.id,
              rotulo: (
                <span className="flex items-center gap-1">
                  <ind.icone className="h-3 w-3" />
                  {ind.rotulo}
                </span>
              ),
            }))}
            valor={indicador}
            aoTrocar={setIndicador}
          />
        </div>

        {loadOrigem ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <>
            <div className="animar-cascata grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {ORIGENS.map((origem) => {
                const dados = porOrigem?.tipos[origem.id];
                const valor = dados ? dados[indicador] : 0;
                const ativa = drill?.tipo === "origem" && drill.origemId === origem.id;
                return (
                  <CaixaOrigem
                    key={origem.id}
                    origem={origem}
                    valor={valor ?? 0}
                    indicador={indInfo}
                    ativa={ativa}
                    aoAbrir={() => abrirDrill({ tipo: "origem", origemId: origem.id, rotulo: origem.rotulo })}
                  />
                );
              })}
            </div>

            {/* Totais */}
            {porOrigem && (
              <div className="animar-surgir mt-3 grid grid-cols-2 gap-2 rounded-md border border-borda bg-elevado/50 p-3 sm:grid-cols-4">
                <Total rotulo="Receita paga" valor={porOrigem.total.receita_paga} tom="ok" />
                <Total rotulo="Despesa paga" valor={porOrigem.total.despesa_paga} tom="erro" />
                <Total rotulo="Líquido" valor={porOrigem.total.liquido} tom={porOrigem.total.liquido >= 0 ? "ok" : "erro"} />
                <Total rotulo="A receber" valor={porOrigem.total.a_receber} tom="ouro" />
                <Total rotulo="A pagar" valor={porOrigem.total.a_pagar} tom="erro" />
                <Total rotulo="Venc. receita" valor={porOrigem.total.vencido_receitas} tom="erro" />
                <Total rotulo="Venc. despesa" valor={porOrigem.total.vencido_despesas} tom="erro" />
              </div>
            )}
          </>
        )}
      </section>

      {/* ─── Drill-down list ─── */}
      {drill && (
        <section className="animar-surgir">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-suave">
              {drill.tipo === "conta" && `Lançamentos — ${drill.nome}`}
              {drill.tipo === "origem" && `Lançamentos — ${drill.rotulo}`}
              {drill.tipo === "ativo" && `Lançamentos — ${drill.nome}`}
            </h3>
            <BotaoIcone rotulo="Fechar" icone={X} tamanho="sm" className="ml-auto" onClick={() => setDrill(null)} />
          </div>
          {loadDrill ? (
            <SkeletonLinhas linhas={5} />
          ) : (
            <ListaDrillDown
              lancamentos={(drillLanc?.dados ?? []) as Lancamento[]}
              total={drillLanc?.meta?.total ?? 0}
              ehAdmin={ehAdmin}
              podeEditar={pode("lancamentos", "editar")}
              podeTransicionar={pode("lancamentos", "transicionar")}
              aoEditar={abrirEdicao}
              aoLinkar={setLinkarLanc}
              onAtualizar={() => fila.invalidateQueries({ queryKey: ["drill-lancamentos"] })}
            />
          )}
        </section>
      )}

      {/* ─── Seção Ativos: drill-down por ativo ─── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-suave flex items-center gap-1.5">
          <CircleDollarSign className="h-3.5 w-3.5" /> Drill-down por ativo
          <span className="normal-case font-normal text-mudo">— diretos + herdados, com origem marcada</span>
        </h2>
        <Card>
          <Campo rotulo="Buscar ativo">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mudo" />
              <Entrada
                className="pl-9"
                value={buscaAtivo}
                onChange={(e) => setBuscaAtivo(e.target.value)}
                placeholder="Nome, código ou placa do ativo…"
              />
            </div>
          </Campo>
          {resAtivos.length > 0 && (
            <div className="mt-2 space-y-1">
              {resAtivos.map((r) => (
                <button
                  key={r.entidade_id}
                  onClick={() => {
                    abrirDrill({ tipo: "ativo", ativoId: r.entidade_id, nome: r.titulo });
                    setBuscaAtivo("");
                    setResAtivos([]);
                  }}
                  className="w-full flex items-center gap-3 rounded-lg p-2.5 text-left hover:bg-elevado transition-colors"
                >
                  <CircleDollarSign className="h-4 w-4 shrink-0 text-ouro" />
                  <div>
                    <p className="text-sm font-medium">{r.titulo}</p>
                    <p className="text-xs text-suave">{r.subtitulo}</p>
                  </div>
                  <ChevronRight className="ml-auto h-4 w-4 text-mudo" />
                </button>
              ))}
            </div>
          )}
          {drill?.tipo === "ativo" && (
            <div className="mt-4">
              <p className="text-xs text-suave mb-2">
                Lançamentos de <strong>{drill.nome}</strong>
              </p>
              {loadDrill ? (
                <SkeletonLinhas linhas={5} />
              ) : (
                <ListaDrillDown
                  lancamentos={(drillLanc?.dados ?? []) as Lancamento[]}
                  total={drillLanc?.meta?.total ?? 0}
                  ehAdmin={ehAdmin}
                  podeEditar={pode("lancamentos", "editar")}
                  podeTransicionar={pode("lancamentos", "transicionar")}
                  aoEditar={abrirEdicao}
              aoLinkar={setLinkarLanc}
                  mostrarOrigem
                  onAtualizar={() => fila.invalidateQueries({ queryKey: ["drill-lancamentos"] })}
                />
              )}
            </div>
          )}
        </Card>
      </section>

      {/* Modal: editar lançamento */}
      <Modal aberto={!!editarLanc} aoFechar={() => setEditarLanc(null)} titulo="Editar lançamento">
        {editarLanc && (
          <form onSubmit={salvarEdicao} className="space-y-4">
            {editarLanc.temOrigem && (
              <Caixa tom="info" className="text-xs text-suave">
                Lançamento gerado por uma operação/manutenção. Editar aqui corrige o valor sem desfazer o vínculo.
              </Caixa>
            )}
            <Campo rotulo="Descrição">
              <Entrada required value={formEd.descricao} onChange={(e) => setFormEd({ ...formEd, descricao: e.target.value })} />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo rotulo="Valor (R$)">
                <Entrada type="number" step="0.01" min="0.01" required value={formEd.valor}
                  onChange={(e) => setFormEd({ ...formEd, valor: e.target.value })} />
              </Campo>
              <Campo rotulo="Vencimento">
                <Entrada type="date" required value={formEd.data_vencimento}
                  onChange={(e) => setFormEd({ ...formEd, data_vencimento: e.target.value })} />
              </Campo>
              <Campo rotulo="Categoria">
                <Selecao required value={formEd.categoria_id} onChange={(e) => setFormEd({ ...formEd, categoria_id: e.target.value })}>
                  <option value="">Escolha…</option>
                  {categorias?.filter((c) => c.tipo === editarLanc.tipo).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Conta">
                <Selecao required value={formEd.conta_id} onChange={(e) => setFormEd({ ...formEd, conta_id: e.target.value })}>
                  <option value="">Escolha…</option>
                  {contas?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Forma de pagamento">
                <Selecao value={formEd.forma_pagamento} onChange={(e) => setFormEd({ ...formEd, forma_pagamento: e.target.value })}>
                  <option value="">—</option>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
                </Selecao>
              </Campo>
              {editarLanc.status === "pago" && (
                <Campo rotulo="Data do pagamento" dica="Retroativo">
                  <Entrada type="date" value={formEd.data_pagamento}
                    onChange={(e) => setFormEd({ ...formEd, data_pagamento: e.target.value })} />
                </Campo>
              )}
            </div>
            {erroEd && <p className="text-sm text-erro">{erroEd}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="fantasma" onClick={() => setEditarLanc(null)}>Cancelar</Botao>
              <Botao type="submit" carregando={salvandoEd}>Salvar</Botao>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: linkar lançamento → ativo */}
      {linkarLanc && (
        <Modal aberto aoFechar={() => { setLinkarLanc(null); setBuscaAtivLink(""); }} titulo="Vincular ao ativo">
          <div className="space-y-4">
            <p className="text-sm text-suave">
              Associe <strong>{linkarLanc.descricao}</strong> a um ativo para incluí-lo no resultado/ROI desse ativo.
            </p>
            {linkarLanc.ativoId && (
              <p className="text-xs text-ouro">Este lançamento já tem um ativo vinculado. Sobrescrever.</p>
            )}
            <Campo rotulo="Buscar ativo">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-mudo" />
                <Entrada
                  className="pl-9"
                  value={buscaAtivLink}
                  onChange={(e) => setBuscaAtivLink(e.target.value)}
                  placeholder="Nome ou código do ativo…"
                  autoFocus
                />
              </div>
            </Campo>
            {resAtivLink.length > 0 && (
              <div className="space-y-1">
                {resAtivLink.map((r) => (
                  <button
                    key={r.entidade_id}
                    onClick={() => efetuarLink(linkarLanc.id, r.entidade_id)}
                    disabled={salvandoLink}
                    className="w-full flex items-center gap-3 rounded-lg p-2.5 text-left hover:bg-elevado transition-colors disabled:opacity-50"
                  >
                    <CircleDollarSign className="h-4 w-4 shrink-0 text-ouro" />
                    <div>
                      <p className="text-sm font-medium">{r.titulo}</p>
                      <p className="text-xs text-suave">{r.subtitulo}</p>
                    </div>
                    <Link2 className="ml-auto h-4 w-4 text-mudo" />
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Botao variante="fantasma" onClick={() => { setLinkarLanc(null); setBuscaAtivLink(""); }}>
                Cancelar
              </Botao>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────── Sub-componentes ──────────────────────────────

function CaixaConta({
  indice, contaId, contas, periodo, ativa, aoEscolher, aoAbrir,
}: {
  indice: number; contaId: string | null; contas: Conta[];
  periodo: string; ativa: boolean;
  aoEscolher: (id: string) => void;
  aoAbrir: (contaId: string, nome: string) => void;
}) {
  const conta = contas.find((c) => c.id === contaId);

  return (
    <div
      className={`animar-surgir superficie rounded-lg border p-4 shadow-painel
        ${ativa ? "border-ouro ring-1 ring-ouro/30" : "border-borda"}
        ${conta ? "elevar cursor-pointer" : ""}`}
      onClick={() => { if (conta) aoAbrir(conta.id, conta.nome); }}
    >
      {!conta ? (
        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 text-mudo">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Caixa {indice + 1}</span>
          </div>
          <Selecao value="" onChange={(e) => aoEscolher(e.target.value)}>
            <option value="">Escolha uma conta…</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 text-mudo">
            <Wallet className="h-4 w-4 shrink-0" />
            <span className="truncate text-xs font-medium uppercase tracking-wider">{conta.nome}</span>
            <BotaoIcone
              rotulo="Trocar conta"
              icone={ChevronDown}
              tamanho="sm"
              className="-my-1 ml-auto"
              onClick={(e) => { e.stopPropagation(); aoEscolher(""); }}
            />
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-texto">
            {dinheiro(Number(conta.saldo))}
          </p>
          <p className={`mt-1 text-xs ${ativa ? "font-medium text-ouro" : "text-mudo"}`}>
            {ativa ? "Ver lançamentos ↓" : "saldo atual"}
          </p>
        </div>
      )}
    </div>
  );
}

function CaixaOrigem({
  origem, valor, indicador, ativa, aoAbrir,
}: {
  origem: { id: string; rotulo: string; icone: LucideIcon };
  valor: number;
  indicador: typeof INDICADORES[number];
  ativa: boolean;
  aoAbrir: () => void;
}) {
  const negativo = valor < 0;
  return (
    <button
      onClick={aoAbrir}
      className={`animar-surgir superficie elevar rounded-lg border p-4 text-left shadow-painel
        ${ativa ? "border-ouro ring-1 ring-ouro/30" : "border-borda"}`}
    >
      <div className="flex items-center gap-2 text-mudo">
        <origem.icone className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{origem.rotulo}</span>
      </div>
      <p className={`mt-2 font-display text-xl font-bold
        ${negativo ? "text-erro" : indicador.tom === "ok" ? "text-ok" : indicador.tom === "erro" ? "text-erro" : indicador.tom === "ouro" ? "text-ouro" : "text-texto"}`}>
        {dinheiro(Math.abs(valor))}
        {negativo && <span className="ml-1 text-xs">↓</span>}
      </p>
      <p className="mt-1 text-xs text-mudo">{indicador.rotulo}</p>
    </button>
  );
}

function Total({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: "ok" | "erro" | "ouro" }) {
  const cor = { ok: "text-ok", erro: "text-erro", ouro: "text-ouro" }[tom];
  return (
    <div>
      <p className="text-xs text-mudo">{rotulo}</p>
      <p className={`text-sm font-semibold ${cor}`}>{dinheiro(valor)}</p>
    </div>
  );
}

function ListaDrillDown({
  lancamentos, total, ehAdmin, podeEditar, podeTransicionar, aoEditar, aoLinkar, mostrarOrigem, onAtualizar,
}: {
  lancamentos: Lancamento[];
  total: number;
  ehAdmin: boolean;
  podeEditar: boolean;
  podeTransicionar: boolean;
  aoEditar: (l: Lancamento) => void;
  aoLinkar: (l: Lancamento) => void;
  mostrarOrigem?: boolean;
  onAtualizar: () => void;
}) {
  const notificar = useToast();
  const fila = useQueryClient();

  if (lancamentos.length === 0) {
    return <EstadoVazio titulo="Nenhum lançamento" descricao="Não há lançamentos neste filtro." />;
  }

  const anular = async (l: Lancamento) => {
    if (!ehAdmin) return;
    const motivo = prompt("Motivo da anulação:");
    if (!motivo) return;
    try {
      await api.post(`/lancamentos/${l.id}/anular`, { motivo });
      onAtualizar();
      fila.invalidateQueries({ queryKey: ["lancamentos"] });
      notificar({ tipo: "ok", titulo: "Lançamento anulado" });
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Erro ao anular", descricao: e instanceof ApiError ? e.message : undefined });
    }
  };

  return (
    <div className="space-y-1.5">
      {total > lancamentos.length && (
        <p className="text-xs text-suave">Mostrando {lancamentos.length} de {total} lançamentos.</p>
      )}
      {lancamentos.map((l) => {
        const vencido = l.status === "previsto" && new Date(l.dataVencimento) < new Date();
        const origem = mostrarOrigem ? (l as unknown as { origem?: string }).origem : undefined;
        return (
          <div key={l.id} className="superficie flex items-start gap-2 rounded-md border border-borda p-3 transition-colors hover:border-borda-forte">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-medium ${l.tipo === "receita" ? "text-ok" : "text-erro"}`}>
                  {l.tipo === "receita" ? "+" : "-"}{dinheiro(Number(l.valor))}
                </span>
                <span className="text-sm truncate">{l.descricao}</span>
                <Selo tom={l.status === "pago" ? "ok" : vencido ? "erro" : "info"}>
                  {l.status === "pago" ? "Pago" : vencido ? "Vencido" : l.status === "cancelado" ? "Anulado" : "Previsto"}
                </Selo>
                {origem && <Selo>{origem}</Selo>}
              </div>
              <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-mudo">
                <span>{l.categoria}</span>
                <span>{l.conta}</span>
                {l.status === "pago" && l.dataPagamento && (
                  <span>Pago em {dataCurta(l.dataPagamento)}</span>
                )}
                {l.status !== "pago" && (
                  <span>Vence {dataCurta(l.dataVencimento)}</span>
                )}
                {l.ativoId && <span className="text-ouro flex items-center gap-0.5"><Link2 className="h-2.5 w-2.5" /> vinculado</span>}
              </div>
            </div>
            {/* Ações */}
            <div className="flex shrink-0 items-center gap-1">
              {podeEditar && l.status !== "cancelado" && (
                <BotaoIcone rotulo="Editar" icone={Pencil} tamanho="sm" onClick={() => aoEditar(l)} />
              )}
              {!l.ativoId && podeEditar && (
                <BotaoIcone rotulo="Vincular ao ativo" icone={Link2} tamanho="sm" tom="ouro" onClick={() => aoLinkar(l)} />
              )}
              {ehAdmin && l.status !== "cancelado" && (
                <BotaoIcone rotulo="Anular" icone={Ban} tamanho="sm" tom="erro" onClick={() => anular(l)} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
