// Primeiro arranque em produção: se o banco não tem nenhum usuário e
// ADMIN_EMAIL/ADMIN_SENHA estão definidos, cria o administrador inicial.
// Nunca roda de novo (idempotente por construção).
import { eq } from "drizzle-orm";
import { db } from "./client";
import { usuarios, categoriasFinanceiras } from "./schema";
import { novoId } from "../lib/ids";
import { hashSenha } from "../services/auth";
import { registrarEvento } from "../services/timeline";

const CATEGORIAS_PADRAO: { nome: string; tipo: "receita" | "despesa" }[] = [
  // Receitas operacionais
  { nome: "Locação", tipo: "receita" },
  { nome: "Guincho", tipo: "receita" },
  { nome: "Venda de Ativos", tipo: "receita" },
  // Despesas operacionais
  { nome: "Manutenção", tipo: "despesa" },
  { nome: "Combustível", tipo: "despesa" },
  { nome: "Administrativo", tipo: "despesa" },
  // Novas categorias práticas
  { nome: "Conta Fixa", tipo: "despesa" },
  { nome: "Compras Gerais", tipo: "despesa" },
  { nome: "Abastecimento", tipo: "despesa" },
  { nome: "Lavagem", tipo: "despesa" },
  { nome: "Taxas Detran", tipo: "despesa" },
  { nome: "IPTU", tipo: "despesa" },
  { nome: "Seguro", tipo: "despesa" },
  { nome: "Multas", tipo: "despesa" },
  { nome: "Peças e Acessórios", tipo: "despesa" },
  { nome: "Salários", tipo: "despesa" },
  { nome: "Honorários", tipo: "despesa" },
];

/** Garante que todas as categorias padrão existem. Idempotente. */
export async function garantirCategoriasPadrao(): Promise<void> {
  const existentes = await db
    .select({ nome: categoriasFinanceiras.nome })
    .from(categoriasFinanceiras);
  const nomes = new Set(existentes.map((c) => c.nome));

  const faltando = CATEGORIAS_PADRAO.filter((c) => !nomes.has(c.nome));
  if (faltando.length === 0) return;

  await db.insert(categoriasFinanceiras).values(
    faltando.map((c) => ({ id: novoId(), nome: c.nome, tipo: c.tipo }))
  );
  console.log(`Categorias financeiras criadas: ${faltando.map((c) => c.nome).join(", ")}`);
}

export async function garantirAdminInicial(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_SENHA;
  if (!email || !senha) return;

  const existentes = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
  if (existentes.length > 0) return;

  const id = novoId();
  await db.transaction(async (tx) => {
    await tx.insert(usuarios).values({
      id,
      nome: "Administrador",
      email: email.toLowerCase().trim(),
      senhaHash: await hashSenha(senha),
      papel: "admin",
    });
    await registrarEvento(tx, {
      entidadeTipo: "usuario",
      entidadeId: id,
      evento: "criado",
      descricao: "Administrador inicial criado no primeiro arranque",
      usuarioId: id,
    });
  });
  console.log(`Administrador inicial criado: ${email}`);
}
