import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PAPEIS_USUARIO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Botao, Campo, Card, Entrada, Selecao, Selo, useToast } from "../componentes/ui";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
  ultimoAcesso: string | null;
}

export function Usuarios() {
  const { pode, usuario: logado } = useAuth();
  const filaQueries = useQueryClient();
  const notificar = useToast();
  const [form, setForm] = useState({ nome: "", email: "", senha: "", papel: "operador" });
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);

  const { data } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => api.get<{ dados: Usuario[] }>("/usuarios").then((r) => r.dados),
  });

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setCriando(true);
    try {
      await api.post("/usuarios", form);
      setForm({ nome: "", email: "", senha: "", papel: "operador" });
      filaQueries.invalidateQueries({ queryKey: ["usuarios"] });
      notificar({ tipo: "ok", titulo: "Usuário criado" });
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro ao criar usuário.");
    } finally {
      setCriando(false);
    }
  };

  const alternarAtivo = async (u: Usuario) => {
    await api.post(`/usuarios/${u.id}/${u.ativo ? "desativar" : "reativar"}`);
    filaQueries.invalidateQueries({ queryKey: ["usuarios"] });
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-lg font-bold">Usuários</h1>

      {pode("usuarios", "criar") && (
        <Card titulo="Novo usuário">
          <form onSubmit={criar} className="grid gap-4 md:grid-cols-5">
            <Campo rotulo="Nome">
              <Entrada value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </Campo>
            <Campo rotulo="E-mail">
              <Entrada type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Campo>
            <Campo rotulo="Senha (mín. 8)">
              <Entrada type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
            </Campo>
            <Campo rotulo="Papel">
              <Selecao value={form.papel} onChange={(e) => setForm({ ...form, papel: e.target.value })}>
                {PAPEIS_USUARIO.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Selecao>
            </Campo>
            <div className="flex items-end">
              <Botao type="submit" disabled={criando} className="w-full">
                {criando ? "Criando…" : "Criar"}
              </Botao>
            </div>
          </form>
          {erro && <p className="mt-2 text-sm text-erro">{erro}</p>}
        </Card>
      )}

      <Card>
        <ul className="divide-y divide-borda">
          {data?.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {u.nome} {!u.ativo && <Selo>desativado</Selo>}
                </p>
                <p className="text-xs text-suave">{u.email}</p>
              </div>
              <Selo>{u.papel}</Selo>
              {pode("usuarios", "editar") && u.id !== logado?.id && (
                <Botao variante="secundario" onClick={() => alternarAtivo(u)}>
                  {u.ativo ? "Desativar" : "Reativar"}
                </Botao>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
