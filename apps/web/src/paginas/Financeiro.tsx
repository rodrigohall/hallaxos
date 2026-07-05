import { useState, useEffect, useRef, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Plus, CircleDollarSign, CheckCircle2, Undo2, XCircle, TrendingUp, TrendingDown, Ban, Pencil,
  ListChecks, Link2, ChevronDown, ChevronUp, Truck, Car, PackageMinus, Wrench, Fuel,
} from "lucide-react";
import { FORMAS_PAGAMENTO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, BotaoIcone, Caixa, Campo, Card, Chip, Entrada, EstadoVazio, Kpi, Lista,
  ListaLinha, Modal, Segmentado, Selecao, Selo, SkeletonLinhas, dataCurta, dinheiro, useToast,
} from "../componentes/ui";

interface Lancamento {
  id: string; tipo: string; descricao: string; valor: string; status: string;
  dataVencimento: string; dataPagamento: string | null; vencido: boolean;
  temOrigem: boolean; categoria: string; conta: string; pessoa: string | null;
  categoriaId: string; contaId: string; formaPagamento: string | null;
}
interface Conta { id: string; nome: string; saldo: string }
interface Categoria { id: string; nome: string; tipo: string }
interface VinculoResultado { entidade_tipo: string; entidade_id: string; titulo: string; subtitulo: string }

// Só estes tipos são vínculos válidos de um lançamento (doc 02 §4).
const ROTULO_VINCULO: Record<string, string> = {
  operacao: "Operação", manutencao: "Manutenção", ativo: "Ativo",
};

const FILTROS = ["previsto", "vencido", "pago", "cancelado"] as const;
const VAZIO = {
  tipo: "despesa", descricao: "", categoria_id: "", conta_id: "",
  valor: "", data_vencimento: "", data_pagamento: "", parcelas: "1", pago: false, forma_pagamento: "pix",
};
const VAZIO_ED = {
  descricao: "", valor: "", data_vencimento: "", categoria_id: "", conta_id: "",
  forma_pagamento: "", data_pagamento: "",
};

export function Financeiro() {
  const { pode, usuario } = useAuth();
  const ehAdmin = usuario?.papel === "admin";
  const fila = useQueryClient();
  const notificar = useToast();
  // Sprint 14: a página aceita filtros por URL — deep-links vindos do
  // dashboard (?tipo=&status=), do detalhe de ativo (?ativo_id=) e do detalhe
  // de operação/lançamento (?lancamento=, ?novo=1&operacao_id=&ativo_id=).
  const [params, setParams] = useSearchParams();
  // Com ?novo=1, ativo_id é pré-vínculo do modal (não filtro da lista).
  const ativoFiltro = params.get("novo") === "1" ? null : params.get("ativo_id");
  const lancamentoFiltro = params.get("lancamento");
  // Deep-links de lançamento/ativo mostram TUDO por padrão (o alvo pode estar
  // em qualquer status); a lista normal continua abrindo em "previsto".
  const [status, setStatus] = useState<string | null>(
    lancamentoFiltro || ativoFiltro ? params.get("status") : params.get("status") ?? "previsto"
  );
  const [tipo, setTipo] = useState<string | null>(params.get("tipo"));
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState<{ tipo: "pagar" | "estornar" | "cancelar" | "anular"; l: Lancamento } | null>(null);
  const [campoAcao, setCampoAcao] = useState("");
  const [editar, setEditar] = useState<Lancamento | null>(null);
  const [formEd, setFormEd] = useState({ ...VAZIO_ED });
  const [erroEd, setErroEd] = useState("");
  const [salvandoEd, setSalvandoEd] = useState(false);
  // Criação inline de categoria/conta direto no formulário de lançamento —
  // necessário no primeiro uso, quando ainda não há nenhuma cadastrada.
  const [novaCat, setNovaCat] = useState("");
  const [novaConta, setNovaConta] = useState("");
  const [salvandoAux, setSalvandoAux] = useState(false);
  // Pagamento em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteModal, setLoteModal] = useState(false);
  const [loteForma, setLoteForma] = useState("");
  const [loteData, setLoteData] = useState(new Date().toISOString().slice(0, 10));
  const [loteConta, setLoteConta] = useState("");
  const [loteEnviando, setLoteEnviando] = useState(false);
  // Vinculação automática de avulsos (admin only)
  const [vincularAberto, setVincularAberto] = useState(false);
  type VincularPreview = { dry_run: true; operacoes: { lancamento_id: string; descricao: string; valor: string; operacao_codigo: string }[]; manutencoes: { lancamento_id: string; descricao: string; valor: string }[]; total: number };
  const [vincularPreview, setVincularPreview] = useState<VincularPreview | null>(null);
  const [vincularEnviando, setVincularEnviando] = useState(false);

  const abrirVincular = async () => {
    setVincularPreview(null);
    setVincularAberto(true);
    setVincularEnviando(true);
    try {
      const { dados } = await api.post<{ dados: VincularPreview }>("/lancamentos/vincular", { dry_run: true });
      setVincularPreview(dados);
    } catch {
      notificar({ tipo: "erro", titulo: "Erro ao calcular vínculos" });
      setVincularAberto(false);
    } finally {
      setVincularEnviando(false);
    }
  };

  const confirmarVincular = async () => {
    setVincularEnviando(true);
    try {
      const { dados } = await api.post<{ dados: { total: number; operacoes: number; manutencoes: number } }>("/lancamentos/vincular", { dry_run: false });
      notificar({ tipo: "ok", titulo: `${dados.total} lançamento(s) vinculado(s)` });
      setVincularAberto(false);
      setVincularPreview(null);
      invalidar();
    } catch {
      notificar({ tipo: "erro", titulo: "Erro ao vincular" });
    } finally {
      setVincularEnviando(false);
    }
  };

  // Vínculos do lançamento avulso (interconexão, decisão #53): origem rastreável
  // (operação OU manutenção — exclusivas) e/ou ativo (classificação que coexiste).
  // Reusa a busca global (mesmas entidades, escopadas ao papel) — sem fonte nova.
  const [buscaVinc, setBuscaVinc] = useState("");
  const [resVinc, setResVinc] = useState<VinculoResultado[]>([]);
  const [origemVinc, setOrigemVinc] = useState<{ tipo: "operacao" | "manutencao"; id: string; titulo: string } | null>(null);
  const [ativoVinc, setAtivoVinc] = useState<{ id: string; titulo: string } | null>(null);
  const timerVinc = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerVinc.current);
    if (buscaVinc.trim().length < 2) {
      setResVinc([]);
      return;
    }
    timerVinc.current = setTimeout(() => {
      api
        .get<{ dados: VinculoResultado[] }>(`/busca?q=${encodeURIComponent(buscaVinc)}`)
        .then(({ dados }) => setResVinc(dados.filter((r) => r.entidade_tipo in ROTULO_VINCULO)))
        .catch(() => setResVinc([]));
    }, 200);
    return () => clearTimeout(timerVinc.current);
  }, [buscaVinc]);

  const limparVinc = () => {
    setBuscaVinc("");
    setResVinc([]);
    setOrigemVinc(null);
    setAtivoVinc(null);
  };
  const fecharNovo = () => {
    setNovo(false);
    setForm({ ...VAZIO });
    limparVinc();
    setErro("");
  };
  const escolherVinc = (r: VinculoResultado) => {
    if (r.entidade_tipo === "ativo") setAtivoVinc({ id: r.entidade_id, titulo: r.titulo });
    else setOrigemVinc({ tipo: r.entidade_tipo as "operacao" | "manutencao", id: r.entidade_id, titulo: r.titulo });
    setBuscaVinc("");
    setResVinc([]);
  };

  const { data: contas } = useQuery({
    queryKey: ["contas"],
    queryFn: () => api.get<{ dados: Conta[] }>("/contas").then((r) => r.dados),
  });
  const { data: categorias } = useQuery({
    queryKey: ["categorias-financeiras"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/categorias-financeiras").then((r) => r.dados),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["lancamentos", status, tipo, ativoFiltro, lancamentoFiltro],
    queryFn: () =>
      api.get<{ dados: Lancamento[]; meta: { total: number } }>(
        // Deep-link de um lançamento ignora os demais filtros — o alvo pode
        // estar em qualquer status/tipo.
        lancamentoFiltro
          ? `/lancamentos?por_pagina=50&lancamento_id=${lancamentoFiltro}`
          : `/lancamentos?por_pagina=50${status ? `&status=${status}` : ""}${tipo ? `&tipo=${tipo}` : ""}${ativoFiltro ? `&ativo_id=${ativoFiltro}` : ""}`
      ),
  });

  // ?novo=1: abre o modal de novo lançamento já pré-vinculado à operação e/ou
  // ao ativo indicados na URL (Sprint 14 · D2/E) — títulos vêm das fichas.
  const novoParamTratado = useRef(false);
  useEffect(() => {
    if (novoParamTratado.current || params.get("novo") !== "1") return;
    novoParamTratado.current = true;
    const opId = params.get("operacao_id");
    const atId = params.get("ativo_id");
    if (opId) {
      api.get<{ dados: { id: string; codigo: string } }>(`/operacoes/${opId}`)
        .then((r) => setOrigemVinc({ tipo: "operacao", id: r.dados.id, titulo: r.dados.codigo }))
        .catch(() => {});
    }
    if (atId) {
      api.get<{ dados: { id: string; nome: string } }>(`/ativos/${atId}`)
        .then((r) => setAtivoVinc({ id: r.dados.id, titulo: r.dados.nome }))
        .catch(() => {});
    }
    setNovo(true);
    // Limpa a URL para o modal não reabrir em refresh/navegação
    setParams((p) => { p.delete("novo"); p.delete("operacao_id"); p.delete("ativo_id"); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["lancamentos"] });
    fila.invalidateQueries({ queryKey: ["contas"] });
    fila.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    try {
      await api.post("/lancamentos", {
        ...form,
        parcelas: Number(form.parcelas),
        valor: Number(form.valor),
        forma_pagamento: form.pago ? form.forma_pagamento : null,
        // Retroativo: data de pagamento só quando pago e informada (senão usa o vencimento).
        data_pagamento: form.pago && form.data_pagamento ? form.data_pagamento : null,
        // Vínculos opcionais (interconexão): origem exclusiva + ativo que coexiste.
        operacao_id: origemVinc?.tipo === "operacao" ? origemVinc.id : null,
        manutencao_id: origemVinc?.tipo === "manutencao" ? origemVinc.id : null,
        ativo_id: ativoVinc?.id ?? null,
      });
      setNovo(false);
      setForm({ ...VAZIO });
      limparVinc();
      invalidar();
      notificar({ tipo: "ok", titulo: "Lançamento criado" });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro inesperado.");
    }
  };

  // Cria a categoria (no tipo atual do lançamento) e já a seleciona no form.
  const adicionarCategoria = async () => {
    const nome = novaCat.trim();
    if (nome.length < 2) return;
    setSalvandoAux(true);
    setErro("");
    try {
      const { dados } = await api.post<{ dados: Categoria }>("/categorias-financeiras", {
        nome,
        tipo: form.tipo,
      });
      await fila.invalidateQueries({ queryKey: ["categorias-financeiras"] });
      setForm((f) => ({ ...f, categoria_id: dados.id }));
      setNovaCat("");
      notificar({ tipo: "ok", titulo: "Categoria criada" });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSalvandoAux(false);
    }
  };

  // Cria a conta (saldo inicial 0) e já a seleciona no form.
  const adicionarConta = async () => {
    const nome = novaConta.trim();
    if (nome.length < 2) return;
    setSalvandoAux(true);
    setErro("");
    try {
      const { dados } = await api.post<{ dados: Conta }>("/contas", { nome, saldo_inicial: 0 });
      await fila.invalidateQueries({ queryKey: ["contas"] });
      setForm((f) => ({ ...f, conta_id: dados.id }));
      setNovaConta("");
      notificar({ tipo: "ok", titulo: "Conta criada" });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSalvandoAux(false);
    }
  };

  const executarAcao = async () => {
    if (!acao) return;
    try {
      if (acao.tipo === "pagar") {
        await api.post(`/lancamentos/${acao.l.id}/pagar`, {
          data_pagamento: new Date().toISOString().slice(0, 10),
          forma_pagamento: campoAcao || "pix",
        });
      } else {
        await api.post(`/lancamentos/${acao.l.id}/${acao.tipo}`, { motivo: campoAcao });
      }
      invalidar();
      notificar({ tipo: "ok", titulo: { pagar: "Pago", estornar: "Estornado", cancelar: "Cancelado", anular: "Anulado" }[acao.tipo] });
      setAcao(null);
      setCampoAcao("");
    } catch (err) {
      notificar({ tipo: "erro", titulo: "Não foi possível", descricao: err instanceof ApiError ? err.message : undefined });
    }
  };

  // Edição depois de lançado: corrige valor/vencimento/conta/categoria/forma e,
  // num pago (só admin), a data de pagamento — com auditoria no servidor.
  const abrirEdicao = (l: Lancamento) => {
    setEditar(l);
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
    if (!editar) return;
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
      // Data de pagamento só vale para um lançamento já pago (invariante pago⇔data).
      if (editar.status === "pago" && formEd.data_pagamento) payload.data_pagamento = formEd.data_pagamento;
      await api.patch(`/lancamentos/${editar.id}`, payload);
      invalidar();
      notificar({ tipo: "ok", titulo: "Lançamento atualizado" });
      setEditar(null);
    } catch (err) {
      setErroEd(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSalvandoEd(false);
    }
  };
  // Quem pode editar esta linha: tem permissão, não está anulada e — se paga —
  // é admin (reescreve indicadores).
  const podeEditar = (l: Lancamento) =>
    pode("lancamentos", "editar") && l.status !== "cancelado" && (l.status !== "pago" || ehAdmin);

  const totalAberto = data?.dados
    .filter((l) => l.status === "previsto")
    .reduce((s, l) => s + Number(l.valor), 0);

  const [analisesAberto, setAnalisesAberto] = useState(false);
  const [mesesAnalise, setMesesAnalise] = useState(3);

  const { data: porTipo } = useQuery({
    queryKey: ["financeiro/por-tipo", mesesAnalise],
    queryFn: () =>
      api.get<{ dados: Array<{ mes: string; guincho: string; locacao: string; venda_ativo: string; avulso: string }> }>(
        `/financeiro/por-tipo?meses=${mesesAnalise}`
      ).then((r) => r.dados),
    enabled: analisesAberto,
  });

  const { data: custoAtivo } = useQuery({
    queryKey: ["financeiro/custo-por-ativo", mesesAnalise],
    queryFn: () =>
      api.get<{ dados: Array<{ ativo_id: string; ativo: string; manutencao: string; combustivel: string; outros: string; total: string }> }>(
        `/financeiro/custo-por-ativo?meses=${mesesAnalise}`
      ).then((r) => r.dados),
    enabled: analisesAberto,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Financeiro</h1>
        <div className="ml-auto flex items-center gap-2">
          {ehAdmin && (
            <BotaoIcone
              rotulo="Vincular lançamentos avulsos automaticamente"
              icone={Link2}
              tom="ouro"
              onClick={abrirVincular}
            />
          )}
          {pode("lancamentos", "criar") && (
            <Botao tamanho="sm" onClick={() => setNovo(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo lançamento
            </Botao>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {contas?.map((c) => (
          <Kpi key={c.id} rotulo={c.nome} valor={dinheiro(c.saldo)} icone={Wallet}
            tom={Number(c.saldo) >= 0 ? "neutro" : "erro"} detalhe="saldo derivado dos lançamentos" />
        ))}
      </div>

      {/* ── Painel de Análises ── */}
      <div className="animar-surgir superficie rounded-lg border border-borda shadow-painel">
        <button
          onClick={() => setAnalisesAberto((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-suave">Análises financeiras</span>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Segmentado
              opcoes={([1, 3, 6, 12] as const).map((m) => ({
                id: String(m),
                rotulo: m === 1 ? "1m" : m === 12 ? "1a" : `${m}m`,
              }))}
              valor={String(mesesAnalise)}
              aoTrocar={(v) => { setMesesAnalise(Number(v) as 1 | 3 | 6 | 12); if (!analisesAberto) setAnalisesAberto(true); }}
            />
            {analisesAberto
              ? <ChevronUp className="h-4 w-4 text-mudo" />
              : <ChevronDown className="h-4 w-4 text-mudo" />}
          </div>
        </button>

        {analisesAberto && (
          <div className="border-t border-borda px-5 pb-5 pt-4 space-y-6">

            {/* Faturamento por tipo de operação */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-mudo">
                Faturamento por tipo de operação (receitas pagas)
              </p>
              {!porTipo ? (
                <p className="text-xs text-mudo">Carregando…</p>
              ) : porTipo.length === 0 ? (
                <p className="text-xs text-mudo">Sem dados no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wider text-mudo">
                        <th className="pb-2">Mês</th>
                        <th className="pb-2 text-right"><span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> Guincho</span></th>
                        <th className="pb-2 text-right"><span className="inline-flex items-center gap-1"><Car className="h-3 w-3" /> Locação</span></th>
                        <th className="pb-2 text-right"><span className="inline-flex items-center gap-1"><PackageMinus className="h-3 w-3" /> Venda Ativo</span></th>
                        <th className="pb-2 text-right">Avulso</th>
                        <th className="pb-2 text-right text-texto">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borda">
                      {porTipo.map((row) => {
                        const total = Number(row.guincho) + Number(row.locacao) + Number(row.venda_ativo) + Number(row.avulso);
                        const mes = new Date(row.mes + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
                        return (
                          <tr key={row.mes} className="hover:bg-elevado/50 transition-colors">
                            <td className="py-2 font-medium text-texto capitalize">{mes}</td>
                            <td className="py-2 text-right text-ok">{Number(row.guincho) > 0 ? dinheiro(row.guincho) : <span className="text-mudo">—</span>}</td>
                            <td className="py-2 text-right text-ok">{Number(row.locacao) > 0 ? dinheiro(row.locacao) : <span className="text-mudo">—</span>}</td>
                            <td className="py-2 text-right text-ok">{Number(row.venda_ativo) > 0 ? dinheiro(row.venda_ativo) : <span className="text-mudo">—</span>}</td>
                            <td className="py-2 text-right text-suave">{Number(row.avulso) > 0 ? dinheiro(row.avulso) : <span className="text-mudo">—</span>}</td>
                            <td className="py-2 text-right font-semibold text-texto">{total > 0 ? dinheiro(total) : <span className="text-mudo">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Custo por ativo */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-mudo">
                Custo por ativo (despesas pagas)
              </p>
              {!custoAtivo ? (
                <p className="text-xs text-mudo">Carregando…</p>
              ) : custoAtivo.length === 0 ? (
                <p className="text-xs text-mudo">Sem despesas vinculadas a ativos no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wider text-mudo">
                        <th className="pb-2">Ativo</th>
                        <th className="pb-2 text-right"><span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> Manutenção</span></th>
                        <th className="pb-2 text-right"><span className="inline-flex items-center gap-1"><Fuel className="h-3 w-3" /> Combustível</span></th>
                        <th className="pb-2 text-right">Outros</th>
                        <th className="pb-2 text-right text-erro">Total gasto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borda">
                      {custoAtivo.map((row) => (
                        <tr key={row.ativo_id} className="hover:bg-elevado/50 transition-colors">
                          <td className="py-2 font-medium text-texto"><Link to={`/ativos/${row.ativo_id}`} className="hover:text-ouro">{row.ativo}</Link></td>
                          <td className="py-2 text-right text-suave">{Number(row.manutencao) > 0 ? dinheiro(row.manutencao) : <span className="text-mudo">—</span>}</td>
                          <td className="py-2 text-right text-suave">{Number(row.combustivel) > 0 ? dinheiro(row.combustivel) : <span className="text-mudo">—</span>}</td>
                          <td className="py-2 text-right text-suave">{Number(row.outros) > 0 ? dinheiro(row.outros) : <span className="text-mudo">—</span>}</td>
                          <td className="py-2 text-right font-semibold text-erro">{dinheiro(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Filtros ativos vindos de deep-link (Sprint 14) — sempre com saída visível */}
      {(lancamentoFiltro || ativoFiltro) && (
        <Caixa tom="ouro">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-ouro" />
            <span className="flex-1 text-suave">
              {lancamentoFiltro ? "Exibindo um lançamento específico." : "Exibindo lançamentos do ativo (diretos, da operação ou herdados de manutenção)."}
            </span>
            <Botao
              variante="link"
              tamanho="sm"
              className="shrink-0"
              onClick={() => {
                setParams((p) => { p.delete("lancamento"); p.delete("ativo_id"); p.delete("tipo"); p.delete("status"); return p; }, { replace: true });
                setStatus("previsto");
              }}
            >
              ver todos
            </Botao>
          </div>
        </Caixa>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((s) => (
          <Chip key={s} ativo={status === s} onClick={() => setStatus(status === s ? null : s)}>{s}</Chip>
        ))}
        <span aria-hidden className="mx-1 w-px self-stretch bg-borda" />
        <Chip ativo={tipo === "receita"} onClick={() => setTipo(tipo === "receita" ? null : "receita")}>receitas</Chip>
        <Chip ativo={tipo === "despesa"} onClick={() => setTipo(tipo === "despesa" ? null : "despesa")}>despesas</Chip>
      </div>

      {/* Barra de ação em lote */}
      {selecionados.size > 0 && (
        <Caixa tom="info">
          <div className="flex items-center gap-3">
            <ListChecks className="h-4 w-4 shrink-0 text-info" />
            <span className="flex-1 text-sm font-medium">{selecionados.size} selecionado(s)</span>
            <Botao tamanho="sm" onClick={() => setLoteModal(true)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Pagar selecionados
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setSelecionados(new Set())}>
              Limpar
            </Botao>
          </div>
        </Caixa>
      )}

      <Card>
        {isLoading ? (
          <SkeletonLinhas linhas={5} />
        ) : !data || data.dados.length === 0 ? (
          <EstadoVazio icone={CircleDollarSign} titulo="Nenhum lançamento aqui" />
        ) : (
          <>
            <Lista>
              {data.dados.map((l) => (
                <ListaLinha
                  key={l.id}
                  titulo={
                    <span className="flex items-center gap-2">
                      {pode("lancamentos", "transicionar") && l.status === "previsto" && (
                        <input
                          type="checkbox"
                          checked={selecionados.has(l.id)}
                          onChange={(e) => {
                            setSelecionados((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(l.id); else next.delete(l.id);
                              return next;
                            });
                          }}
                          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-borda-forte accent-ouro"
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      {l.tipo === "receita"
                        ? <TrendingUp className="h-3.5 w-3.5 shrink-0 text-ok" />
                        : <TrendingDown className="h-3.5 w-3.5 shrink-0 text-erro" />}
                      {l.descricao}
                      {l.temOrigem && <Selo tom="info">origem</Selo>}
                    </span>
                  }
                  subtitulo={`${l.categoria} · ${l.conta}${l.pessoa ? ` · ${l.pessoa}` : ""} · ${
                    l.dataPagamento ? `pago em ${dataCurta(l.dataPagamento)}` : `vence ${dataCurta(l.dataVencimento)}`
                  }`}
                  direita={
                    <>
                      <span className={`text-sm font-medium ${l.tipo === "receita" ? "text-ok" : "text-erro"}`}>
                        {dinheiro(l.valor)}
                      </span>
                      <Selo tom={l.vencido ? "erro" : l.status === "pago" ? "ok" : l.status === "cancelado" ? "erro" : "alerta"}>
                        {l.vencido ? "vencido" : l.status}
                      </Selo>
                      {podeEditar(l) && (
                        <BotaoIcone rotulo="Editar" icone={Pencil} tamanho="sm" tom="ouro" onClick={() => abrirEdicao(l)} />
                      )}
                      {pode("lancamentos", "transicionar") && l.status === "previsto" && (
                        <>
                          <BotaoIcone rotulo="Pagar" icone={CheckCircle2} tamanho="sm" tom="ok" onClick={() => setAcao({ tipo: "pagar", l })} />
                          <BotaoIcone rotulo="Cancelar" icone={XCircle} tamanho="sm" tom="erro" onClick={() => setAcao({ tipo: "cancelar", l })} />
                        </>
                      )}
                      {pode("lancamentos", "transicionar") && l.status === "pago" && !l.descricao.startsWith("Estorno:") && (
                        <BotaoIcone rotulo="Estornar" icone={Undo2} tamanho="sm" tom="alerta" onClick={() => setAcao({ tipo: "estornar", l })} />
                      )}
                      {/* Anular: lançado errado — some dos indicadores, sem contrapartida. Só admin. */}
                      {ehAdmin && l.status !== "cancelado" && !l.descricao.startsWith("Estorno:") && (
                        <BotaoIcone rotulo="Anular (lançado errado)" icone={Ban} tamanho="sm" tom="erro" onClick={() => setAcao({ tipo: "anular", l })} />
                      )}
                    </>
                  }
                />
              ))}
            </Lista>
            <p className="mt-3 text-xs text-mudo">
              {data.meta.total} lançamento(s)
              {status === "previsto" && totalAberto ? ` · ${dinheiro(totalAberto)} em aberto` : ""}
            </p>
          </>
        )}
      </Card>

      <Modal aberto={novo} aoFechar={fecharNovo} titulo="Novo lançamento">
        <form onSubmit={criar} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <Selecao value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </Selecao>
            </Campo>
            <Campo rotulo="Valor total (R$)">
              <Entrada type="number" step="0.01" min="0.01" required value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </Campo>
          </div>
          <Campo rotulo="Descrição">
            <Entrada required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Categoria">
              <Selecao required value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">Escolha…</option>
                {categorias?.filter((c) => c.tipo === form.tipo).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </Selecao>
              {pode("categorias_financeiras", "criar") && (
                <div className="mt-1.5 flex gap-1.5">
                  <Entrada
                    placeholder={`Nova categoria de ${form.tipo}`}
                    value={novaCat}
                    onChange={(e) => setNovaCat(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); adicionarCategoria(); }
                    }}
                  />
                  <Botao type="button" variante="fantasma" onClick={adicionarCategoria}
                    disabled={salvandoAux || novaCat.trim().length < 2}>
                    <Plus className="h-4 w-4" />
                  </Botao>
                </div>
              )}
            </Campo>
            <Campo rotulo="Conta">
              <Selecao required value={form.conta_id} onChange={(e) => setForm({ ...form, conta_id: e.target.value })}>
                <option value="">Escolha…</option>
                {contas?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
              {pode("contas", "criar") && (
                <div className="mt-1.5 flex gap-1.5">
                  <Entrada
                    placeholder="Nova conta (ex.: Caixa, Banco)"
                    value={novaConta}
                    onChange={(e) => setNovaConta(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); adicionarConta(); }
                    }}
                  />
                  <Botao type="button" variante="fantasma" onClick={adicionarConta}
                    disabled={salvandoAux || novaConta.trim().length < 2}>
                    <Plus className="h-4 w-4" />
                  </Botao>
                </div>
              )}
            </Campo>
            <Campo rotulo="Vencimento">
              <Entrada type="date" required value={form.data_vencimento}
                onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
            </Campo>
            <Campo rotulo="Parcelas" dica="Vencimentos mensais">
              <Entrada type="number" min="1" max="60" value={form.parcelas}
                onChange={(e) => setForm({ ...form, parcelas: e.target.value, pago: false })} />
            </Campo>
          </div>
          {form.parcelas === "1" && (
            <label className="flex items-center gap-2 text-sm text-suave">
              <input type="checkbox" checked={form.pago}
                onChange={(e) => setForm({ ...form, pago: e.target.checked })} className="accent-ouro" />
              Já foi pago
            </label>
          )}
          {form.pago && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Forma de pagamento">
                <Selecao value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
                </Selecao>
              </Campo>
              <Campo rotulo="Data do pagamento" dica="Retroativo (padrão: vencimento)">
                <Entrada type="date" value={form.data_pagamento}
                  onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} />
              </Campo>
            </div>
          )}
          {/* Vínculos (opcional): liga o lançamento avulso a uma operação/manutenção
              (origem) e/ou a um ativo (custo direto). Busca as mesmas entidades do ⌘K. */}
          <Campo rotulo="Vínculos" dica="Opcional — origem (operação/manutenção) e/ou ativo">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {origemVinc && (
                  <Chip onRemover={() => setOrigemVinc(null)}>
                    {ROTULO_VINCULO[origemVinc.tipo]}: {origemVinc.titulo}
                  </Chip>
                )}
                {ativoVinc && (
                  <Chip onRemover={() => setAtivoVinc(null)}>Ativo: {ativoVinc.titulo}</Chip>
                )}
              </div>
              <Entrada
                placeholder="Buscar operação, manutenção ou ativo…"
                value={buscaVinc}
                onChange={(e) => setBuscaVinc(e.target.value)}
              />
              {resVinc.length > 0 && (
                <ul className="max-h-40 overflow-auto rounded-md border border-borda bg-fundo/40 text-sm">
                  {resVinc.map((r) => (
                    <li key={`${r.entidade_tipo}:${r.entidade_id}`}>
                      <button
                        type="button"
                        onClick={() => escolherVinc(r)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-ouro/10"
                      >
                        <Selo>{ROTULO_VINCULO[r.entidade_tipo]}</Selo>
                        <span className="truncate">{r.titulo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Campo>
          {erro && <p className="text-sm text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={fecharNovo}>Cancelar</Botao>
            <Botao type="submit">Criar</Botao>
          </div>
        </form>
      </Modal>

      <Modal aberto={!!editar} aoFechar={() => setEditar(null)} titulo="Editar lançamento">
        {editar && (
          <form onSubmit={salvarEdicao} className="space-y-4">
            {editar.temOrigem && (
              <Caixa tom="info" className="text-xs text-suave">
                Lançamento gerado por uma operação/manutenção. Editar aqui corrige o valor
                sem desfazer o vínculo de origem — a mudança fica na timeline.
              </Caixa>
            )}
            <Campo rotulo="Descrição">
              <Entrada required value={formEd.descricao} onChange={(e) => setFormEd({ ...formEd, descricao: e.target.value })} />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  {categorias?.filter((c) => c.tipo === editar.tipo).map((c) => (
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
              {editar.status === "pago" && (
                <Campo rotulo="Data do pagamento" dica="Retroativo">
                  <Entrada type="date" value={formEd.data_pagamento}
                    onChange={(e) => setFormEd({ ...formEd, data_pagamento: e.target.value })} />
                </Campo>
              )}
            </div>
            {erroEd && <p className="text-sm text-erro">{erroEd}</p>}
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="fantasma" onClick={() => setEditar(null)}>Cancelar</Botao>
              <Botao type="submit" carregando={salvandoEd}>Salvar</Botao>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: pagamento em lote */}
      <Modal aberto={loteModal} aoFechar={() => setLoteModal(false)} titulo={`Pagar ${selecionados.size} lançamento(s)`}>
        <div className="space-y-4">
          <p className="text-sm text-suave">
            Os {selecionados.size} lançamentos selecionados serão marcados como pagos com os mesmos dados.
          </p>
          <Campo rotulo="Forma de pagamento">
            <Selecao value={loteForma} onChange={(e) => setLoteForma(e.target.value)}>
              <option value="">Selecione</option>
              {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Data do pagamento">
            <Entrada type="date" value={loteData} onChange={(e) => setLoteData(e.target.value)} />
          </Campo>
          <Campo rotulo="Conta (opcional)">
            <Selecao value={loteConta} onChange={(e) => setLoteConta(e.target.value)}>
              <option value="">Conta de cada lançamento</option>
              {contas?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setLoteModal(false)}>Cancelar</Botao>
            <Botao
              disabled={!loteForma || loteEnviando}
              carregando={loteEnviando}
              onClick={async () => {
                if (!loteForma) return;
                setLoteEnviando(true);
                try {
                  const r = await api.post<{ dados: { ok: number; falhas: Array<{ id: string; erro: string }> } }>("/lancamentos/pagar-lote", {
                    ids: Array.from(selecionados),
                    data_pagamento: loteData,
                    forma_pagamento: loteForma,
                    ...(loteConta ? { conta_id: loteConta } : {}),
                  });
                  invalidar();
                  setSelecionados(new Set());
                  setLoteModal(false);
                  const { ok, falhas } = r.dados;
                  if (falhas.length === 0) {
                    notificar({ tipo: "ok", titulo: `${ok} pagamento(s) registrado(s)` });
                  } else {
                    notificar({ tipo: "alerta", titulo: `${ok} pago(s), ${falhas.length} com falha` });
                  }
                } catch (err) {
                  notificar({ tipo: "erro", titulo: "Pagamento em lote falhou", descricao: err instanceof ApiError ? err.message : undefined });
                } finally {
                  setLoteEnviando(false);
                }
              }}
            >
              Confirmar pagamento em lote
            </Botao>
          </div>
        </div>
      </Modal>

      <Modal aberto={vincularAberto} aoFechar={() => { setVincularAberto(false); setVincularPreview(null); }} titulo="Vincular lançamentos avulsos">
        <div className="space-y-4">
          {vincularEnviando && !vincularPreview ? (
            <p className="text-sm text-suave">Calculando correspondências…</p>
          ) : vincularPreview?.total === 0 ? (
            <p className="text-sm text-suave">Nenhum lançamento avulso com correspondência inequívoca encontrado.</p>
          ) : vincularPreview ? (
            <>
              <p className="text-sm text-suave">
                Foram encontrados <span className="font-semibold text-texto">{vincularPreview.total}</span> lançamento(s) com correspondência única por cliente/fornecedor e data:
              </p>
              {vincularPreview.operacoes.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-mudo uppercase tracking-wider">Operações ({vincularPreview.operacoes.length})</p>
                  <ul className="space-y-1">
                    {vincularPreview.operacoes.slice(0, 5).map((r) => (
                      <li key={r.lancamento_id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-texto">{r.descricao}</span>
                        <span className="ml-3 shrink-0 text-xs text-mudo">{r.operacao_codigo} · {dinheiro(r.valor)}</span>
                      </li>
                    ))}
                    {vincularPreview.operacoes.length > 5 && (
                      <li className="text-xs text-mudo">… e mais {vincularPreview.operacoes.length - 5}</li>
                    )}
                  </ul>
                </div>
              )}
              {vincularPreview.manutencoes.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-mudo uppercase tracking-wider">Manutenções ({vincularPreview.manutencoes.length})</p>
                  <ul className="space-y-1">
                    {vincularPreview.manutencoes.slice(0, 5).map((r) => (
                      <li key={r.lancamento_id} className="flex items-center justify-between text-sm">
                        <span className="truncate text-texto">{r.descricao}</span>
                        <span className="ml-3 shrink-0 text-xs text-mudo">{dinheiro(r.valor)}</span>
                      </li>
                    ))}
                    {vincularPreview.manutencoes.length > 5 && (
                      <li className="text-xs text-mudo">… e mais {vincularPreview.manutencoes.length - 5}</li>
                    )}
                  </ul>
                </div>
              )}
              <p className="text-xs text-mudo">Lançamentos com mais de uma correspondência possível são ignorados (ambíguos). Lançamentos sem pessoa_id também são ignorados.</p>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => { setVincularAberto(false); setVincularPreview(null); }}>Cancelar</Botao>
            {vincularPreview && vincularPreview.total > 0 && (
              <Botao carregando={vincularEnviando} disabled={vincularEnviando} onClick={confirmarVincular}>
                Vincular {vincularPreview.total} lançamento(s)
              </Botao>
            )}
          </div>
        </div>
      </Modal>

      <Modal aberto={!!acao} aoFechar={() => setAcao(null)}
        titulo={
          acao?.tipo === "pagar" ? "Confirmar pagamento"
          : acao?.tipo === "estornar" ? "Estornar lançamento"
          : acao?.tipo === "anular" ? "Anular lançamento (lançado errado)"
          : "Cancelar lançamento"
        }>
        {acao && (
          <div className="space-y-4">
            <p className="text-sm text-suave">
              <span className="font-medium text-texto">{acao.l.descricao}</span> · {dinheiro(acao.l.valor)}
              {acao.tipo === "estornar" && " — será criada uma contrapartida; o pagamento original permanece no histórico."}
              {acao.tipo === "anular" && " — sai de todos os indicadores (dashboard, DRE, ROI, saldo) sem gerar contrapartida. A trilha e a origem ficam no histórico. Use só para lançamentos digitados por engano."}
            </p>
            {acao.tipo === "pagar" ? (
              <Campo rotulo="Forma de pagamento">
                <Selecao value={campoAcao || "pix"} onChange={(e) => setCampoAcao(e.target.value)}>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
                </Selecao>
              </Campo>
            ) : (
              <Campo rotulo="Motivo">
                <Entrada value={campoAcao} onChange={(e) => setCampoAcao(e.target.value)} autoFocus />
              </Campo>
            )}
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={() => setAcao(null)}>Voltar</Botao>
              <Botao variante={acao.tipo === "pagar" ? "primario" : "perigo"} onClick={executarAcao}
                disabled={acao.tipo !== "pagar" && campoAcao.trim().length < 3}>
                Confirmar
              </Botao>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
