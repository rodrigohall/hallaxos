import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Truck, KeyRound, TrendingUp, ShoppingCart, MapPin, Clock, Tag, Percent } from "lucide-react";
import { api, ApiError } from "../api";
import {
  Botao, Card, Campo, Entrada, AreaTexto, useToast,
} from "../componentes/ui";
import { Seletor, type ItemSeletor } from "../operacoes/Seletor";
import { ROTULO_TIPO } from "../operacoes/rotulos";

type Tipo = "guincho" | "locacao" | "venda" | "compra";
type DescontoTipo = "R$" | "%";

/** Formata endereço retornado pelo ViaCEP numa linha. */
function enderecoViaCep(d: Record<string, string>): string {
  const partes = [d.logradouro, d.bairro, d.localidade && d.uf ? `${d.localidade}/${d.uf}` : d.localidade].filter(Boolean);
  return partes.join(", ");
}

/** Endereço cadastrado do cliente formatado numa linha (referencia o núcleo Pessoas). */
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
  const [retroativo, setRetroativo] = useState(false);
  const [descontoTipo, setDescontoTipo] = useState<DescontoTipo>("R$");
  const [enviando, setEnviando] = useState(false);

  const set = (k: string) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));

  // Endereço do cliente para atalho "Usar endereço do cliente" no guincho.
  const { data: clientePessoa } = useQuery({
    queryKey: ["pessoa-endereco", cliente?.id],
    enabled: tipo === "guincho" && !!cliente,
    queryFn: () => api.get<{ dados: Record<string, unknown> }>(`/pessoas/${cliente!.id}`).then((r) => r.dados),
  });
  const enderecoCliente = enderecoDe(clientePessoa);
  const usarEndereco = (campo: "origem_endereco" | "destino_endereco") =>
    enderecoCliente && setCampos((c) => ({ ...c, [campo]: enderecoCliente }));

  // Detalhes do ativo para pré-preenchimento na locação (diária + caução FIPE 5%).
  const { data: ativoDet } = useQuery({
    queryKey: ["ativo-detalhe-locacao", ativo?.id],
    enabled: tipo === "locacao" && !!ativo,
    queryFn: () => api.get<{ dados: Record<string, unknown> }>(`/ativos/${ativo!.id}`).then((r) => r.dados),
  });
  const ativoAnteriorId = useRef<string | null>(null);
  useEffect(() => {
    if (!ativoDet || !ativo || ativo.id === ativoAnteriorId.current) return;
    ativoAnteriorId.current = ativo.id;
    const fipe = Number(ativoDet.valorFipe ?? 0);
    const diaria = ativoDet.valorDiaria ? String(ativoDet.valorDiaria) : "";
    setCampos((c) => ({
      ...c,
      valor_diaria_base: diaria,
      desconto: "",
      caucao: fipe > 0 ? (fipe * 0.05).toFixed(2) : c.caucao ?? "",
    }));
  }, [ativoDet, ativo]);

  // Diária efetiva após desconto (locação).
  const diariaSugerida = Number(campos.valor_diaria_base || 0);
  const descontoRaw = Number(campos.desconto || 0);
  const diariaNaEfetiva =
    descontoTipo === "%"
      ? Math.max(0, diariaSugerida * (1 - descontoRaw / 100))
      : Math.max(0, diariaSugerida - descontoRaw);

  // Lookup CEP → ViaCEP (chama para campo `cep_origem` ou `cep_destino`).
  const buscarCep = async (cep: string, campoEndereco: "origem_endereco" | "destino_endereco") => {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const json = await res.json() as Record<string, string>;
      if (json.erro) return;
      const endereco = enderecoViaCep(json);
      if (endereco) setCampos((c) => ({ ...c, [campoEndereco]: endereco }));
    } catch {
      // ignora falha de rede — usuário pode digitar manualmente
    }
  };

  const enviar = async () => {
    if (!tipo || !cliente) return;
    setEnviando(true);
    try {
      const ou = (v: string | undefined) => (v === "" || v === undefined ? undefined : v);
      let corpo: Record<string, unknown> = {
        cliente_id: cliente.id,
        observacoes: ou(campos.observacoes),
        data_inicio: retroativo ? ou(campos.data_inicio) : undefined,
      };
      let url = "";
      if (tipo === "guincho") {
        url = "/operacoes/guincho";
        corpo = {
          ...corpo,
          caminhao_id: ativo?.id ?? null,
          origem_endereco: campos.origem_endereco,
          destino_endereco: campos.destino_endereco,
          veiculo_cliente_descricao: campos.veiculo_cliente_descricao,
          veiculo_cliente_placa: ou(campos.veiculo_cliente_placa),
          valor_total: Number(campos.valor_total || 0),
        };
      } else if (tipo === "locacao") {
        url = "/operacoes/locacao";
        corpo = {
          ...corpo,
          ativo_id: ativo?.id,
          valor_diaria: diariaSugerida > 0 ? diariaNaEfetiva : Number(campos.valor_diaria_base || 0),
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

  const podeEnviar =
    !!tipo && !!cliente &&
    (tipo !== "guincho" || (!!campos.origem_endereco && !!campos.destino_endereco && !!campos.veiculo_cliente_descricao)) &&
    (tipo !== "locacao" || (!!ativo && (diariaSugerida > 0 || !!campos.valor_diaria_base) && !!campos.data_devolucao_prevista)) &&
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
              setRetroativo(false);
              ativoAnteriorId.current = null;
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
                  filtro="status=disponivel&categoria_nome=Caminhão"
                />

                {/* Origem */}
                <div className="space-y-1">
                  <Campo rotulo="Endereço de origem">
                    <div className="flex gap-2">
                      <Entrada
                        placeholder="CEP (opcional)"
                        value={campos.cep_origem ?? ""}
                        onChange={set("cep_origem")}
                        onBlur={(e) => buscarCep(e.target.value, "origem_endereco")}
                        className="w-28 shrink-0"
                        maxLength={9}
                      />
                      <Entrada
                        value={campos.origem_endereco ?? ""}
                        onChange={set("origem_endereco")}
                        placeholder="Logradouro, bairro, cidade/UF"
                        className="flex-1"
                      />
                    </div>
                    <BotaoEndereco visivel={!!enderecoCliente} ao={() => usarEndereco("origem_endereco")} />
                  </Campo>
                </div>

                {/* Destino */}
                <div className="space-y-1">
                  <Campo rotulo="Endereço de destino">
                    <div className="flex gap-2">
                      <Entrada
                        placeholder="CEP (opcional)"
                        value={campos.cep_destino ?? ""}
                        onChange={set("cep_destino")}
                        onBlur={(e) => buscarCep(e.target.value, "destino_endereco")}
                        className="w-28 shrink-0"
                        maxLength={9}
                      />
                      <Entrada
                        value={campos.destino_endereco ?? ""}
                        onChange={set("destino_endereco")}
                        placeholder="Logradouro, bairro, cidade/UF"
                        className="flex-1"
                      />
                    </div>
                    <BotaoEndereco visivel={!!enderecoCliente} ao={() => usarEndereco("destino_endereco")} />
                  </Campo>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo rotulo="Veículo do cliente">
                    <Entrada value={campos.veiculo_cliente_descricao ?? ""} onChange={set("veiculo_cliente_descricao")} placeholder="Ex.: Fiat Strada branca" />
                  </Campo>
                  <Campo rotulo="Placa do cliente (opcional)">
                    <Entrada value={campos.veiculo_cliente_placa ?? ""} onChange={set("veiculo_cliente_placa")} className="uppercase" />
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

                {ativo && diariaSugerida > 0 && (
                  <div className="rounded-md border border-borda bg-elevado px-3 py-2 text-xs text-suave">
                    <span className="font-medium text-texto">Diária sugerida:</span>{" "}
                    <span className="font-display text-ouro">
                      {diariaSugerida.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    {" "}— FIPE 5%:{" "}
                    <span className="text-texto">{Number(campos.caucao || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Desconto com toggle R$ / % */}
                  <Campo rotulo="Desconto na diária" dica={diariaSugerida > 0 ? `Diária final: ${diariaNaEfetiva.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : undefined}>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setDescontoTipo(descontoTipo === "R$" ? "%" : "R$")}
                        className="flex items-center gap-0.5 rounded border border-borda px-2 text-xs font-medium text-suave hover:border-borda-forte"
                        title="Alternar entre R$ e %"
                      >
                        {descontoTipo === "R$" ? <Tag className="h-3 w-3" /> : <Percent className="h-3 w-3" />}
                        {descontoTipo}
                      </button>
                      <Entrada
                        type="number"
                        step="0.01"
                        min="0"
                        value={campos.desconto ?? ""}
                        onChange={set("desconto")}
                        placeholder="0"
                        className="flex-1"
                      />
                    </div>
                  </Campo>

                  <Campo rotulo="Caução (R$)" dica="Auto-sugerida como 5% do FIPE — editável">
                    <Entrada type="number" step="0.01" value={campos.caucao ?? ""} onChange={set("caucao")} />
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

            {/* Retroativo toggle */}
            <div className="rounded-md border border-borda bg-elevado/50 p-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={retroativo}
                  onChange={(e) => setRetroativo(e.target.checked)}
                  className="h-4 w-4 rounded border-borda-forte accent-ouro"
                />
                <span className="flex items-center gap-1.5 text-sm text-suave">
                  <Clock className="h-3.5 w-3.5" />
                  Registrar como retroativo (data passada)
                </span>
              </label>
              {retroativo && (
                <div className="mt-3">
                  <Campo rotulo="Data de início">
                    <Entrada
                      type="date"
                      value={campos.data_inicio ?? ""}
                      onChange={set("data_inicio")}
                    />
                  </Campo>
                </div>
              )}
            </div>

            <Campo rotulo="Observações (opcional)">
              <AreaTexto value={campos.observacoes ?? ""} onChange={set("observacoes")} />
            </Campo>

            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={() => navegar("/operacoes")}>Cancelar</Botao>
              <Botao onClick={enviar} carregando={enviando} disabled={!podeEnviar || enviando}>
                Criar operação
              </Botao>
            </div>
            {(tipo === "locacao" || tipo === "venda" || tipo === "compra") && !ativo && (
              <p className="text-right text-xs text-mudo">Selecione o ativo para continuar.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
