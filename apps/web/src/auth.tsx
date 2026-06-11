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
  carregando: boolean;
  entrar(email: string, senha: string): Promise<void>;
  sair(): Promise<void>;
  pode(recurso: string, acao: string): boolean;
}

const Contexto = createContext<Sessao>(null as never);

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [permissoes, setPermissoes] = useState<Permissoes>({});
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .get<{ dados: { usuario: Usuario; permissoes: Permissoes } }>("/auth/sessao")
      .then(({ dados }) => {
        setUsuario(dados.usuario);
        setPermissoes(dados.permissoes);
      })
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
  }, []);

  const entrar = async (email: string, senha: string) => {
    const { dados } = await api.post<{ dados: { usuario: Usuario; permissoes: Permissoes } }>(
      "/auth/login",
      { email, senha }
    );
    setUsuario(dados.usuario);
    setPermissoes(dados.permissoes);
  };

  const sair = async () => {
    await api.post("/auth/logout").catch(() => {});
    setUsuario(null);
    setPermissoes({});
  };

  const pode = (recurso: string, acao: string) => permissoes[recurso]?.includes(acao) ?? false;

  return (
    <Contexto.Provider value={{ usuario, permissoes, carregando, entrar, sair, pode }}>
      {children}
    </Contexto.Provider>
  );
}

export const useAuth = () => useContext(Contexto);
