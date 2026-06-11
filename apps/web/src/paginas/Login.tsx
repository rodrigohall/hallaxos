import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";
import { Botao, Campo, Entrada } from "../componentes/ui";

export function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await entrar(email, senha);
      navegar("/");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro ao entrar.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={enviar} className="w-full max-w-sm rounded-xl border border-borda bg-painel p-6">
        <h1 className="mb-1 text-center text-2xl font-bold">
          Hallax<span className="text-marca-forte">OS</span>
        </h1>
        <p className="mb-6 text-center text-sm text-suave">O cérebro operacional da Hallax</p>
        <div className="space-y-4">
          <Campo rotulo="E-mail">
            <Entrada
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@hallax.com"
              autoFocus
              required
            />
          </Campo>
          <Campo rotulo="Senha">
            <Entrada type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          {erro && <p className="text-sm text-erro">{erro}</p>}
          <Botao type="submit" disabled={enviando} className="w-full">
            {enviando ? "Entrando…" : "Entrar"}
          </Botao>
        </div>
      </form>
    </div>
  );
}
