import { z } from "zod";
import { FORMAS_PAGAMENTO, STATUS_LANCAMENTO, TIPOS_LANCAMENTO } from "../enums";

export const lancamentoCriarSchema = z.object({
  tipo: z.enum(TIPOS_LANCAMENTO),
  descricao: z.string().trim().min(2, "Descreva o lançamento"),
  categoria_id: z.string().uuid("Escolha a categoria"),
  conta_id: z.string().uuid("Escolha a conta"),
  pessoa_id: z.string().uuid().nullish(),
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  data_vencimento: z.string().date("Informe o vencimento"),
  parcelas: z.coerce.number().int().min(1).max(60).default(1),
  pago: z.boolean().default(false),
  forma_pagamento: z.enum(FORMAS_PAGAMENTO).nullish(),
});
export type LancamentoCriarInput = z.infer<typeof lancamentoCriarSchema>;

export const lancamentoEditarSchema = z.object({
  descricao: z.string().trim().min(2).optional(),
  categoria_id: z.string().uuid().optional(),
  conta_id: z.string().uuid().optional(),
  pessoa_id: z.string().uuid().nullish(),
  valor: z.coerce.number().positive().optional(),
  data_vencimento: z.string().date().optional(),
});
export type LancamentoEditarInput = z.infer<typeof lancamentoEditarSchema>;

export const lancamentoPagarSchema = z.object({
  data_pagamento: z.string().date(),
  conta_id: z.string().uuid().optional(),
  forma_pagamento: z.enum(FORMAS_PAGAMENTO),
});
export type LancamentoPagarInput = z.infer<typeof lancamentoPagarSchema>;

export const lancamentoFiltrosSchema = z.object({
  tipo: z.enum(TIPOS_LANCAMENTO).optional(),
  status: z.enum([...STATUS_LANCAMENTO, "vencido"] as const).optional(),
  categoria_id: z.string().uuid().optional(),
  conta_id: z.string().uuid().optional(),
  pessoa_id: z.string().uuid().optional(),
  busca: z.string().optional(),
});

export const contaCriarSchema = z.object({
  nome: z.string().trim().min(2),
  saldo_inicial: z.coerce.number().default(0),
});
export const categoriaFinanceiraCriarSchema = z.object({
  nome: z.string().trim().min(2),
  tipo: z.enum(TIPOS_LANCAMENTO),
});
