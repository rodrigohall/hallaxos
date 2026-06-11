import { z } from "zod";
import { COMBUSTIVEIS, STATUS_ATIVO } from "../enums";

const placaSchema = z
  .string()
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .pipe(z.string().min(7).max(7));

export const ativoVeiculoSchema = z.object({
  placa: placaSchema,
  renavam: z.string().nullish(),
  chassi: z.string().nullish(),
  marca: z.string().min(1, "Informe a marca"),
  modelo: z.string().min(1, "Informe o modelo"),
  ano_fabricacao: z.coerce.number().int().min(1950).max(2100).nullish(),
  ano_modelo: z.coerce.number().int().min(1950).max(2100).nullish(),
  cor: z.string().nullish(),
  combustivel: z.enum(COMBUSTIVEIS).nullish(),
  km_atual: z.coerce.number().int().min(0).default(0),
});

export const ativoCriarSchema = z.object({
  nome: z.string().min(2, "Informe o nome do ativo"),
  categoria_id: z.string().uuid("Escolha a categoria"),
  valor_aquisicao: z.coerce.number().min(0).nullish(),
  valor_fipe: z.coerce.number().min(0).nullish(),
  data_aquisicao: z.coerce.date().nullish(),
  localizacao: z.string().nullish(),
  observacoes: z.string().nullish(),
  veiculo: ativoVeiculoSchema.nullish(),
});
export type AtivoCriarInput = z.infer<typeof ativoCriarSchema>;

export const ativoEditarSchema = ativoCriarSchema
  .omit({ veiculo: true })
  .partial()
  .extend({
    status: z.enum(STATUS_ATIVO).optional(),
    veiculo: ativoVeiculoSchema.partial().nullish(),
  });
export type AtivoEditarInput = z.infer<typeof ativoEditarSchema>;

export const ativoFiltrosSchema = z.object({
  busca: z.string().optional(),
  status: z.enum(STATUS_ATIVO).optional(),
  categoria_id: z.string().uuid().optional(),
  incluir_arquivados: z.coerce.boolean().default(false),
});

export const comentarioCriarSchema = z.object({
  texto: z.string().trim().min(1, "Escreva o comentário"),
});
export type ComentarioCriarInput = z.infer<typeof comentarioCriarSchema>;
