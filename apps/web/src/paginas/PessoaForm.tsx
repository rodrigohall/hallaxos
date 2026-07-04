import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { Botao, Campo, Card, Entrada, Selecao, Chip, useToast } from "../componentes/ui";

const VAZIO = {
  tipo: "pf",
  nome: "", nome_fantasia: "", cpf_cnpj: "", email: "", telefone: "",
  cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "",
  cnh_numero: "", cnh_categoria: "", cnh_validade: "", observacoes: "",
};

type Formulario = typeof VAZIO;

export function PessoaForm() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  // Cadastro rápido a partir de outro formulário (ex.: Nova operação): ao
  // salvar, volta para a rota de origem com o novo cliente pré-selecionado.
  const retorno = params.get("retorno");
  const filaQueries = useQueryClient();
  const notificar = useToast();
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [ehOficina, setEhOficina] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [buscandoCep, setBuscandoCep] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<{ dados: Record<string, unknown> }>(`/pessoas/${id}`).then(({ dados }) => {
      const f = { ...VAZIO };
      const mapa: Record<string, string> = {
        tipo: "tipo", nome: "nome", nomeFantasia: "nome_fantasia", cpfCnpj: "cpf_cnpj",
        email: "email", telefone: "telefone", cep: "cep", logradouro: "logradouro",
        numero: "numero", bairro: "bairro", cidade: "cidade", uf: "uf",
        cnhNumero: "cnh_numero", cnhCategoria: "cnh_categoria", cnhValidade: "cnh_validade",
        observacoes: "observacoes",
      };
      for (const [coluna, campo] of Object.entries(mapa)) {
        const v = dados[coluna];
        if (v != null) (f as Record<string, string>)[campo] = String(v);
      }
      setForm(f);
      setEhOficina(Array.isArray(dados.papeis) && (dados.papeis as string[]).includes("oficina"));
    });
  }, [id]);

  const definir = (campo: keyof Formulario) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  // Autocomplete de endereço pelo CEP (ViaCEP). A consulta é feita pelo
  // navegador do usuário — não passa pelo nosso servidor. Preenche logradouro,
  // bairro, cidade e UF; em falha, deixa preencher manualmente sem travar.
  const buscarCep = async (valor: string) => {
    const cep = valor.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = (await r.json()) as {
        erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string;
      };
      if (d.erro) {
        notificar({ tipo: "erro", titulo: "CEP não encontrado", descricao: "Confira o número ou preencha manualmente." });
        return;
      }
      setForm((f) => ({
        ...f,
        logradouro: d.logradouro || f.logradouro,
        bairro: d.bairro || f.bairro,
        cidade: d.localidade || f.cidade,
        uf: d.uf || f.uf,
      }));
    } catch {
      notificar({ tipo: "erro", titulo: "Não consegui consultar o CEP", descricao: "Preencha o endereço manualmente." });
    } finally {
      setBuscandoCep(false);
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErros({});
    setErroGeral("");
    setEnviando(true);
    try {
      const corpo: Record<string, unknown> = {};
      for (const [campo, valor] of Object.entries(form)) {
        corpo[campo] = valor === "" ? null : valor;
      }
      corpo.tipo = form.tipo;
      corpo.nome = form.nome;
      corpo.cpf_cnpj = form.cpf_cnpj;
      corpo.eh_oficina = ehOficina;
      const { dados } = id
        ? await api.patch<{ dados: { id: string } }>(`/pessoas/${id}`, corpo)
        : await api.post<{ dados: { id: string } }>("/pessoas", corpo);
      filaQueries.invalidateQueries({ queryKey: ["pessoas"] });
      notificar({
        tipo: "ok",
        titulo: id ? "Cadastro atualizado" : "Cadastro criado",
        descricao: "A alteração já está na timeline.",
      });
      if (!id && retorno && retorno.startsWith("/")) {
        const sep = retorno.includes("?") ? "&" : "?";
        navegar(`${retorno}${sep}cliente_id=${dados.id}`);
      } else {
        navegar(`/clientes/${dados.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.detalhes) {
          setErros(Object.fromEntries(err.detalhes.map((d) => [d.campo, d.mensagem])));
        }
        setErroGeral(err.message);
      } else {
        setErroGeral("Erro inesperado.");
      }
    } finally {
      setEnviando(false);
    }
  };

  const etapas = ["Identificação", "Contato e endereço", "CNH e observações"];

  return (
    <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-display text-lg font-bold">{id ? "Editar cadastro" : "Novo cadastro"}</h1>

      <div className="flex flex-wrap gap-2">
        {etapas.map((nome, i) => (
          <Chip key={nome} ativo={etapa === i} onClick={() => setEtapa(i)}>
            {i + 1}. {nome}
          </Chip>
        ))}
      </div>

      {etapa === 0 && (
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo rotulo="Tipo">
              <Selecao value={form.tipo} onChange={definir("tipo")}>
                <option value="pf">Pessoa Física</option>
                <option value="pj">Pessoa Jurídica</option>
              </Selecao>
            </Campo>
            <Campo rotulo={form.tipo === "pj" ? "CNPJ" : "CPF"} erro={erros.cpf_cnpj}>
              <Entrada value={form.cpf_cnpj} onChange={definir("cpf_cnpj")} required />
            </Campo>
            <Campo rotulo={form.tipo === "pj" ? "Razão social" : "Nome completo"} erro={erros.nome}>
              <Entrada value={form.nome} onChange={definir("nome")} required />
            </Campo>
            {form.tipo === "pj" && (
              <Campo rotulo="Nome fantasia">
                <Entrada value={form.nome_fantasia} onChange={definir("nome_fantasia")} />
              </Campo>
            )}
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ehOficina}
              onChange={(e) => setEhOficina(e.target.checked)}
              className="h-4 w-4 rounded border-borda accent-ouro"
            />
            <span>É oficina <span className="text-mudo">— aparece na busca de oficinas das manutenções</span></span>
          </label>
        </Card>
      )}

      {etapa === 1 && (
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo rotulo="Telefone (WhatsApp)" erro={erros.telefone}>
              <Entrada value={form.telefone} onChange={definir("telefone")} />
            </Campo>
            <Campo rotulo="E-mail" erro={erros.email}>
              <Entrada type="email" value={form.email} onChange={definir("email")} />
            </Campo>
            <Campo rotulo="CEP" dica={buscandoCep ? "Buscando endereço…" : "Preenche o endereço automaticamente"}>
              <Entrada
                value={form.cep}
                inputMode="numeric"
                maxLength={9}
                placeholder="00000-000"
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, cep: v }));
                  if (v.replace(/\D/g, "").length === 8) void buscarCep(v);
                }}
                onBlur={(e) => void buscarCep(e.target.value)}
              />
            </Campo>
            <Campo rotulo="Cidade">
              <Entrada value={form.cidade} onChange={definir("cidade")} />
            </Campo>
            <Campo rotulo="Logradouro">
              <Entrada value={form.logradouro} onChange={definir("logradouro")} />
            </Campo>
            <Campo rotulo="Bairro">
              <Entrada value={form.bairro} onChange={definir("bairro")} />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Número">
                <Entrada value={form.numero} onChange={definir("numero")} />
              </Campo>
              <Campo rotulo="UF" erro={erros.uf}>
                <Entrada value={form.uf} onChange={definir("uf")} maxLength={2} />
              </Campo>
            </div>
          </div>
        </Card>
      )}

      {etapa === 2 && (
        <Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Campo rotulo="CNH (se dirige)">
              <Entrada value={form.cnh_numero} onChange={definir("cnh_numero")} />
            </Campo>
            <Campo rotulo="Categoria">
              <Entrada value={form.cnh_categoria} onChange={definir("cnh_categoria")} />
            </Campo>
            <Campo rotulo="Validade da CNH">
              <Entrada type="date" value={form.cnh_validade} onChange={definir("cnh_validade")} />
            </Campo>
          </div>
          <div className="mt-4">
            <Campo rotulo="Observações">
              <Entrada value={form.observacoes} onChange={definir("observacoes")} />
            </Campo>
          </div>
        </Card>
      )}

      {erroGeral && <p className="text-sm text-erro">{erroGeral}</p>}

      <div className="flex gap-2">
        {etapa > 0 && (
          <Botao type="button" variante="secundario" onClick={() => setEtapa(etapa - 1)}>
            Voltar
          </Botao>
        )}
        {etapa < etapas.length - 1 ? (
          <Botao type="button" onClick={() => setEtapa(etapa + 1)}>
            Continuar
          </Botao>
        ) : (
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar cadastro"}
          </Botao>
        )}
      </div>
    </form>
  );
}
