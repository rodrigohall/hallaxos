import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Plus, CircleDollarSign, CheckCircle2, Undo2, XCircle, TrendingUp, TrendingDown,
} from "lucide-react";
import { FORMAS_PAGAMENTO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Campo, Card, Chip, Entrada, EstadoVazio, Kpi, Lista, ListaLinha, Modal,
  Selecao, Selo, SkeletonLinhas, dataCurta, dinheiro, useToast,
} from "../componentes/ui";

interface Lancamento {
  id: string; tipo: string; descricao: string; valor: string; status: string;
  dataVencimento: string; dataPagamento: string | null; vencido: boolean;
  temOrigem: boolean; categoria: string; conta: string; pessoa: string | null;
}
interface Conta { id: string; nome: string; saldo: string }
interface Categoria { id: string; nome: string; tipo: string }

const FILTROS = ["previsto", "vencido", "pago", "cancelado"] as const;
const VAZIO = {
  tipo: "despesa", descricao: "", categoria_id: "", conta_id: "",
  valor: "", data_vencimento: "", parcelas: "1", pago: false, forma_pagamento: "pix",
};

export function Financeiro() {
  const { pode } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [status, setStatus] = useState<string | null>("previsto");
  const [tipo, setTipo] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState<{ tipo: "pagar" | "estornar" | "cancelar"; l: Lancamento } | null>(null);
  const [campoAcao, setCampoAcao] = useState("");
  // Criação inline de categoria/conta direto no formulário de lançamento —
  // necessário no primeiro uso, quando ainda não há nenhuma cadastrada.
  const [novaCat, setNovaCat] = useState("");
  const [novaConta, setNovaConta] = useState("");
  const [salvandoAux, setSalvandoAux] = useState(false);

  const { data: contas } = useQuery({
    queryKey: ["contas"],
    queryFn: () => api.get<{ dados: Conta[] }>("/contas").then((r) => r.dados),
  });
  const { data: categorias } = useQuery({
    queryKey: ["categorias-financeiras"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/categorias-financeiras").then((r) => r.dados),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["lancamentos", status, tipo],
    queryFn: () =>
      api.get<{ dados: Lancamento[]; meta: { total: number } }>(
        `/lancamentos?por_pagina=50${status ? `&status=${status}` : ""}${tipo ? `&tipo=${tipo}` : ""}`
      ),
  });

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
      });
      setNovo(false);
      setForm({ ...VAZIO });
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
      notificar({ tipo: "ok", titulo: { pagar: "Pago", estornar: "Estornado", cancelar: "Cancelado" }[acao.tipo] });
      setAcao(null);
      setCampoAcao("");
    } catch (err) {
      notificar({ tipo: "erro", titulo: "Não foi possível", descricao: err instanceof ApiError ? err.message : undefined });
    }
  };

  const totalAberto = data?.dados
    .filter((l) => l.status === "previsto")
    .reduce((s, l) => s + Number(l.valor), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Financeiro</h1>
        {pode("lancamentos", "criar") && (
          <Botao tamanho="sm" className="ml-auto" onClick={() => setNovo(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo lançamento
          </Botao>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {contas?.map((c) => (
          <Kpi key={c.id} rotulo={c.nome} valor={dinheiro(c.saldo)} icone={Wallet}
            tom={Number(c.saldo) >= 0 ? "neutro" : "erro"} detalhe="saldo derivado dos lançamentos" />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((s) => (
          <Chip key={s} ativo={status === s} onClick={() => setStatus(status === s ? null : s)}>{s}</Chip>
        ))}
        <span className="mx-1 text-borda">|</span>
        <Chip ativo={tipo === "receita"} onClick={() => setTipo(tipo === "receita" ? null : "receita")}>receitas</Chip>
        <Chip ativo={tipo === "despesa"} onClick={() => setTipo(tipo === "despesa" ? null : "despesa")}>despesas</Chip>
      </div>

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
                      {pode("lancamentos", "transicionar") && l.status === "previsto" && (
                        <>
                          <button title="Pagar" onClick={() => setAcao({ tipo: "pagar", l })}
                            className="rounded p-1.5 text-suave hover:text-ok"><CheckCircle2 className="h-4 w-4" /></button>
                          <button title="Cancelar" onClick={() => setAcao({ tipo: "cancelar", l })}
                            className="rounded p-1.5 text-suave hover:text-erro"><XCircle className="h-4 w-4" /></button>
                        </>
                      )}
                      {pode("lancamentos", "transicionar") && l.status === "pago" && !l.descricao.startsWith("Estorno:") && (
                        <button title="Estornar" onClick={() => setAcao({ tipo: "estornar", l })}
                          className="rounded p-1.5 text-suave hover:text-alerta"><Undo2 className="h-4 w-4" /></button>
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

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo lançamento">
        <form onSubmit={criar} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
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
            <Campo rotulo="Forma de pagamento">
              <Selecao value={form.forma_pagamento} onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}>
                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
              </Selecao>
            </Campo>
          )}
          {erro && <p className="text-sm text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={() => setNovo(false)}>Cancelar</Botao>
            <Botao type="submit">Criar</Botao>
          </div>
        </form>
      </Modal>

      <Modal aberto={!!acao} aoFechar={() => setAcao(null)}
        titulo={acao?.tipo === "pagar" ? "Confirmar pagamento" : acao?.tipo === "estornar" ? "Estornar lançamento" : "Cancelar lançamento"}>
        {acao && (
          <div className="space-y-4">
            <p className="text-sm text-suave">
              <span className="font-medium text-texto">{acao.l.descricao}</span> · {dinheiro(acao.l.valor)}
              {acao.tipo === "estornar" && " — será criada uma contrapartida; o pagamento original permanece no histórico."}
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
