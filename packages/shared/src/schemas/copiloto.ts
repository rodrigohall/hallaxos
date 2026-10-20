import { z } from "zod";
import { FORMAS_PAGAMENTO } from "../enums";
import { pessoaCriarSchema } from "./pessoa";
import { cpfCnpjSchema } from "./comum";
import { ativoVeiculoSchema } from "./ativo";

// Registro pelo copiloto (Sprint 17): "hoje fizemos um guincho de 400 do local X
// pro Y, carro tal, cliente fulano — lança aí". O copiloto monta um destes, o
// humano confirma com um toque e a API executa tudo numa transação só, pelos
// services de sempre (decisão #79). O MESMO schema valida a proposta (o que
// faltar volta ao modelo para ele perguntar) e a confirmação (a API nunca
// confia no que o navegador devolve).

const data = (msg: string) => z.string({ required_error: msg }).date(msg);
const uuid = (msg: string) => z.string({ required_error: msg }).uuid(msg);
const valor = (msg: string) => z.coerce.number({ required_error: msg, invalid_type_error: msg }).positive(msg);

/** Pessoa do registro: um cadastro que já existe ou os dados mínimos de um novo. */
export const pessoaRegistroSchema = z
  .object(
    {
      id: z.string().uuid("Id de cliente inválido — procure o cadastro com busca_global").optional(),
      novo: pessoaCriarSchema
        .pick({ tipo: true, nome: true, cpf_cnpj: true })
        .extend({
          tipo: pessoaCriarSchema.shape.tipo.default("pf"),
          // As regras são as do cadastro; só a falta ganha pergunta própria.
          nome: z.string({ required_error: "Informe o nome do cliente novo" }).pipe(pessoaCriarSchema.shape.nome),
          cpf_cnpj: z.string({ required_error: "Informe o CPF ou CNPJ do cliente novo" }).pipe(cpfCnpjSchema),
          telefone: z
            .string()
            .transform((v) => v.replace(/\D/g, ""))
            .pipe(z.string().min(10, "Telefone precisa de DDD + número").max(13, "Telefone longo demais"))
            .optional(),
        })
        .optional(),
    },
    { required_error: "Informe o cliente: um cadastro existente ou nome + CPF/CNPJ de um novo" }
  )
  .refine((p) => !!p.id !== !!p.novo, {
    message: "Informe o cliente: um cadastro existente ou nome + CPF/CNPJ de um novo",
  });

/** Pago (conta + forma) ou pendente (vencimento). Parcelado só nasce pendente. */
export const pagamentoRegistroSchema = z.discriminatedUnion(
  "situacao",
  [
    z.object({
      situacao: z.literal("pago"),
      conta_id: uuid("Informe a conta em que o dinheiro entrou ou saiu"),
      forma_pagamento: z.enum(FORMAS_PAGAMENTO, {
        errorMap: () => ({ message: "Informe a forma de pagamento (pix, dinheiro, cartão…)" }),
      }),
      data_pagamento: z.string().date().optional(),
    }),
    z.object({
      situacao: z.literal("pendente"),
      conta_id: z.string().uuid().optional(),
      data_vencimento: data("Informe o vencimento"),
      parcelas: z.coerce.number().int().min(1).max(60).default(1),
    }),
  ],
  { errorMap: () => ({ message: "Informe se já foi pago ou se fica a receber/pagar" }) }
);
export type PagamentoRegistro = z.infer<typeof pagamentoRegistroSchema>;

const comum = {
  /** Quando aconteceu (YYYY-MM-DD). Ausente = hoje. */
  data: z.string().date().optional(),
  observacoes: z.string().trim().max(2000).optional(),
};

export const registroGuinchoSchema = z.object({
  tipo: z.literal("guincho"),
  ...comum,
  cliente: pessoaRegistroSchema,
  origem_endereco: z.string({ required_error: "Informe a origem" }).trim().min(3, "Informe a origem"),
  destino_endereco: z.string({ required_error: "Informe o destino" }).trim().min(3, "Informe o destino"),
  veiculo_cliente_descricao: z
    .string({ required_error: "Informe o veículo transportado" })
    .trim()
    .min(2, "Informe o veículo transportado"),
  veiculo_cliente_placa: z.string().trim().optional(),
  caminhao_id: z.string().uuid("Id de caminhão inválido — procure com busca_global").optional(),
  motorista_id: z.string().uuid("Id de motorista inválido — procure com busca_global").optional(),
  valor: valor("Informe o valor do guincho"),
  pagamento: pagamentoRegistroSchema,
});

export const registroLocacaoSchema = z
  .object({
    tipo: z.literal("locacao"),
    ...comum,
    cliente: pessoaRegistroSchema,
    ativo_id: uuid("Informe o veículo alugado"),
    valor_diaria: valor("Informe o valor da diária"),
    data_retirada: data("Informe a data de retirada"),
    /** Devolução prevista (reservada/ativa) ou real (finalizada). */
    data_devolucao: data("Informe a data de devolução"),
    /** reservada = ainda não saiu; ativa = está com o cliente; finalizada = já voltou. */
    situacao: z.enum(["reservada", "ativa", "finalizada"], {
      errorMap: () => ({ message: "Informe se a locação está reservada, em andamento ou já finalizada" }),
    }),
    /** Só na finalizada, que é quando a locação gera a receita. */
    pagamento: pagamentoRegistroSchema.optional(),
  })
  .refine((l) => l.data_devolucao >= l.data_retirada, {
    message: "A devolução não pode ser antes da retirada",
    path: ["data_devolucao"],
  })
  .refine((l) => l.situacao !== "finalizada" || !!l.pagamento, {
    message: "Informe se a locação já foi paga ou se fica a receber",
    path: ["pagamento"],
  });

export const registroVendaSchema = z.object({
  tipo: z.literal("venda"),
  ...comum,
  cliente: pessoaRegistroSchema,
  ativo_id: uuid("Informe o ativo vendido"),
  valor: valor("Informe o valor da venda"),
  /** Documentação já transferida → a venda já sai concluída (ativo vendido). */
  transferido: z.boolean().default(false),
  pagamento: pagamentoRegistroSchema,
});

/** Ativo da compra: um que já existe ou o cadastro mínimo de um novo. */
export const ativoRegistroSchema = z
  .object({
    id: z.string().uuid("Id de ativo inválido — procure com busca_global").optional(),
    novo: z
      .object({
        nome: z.string({ required_error: "Informe o nome do ativo comprado" }).trim().min(2, "Informe o nome do ativo comprado"),
        categoria_id: uuid("Informe a categoria do ativo comprado"),
        veiculo: ativoVeiculoSchema
          .pick({ placa: true, marca: true, modelo: true, ano_fabricacao: true, ano_modelo: true, cor: true, km_atual: true })
          .optional(),
      })
      .optional(),
  }, { required_error: "Informe o ativo comprado: um já cadastrado ou nome, categoria e dados do novo" })
  .refine((a) => !!a.id !== !!a.novo, { message: "Informe o ativo: um já cadastrado ou os dados de um novo" });

export const registroCompraSchema = z.object({
  tipo: z.literal("compra"),
  ...comum,
  /** Quem vendeu para a Hallax. */
  cliente: pessoaRegistroSchema,
  ativo: ativoRegistroSchema,
  valor: valor("Informe o valor da compra"),
  transferido: z.boolean().default(false),
  pagamento: pagamentoRegistroSchema,
});

export const registroLancamentoSchema = z.object({
  tipo: z.literal("lancamento"),
  ...comum,
  natureza: z.enum(["receita", "despesa"], {
    errorMap: () => ({ message: "Informe se é uma receita ou uma despesa" }),
  }),
  descricao: z.string({ required_error: "Descreva o lançamento" }).trim().min(2, "Descreva o lançamento"),
  valor: valor("Informe o valor"),
  categoria_id: uuid("Informe a categoria"),
  pessoa_id: z.string().uuid("Id de pessoa inválido — procure com busca_global").optional(),
  ativo_id: z.string().uuid("Id de ativo inválido — procure com busca_global").optional(),
  pagamento: pagamentoRegistroSchema,
});

export const registroCopilotoSchema = z.discriminatedUnion("tipo", [
  registroGuinchoSchema,
  // .refine() embrulha o objeto em ZodEffects, que o discriminatedUnion não
  // aceita — a locação entra pelo objeto cru e o refine roda em conferirRegistro.
  registroLocacaoSchema.innerType().innerType(),
  registroVendaSchema,
  registroCompraSchema,
  registroLancamentoSchema,
], { errorMap: () => ({ message: "Informe o tipo: guincho, locação, venda, compra ou lançamento" }) });
export type RegistroCopiloto = z.infer<typeof registroCopilotoSchema>;
export type TipoRegistro = RegistroCopiloto["tipo"];

/** Validação completa, com as regras entre campos da locação. */
export const registroCopilotoCompletoSchema = registroCopilotoSchema.superRefine((r, ctx) => {
  if (r.tipo !== "locacao") return;
  const v = registroLocacaoSchema.safeParse(r);
  if (!v.success) for (const issue of v.error.issues) ctx.addIssue(issue);
});

/** Confirmação: o registro + a chave que impede o duplo toque de lançar duas vezes. */
export const confirmarRegistroSchema = z.object({
  chave: z.string().uuid(),
  registro: registroCopilotoCompletoSchema,
});
