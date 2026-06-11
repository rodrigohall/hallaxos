import { z } from "zod";

export const paginacaoSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(100).default(25),
});

export const idSchema = z.string().uuid();

/** Normaliza para só dígitos (CPF, CNPJ, telefone). */
export const soDigitos = (v: string) => v.replace(/\D/g, "");

export const cpfCnpjSchema = z
  .string()
  .transform(soDigitos)
  .refine((v) => v.length === 11 || v.length === 14, {
    message: "CPF deve ter 11 dígitos ou CNPJ 14 dígitos",
  });
