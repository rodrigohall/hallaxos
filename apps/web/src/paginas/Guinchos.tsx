import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, MapPin, ArrowRight } from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Campo, Card, Chip, Entrada, AreaTexto, Selecao, Selo, Lista, ListaLinha,
  Modal, SkeletonLinhas, EstadoVazio, dinheiro, dataCurta, useToast,
} from "../componentes/ui";
import { BuscaPessoa, type PessoaResumo } from "../componentes/BuscaPessoa";

interface GuinchoLista {
  id: string;
  codigo: string;
  status: string;
  valorTotal: string;
  desconto: string;
  dataInicio: string;
  cliente: string;
  origem: string;
  destino: string;
  veiculoCliente: string;
}
interface Caminhao { id: string; codigo: string; nome: string; placa: string; categoria: string }

const ROTULOS: Record<string, string> = {
  solicitado: "solicitado", a_caminho: "a caminho", em_execucao: "em execução",
  concluido: "concluído", cancelada: "cancelada",
};
const FILTROS = ["solicitado", "a_caminho", "em_execucao", "concluido", "cancelada"] as const;
const VAZIO = {
  recurso_ativo_id: "", origem_endereco: "", destino_endereco: "",
  veiculo_cliente_descricao: "", veiculo_cliente_placa: "", valor_total: "", desconto: "0", observacoes: "",
};

export function Guinchos() {
  const { pode } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [status, setStatus] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });
  const [cliente, setCliente] = useState<PessoaResumo | null>(null);
  const [motorista, setMotorista] = useState<PessoaResumo | null>(null);
  const [erro, setErro] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["guinchos", status, busca],
    queryFn: () =>
      api.get<{ dados: GuinchoLista[]; meta: { total: number } }>(
        `/guinchos?por_pagina=50${status ? `&status=${status}` : ""}${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`
      ),
  });

  const podeCriar = pode("operacoes", "criar");
  const { data: caminhoes } = useQuery({
    queryKey: ["caminhoes-disponiveis"],
    enabled: novo && podeCriar,
    queryFn: () => api.get<{ dados: Caminhao[] }>("/guinchos/caminhoes-disponiveis").then((r) => r.dados),
  });

  const fechar = () => {
    setNovo(false);
    setForm({ ...VAZIO });
    setCliente(null);
    setMotorista(null);
    setErro("");
  };

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!cliente) return setErro("Escolha o cliente.");
    if (!form.recurso_ativo_id) return setErro("Escolha o caminhão guincho.");
    try {
      const { dados } = await api.post<{ dados: { id: string } }>("/guinchos", {
        cliente_id: cliente.id,
        motorista_id: motorista?.id ?? null,
        recurso_ativo_id: form.recurso_ativo_id,
        origem_endereco: form.origem_endereco,
        destino_endereco: form.destino_endereco,
        veiculo_cliente_descricao: form.veiculo_cliente_descricao,
        veiculo_cliente_placa: form.veiculo_cliente_placa || null,
        valor_total: Number(form.valor_total || 0),
        desconto: Number(form.desconto || 0),
        observacoes: form.observacoes || null,
      });
      fila.invalidateQueries({ queryKey: ["guinchos"] });
      fila.invalidateQueries({ queryKey: ["dashboard"] });
      notificar({ tipo: "ok", titulo: "Guincho solicitado" });
      fechar();
      void dados;
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro inesperado.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Guinchos</h1>
        {podeCriar && (
          <Botao tamanho="sm" className="ml-auto" onClick={() => setNovo(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo guincho
          </Botao>
        )}
      </div>

      <Entrada
        placeholder="Buscar por código, cliente, endereço ou veículo…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <div className="flex flex-wrap gap-1.5">
        <Chip ativo={status === null} onClick={() => setStatus(null)}>todos</Chip>
        {FILTROS.map((s) => (
          <Chip key={s} ativo={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {ROTULOS[s]}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <SkeletonLinhas linhas={4} />
      ) : !data || data.dados.length === 0 ? (
        <Card>
          <EstadoVazio
            icone={Truck}
            titulo={busca || status ? "Nenhum guincho encontrado" : "Nenhum guincho ainda"}
            descricao="Cada acionamento de guincho aparece aqui, do chamado à conclusão."
            acao={
              podeCriar && (
                <Botao variante="secundario" tamanho="sm" onClick={() => setNovo(true)}>
                  <Plus className="h-3.5 w-3.5" /> Novo guincho
                </Botao>
              )
            }
          />
        </Card>
      ) : (
        <Card>
          <Lista>
            {data.dados.map((g) => (
              <Link key={g.id} to={`/guinchos/${g.id}`} className="block">
                <ListaLinha
                  titulo={
                    <span className="flex items-center gap-2">
                      <span className="font-display font-bold text-ouro">{g.codigo}</span>
                      <span>{g.cliente}</span>
                      <span className="text-mudo">· {g.veiculoCliente}</span>
                    </span>
                  }
                  subtitulo={
                    <span className="flex items-center gap-1 text-xs">
                      <MapPin className="h-3 w-3 shrink-0" /> {g.origem}
                      <ArrowRight className="h-3 w-3 shrink-0" /> {g.destino}
                      <span className="text-mudo"> · {dataCurta(g.dataInicio)}</span>
                    </span>
                  }
                  direita={
                    <>
                      <span className="text-sm font-medium">{dinheiro(Number(g.valorTotal) - Number(g.desconto))}</span>
                      <Selo tom={g.status}>{ROTULOS[g.status] ?? g.status}</Selo>
                    </>
                  }
                />
              </Link>
            ))}
          </Lista>
          <p className="mt-3 text-xs text-mudo">{data.meta.total} guincho(s)</p>
        </Card>
      )}

      <Modal aberto={novo} aoFechar={fechar} titulo="Novo guincho">
        <form onSubmit={criar} className="space-y-4">
          <Campo rotulo="Cliente">
            <BuscaPessoa rotulo="cliente" selecionada={cliente} aoSelecionar={setCliente} papelSugerido="cliente" />
          </Campo>

          <Campo rotulo="Caminhão guincho" dica="Apenas veículos disponíveis">
            <Selecao
              required
              value={form.recurso_ativo_id}
              onChange={(e) => setForm({ ...form, recurso_ativo_id: e.target.value })}
            >
              <option value="">Escolha…</option>
              {caminhoes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {c.placa} ({c.categoria})
                </option>
              ))}
            </Selecao>
          </Campo>

          <div className="grid grid-cols-2 gap-4">
            <Campo rotulo="Origem">
              <Entrada required value={form.origem_endereco}
                onChange={(e) => setForm({ ...form, origem_endereco: e.target.value })} />
            </Campo>
            <Campo rotulo="Destino">
              <Entrada required value={form.destino_endereco}
                onChange={(e) => setForm({ ...form, destino_endereco: e.target.value })} />
            </Campo>
            <Campo rotulo="Veículo do cliente">
              <Entrada required placeholder="Fiat Uno cinza" value={form.veiculo_cliente_descricao}
                onChange={(e) => setForm({ ...form, veiculo_cliente_descricao: e.target.value })} />
            </Campo>
            <Campo rotulo="Placa do cliente" dica="Opcional">
              <Entrada value={form.veiculo_cliente_placa}
                onChange={(e) => setForm({ ...form, veiculo_cliente_placa: e.target.value })} />
            </Campo>
            <Campo rotulo="Valor do serviço (R$)">
              <Entrada type="number" step="0.01" min="0" value={form.valor_total}
                onChange={(e) => setForm({ ...form, valor_total: e.target.value })} />
            </Campo>
            <Campo rotulo="Desconto (R$)">
              <Entrada type="number" step="0.01" min="0" value={form.desconto}
                onChange={(e) => setForm({ ...form, desconto: e.target.value })} />
            </Campo>
          </div>

          <Campo rotulo="Motorista" dica="Opcional">
            <BuscaPessoa rotulo="motorista" selecionada={motorista} aoSelecionar={setMotorista} papelSugerido="motorista" />
          </Campo>

          <Campo rotulo="Observações" dica="Opcional">
            <AreaTexto rows={2} value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </Campo>

          {erro && <p className="text-sm text-erro">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={fechar}>Cancelar</Botao>
            <Botao type="submit">Solicitar guincho</Botao>
          </div>
        </form>
      </Modal>
    </div>
  );
}
