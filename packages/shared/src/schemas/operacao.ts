import { z } from "zod";
import { STATUS_OPERACAO } from "../enums";

const placaClienteSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .pipe(z.string().min(7).max(7))
  .nullish();

/** Criação de guincho: começa em `solicitado`. O caminhão é o ativo recurso. */
export const guinchoCriarSchema = z.object({
  cliente_id: z.string().uuid("Escolha o cliente"),
  recurso_ativo_id: z.string().uuid("Escolha o caminhão guincho"),
  motorista_id: z.string().uuid().nullish(),
  origem_endereco: z.string().trim().min(3, "Informe o endereço de origem"),
  destino_endereco: z.string().trim().min(3, "Informe o endereço de destino"),
  veiculo_cliente_descricao: z.string().trim().min(2, "Descreva o veículo do cliente"),
  veiculo_cliente_placa: placaClienteSchema,
  valor_total: z.coerce.number().min(0, "Valor inválido").default(0),
  desconto: z.coerce.number().min(0).default(0),
  data_acionamento: z.coerce.date().nullish(),
  observacoes: z.string().trim().nullish(),
});
export type GuinchoCriarInput = z.infer<typeof guinchoCriarSchema>;

/** Conclusão: registra km percorrido e gera a receita do serviço. */
export const guinchoConcluirSchema = z.object({
  km_percorrido: z.coerce.number().int().min(0).nullish(),
  observacoes: z.string().trim().nullish(),
});
export type GuinchoConcluirInput = z.infer<typeof guinchoConcluirSchema>;

export const operacaoCancelarSchema = z.object({
  motivo: z.string().trim().min(3, "Informe o motivo do cancelamento"),
});

export const operacaoFiltrosSchema = z.object({
  status: z.enum(STATUS_OPERACAO).optional(),
  busca: z.string().optional(),
});
