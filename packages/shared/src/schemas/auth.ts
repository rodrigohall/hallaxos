import { z } from "zod";
import { PAPEIS_USUARIO } from "../enums";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(1, "Informe a senha"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const trocarSenhaSchema = z.object({
  senha_atual: z.string().min(1, "Informe a senha atual"),
  senha_nova: z.string().min(8, "A nova senha deve ter no mínimo 8 caracteres"),
});
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;

export const usuarioCriarSchema = z.object({
  nome: z.string().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  papel: z.enum(PAPEIS_USUARIO),
});
export type UsuarioCriarInput = z.infer<typeof usuarioCriarSchema>;

export const usuarioEditarSchema = usuarioCriarSchema.partial().omit({ senha: true }).extend({
  senha: z.string().min(8).optional(),
});
export type UsuarioEditarInput = z.infer<typeof usuarioEditarSchema>;
