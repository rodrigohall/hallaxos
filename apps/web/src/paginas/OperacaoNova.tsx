import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Truck, KeyRound, TrendingUp, ShoppingCart, MapPin } from "lucide-react";
import { api, ApiError } from "../api";
import {
  Botao, Card, Campo, Entrada, AreaTexto, useToast,
} from "../componentes/ui";
import { Seletor, type ItemSeletor } from "../operacoes/Seletor";
import { ROTULO_TIPO } from "../operacoes/rotulos";

type Tipo = "guincho" | "locacao" | "venda" | "compra";

/** Endereço cadastrado do cliente, formatado em uma linha (núcleo Pessoas — sem
 * tabela paralela; o guincho apenas referencia/preenche a partir dele). */
function enderecoDe(p: Record<string, unknown> | undefined): string | null {
  if (!p) return null;
  const linha1 = [p.logradouro, p.numero].filter(Boolean).join(", ");
  const cidadeUf = [p.cidade, p.uf].filter(Boolean).join("/");
  const linha2 = [p.bairro, cidadeUf].filter(Boolean).join(" - ");
  const full = [linha1, p.complemento, linha2].filter(Boolean).join(" - ");
  return full.trim() ? full : null;
}

const TIPOS: Array<{ tipo: Tipo; icone: typeof Truck; descricao: string }> = [
  { tipo: "guincho", icone: Truck, descricao: "Acionamento de guincho da origem ao destino." },
  { tipo: "locacao", icone: KeyRound, descricao: "Aluguel de um veículo da frota a um cliente." },
  { tipo: "venda", icone: TrendingUp, descricao: "Venda de um ativo do patrimônio." },
  { tipo: "compra", icone: ShoppingCart, descricao: "Compra de um ativo para o patrimônio." },
];

export function OperacaoNova() {
  const navegar = useNavigate();
  const notificar = useToast();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [cliente, setCliente] = useState<ItemSeletor | null>(null);
  const [ativo, setAtivo] = useState<ItemSeletor | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));

  // Endereço cadastrado do cliente, para o atalho "Usar endereço do cliente"
  // nos campos de origem/destino do guincho (referencia o núcleo Pessoas).
  const { data: clientePessoa } = useQuery({
    queryKey: ["pessoa-endereco", cliente?.id],
    enabled: tipo === "guincho" && !!cliente,
    queryFn: () => api.get<{ dados: Record<string, unknown> }>(`/pessoas/${cliente!.id}`).then((r) => r.dados),
  });
  const enderecoCliente = enderecoDe(clientePessoa);
  const usarEndereco = (campo: "origem_endereco" | "destino_endereco") =>
    enderecoCliente && setCampos((c) => ({ ...c, [campo]: enderecoCliente }));

  const enviar = async () => {
    if (!tipo || !cliente) return;
    setEnviando(true);
    try {
      let corpo: Record<string, unknown> = { cliente_id: cliente.id, observacoes: campos.observacoes || undefined };
      let url = "";
      if (tipo === "guincho") {
        url = "/operacoes/guincho";
        corpo = {
          ...corpo,
          caminhao_id: ativo?.id ?? null,
          origem_endereco: campos.origem_endereco,
          destino_endereco: campos.destino_endereco,
          veiculo_cliente_descricao: campos.veiculo_cliente_descricao,
          veiculo_cliente_placa: campos.veiculo_cliente_placa || undefined,
          valor_total: Number(campos.valor_total || 0),
        };
      } else if (tipo === "locacao") {
        url = "/operacoes/locacao";
        corpo = {
          ...corpo,
          ativo_id: ativo?.id,
          valor_diaria: Number(campos.valor_diaria || 0),
          caucao: Number(campos.caucao || 0),
          data_devolucao_prevista: campos.data_devolucao_prevista,
        };
      } else {
        url = `/operacoes/${tipo}`;
        corpo = {
          ...corpo,
          ativo_id: ativo?.id,
          valor_total: Number(campos.valor_total || 0),
          km_no_ato: campos.km_no_ato ? Number(campos.km_no_ato) : undefined,
        };
      }
      const r = await api.post<{ dados: { id: string; codigo: string } }>(url, corpo);
      notificar({ tipo: "ok", titulo: `Operação ${r.dados.codigo} criada` });
      navegar(`/operacoes/${r.dados.id}`);
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível criar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  const BotaoEndereco = ({ visivel, ao }: { visivel: boolean; ao: () => void }) =>
    visivel ? (
      <button type="button" onClick={ao} className="mt-1 inline-flex items-center gap-1 text-xs text-ouro hover:underline">
        <MapPin className="h-3 w-3" /> Usar endereço do cliente
      </button>
    ) : null;

  const precisaAtivo = tipo === "locacao" || tipo === "venda" || tipo === "compra";
  const podeEnviar =
    !!tipo && !!cliente &&
    (tipo !== "guincho" || (!!campos.origem_endereco && !!campos.destino_endereco && !!campos.veiculo_cliente_descricao)) &&
    (tipo !== "locacao" || (!!ativo && !!campos.valor_diaria && !!campos.data_devolucao_prevista)) &&
    ((tipo !== "venda" && tipo !== "compra") || (!!ativo && !!campos.valor_total));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-lg font-bold">Nova operação</h1>

      {/* Passo 1: escolher o tipo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TIPOS.map((t) => (
          <button
            key={t.tipo}
            onClick={() => {
              setTipo(t.tipo);
              setAtivo(null);
              setCampos({});
            }}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors ${
              tipo === t.tipo ? "border-ouro bg-ouro/5 text-ouro" : "border-borda text-suave hover:border-borda-forte hover:text-texto"
            }`}
          >
            <t.icone className="h-5 w-5" />
            <span className="text-sm font-medium">{ROTULO_TIPO[t.tipo]}</span>
          </button>
        ))}
      </div>

      {tipo && (
        <Card>
          <p className="mb-4 text-sm text-suave">{TIPOS.find((t) => t.tipo === tipo)!.descricao}</p>
          <div className="space-y-4">
            <Seletor rotulo="Cliente" recurso="pessoas" selecionado={cliente} aoSelecionar={setCliente} />

            {tipo === "guincho" && (
              <>
                <Seletor
                  rotulo="Caminhão guincho (recurso) — opcional"
                  recurso="ativos"
                  selecionado={ativo}
                  aoSelecionar={setAtivo}
                  filtro="status=disponivel"
                />
                <Campo rotulo="Endereço de origem">
                  <Entrada value={campos.origem_endereco ?? ""} onChange={set("origem_endereco")} placeholder="De onde retirar" />
                  <BotaoEndereco visivel={!!enderecoCliente} ao={() => usarEndereco("origem_endereco")} />
                </Campo>
                <Campo rotulo="Endereço de destino">
                  <Entrada value={campos.destino_endereco ?? ""} onChange={set("destino_endereco")} placeholder="Para onde levar" />
                  <BotaoEndereco visivel={!!enderecoCliente} ao={() => usarEndereco("destino_endereco")} />
                </Campo>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo rotulo="Veículo do cliente">
                    <Entrada value={campos.veiculo_cliente_descricao ?? ""} onChange={set("veiculo_cliente_descricao")} placeholder="Ex.: Fiat Strada branca" />
                  </Campo>
                  <Campo rotulo="Placa do cliente (opcional)">
                    <Entrada value={campos.veiculo_cliente_placa ?? ""} onChange={set("veiculo_cliente_placa")} />
                  </Campo>
                </div>
                <Campo rotulo="Valor do serviço (R$)" dica="Pode ser ajustado na conclusão.">
                  <Entrada type="number" value={campos.valor_total ?? ""} onChange={set("valor_total")} />
                </Campo>
              </>
            )}

            {tipo === "locacao" && (
              <>
                <Seletor rotulo="Veículo" recurso="ativos" selecionado={ativo} aoSelecionar={setAtivo} filtro="status=disponivel" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo rotulo="Valor da diária (R$)">
                    <Entrada type="number" value={campos.valor_diaria ?? ""} onChange={set("valor_diaria")} />
                  </Campo>
                  <Campo rotulo="Caução (R$)">
                    <Entrada type="number" value={campos.caucao ?? ""} onChange={set("caucao")} />
                  </Campo>
                </div>
                <Campo rotulo="Devolução prevista">
                  <Entrada type="date" value={campos.data_devolucao_prevista ?? ""} onChange={set("data_devolucao_prevista")} />
                </Campo>
              </>
            )}

            {(tipo === "venda" || tipo === "compra") && (
              <>
                <Seletor
                  rotulo={tipo === "venda" ? "Ativo à venda" : "Ativo adquirido"}
                  recurso="ativos"
                  selecionado={ativo}
                  aoSelecionar={setAtivo}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo rotulo={`Valor da ${tipo} (R$)`}>
                    <Entrada type="number" value={campos.valor_total ?? ""} onChange={set("valor_total")} />
                  </Campo>
                  <Campo rotulo="Km no ato (opcional)">
                    <Entrada type="number" value={campos.km_no_ato ?? ""} onChange={set("km_no_ato")} />
                  </Campo>
                </div>
              </>
            )}

            <Campo rotulo="Observações (opcional)">
              <AreaTexto value={campos.observacoes ?? ""} onChange={set("observacoes")} />
            </Campo>

            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={() => navegar("/operacoes")}>Cancelar</Botao>
              <Botao onClick={enviar} carregando={enviando} disabled={!podeEnviar || enviando}>
                Criar operação
              </Botao>
            </div>
            {precisaAtivo && !ativo && (
              <p className="text-right text-xs text-mudo">Selecione o ativo para continuar.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
