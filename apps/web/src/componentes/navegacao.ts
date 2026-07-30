// A navegação do sistema, declarada uma vez.
//
// Antes esta lista vivia dentro do Layout, recriada a cada render, com a
// permissão escrita como spread condicional item a item. Agora é dado: as três
// superfícies (sidebar, menu mobile e barra inferior) leem daqui, e os atalhos
// de teclado saem do mesmo lugar — não há como um item existir num menu e
// faltar no outro.
import {
  LayoutDashboard, Users, CarFront, Workflow, Wrench, CalendarDays,
  CircleDollarSign, ShieldCheck, ClipboardList, type LucideIcon,
} from "lucide-react";

export interface ItemNav {
  para: string;
  rotulo: string;
  icone: LucideIcon;
  /** NavLink com `end` — só o path exato fica ativo (usado pelo Dashboard). */
  fim?: boolean;
  /** Rótulo curto para a barra inferior do mobile. */
  rotuloBottom?: string;
  /** Permissão exigida; sem ela o item não aparece em nenhuma superfície. */
  permissao?: [recurso: string, acao: string];
  /** Aparece na barra inferior do mobile (máx. 4). */
  primario?: boolean;
  /** Tecla do atalho `g` + letra. */
  atalho?: string;
}

export interface SecaoNav {
  secao: string;
  itens: ItemNav[];
}

export const SECOES_NAV: SecaoNav[] = [
  {
    secao: "Operação",
    itens: [
      { para: "/", rotulo: "Dashboard", icone: LayoutDashboard, fim: true, rotuloBottom: "Início", primario: true, atalho: "d" },
      { para: "/ativos", rotulo: "Ativos", icone: CarFront, primario: true, atalho: "a" },
      { para: "/operacoes", rotulo: "Operações", icone: Workflow, rotuloBottom: "Ops", permissao: ["operacoes", "ler"], primario: true, atalho: "o" },
      { para: "/manutencoes", rotulo: "Manutenções", icone: Wrench, rotuloBottom: "Manutenção", permissao: ["manutencoes", "ler"], atalho: "m" },
      { para: "/agenda", rotulo: "Agenda", icone: CalendarDays, permissao: ["agenda", "ler"], atalho: "g" },
      { para: "/clientes", rotulo: "Clientes", icone: Users, atalho: "c" },
    ],
  },
  {
    // Dashboard $ e Relatórios foram absorvidos pelo hub (Sprint 16 · Frente 1):
    // um destino só para dinheiro, com abas internas.
    secao: "Financeiro",
    itens: [
      { para: "/financeiro", rotulo: "Financeiro", icone: CircleDollarSign, rotuloBottom: "R$", permissao: ["lancamentos", "ler"], primario: true, atalho: "f" },
    ],
  },
  {
    secao: "Sistema",
    itens: [
      { para: "/usuarios", rotulo: "Usuários", icone: ShieldCheck, permissao: ["usuarios", "ler"], atalho: "u" },
      { para: "/auditoria", rotulo: "Auditoria", icone: ClipboardList, permissao: ["usuarios", "ler"] },
    ],
  },
];

type Pode = (recurso: string, acao: string) => boolean;

/** Seções com os itens que o papel enxerga; seção que esvazia não é devolvida. */
export function secoesVisiveis(pode: Pode): SecaoNav[] {
  return SECOES_NAV.map((s) => ({
    ...s,
    itens: s.itens.filter((i) => !i.permissao || pode(i.permissao[0], i.permissao[1])),
  })).filter((s) => s.itens.length > 0);
}

/** Lista plana do que o papel enxerga — usada por atalhos e barra inferior. */
export function itensVisiveis(pode: Pode): ItemNav[] {
  return secoesVisiveis(pode).flatMap((s) => s.itens);
}
