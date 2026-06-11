import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Card, Entrada, Selo } from "../componentes/ui";

export interface Pessoa {
  id: string;
  tipo: "pf" | "pj";
  nome: string;
  nome_fantasia?: string | null;
  nomeFantasia?: string | null;
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
      api
        .get<{ dados: Pessoa[]; meta: { total: number } }>(
          `/pessoas?por_pagina=50${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`
        )
        .then((r) => r),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">Clientes</h1>
        {pode("pessoas", "criar") && (
          <Link to="/clientes/novo" className="ml-auto">
            <Botao>+ Novo cadastro</Botao>
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
        {isLoading && <p className="text-sm text-suave">Buscando…</p>}
        {data && data.dados.length === 0 && (
          <p className="text-sm text-suave">
            Nenhum cadastro encontrado.{" "}
            {pode("pessoas", "criar") && (
              <Link to="/clientes/novo" className="text-marca-forte underline">
                Criar agora
              </Link>
            )}
          </p>
        )}
        <ul className="divide-y divide-borda">
          {data?.dados.map((p) => (
            <li key={p.id}>
              <Link to={`/clientes/${p.id}`} className="flex items-center gap-3 py-3 hover:bg-borda/20">
                <div className="flex-1">
                  <p className="text-sm font-medium">{p.nome}</p>
                  <p className="text-xs text-suave">
                    {p.tipo === "pj" ? "CNPJ" : "CPF"} {p.cpfCnpj}
                    {p.telefone ? ` · ${p.telefone}` : ""}
                    {p.cidade ? ` · ${p.cidade}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  {p.papeis.map((papel) => (
                    <Selo key={papel}>{papel}</Selo>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {data && <p className="mt-2 text-xs text-suave">{data.meta.total} cadastro(s)</p>}
      </Card>
    </div>
  );
}
