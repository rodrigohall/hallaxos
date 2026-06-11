import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Entrada, Selo, Lista, ListaLinha, SkeletonLinhas, EstadoVazio,
} from "../componentes/ui";

export interface Pessoa {
  id: string;
  tipo: "pf" | "pj";
  nome: string;
  cpfCnpj: string;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  papeis: string[];
}

export function Pessoas() {
  const [busca, setBusca] = useState("");
  const { pode } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["pessoas", busca],
    queryFn: () =>
      api.get<{ dados: Pessoa[]; meta: { total: number } }>(
        `/pessoas?por_pagina=50${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Clientes</h1>
        {pode("pessoas", "criar") && (
          <Link to="/clientes/novo" className="ml-auto">
            <Botao tamanho="sm">
              <Plus className="h-3.5 w-3.5" /> Novo cadastro
            </Botao>
          </Link>
        )}
      </div>

      {/* Busca antes de cadastro (doc 03 regra 8) */}
      <Entrada
        placeholder="Buscar por nome, CPF/CNPJ ou telefone…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      <Card>
        {isLoading ? (
          <SkeletonLinhas linhas={5} />
        ) : !data || data.dados.length === 0 ? (
          <EstadoVazio
            icone={Users}
            titulo={busca ? `Nenhum cadastro para “${busca}”` : "Nenhum cliente ainda"}
            descricao="Confira a grafia ou crie um novo cadastro."
            acao={
              pode("pessoas", "criar") && (
                <Link to="/clientes/novo">
                  <Botao variante="secundario" tamanho="sm">
                    <Plus className="h-3.5 w-3.5" /> Criar cadastro
                  </Botao>
                </Link>
              )
            }
          />
        ) : (
          <>
            <Lista>
              {data.dados.map((p) => (
                <ListaLinha
                  key={p.id}
                  para={`/clientes/${p.id}`}
                  titulo={p.nome}
                  subtitulo={
                    `${p.tipo === "pj" ? "CNPJ" : "CPF"} ${p.cpfCnpj}` +
                    (p.telefone ? ` · ${p.telefone}` : "") +
                    (p.cidade ? ` · ${p.cidade}` : "")
                  }
                  direita={p.papeis.map((papel) => (
                    <Selo key={papel}>{papel}</Selo>
                  ))}
                />
              ))}
            </Lista>
            <p className="mt-3 text-xs text-mudo">{data.meta.total} cadastro(s)</p>
          </>
        )}
      </Card>
    </div>
  );
}
