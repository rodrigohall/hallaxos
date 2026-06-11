import { z } from "zod";
import { TIPOS_PESSOA } from "../enums";
import { cpfCnpjSchema, soDigitos } from "./comum";

const telefone = z.string().transform(soDigitos).pipe(z.string().min(10).max(13)).nullish();

export const pessoaCriarSchema = z.object({
  tipo: z.enum(TIPOS_PESSOA),
  nome: z.string().min(2, "Informe o nome"),
  nome_fantasia: z.string().nullish(),
  cpf_cnpj: cpfCnpjSchema,
  email: z.string().email("E-mail inválido").nullish().or(z.literal("").transform(() => null)),
  telefone,
  telefone_secundario: telefone,
  cep: z.string().transform(soDigitos).nullish(),
  logradouro: z.string().nullish(),
  numero: z.string().nullish(),
  complemento: z.string().nullish(),
  bairro: z.string().nullish(),
  cidade: z.string().nullish(),
  uf: z.string().length(2).toUpperCase().nullish(),
  cnh_numero: z.string().nullish(),
  cnh_categoria: z.string().nullish(),
  cnh_validade: z.coerce.date().nullish(),
  observacoes: z.string().nullish(),
});
export type PessoaCriarInput = z.infer<typeof pessoaCriarSchema>;

export const pessoaEditarSchema = pessoaCriarSchema.partial();
export type PessoaEditarInput = z.infer<typeof pessoaEditarSchema>;

export const pessoaFiltrosSchema = z.object({
  busca: z.string().optional(),
  papel: z.string().optional(),
  incluir_arquivados: z.coerce.boolean().default(false),
});
