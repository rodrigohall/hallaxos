// Matriz de permissões (doc 05 §3) — escrita uma vez, usada pela API para
// autorizar e pela UI para esconder o que o papel não pode fazer.
import type { PapelUsuario } from "./enums";

export const RECURSOS = [
  "pessoas", "ativos", "operacoes", "manutencoes",
  "lancamentos", "contas", "categorias_financeiras",
  "dashboard_operacional", "dashboard_financeiro",
  "relatorios_operacionais", "relatorios_financeiros",
  "documentos", "comentarios", "tags", "agenda",
  "timeline", "busca", "usuarios", "overrides",
] as const;
export type Recurso = (typeof RECURSOS)[number];

export const ACOES = ["criar", "ler", "editar", "arquivar", "transicionar"] as const;
export type Acao = (typeof ACOES)[number];

type Permissoes = Record<Recurso, readonly Acao[]>;

const TUDO = ["criar", "ler", "editar", "arquivar", "transicionar"] as const;
const LER = ["ler"] as const;
const NADA = [] as const;

const MATRIZ: Record<PapelUsuario, Permissoes> = {
  admin: {
    pessoas: TUDO, ativos: TUDO, operacoes: TUDO, manutencoes: TUDO,
    lancamentos: TUDO, contas: TUDO, categorias_financeiras: TUDO,
    dashboard_operacional: LER, dashboard_financeiro: LER,
    relatorios_operacionais: LER, relatorios_financeiros: LER,
    documentos: TUDO, comentarios: TUDO, tags: TUDO, agenda: TUDO,
    timeline: LER, busca: LER, usuarios: TUDO, overrides: ["transicionar"],
  },
  gestor: {
    pessoas: TUDO, ativos: TUDO, operacoes: TUDO, manutencoes: TUDO,
    lancamentos: TUDO, contas: TUDO, categorias_financeiras: TUDO,
    dashboard_operacional: LER, dashboard_financeiro: LER,
    relatorios_operacionais: LER, relatorios_financeiros: LER,
    documentos: TUDO, comentarios: TUDO, tags: TUDO, agenda: TUDO,
    timeline: LER, busca: LER, usuarios: LER, overrides: NADA,
  },
  operador: {
    pessoas: ["criar", "ler", "editar"], ativos: ["ler", "editar"],
    operacoes: ["criar", "ler", "editar", "transicionar"],
    manutencoes: ["criar", "ler", "editar", "transicionar"],
    lancamentos: NADA, contas: NADA, categorias_financeiras: NADA,
    dashboard_operacional: LER, dashboard_financeiro: NADA,
    relatorios_operacionais: LER, relatorios_financeiros: NADA,
    documentos: TUDO, comentarios: TUDO, tags: TUDO, agenda: TUDO,
    timeline: LER, busca: LER, usuarios: NADA, overrides: NADA,
  },
  financeiro: {
    pessoas: LER, ativos: LER, operacoes: LER, manutencoes: LER,
    lancamentos: TUDO, contas: TUDO, categorias_financeiras: TUDO,
    dashboard_operacional: LER, dashboard_financeiro: LER,
    relatorios_operacionais: LER, relatorios_financeiros: LER,
    documentos: TUDO, comentarios: TUDO, tags: TUDO, agenda: LER,
    timeline: LER, busca: LER, usuarios: NADA, overrides: NADA,
  },
};

export function pode(papel: PapelUsuario, recurso: Recurso, acao: Acao): boolean {
  return MATRIZ[papel][recurso].includes(acao);
}

export function permissoesDe(papel: PapelUsuario): Permissoes {
  return MATRIZ[papel];
}
