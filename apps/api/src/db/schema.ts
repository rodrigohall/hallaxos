// Definições Drizzle das tabelas consultadas pela aplicação.
// O DDL (fonte de verdade da estrutura) vive em src/db/migrations/*.sql.
import {
  pgTable, uuid, text, boolean, timestamp, date, pgEnum, jsonb, primaryKey,
  numeric, integer,
} from "drizzle-orm/pg-core";
import {
  PAPEIS_USUARIO, TIPOS_PESSOA, PAPEIS_PESSOA, REFERENCIA_ENTIDADES, EVENTOS_TIMELINE,
  STATUS_ATIVO, COMBUSTIVEIS, TIPOS_DOCUMENTO, TIPOS_LANCAMENTO, STATUS_LANCAMENTO,
  FORMAS_PAGAMENTO,
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

export const statusAtivoEnum = pgEnum("status_ativo", STATUS_ATIVO);
export const combustivelEnum = pgEnum("combustivel", COMBUSTIVEIS);
export const tipoDocumentoEnum = pgEnum("tipo_documento", TIPOS_DOCUMENTO);

export const ativoCategorias = pgTable("ativo_categorias", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  ehVeicular: boolean("eh_veicular").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ativos = pgTable("ativos", {
  id: uuid("id").primaryKey(),
  codigo: text("codigo").notNull(),
  categoriaId: uuid("categoria_id").notNull().references(() => ativoCategorias.id),
  nome: text("nome").notNull(),
  status: statusAtivoEnum("status").notNull().default("disponivel"),
  valorAquisicao: numeric("valor_aquisicao", { precision: 12, scale: 2 }),
  valorFipe: numeric("valor_fipe", { precision: 12, scale: 2 }),
  dataAquisicao: date("data_aquisicao"),
  localizacao: text("localizacao"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const ativosVeiculos = pgTable("ativos_veiculos", {
  ativoId: uuid("ativo_id").primaryKey().references(() => ativos.id),
  placa: text("placa").notNull().unique(),
  renavam: text("renavam"),
  chassi: text("chassi"),
  marca: text("marca").notNull(),
  modelo: text("modelo").notNull(),
  anoFabricacao: integer("ano_fabricacao"),
  anoModelo: integer("ano_modelo"),
  cor: text("cor"),
  combustivel: combustivelEnum("combustivel"),
  kmAtual: integer("km_atual").notNull().default(0),
});

export const documentos = pgTable("documentos", {
  id: uuid("id").primaryKey(),
  entidadeTipo: referenciaEntidadeEnum("entidade_tipo").notNull(),
  entidadeId: uuid("entidade_id").notNull(),
  tipo: tipoDocumentoEnum("tipo").notNull(),
  nome: text("nome").notNull(),
  arquivoPath: text("arquivo_path").notNull(),
  mimeType: text("mime_type").notNull(),
  tamanhoBytes: integer("tamanho_bytes").notNull(),
  dataValidade: date("data_validade"),
  ordem: integer("ordem").notNull().default(0),
  principal: boolean("principal").notNull().default(false),
  usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const comentarios = pgTable("comentarios", {
  id: uuid("id").primaryKey(),
  entidadeTipo: referenciaEntidadeEnum("entidade_tipo").notNull(),
  entidadeId: uuid("entidade_id").notNull(),
  usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
  texto: text("texto").notNull(),
  editadoEm: timestamp("editado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const tipoLancamentoEnum = pgEnum("tipo_lancamento", TIPOS_LANCAMENTO);
export const statusLancamentoEnum = pgEnum("status_lancamento", STATUS_LANCAMENTO);
export const formaPagamentoEnum = pgEnum("forma_pagamento", FORMAS_PAGAMENTO);

export const categoriasFinanceiras = pgTable("categorias_financeiras", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull(),
  tipo: tipoLancamentoEnum("tipo").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contas = pgTable("contas", {
  id: uuid("id").primaryKey(),
  nome: text("nome").notNull().unique(),
  saldoInicial: numeric("saldo_inicial", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lancamentos = pgTable("lancamentos", {
  id: uuid("id").primaryKey(),
  tipo: tipoLancamentoEnum("tipo").notNull(),
  descricao: text("descricao").notNull(),
  categoriaId: uuid("categoria_id").notNull().references(() => categoriasFinanceiras.id),
  contaId: uuid("conta_id").notNull().references(() => contas.id),
  pessoaId: uuid("pessoa_id").references(() => pessoas.id),
  operacaoId: uuid("operacao_id"),
  manutencaoId: uuid("manutencao_id"),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  dataVencimento: date("data_vencimento").notNull(),
  dataPagamento: date("data_pagamento"),
  status: statusLancamentoEnum("status").notNull().default("previsto"),
  formaPagamento: formaPagamentoEnum("forma_pagamento"),
  parcelaNumero: integer("parcela_numero"),
  parcelaTotal: integer("parcela_total"),
  grupoParcelasId: uuid("grupo_parcelas_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

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
