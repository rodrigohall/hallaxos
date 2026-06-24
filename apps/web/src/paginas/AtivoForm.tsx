import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Link2 } from "lucide-react";
import { COMBUSTIVEIS } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { Botao, Campo, Card, Entrada, Selecao, useToast } from "../componentes/ui";

interface Categoria {
  id: string;
  nome: string;
  ehVeicular: boolean;
}

const VAZIO = {
  nome: "", categoria_id: "", valor_aquisicao: "", valor_fipe: "",
  valor_diaria: "", data_fipe_atualizacao: "",
  data_aquisicao: "", localizacao: "", observacoes: "", status: "",
  placa: "", renavam: "", chassi: "", marca: "", modelo: "",
  ano_fabricacao: "", ano_modelo: "", cor: "", combustivel: "", km_atual: "",
};
type Form = typeof VAZIO;

export function AtivoForm() {
  const { id } = useParams();
  const navegar = useNavigate();
  const fila = useQueryClient();
  const notificar = useToast();
  const [form, setForm] = useState<Form>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null);
  const [gerarCompra, setGerarCompra] = useState(false);

  const { data: categorias } = useQuery({
    queryKey: ["ativo-categorias"],
    queryFn: () => api.get<{ dados: Categoria[] }>("/ativos/categorias").then((r) => r.dados),
  });
  const categoria = categorias?.find((c) => c.id === form.categoria_id);
  const veicular = !!categoria?.ehVeicular;

  useEffect(() => {
    if (!id) return;
    api.get<{ dados: Record<string, unknown> & { veiculo: Record<string, unknown> | null } }>(`/ativos/${id}`).then(({ dados }) => {
      const f = { ...VAZIO };
      f.nome = String(dados.nome ?? "");
      f.categoria_id = String(dados.categoriaId ?? "");
      f.valor_aquisicao = dados.valorAquisicao ? String(dados.valorAquisicao) : "";
      f.valor_fipe = dados.valorFipe ? String(dados.valorFipe) : "";
      f.valor_diaria = dados.valorDiaria ? String(dados.valorDiaria) : "";
      f.data_fipe_atualizacao = dados.dataFipeAtualizacao ? String(dados.dataFipeAtualizacao) : "";
      f.data_aquisicao = dados.dataAquisicao ? String(dados.dataAquisicao) : "";
      f.localizacao = String(dados.localizacao ?? "");
      f.observacoes = String(dados.observacoes ?? "");
      f.status = String(dados.status ?? "");
      const v = dados.veiculo;
      if (v) {
        f.placa = String(v.placa ?? "");
        f.renavam = String(v.renavam ?? "");
        f.chassi = String(v.chassi ?? "");
        f.marca = String(v.marca ?? "");
        f.modelo = String(v.modelo ?? "");
        f.ano_fabricacao = v.anoFabricacao ? String(v.anoFabricacao) : "";
        f.ano_modelo = v.anoModelo ? String(v.anoModelo) : "";
        f.cor = String(v.cor ?? "");
        f.combustivel = String(v.combustivel ?? "");
        f.km_atual = v.kmAtual != null ? String(v.kmAtual) : "";
      }
      setForm(f);
    });
  }, [id]);

  const definir = (campo: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  const criarCategoria = async () => {
    if (!novaCategoria?.trim()) return;
    try {
      const { dados } = await api.post<{ dados: Categoria }>("/ativos/categorias", {
        nome: novaCategoria.trim(),
        eh_veicular: confirm("Esta categoria é de veículos (exige placa)?"),
      });
      fila.invalidateQueries({ queryKey: ["ativo-categorias"] });
      setForm((f) => ({ ...f, categoria_id: dados.id }));
      setNovaCategoria(null);
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Falha ao criar categoria", descricao: e instanceof ApiError ? e.message : undefined });
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErros({});
    setErroGeral("");
    setEnviando(true);
    try {
      const ou = (v: string) => (v === "" ? null : v);
      const corpo: Record<string, unknown> = {
        nome: form.nome,
        categoria_id: form.categoria_id,
        valor_aquisicao: ou(form.valor_aquisicao),
        valor_fipe: ou(form.valor_fipe),
        valor_diaria: ou(form.valor_diaria),
        data_fipe_atualizacao: ou(form.data_fipe_atualizacao),
        data_aquisicao: ou(form.data_aquisicao),
        localizacao: ou(form.localizacao),
        observacoes: ou(form.observacoes),
      };
      if (!id) {
        // Guard anti-duplicação (#58): só ao criar — flag de mão única
        corpo.gerar_compra = gerarCompra;
      }
      if (id && form.status) corpo.status = form.status;
      if (veicular && (form.placa || form.marca || form.modelo)) {
        corpo.veiculo = {
          placa: ou(form.placa),
          renavam: ou(form.renavam),
          chassi: ou(form.chassi),
          marca: ou(form.marca) ?? "",
          modelo: ou(form.modelo) ?? "",
          ano_fabricacao: ou(form.ano_fabricacao),
          ano_modelo: ou(form.ano_modelo),
          cor: ou(form.cor),
          combustivel: ou(form.combustivel),
          km_atual: form.km_atual === "" ? 0 : Number(form.km_atual),
        };
      }
      const { dados } = id
        ? await api.patch<{ dados: { id: string } }>(`/ativos/${id}`, corpo)
        : await api.post<{ dados: { id: string } }>("/ativos", corpo);
      fila.invalidateQueries({ queryKey: ["ativos"] });
      fila.invalidateQueries({ queryKey: ["dashboard"] });
      notificar({ tipo: "ok", titulo: id ? "Ativo atualizado" : "Ativo cadastrado" });
      navegar(`/ativos/${dados.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.detalhes) {
          setErros(
            Object.fromEntries(err.detalhes.map((d) => [d.campo.replace("veiculo.", ""), d.mensagem]))
          );
        }
        setErroGeral(err.message);
      } else {
        setErroGeral("Erro inesperado.");
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-lg font-bold">{id ? "Editar ativo" : "Novo ativo"}</h1>

      <Card titulo="Identificação">
        <div className="grid gap-4 md:grid-cols-2">
          <Campo rotulo="Nome do ativo" erro={erros.nome} dica='Ex.: "Corolla Prata 2022", "Empilhadeira Yale"'>
            <Entrada value={form.nome} onChange={definir("nome")} required autoFocus />
          </Campo>
          <Campo rotulo="Categoria" erro={erros.categoria_id}>
            {novaCategoria === null ? (
              <div className="flex gap-2">
                <Selecao value={form.categoria_id} onChange={definir("categoria_id")} required>
                  <option value="">Escolha…</option>
                  {categorias?.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </Selecao>
                <Botao type="button" variante="secundario" onClick={() => setNovaCategoria("")} title="Nova categoria">
                  <Plus className="h-4 w-4" />
                </Botao>
              </div>
            ) : (
              <div className="flex gap-2">
                <Entrada
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value)}
                  placeholder="Nome da nova categoria"
                  autoFocus
                />
                <Botao type="button" tamanho="md" onClick={criarCategoria}>Criar</Botao>
                <Botao type="button" variante="fantasma" onClick={() => setNovaCategoria(null)}>✕</Botao>
              </div>
            )}
          </Campo>
        </div>
      </Card>

      {veicular && (
        <Card titulo="Veículo" className="border-info/20">
          <p className="mb-3 text-xs text-mudo">
            Placa obrigatória apenas quando o cadastro estiver completo — você pode salvar sem ela agora.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <Campo rotulo="Placa" erro={erros.placa}>
              <Entrada value={form.placa} onChange={definir("placa")} className="uppercase" maxLength={8} />
            </Campo>
            <Campo rotulo="Marca" erro={erros.marca}>
              <Entrada value={form.marca} onChange={definir("marca")} />
            </Campo>
            <Campo rotulo="Modelo" erro={erros.modelo}>
              <Entrada value={form.modelo} onChange={definir("modelo")} />
            </Campo>
            <Campo rotulo="Ano fabricação" erro={erros.ano_fabricacao}>
              <Entrada type="number" value={form.ano_fabricacao} onChange={definir("ano_fabricacao")} />
            </Campo>
            <Campo rotulo="Ano modelo" erro={erros.ano_modelo}>
              <Entrada type="number" value={form.ano_modelo} onChange={definir("ano_modelo")} />
            </Campo>
            <Campo rotulo="Cor">
              <Entrada value={form.cor} onChange={definir("cor")} />
            </Campo>
            <Campo rotulo="Combustível">
              <Selecao value={form.combustivel} onChange={definir("combustivel")}>
                <option value="">—</option>
                {COMBUSTIVEIS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Selecao>
            </Campo>
            <Campo rotulo="Quilometragem" erro={erros.km_atual}>
              <Entrada type="number" value={form.km_atual} onChange={definir("km_atual")} />
            </Campo>
            <Campo rotulo="Renavam">
              <Entrada value={form.renavam} onChange={definir("renavam")} />
            </Campo>
            <Campo rotulo="Chassi">
              <Entrada value={form.chassi} onChange={definir("chassi")} />
            </Campo>
          </div>
        </Card>
      )}

      <Card titulo="Valores e situação">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Campo rotulo="Valor de compra (R$)" erro={erros.valor_aquisicao}>
            <Entrada type="number" step="0.01" value={form.valor_aquisicao} onChange={definir("valor_aquisicao")} />
          </Campo>
          <Campo rotulo="Diária padrão (R$)" erro={erros.valor_diaria}
            dica="Sugerida na locação — editável no ato">
            <Entrada type="number" step="0.01" value={form.valor_diaria} onChange={definir("valor_diaria")} />
          </Campo>
          <Campo rotulo="Valor FIPE (R$)" erro={erros.valor_fipe}>
            <Entrada type="number" step="0.01" value={form.valor_fipe} onChange={definir("valor_fipe")} />
          </Campo>
          <Campo rotulo="Data atualização FIPE" dica='Rótulo exibido na tela do ativo (ex.: "FIPE jun/26")'>
            <Entrada type="date" value={form.data_fipe_atualizacao} onChange={definir("data_fipe_atualizacao")} />
          </Campo>
          <Campo rotulo="Data de aquisição">
            <Entrada type="date" value={form.data_aquisicao} onChange={definir("data_aquisicao")} />
          </Campo>
          <Campo rotulo="Localização" dica="Pátio, galpão, filial…">
            <Entrada value={form.localizacao} onChange={definir("localizacao")} />
          </Campo>
          {id && (
            <Campo rotulo="Situação">
              <Selecao value={form.status} onChange={definir("status")}>
                {["disponivel", "reservado", "alugado", "em_manutencao", "em_uso_interno", "vendido", "baixado"].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Observações">
            <Entrada value={form.observacoes} onChange={definir("observacoes")} />
          </Campo>
        </div>
      </Card>

      {/* Interligação — guard #58: só no cadastro novo, de mão única */}
      {!id && (
        <Card titulo="Interligação" icone={Link2} className="border-ouro/20">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={gerarCompra}
              onChange={(e) => setGerarCompra(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-borda-forte accent-ouro"
            />
            <div>
              <p className="text-sm font-medium">Gerar operação de compra e lançamento financeiro</p>
              <p className="text-xs text-mudo">
                Cria uma operação do tipo "compra" vinculada a este ativo e um lançamento
                de despesa com o valor de compra informado. Só disponível quando o valor de
                compra está preenchido. A operação criada <strong>não</strong> recria este ativo (guard #58).
              </p>
            </div>
          </label>
          {gerarCompra && !form.valor_aquisicao && (
            <p className="mt-2 text-xs text-alerta">Preencha o valor de compra para gerar o lançamento.</p>
          )}
        </Card>
      )}

      {erroGeral && <p className="text-sm text-erro">{erroGeral}</p>}

      <div className="flex gap-2">
        <Botao type="submit" carregando={enviando}>
          {id ? "Salvar alterações" : "Cadastrar ativo"}
        </Botao>
        <Botao type="button" variante="fantasma" onClick={() => navegar(-1)}>Cancelar</Botao>
      </div>
    </form>
  );
}
