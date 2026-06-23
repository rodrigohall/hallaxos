import { z } from "zod";
import { FORMAS_PAGAMENTO, STATUS_LANCAMENTO, TIPOS_LANCAMENTO } from "../enums";

export const lancamentoCriarSchema = z
  .object({
    tipo: z.enum(TIPOS_LANCAMENTO),
    descricao: z.string().trim().min(2, "Descreva o lançamento"),
    categoria_id: z.string().uuid("Escolha a categoria"),
    conta_id: z.string().uuid("Escolha a conta"),
    pessoa_id: z.string().uuid().nullish(),
    valor: z.coerce.number().positive("Valor deve ser maior que zero"),
    data_vencimento: z.string().date("Informe o vencimento"),
    // Data de pagamento (retroativo): quando `pago`, permite registrar a data real
    // do pagamento, diferente do vencimento. Omitida, usa o próprio vencimento.
    data_pagamento: z.string().date().nullish(),
    parcelas: z.coerce.number().int().min(1).max(60).default(1),
    pago: z.boolean().default(false),
    forma_pagamento: z.enum(FORMAS_PAGAMENTO).nullish(),
    // Interconexão (doc 02 §4): vincular um lançamento avulso a uma operação ou
    // manutenção existente (origem rastreável) e/ou a um ativo (classificação).
    // `operacao_id` e `manutencao_id` são origem — mutuamente exclusivos (espelha
    // o CHECK chk_lancamento_origem_unica). `ativo_id` coexiste (decisão #53).
    operacao_id: z.string().uuid().nullish(),
    manutencao_id: z.string().uuid().nullish(),
    ativo_id: z.string().uuid().nullish(),
  })
  .refine((v) => !(v.operacao_id && v.manutencao_id), {
    message: "Um lançamento tem no máximo uma origem: operação ou manutenção, não as duas.",
    path: ["manutencao_id"],
  });
export type LancamentoCriarInput = z.infer<typeof lancamentoCriarSchema>;

// Edição depois de lançado: valor/vencimento/conta/forma e — para um lançamento
// já pago — a data de pagamento, tudo com auditoria. Lançamento gerado por
// operação/manutenção também é editável aqui (o vínculo de origem é preservado);
// editar um pago é restrito ao admin (reescreve indicadores). Ver decisões.
export const lancamentoEditarSchema = z.object({
  descricao: z.string().trim().min(2).optional(),
  categoria_id: z.string().uuid().optional(),
  conta_id: z.string().uuid().optional(),
  pessoa_id: z.string().uuid().nullish(),
  valor: z.coerce.number().positive().optional(),
  data_vencimento: z.string().date().optional(),
  data_pagamento: z.string().date().optional(),
  forma_pagamento: z.enum(FORMAS_PAGAMENTO).nullish(),
  // Linkar lançamento avulso a um ativo (classificação, decisão #53).
  ativo_id: z.string().uuid().nullish(),
});
export type LancamentoEditarInput = z.infer<typeof lancamentoEditarSchema>;

export const lancamentoPagarSchema = z.object({
  data_pagamento: z.string().date(),
  conta_id: z.string().uuid().optional(),
  forma_pagamento: z.enum(FORMAS_PAGAMENTO),
});
export type LancamentoPagarInput = z.infer<typeof lancamentoPagarSchema>;

// Tipos de origem para drill-down do dashboard financeiro por origem.
export const TIPOS_ORIGEM_LANCAMENTO = ["guincho", "locacao", "venda", "compra", "manutencao", "avulso"] as const;
export type TipoOrigemLancamento = (typeof TIPOS_ORIGEM_LANCAMENTO)[number];

export const lancamentoFiltrosSchema = z.object({
  tipo: z.enum(TIPOS_LANCAMENTO).optional(),
  status: z.enum([...STATUS_LANCAMENTO, "vencido"] as const).optional(),
  categoria_id: z.string().uuid().optional(),
  conta_id: z.string().uuid().optional(),
  pessoa_id: z.string().uuid().optional(),
  busca: z.string().optional(),
  // Drill-down por origem/tipo — usado pelo Dashboard Financeiro.
  operacao_tipo: z.enum(TIPOS_ORIGEM_LANCAMENTO).optional(),
});

export const contaCriarSchema = z.object({
  nome: z.string().trim().min(2),
  saldo_inicial: z.coerce.number().default(0),
});
export const categoriaFinanceiraCriarSchema = z.object({
  nome: z.string().trim().min(2),
  tipo: z.enum(TIPOS_LANCAMENTO),
});
