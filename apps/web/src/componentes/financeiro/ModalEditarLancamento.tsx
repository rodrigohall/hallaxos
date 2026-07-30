// Edição de um lançamento já registrado — o mesmo formulário para quem chega
// pela lista de Lançamentos e para quem chega pelo drill-down do Painel.
//
// REGRA MÁXIMA: existia uma cópia deste form em cada uma das duas telas, com o
// mesmo payload e a mesma invariante de data de pagamento. Agora é um lugar só;
// quem chama informa apenas quais chaves de cache invalidar depois.
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FORMAS_PAGAMENTO } from "@hallaxos/shared";
import { api, ApiError } from "../../api";
import { Botao, Caixa, Campo, Entrada, Modal, Selecao, useToast } from "../ui";

/** O mínimo que o modal precisa saber do lançamento que está editando. */
export interface LancamentoEditavel {
  id: string;
  tipo: string;
  status: string;
  descricao: string;
  valor: string;
  dataVencimento: string;
  dataPagamento: string | null;
  categoriaId: string;
  contaId: string;
  formaPagamento: string | null;
  temOrigem: boolean;
}

interface Categoria { id: string; nome: string; tipo: string }
interface Conta { id: string; nome: string }

export function ModalEditarLancamento({
  lancamento, categorias, contas, aoFechar, invalidar,
}: {
  lancamento: LancamentoEditavel | null;
  categorias: Categoria[] | undefined;
  contas: Conta[] | undefined;
  aoFechar: () => void;
  /** Chaves de query a invalidar após salvar — cada tela cuida do seu cache. */
  invalidar: string[][];
}) {
  const fila = useQueryClient();
  const notificar = useToast();
  const [form, setForm] = useState({
    descricao: "", valor: "", data_vencimento: "",
    categoria_id: "", conta_id: "", forma_pagamento: "", data_pagamento: "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  // Recarrega o formulário sempre que o alvo muda (inclui abrir pela 1ª vez).
  const [alvoCarregado, setAlvoCarregado] = useState<string | null>(null);

  if (lancamento && alvoCarregado !== lancamento.id) {
    setAlvoCarregado(lancamento.id);
    setErro("");
    setForm({
      descricao: lancamento.descricao,
      valor: lancamento.valor,
      data_vencimento: lancamento.dataVencimento,
      categoria_id: lancamento.categoriaId,
      conta_id: lancamento.contaId,
      forma_pagamento: lancamento.formaPagamento ?? "",
      data_pagamento: lancamento.dataPagamento ?? "",
    });
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!lancamento) return;
    setErro("");
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        descricao: form.descricao,
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento,
        categoria_id: form.categoria_id,
        conta_id: form.conta_id,
        forma_pagamento: form.forma_pagamento || null,
      };
      // Data de pagamento só vale para um lançamento já pago (invariante pago⇔data).
      if (lancamento.status === "pago" && form.data_pagamento) {
        payload.data_pagamento = form.data_pagamento;
      }
      await api.patch(`/lancamentos/${lancamento.id}`, payload);
      invalidar.forEach((queryKey) => fila.invalidateQueries({ queryKey }));
      notificar({ tipo: "ok", titulo: "Lançamento atualizado" });
      setAlvoCarregado(null);
      aoFechar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro inesperado.");
    } finally {
      setSalvando(false);
    }
  };

  const fechar = () => {
    setAlvoCarregado(null);
    aoFechar();
  };

  return (
    <Modal aberto={!!lancamento} aoFechar={fechar} titulo="Editar lançamento">
      {lancamento && (
        <form onSubmit={salvar} className="space-y-4">
          {lancamento.temOrigem && (
            <Caixa tom="info" className="text-xs text-suave">
              Lançamento gerado por uma operação/manutenção. Editar aqui corrige o valor
              sem desfazer o vínculo de origem — a mudança fica na timeline.
            </Caixa>
          )}
          <Campo rotulo="Descrição">
            <Entrada required value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Valor (R$)">
              <Entrada type="number" step="0.01" min="0.01" required value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            </Campo>
            <Campo rotulo="Vencimento">
              <Entrada type="date" required value={form.data_vencimento}
                onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
            </Campo>
            <Campo rotulo="Categoria">
              <Selecao required value={form.categoria_id}
                onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
                <option value="">Escolha…</option>
                {categorias?.filter((c) => c.tipo === lancamento.tipo).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Conta">
              <Selecao required value={form.conta_id}
                onChange={(e) => setForm({ ...form, conta_id: e.target.value })}>
                <option value="">Escolha…</option>
                {contas?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Forma de pagamento">
              <Selecao value={form.forma_pagamento}
                onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}>
                <option value="">—</option>
                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
              </Selecao>
            </Campo>
            {lancamento.status === "pago" && (
              <Campo rotulo="Data do pagamento" dica="Retroativo">
                <Entrada type="date" value={form.data_pagamento}
                  onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} />
              </Campo>
            )}
          </div>
          {erro && <p className="text-sm text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={fechar}>Cancelar</Botao>
            <Botao type="submit" carregando={salvando}>Salvar</Botao>
          </div>
        </form>
      )}
    </Modal>
  );
}
