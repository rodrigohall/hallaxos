// Definições Drizzle das tabelas consultadas pela aplicação.
// O DDL (fonte de verdade da estrutura) vive em src/db/migrations/*.sql.
import {
  pgTable, uuid, text, boolean, timestamp, date, pgEnum, jsonb, primaryKey,
} from "drizzle-orm/pg-core";
import {
  PAPEIS_USUARIO, TIPOS_PESSOA, PAPEIS_PESSOA, REFERENCIA_ENTIDADES, EVENTOS_TIMELINE,
} from "@hallaxos/shared";

export const papelUsuarioEnum = pgEnum("papel_usuario", PAPEIS_USUARIO);
export const tipoPessoaEnum = pgEnum("tipo_pessoa", TIPOS_PESSOA);
export const papelPessoaEnum = pgEnum("papel_pessoa", PAPEIS_PESSOA);
export const referenciaEntidadeEnum = pgEnum("referencia_entidade", REFERENCIA_ENTIDADES);
export const eventoTimelineEnum = pgEnum("evento_timeline", EVENTOS_TIMELINE);

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  papel: papelUsuarioEnum("papel").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  ultimoAcesso: timestamp("ultimo_acesso", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessoes = pgTable("sessoes", {
  id: uuid("id").primaryKey(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pessoas = pgTable("pessoas", {
  id: uuid("id").primaryKey(),
  tipo: tipoPessoaEnum("tipo").notNull(),
  nome: text("nome").notNull(),
  nomeFantasia: text("nome_fantasia"),
  cpfCnpj: text("cpf_cnpj").notNull().unique(),
  email: text("email"),
  telefone: text("telefone"),
  telefoneSecundario: text("telefone_secundario"),
  cep: text("cep"),
  logradouro: text("logradouro"),
  numero: text("numero"),
  complemento: text("complemento"),
  bairro: text("bairro"),
  cidade: text("cidade"),
  uf: text("uf"),
  cnhNumero: text("cnh_numero"),
  cnhCategoria: text("cnh_categoria"),
  cnhValidade: date("cnh_validade"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const pessoaPapeis = pgTable(
  "pessoa_papeis",
  {
    pessoaId: uuid("pessoa_id").notNull().references(() => pessoas.id),
    papel: papelPessoaEnum("papel").notNull(),
  },
  (t) => [primaryKey({ columns: [t.pessoaId, t.papel] })]
);

export const timeline = pgTable("timeline", {
  id: uuid("id").primaryKey(),
  entidadeTipo: referenciaEntidadeEnum("entidade_tipo").notNull(),
  entidadeId: uuid("entidade_id").notNull(),
  evento: eventoTimelineEnum("evento").notNull(),
  descricao: text("descricao").notNull(),
  dados: jsonb("dados"),
  usuarioId: uuid("usuario_id").references(() => usuarios.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
