// Hub financeiro — a ÚNICA porta de entrada do dinheiro.
//
// Antes eram três destinos de topo (Financeiro, Dashboard $, Relatórios) para
// "ver o mesmo dinheiro de ângulos diferentes", e o usuário precisava lembrar
// qual ângulo morava em qual item de menu. Agora são cinco abas de um endereço
// só, com a aba na URL.
//
// ── Contrato de query params ────────────────────────────────────────────────
// A aba `lancamentos` mantém os nomes LEGADOS e sem prefixo (`status`, `tipo`,
// `ativo_id`, `lancamento`, `novo`, `operacao_id`): são contrato público, usados
// pelos deep-links das fichas de ativo, de operação e dos KPIs do dashboard.
// As demais abas usam prefixo próprio (`p_` painel, `pl_` planilha, `dre_`)
// porque `status`, `tipo` e `ano` significam coisas diferentes em cada uma.
// Ao trocar de aba, só sobrevivem os params da aba de destino.
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, TrendingUp, TableProperties, CarFront, BarChart3, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { Abas, EstadoVazio, Selo } from "../../componentes/ui";
import { useAbaUrl } from "../../hooks/estadoUrl";
import { PainelLancamentos } from "./PainelLancamentos";
import { PainelVisaoGeral } from "./PainelVisaoGeral";
import { PainelPlanilha } from "./PainelPlanilha";
import { PainelPorAtivo } from "./PainelPorAtivo";
import { PainelDre } from "./PainelDre";
import { PainelProLabore } from "./PainelProLabore";

export type AbaFinanceiro =
  | "lancamentos" | "painel" | "planilha" | "por-ativo" | "dre" | "pro-labore";

interface DefinicaoAba {
  id: AbaFinanceiro;
  rotulo: string;
  icone: LucideIcon;
  /** Permissão exigida para a aba aparecer (e para o painel renderizar). */
  permissao: [recurso: string, acao: string];
  /** Prefixo dos params que pertencem a esta aba. */
  prefixo: string;
}

const ABAS: DefinicaoAba[] = [
  { id: "lancamentos", rotulo: "Lançamentos", icone: CircleDollarSign, permissao: ["lancamentos", "ler"], prefixo: "" },
  { id: "painel",      rotulo: "Painel",      icone: TrendingUp,       permissao: ["dashboard_financeiro", "ler"], prefixo: "p_" },
  { id: "planilha",    rotulo: "Planilha",    icone: TableProperties,  permissao: ["relatorios_financeiros", "ler"], prefixo: "pl_" },
  { id: "por-ativo",   rotulo: "Por Ativo",   icone: CarFront,         permissao: ["relatorios_financeiros", "ler"], prefixo: "" },
  { id: "dre",         rotulo: "DRE",         icone: BarChart3,        permissao: ["relatorios_financeiros", "ler"], prefixo: "dre_" },
  { id: "pro-labore",  rotulo: "Pró-labore",  icone: Wallet,           permissao: ["pro_labore", "ler"], prefixo: "pro_" },
];

/** Params legados da aba de Lançamentos — contrato público dos deep-links. */
const PARAMS_LANCAMENTOS = new Set([
  "status", "tipo", "ativo_id", "lancamento", "novo", "operacao_id",
]);

function pertenceA(chave: string, aba: AbaFinanceiro): boolean {
  if (aba === "lancamentos") return PARAMS_LANCAMENTOS.has(chave);
  const def = ABAS.find((a) => a.id === aba);
  return !!def?.prefixo && chave.startsWith(def.prefixo);
}

export function HubFinanceiro() {
  const { pode } = useAuth();

  const visiveis = ABAS.filter((a) => pode(a.permissao[0], a.permissao[1]));
  const ids = visiveis.map((a) => a.id);
  const padrao = ids[0] ?? "lancamentos";

  const [aba, trocarAba] = useAbaUrl<AbaFinanceiro>(ids, padrao, {
    // Sair de uma aba descarta os filtros dela; a URL só carrega o que a aba
    // de destino sabe ler.
    manter: (chave, destino) => pertenceA(chave, destino),
  });

  // Contador de vencidos na aba de Lançamentos: o número que mais importa não
  // deve exigir entrar na aba para ser visto.
  const { data: vencidos } = useQuery({
    queryKey: ["lancamentos", "vencidos", "contador"],
    queryFn: () =>
      api
        .get<{ meta: { total: number } }>("/lancamentos?status=vencido&por_pagina=1")
        .then((r) => r.meta.total),
    enabled: pode("lancamentos", "ler"),
  });

  if (visiveis.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-lg font-bold">Financeiro</h1>
        <EstadoVazio titulo="Sem permissão" descricao="Seu perfil não tem acesso à área financeira." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="font-display text-lg font-bold">Financeiro</h1>
        <Abas
          abas={visiveis.map((a) => ({
            id: a.id,
            rotulo: a.rotulo,
            icone: a.icone,
            selo:
              a.id === "lancamentos" && vencidos
                ? <Selo tom="erro">{vencidos}</Selo>
                : undefined,
          }))}
          ativa={aba}
          aoTrocar={(id) => trocarAba(id as AbaFinanceiro)}
        />
      </div>

      {/* Só o painel ativo é montado: preserva o padrão de carga sob demanda de
          cada tela e evita que o drill de uma aba refaça fetch por causa da outra. */}
      {aba === "lancamentos" && <PainelLancamentos />}
      {aba === "painel" && <PainelVisaoGeral />}
      {aba === "planilha" && <PainelPlanilha />}
      {aba === "por-ativo" && <PainelPorAtivo />}
      {aba === "dre" && <PainelDre />}
      {aba === "pro-labore" && <PainelProLabore />}
    </div>
  );
}
