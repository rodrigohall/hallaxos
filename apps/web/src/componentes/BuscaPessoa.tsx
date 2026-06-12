// Busca antes de cadastro (doc 03 regra 8): seleciona uma pessoa por nome,
// CPF/CNPJ ou telefone; se não existir, oferece o caminho de cadastro.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, UserPlus, X, Check } from "lucide-react";
import { api } from "../api";
import { Entrada } from "./ui";

export interface PessoaResumo {
  id: string;
  nome: string;
  nomeFantasia: string | null;
  cpfCnpj: string;
  telefone: string | null;
}

export function BuscaPessoa({
  rotulo,
  selecionada,
  aoSelecionar,
  papelSugerido = "cliente",
}: {
  rotulo: string;
  selecionada: PessoaResumo | null;
  aoSelecionar: (p: PessoaResumo | null) => void;
  papelSugerido?: string;
}) {
  const [termo, setTermo] = useState("");
  const ativo = termo.trim().length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ["busca-pessoa", termo],
    enabled: ativo && !selecionada,
    queryFn: () =>
      api
        .get<{ dados: PessoaResumo[] }>(`/pessoas?por_pagina=8&busca=${encodeURIComponent(termo.trim())}`)
        .then((r) => r.dados),
  });

  if (selecionada) {
    return (
      <div className="flex items-center justify-between rounded-md border border-ouro/30 bg-ouro/5 px-3 py-2">
        <span className="flex items-center gap-2 text-sm">
          <Check className="h-4 w-4 text-ouro" />
          <span className="font-medium">{selecionada.nome}</span>
          {selecionada.telefone && <span className="text-mudo">· {selecionada.telefone}</span>}
        </span>
        <button
          type="button"
          onClick={() => aoSelecionar(null)}
          className="rounded p-1 text-suave hover:text-erro"
          aria-label="Trocar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mudo" />
        <Entrada
          className="pl-9"
          placeholder={`Buscar ${rotulo} por nome, CPF/CNPJ ou telefone…`}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
        />
      </div>
      {ativo && (
        <div className="overflow-hidden rounded-md border border-borda bg-painel">
          {isFetching && <p className="px-3 py-2 text-xs text-mudo">Buscando…</p>}
          {!isFetching &&
            data?.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  aoSelecionar(p);
                  setTermo("");
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-elevado"
              >
                <span>
                  <span className="font-medium">{p.nome}</span>
                  {p.nomeFantasia && <span className="text-mudo"> · {p.nomeFantasia}</span>}
                </span>
                <span className="text-xs text-mudo">{p.telefone ?? p.cpfCnpj}</span>
              </button>
            ))}
          {!isFetching && data && data.length === 0 && (
            <div className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-mudo">Ninguém encontrado.</span>
              <Link
                to={`/clientes/novo?papel=${papelSugerido}`}
                className="flex items-center gap-1 text-ouro hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" /> Cadastrar
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
