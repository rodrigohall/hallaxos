import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PapelUsuario } from "@hallaxos/shared";
import { api } from "./api";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
}

type Permissoes = Record<string, string[]>;

interface Sessao {
  usuario: Usuario | null;
  permissoes: Permissoes;
  copilotoAtivo: boolean;
  carregando: boolean;
  entrar(email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  pode(recurso: string, acao: string): boolean;
}

interface DadosSessao {
  usuario: Usuario;
  permissoes: Permissoes;
  copiloto?: { ativo: boolean };
}

const Contexto = createContext<Sessao>(null as never);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [permissoes, setPermissoes] = useState<Permissoes>({});
  const [copilotoAtivo, setCopilotoAtivo] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get<{ dados: DadosSessao }>("/auth/sessao")
      .then(({ dados }) => {
        setUsuario(dados.usuario);
        setPermissoes(dados.permissoes);
        setCopilotoAtivo(dados.copiloto?.ativo ?? false);
      })
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, []);

  const entrar = async (email: string, senha: string) => {
    const { dados } = await api.post<{ dados: DadosSessao }>("/auth/login", { email, senha });
    setUsuario(dados.usuario);
    setPermissoes(dados.permissoes);
    setCopilotoAtivo(dados.copiloto?.ativo ?? false);
  };

  const sair = async () => {
    await api.post("/auth/logout").catch(() => {});
    setUsuario(null);
    setPermissoes({});
    setCopilotoAtivo(false);
  };

  const pode = (recurso: string, acao: string) => permissoes[recurso]?.includes(acao) ?? false;

  return (
    <Contexto.Provider value={{ usuario, permissoes, copilotoAtivo, carregando, entrar, sair, pode }}>
      {children}
    </Contexto.Provider>
  );
}

export const useAuth = () => useContext(Contexto);
