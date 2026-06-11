import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { Botao, Campo, Card, Entrada, Selecao } from "../componentes/ui";

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
  const filaQueries = useQueryClient();
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState(0);

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
    });
  }, [id]);

  const definir = (campo: keyof Formulario) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

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
      const { dados } = id
        ? await api.patch<{ dados: { id: string } }>(`/pessoas/${id}`, corpo)
        : await api.post<{ dados: { id: string } }>("/pessoas", corpo);
      filaQueries.invalidateQueries({ queryKey: ["pessoas"] });
      navegar(`/clientes/${dados.id}`);
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
      <h1 className="text-xl font-bold">{id ? "Editar cadastro" : "Novo cadastro"}</h1>

      <div className="flex gap-2">
        {etapas.map((nome, i) => (
          <button
            key={nome}
            type="button"
            onClick={() => setEtapa(i)}
            className={`rounded-full px-3 py-1 text-xs ${
              etapa === i ? "bg-marca/20 text-marca-forte" : "bg-borda/40 text-suave"
            }`}
          >
            {i + 1}. {nome}
          </button>
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
            <Campo rotulo="CEP">
              <Entrada value={form.cep} onChange={definir("cep")} />
            </Campo>
            <Campo rotulo="Cidade">
              <Entrada value={form.cidade} onChange={definir("cidade")} />
            </Campo>
            <Campo rotulo="Logradouro">
              <Entrada value={form.logradouro} onChange={definir("logradouro")} />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
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
