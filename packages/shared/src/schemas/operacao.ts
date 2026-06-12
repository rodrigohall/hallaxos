import { z } from "zod";
import { TIPOS_OPERACAO, STATUS_OPERACAO } from "../enums";

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

// ── Transição de estado (campos opcionais conforme a transição) ──
export const transicaoSchema = z.object({
  status: z.enum(STATUS_OPERACAO),
  km: z.coerce.number().int().nonnegative().nullish(),
  data: z.string().datetime({ offset: true }).or(z.string().date()).nullish(),
  parcelas: z.coerce.number().int().min(1).max(60).default(1),
  // Sobreposição de bloqueio (ex.: CNH vencida) — exige justificativa (admin)
  justificativa: z.string().trim().min(3).nullish(),
});
export type TransicaoInput = z.infer<typeof transicaoSchema>;
