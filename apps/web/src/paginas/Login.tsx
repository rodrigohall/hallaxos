import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";
import { Botao, Campo, Entrada } from "../componentes/ui";
import { Monograma } from "../marca/Logo";

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Marca d'água do monograma, como no verso do cartão de visitas */}
      <Monograma className="pointer-events-none absolute -right-24 top-1/2 h-[34rem] w-auto -translate-y-1/2 text-elevado opacity-60" />

      <form
        onSubmit={enviar}
        className="animar-deslizar relative w-full max-w-sm rounded-xl border border-borda bg-painel/90 p-8 shadow-flutuante backdrop-blur"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <Monograma className="h-12 w-auto text-ouro" />
          <div className="text-center">
            <p className="font-display text-xl font-bold tracking-[0.18em]">
              HALLAX<span className="text-ouro">OS</span>
            </p>
            <p className="mt-1 text-xs text-mudo">O cérebro operacional da Hallax</p>
          </div>
        </div>
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
          <Campo rotulo="Senha" erro={erro || undefined}>
            <Entrada type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          <Botao type="submit" carregando={enviando} className="w-full">
            Entrar
          </Botao>
        </div>
      </form>
    </div>
  );
}
