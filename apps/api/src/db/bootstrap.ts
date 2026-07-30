// Primeiro arranque em produção: se o banco não tem nenhum usuário e
// ADMIN_EMAIL/ADMIN_SENHA estão definidos, cria o administrador inicial.
// Nunca roda de novo (idempotente por construção).
import { eq } from "drizzle-orm";
import { db } from "./client";
import { usuarios, categoriasFinanceiras, manutencaoTipos, metaSistema } from "./schema";
import { reindexarTudo, BUSCA_INDICE_VERSAO } from "./reindexar";
import { TIPOS_MANUTENCAO } from "@hallaxos/shared";
import { novoId } from "../lib/ids";
import { hashSenha } from "../services/auth";
import { registrarEvento } from "../services/timeline";

/** Chave em meta_sistema que guarda a versão do formato do índice de busca. */
const CHAVE_INDICE = "busca_indice_versao";

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

/** Garante os tipos padrão de manutenção (Sprint 14 · C1). Idempotente. */
export async function garantirTiposManutencaoPadrao(): Promise<void> {
  const existentes = await db.select({ nome: manutencaoTipos.nome }).from(manutencaoTipos);
  const nomes = new Set(existentes.map((t) => t.nome.toLowerCase()));
  const faltando = TIPOS_MANUTENCAO.filter((t) => !nomes.has(t));
  if (faltando.length === 0) return;
  await db.insert(manutencaoTipos).values(faltando.map((nome) => ({ nome, padrao: true })));
  console.log(`Tipos de manutenção criados: ${faltando.join(", ")}`);
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

/**
 * Mantém o índice da busca global no formato do código (Sprint 16).
 *
 * O índice é derivado — reconstruí-lo é sempre seguro. O que faltava era um
 * gatilho: quando o formato mudava, alguém precisava lembrar de rodar
 * `pnpm busca:reindexar` no VPS na mão, e enquanto não rodava a busca ficava
 * com dado velho (foi exatamente o que aconteceu depois do Sprint 14).
 *
 * Agora a versão do formato viaja no código e fica gravada em meta_sistema: se
 * a gravada for diferente, a API reindexa no arranque e regrava. No boot comum
 * é uma consulta a uma tabela de uma linha e um early-return, como os outros
 * dois seeds.
 */
export async function garantirIndiceBusca(): Promise<void> {
  const [atual] = await db
    .select()
    .from(metaSistema)
    .where(eq(metaSistema.chave, CHAVE_INDICE));

  if (atual && Number(atual.valor) === BUSCA_INDICE_VERSAO) return;

  const motivo = atual
    ? `formato mudou (v${atual.valor} → v${BUSCA_INDICE_VERSAO})`
    : "índice ainda não versionado";
  console.log(`Reindexando a busca global: ${motivo}…`);

  const r = await reindexarTudo();
  await db
    .insert(metaSistema)
    .values({ chave: CHAVE_INDICE, valor: String(BUSCA_INDICE_VERSAO) })
    .onConflictDoUpdate({
      target: metaSistema.chave,
      set: { valor: String(BUSCA_INDICE_VERSAO), atualizadoEm: new Date() },
    });

  console.log(
    `Busca reindexada (v${BUSCA_INDICE_VERSAO}): ${r.pessoas} pessoas, ${r.ativos} ativos, ` +
      `${r.operacoes} operações, ${r.manutencoes} manutenções, ${r.documentos} documentos, ` +
      `${r.lancamentos} lançamentos.`
  );
}
