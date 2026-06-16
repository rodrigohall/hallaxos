import { z } from "zod";
import { TIPOS_MANUTENCAO, STATUS_MANUTENCAO } from "../enums";

export const manutencaoCriarSchema = z.object({
  ativo_id: z.string().uuid("Escolha o ativo"),
  tipo: z.enum(TIPOS_MANUTENCAO),
  descricao: z.string().trim().min(3, "Descreva a manutenção"),
  fornecedor_id: z.string().uuid().nullish(),
  data_agendada: z.string().date().nullish(),
  observacoes: z.string().trim().nullish(),
});
export type ManutencaoCriarInput = z.infer<typeof manutencaoCriarSchema>;

// Edição depois de lançada (qualquer status, exceto cancelada): corrige dados e
// datas (incl. retroativo: início/conclusão), com auditoria na timeline.
export const manutencaoEditarSchema = z.object({
  tipo: z.enum(TIPOS_MANUTENCAO).optional(),
  descricao: z.string().trim().min(3).optional(),
  fornecedor_id: z.string().uuid().nullish(),
  data_agendada: z.string().date().nullish(),
  data_inicio: z.string().date().nullish(),
  data_conclusao: z.string().date().nullish(),
  km_no_momento: z.coerce.number().int().min(0).nullish(),
  observacoes: z.string().trim().nullish(),
});
export type ManutencaoEditarInput = z.infer<typeof manutencaoEditarSchema>;

/** Início: data opcional (retroativo); default = agora. */
export const manutencaoIniciarSchema = z.object({
  data_inicio: z.string().date().nullish(),
});
export type ManutencaoIniciarInput = z.infer<typeof manutencaoIniciarSchema>;

/** Conclusão: registra km e gera (opcionalmente) o custo como despesa. */
export const manutencaoConcluirSchema = z.object({
  km_no_momento: z.coerce.number().int().min(0).nullish(),
  custo: z.coerce.number().min(0).nullish(),
  parcelas: z.coerce.number().int().min(1).max(60).default(1),
  data_conclusao: z.string().date().nullish(),
  observacoes: z.string().trim().nullish(),
});
export type ManutencaoConcluirInput = z.infer<typeof manutencaoConcluirSchema>;

export const manutencaoFiltrosSchema = z.object({
  status: z.enum(STATUS_MANUTENCAO).optional(),
  tipo: z.enum(TIPOS_MANUTENCAO).optional(),
  ativo_id: z.string().uuid().optional(),
  busca: z.string().optional(),
});
