import { z } from "zod";
import { TIPOS_OPERACAO, STATUS_OPERACAO, FORMAS_PAGAMENTO } from "../enums";

// ── Filtros de listagem ──
export const operacaoFiltrosSchema = z.object({
  tipo: z.enum(TIPOS_OPERACAO).optional(),
  status: z.enum(STATUS_OPERACAO).optional(),
  cliente_id: z.string().uuid().optional(),
  ativo_id: z.string().uuid().optional(),
  busca: z.string().optional(),
  // "abertas" = não terminais; "atrasadas" = locação ativa vencida (derivado)
  situacao: z.enum(["abertas", "atrasadas"]).optional(),
});

// ── Criação por tipo (núcleo + extensão) ──
const base = {
  cliente_id: z.string().uuid("Escolha o cliente"),
  observacoes: z.string().trim().optional(),
  // Data de início opcional (retroativo): registra a operação com a data real.
  data_inicio: z.string().date().nullish(),
};

export const guinchoCriarSchema = z.object({
  ...base,
  caminhao_id: z.string().uuid("Escolha o caminhão guincho").nullish(),
  motorista_id: z.string().uuid().nullish(),
  origem_endereco: z.string().trim().min(3, "Informe a origem"),
  destino_endereco: z.string().trim().min(3, "Informe o destino"),
  veiculo_cliente_descricao: z.string().trim().min(2, "Descreva o veículo do cliente"),
  veiculo_cliente_placa: z.string().trim().optional(),
  valor_total: z.coerce.number().nonnegative().default(0),
});
export type GuinchoCriarInput = z.infer<typeof guinchoCriarSchema>;

export const locacaoCriarSchema = z.object({
  ...base,
  ativo_id: z.string().uuid("Escolha o veículo"),
  condutor_id: z.string().uuid().nullish(),
  valor_diaria: z.coerce.number().positive("Informe o valor da diária"),
  caucao: z.coerce.number().nonnegative().default(0),
  data_devolucao_prevista: z.string().datetime({ offset: true }).or(z.string().date()),
});
export type LocacaoCriarInput = z.infer<typeof locacaoCriarSchema>;

export const vendaCriarSchema = z.object({
  ...base,
  ativo_id: z.string().uuid("Escolha o ativo à venda"),
  valor_total: z.coerce.number().positive("Informe o valor da venda"),
  km_no_ato: z.coerce.number().int().nonnegative().nullish(),
});
export type VendaCriarInput = z.infer<typeof vendaCriarSchema>;

export const compraCriarSchema = z.object({
  ...base,
  ativo_id: z.string().uuid("Escolha o ativo adquirido"),
  valor_total: z.coerce.number().positive("Informe o valor da compra"),
  km_no_ato: z.coerce.number().int().nonnegative().nullish(),
});
export type CompraCriarInput = z.infer<typeof compraCriarSchema>;

// ── Edição dos lançamentos antes de finalizar (doc 03 §1, regra 5) ──
// Na transição que gera financeiro (finalizada/concluido/fechada), o usuário
// pode revisar os lançamentos que serão criados antes de confirmar: conta,
// forma de pagamento e o vencimento de cada parcela. Não duplica dado nem cria
// tabela — apenas escolhe os valores que o sistema preencheria por padrão.
// Se omitido, mantém o comportamento atual (conta padrão, mensal a partir de hoje).
export const parcelaPrevistaSchema = z.object({
  data_vencimento: z.string().date("Informe o vencimento da parcela"),
  // Valor opcional por parcela; quando ausente, o total é rateado igualmente.
  valor: z.coerce.number().positive().optional(),
});
export type ParcelaPrevista = z.infer<typeof parcelaPrevistaSchema>;

export const financeiroTransicaoSchema = z.object({
  conta_id: z.string().uuid().optional(),
  forma_pagamento: z.enum(FORMAS_PAGAMENTO).nullish(),
  parcelas: z.array(parcelaPrevistaSchema).min(1).max(60),
});
export type FinanceiroTransicaoInput = z.infer<typeof financeiroTransicaoSchema>;

// ── Edição depois de lançada (doc 03 §1; decisão #49) ──
// Após o lançamento/finalização, corrige observações, DATAS (início/fim,
// retroativo) e campos descritivos por tipo — com auditoria na timeline. O valor
// financeiro NÃO se edita aqui: ajusta-se pelo lançamento vinculado (Financeiro),
// evitando recalcular indicadores por dois caminhos.
export const operacaoEditarSchema = z.object({
  observacoes: z.string().trim().nullish(),
  data_inicio: z.string().date().optional(),
  data_fim: z.string().date().nullish(),
  // Guincho (texto livre — local é um evento, doc 02 §3)
  origem_endereco: z.string().trim().min(3).optional(),
  destino_endereco: z.string().trim().min(3).optional(),
  veiculo_cliente_descricao: z.string().trim().min(2).optional(),
  veiculo_cliente_placa: z.string().trim().nullish(),
  motorista_id: z.string().uuid().nullish(),
  // Locação
  condutor_id: z.string().uuid().nullish(),
  data_devolucao_prevista: z.string().date().optional(),
  // Compra/Venda
  km_no_ato: z.coerce.number().int().nonnegative().nullish(),
});
export type OperacaoEditarInput = z.infer<typeof operacaoEditarSchema>;

// ── Transição de estado (campos opcionais conforme a transição) ──
export const transicaoSchema = z.object({
  status: z.enum(STATUS_OPERACAO),
  km: z.coerce.number().int().nonnegative().nullish(),
  data: z.string().datetime({ offset: true }).or(z.string().date()).nullish(),
  parcelas: z.coerce.number().int().min(1).max(60).default(1),
  // Edição dos lançamentos a gerar (opcional; tem precedência sobre `parcelas`).
  financeiro: financeiroTransicaoSchema.optional(),
  // Sobreposição de bloqueio (ex.: CNH vencida) — exige justificativa (admin)
  justificativa: z.string().trim().min(3).nullish(),
});
export type TransicaoInput = z.infer<typeof transicaoSchema>;
