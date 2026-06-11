-- HallaxOS · Schema completo (docs 02, 04 e 05)
-- O banco nasce inteiro na primeira migration: sprints seguintes adicionam
-- API e UI, nunca estrutura. Toda mudança futura = nova migration.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ───────────────────────────── Enums ─────────────────────────────
CREATE TYPE tipo_pessoa AS ENUM ('pf', 'pj');
CREATE TYPE papel_pessoa AS ENUM ('cliente', 'fornecedor', 'motorista', 'parceiro');
CREATE TYPE papel_usuario AS ENUM ('admin', 'gestor', 'operador', 'financeiro');
CREATE TYPE referencia_entidade AS ENUM
  ('pessoa', 'ativo', 'operacao', 'manutencao', 'lancamento', 'documento', 'usuario');
CREATE TYPE status_ativo AS ENUM
  ('disponivel', 'reservado', 'alugado', 'em_manutencao', 'em_uso_interno', 'vendido', 'baixado');
CREATE TYPE combustivel AS ENUM ('gasolina', 'etanol', 'flex', 'diesel', 'eletrico', 'hibrido');
CREATE TYPE tipo_operacao AS ENUM ('guincho', 'locacao', 'venda', 'compra');
CREATE TYPE status_operacao AS ENUM
  ('orcamento', 'reservada', 'ativa', 'finalizada',
   'solicitado', 'a_caminho', 'em_execucao', 'concluido',
   'negociacao', 'fechada', 'concluida', 'cancelada');
CREATE TYPE papel_operacao_ativo AS ENUM ('objeto', 'recurso');
CREATE TYPE status_documentacao AS ENUM ('pendente', 'em_andamento', 'concluida');
CREATE TYPE tipo_lancamento AS ENUM ('receita', 'despesa');
CREATE TYPE status_lancamento AS ENUM ('previsto', 'pago', 'cancelado');
CREATE TYPE forma_pagamento AS ENUM
  ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia');
CREATE TYPE tipo_manutencao AS ENUM ('preventiva', 'corretiva', 'revisao', 'melhoria');
CREATE TYPE status_manutencao AS ENUM ('agendada', 'em_andamento', 'concluida', 'cancelada');
CREATE TYPE tipo_documento AS ENUM
  ('contrato', 'crlv', 'cnh', 'nota_fiscal', 'foto', 'comprovante', 'outro');
CREATE TYPE evento_timeline AS ENUM
  ('criado', 'atualizado', 'status_alterado', 'comentario_adicionado',
   'documento_anexado', 'lancamento_gerado', 'login', 'logout', 'login_falhou');
CREATE TYPE tipo_notificacao AS ENUM
  ('devolucao_atrasada', 'lancamento_vencido', 'cnh_vencendo', 'documento_vencendo',
   'manutencao_agendada', 'operacao_atribuida', 'mencao', 'guincho_solicitado');

-- ──────────────────────── Funções utilitárias ────────────────────────
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION timeline_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A timeline é imutável (append-only)';
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────── Usuários ─────────────────────────────
CREATE TABLE usuarios (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  papel papel_usuario NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_acesso timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessoes (
  id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  expira_em timestamptz NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessoes_usuario ON sessoes (usuario_id);

-- ───────────────────────────── Pessoas ─────────────────────────────
CREATE TABLE pessoas (
  id uuid PRIMARY KEY,
  tipo tipo_pessoa NOT NULL,
  nome text NOT NULL,
  nome_fantasia text,
  cpf_cnpj text NOT NULL UNIQUE,
  email text,
  telefone text,
  telefone_secundario text,
  cep text, logradouro text, numero text, complemento text,
  bairro text, cidade text, uf text,
  cnh_numero text, cnh_categoria text, cnh_validade date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TRIGGER trg_pessoas_updated BEFORE UPDATE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_pessoas_nome_trgm ON pessoas USING gin (nome gin_trgm_ops);

CREATE TABLE pessoa_papeis (
  pessoa_id uuid NOT NULL REFERENCES pessoas(id),
  papel papel_pessoa NOT NULL,
  PRIMARY KEY (pessoa_id, papel)
);

-- ───────────────────────────── Ativos ─────────────────────────────
CREATE TABLE ativo_categorias (
  id uuid PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  eh_veicular boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_ativo_categorias_updated BEFORE UPDATE ON ativo_categorias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE SEQUENCE ativos_codigo_seq;
CREATE TABLE ativos (
  id uuid PRIMARY KEY,
  codigo text NOT NULL UNIQUE
    DEFAULT ('AT-' || lpad(nextval('ativos_codigo_seq')::text, 4, '0')),
  categoria_id uuid NOT NULL REFERENCES ativo_categorias(id),
  nome text NOT NULL,
  status status_ativo NOT NULL DEFAULT 'disponivel',
  valor_aquisicao numeric(12,2),
  data_aquisicao date,
  localizacao text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TRIGGER trg_ativos_updated BEFORE UPDATE ON ativos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_ativos_status ON ativos (status) WHERE deleted_at IS NULL;

CREATE TABLE ativos_veiculos (
  ativo_id uuid PRIMARY KEY REFERENCES ativos(id),
  placa text NOT NULL UNIQUE,
  renavam text,
  chassi text,
  marca text NOT NULL,
  modelo text NOT NULL,
  ano_fabricacao int,
  ano_modelo int,
  cor text,
  combustivel combustivel,
  km_atual int NOT NULL DEFAULT 0
);

-- ───────────────────────────── Operações ─────────────────────────────
CREATE SEQUENCE operacoes_codigo_seq;
CREATE TABLE operacoes (
  id uuid PRIMARY KEY,
  codigo text NOT NULL UNIQUE
    DEFAULT ('OP-' || lpad(nextval('operacoes_codigo_seq')::text, 4, '0')),
  tipo tipo_operacao NOT NULL,
  cliente_id uuid NOT NULL REFERENCES pessoas(id),
  responsavel_id uuid NOT NULL REFERENCES usuarios(id),
  status status_operacao NOT NULL,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  desconto numeric(12,2) NOT NULL DEFAULT 0,
  data_inicio timestamptz NOT NULL DEFAULT now(),
  data_fim timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TRIGGER trg_operacoes_updated BEFORE UPDATE ON operacoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_operacoes_tipo_status ON operacoes (tipo, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_operacoes_cliente ON operacoes (cliente_id);

CREATE TABLE operacao_ativos (
  operacao_id uuid NOT NULL REFERENCES operacoes(id),
  ativo_id uuid NOT NULL REFERENCES ativos(id),
  papel papel_operacao_ativo NOT NULL,
  PRIMARY KEY (operacao_id, ativo_id)
);
CREATE INDEX idx_operacao_ativos_ativo ON operacao_ativos (ativo_id);

CREATE TABLE operacoes_guincho (
  operacao_id uuid PRIMARY KEY REFERENCES operacoes(id),
  motorista_id uuid REFERENCES pessoas(id),
  origem_endereco text NOT NULL,
  destino_endereco text NOT NULL,
  veiculo_cliente_descricao text NOT NULL,
  veiculo_cliente_placa text,
  km_percorrido int,
  data_acionamento timestamptz NOT NULL DEFAULT now(),
  data_conclusao timestamptz
);

CREATE TABLE operacoes_locacao (
  operacao_id uuid PRIMARY KEY REFERENCES operacoes(id),
  condutor_id uuid REFERENCES pessoas(id),
  valor_diaria numeric(12,2) NOT NULL,
  caucao numeric(12,2) NOT NULL DEFAULT 0,
  data_retirada timestamptz,
  data_devolucao_prevista timestamptz NOT NULL,
  data_devolucao_real timestamptz,
  km_saida int,
  km_retorno int
);

CREATE TABLE operacoes_compra_venda (
  operacao_id uuid PRIMARY KEY REFERENCES operacoes(id),
  km_no_ato int,
  data_transferencia date,
  status_documentacao status_documentacao NOT NULL DEFAULT 'pendente'
);

-- ───────────────────────────── Manutenções ─────────────────────────────
CREATE TABLE manutencoes (
  id uuid PRIMARY KEY,
  ativo_id uuid NOT NULL REFERENCES ativos(id),
  tipo tipo_manutencao NOT NULL,
  status status_manutencao NOT NULL DEFAULT 'agendada',
  descricao text NOT NULL,
  fornecedor_id uuid REFERENCES pessoas(id),
  data_agendada date,
  data_inicio timestamptz,
  data_conclusao timestamptz,
  km_no_momento int,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TRIGGER trg_manutencoes_updated BEFORE UPDATE ON manutencoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_manutencoes_ativo ON manutencoes (ativo_id);

-- ───────────────────────────── Financeiro ─────────────────────────────
CREATE TABLE categorias_financeiras (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  tipo tipo_lancamento NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nome, tipo)
);
CREATE TRIGGER trg_categorias_financeiras_updated BEFORE UPDATE ON categorias_financeiras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE contas (
  id uuid PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  saldo_inicial numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_contas_updated BEFORE UPDATE ON contas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE lancamentos (
  id uuid PRIMARY KEY,
  tipo tipo_lancamento NOT NULL,
  descricao text NOT NULL,
  categoria_id uuid NOT NULL REFERENCES categorias_financeiras(id),
  conta_id uuid NOT NULL REFERENCES contas(id),
  pessoa_id uuid REFERENCES pessoas(id),
  operacao_id uuid REFERENCES operacoes(id),
  manutencao_id uuid REFERENCES manutencoes(id),
  valor numeric(12,2) NOT NULL,
  data_vencimento date NOT NULL,
  data_pagamento date,
  status status_lancamento NOT NULL DEFAULT 'previsto',
  forma_pagamento forma_pagamento,
  parcela_numero int,
  parcela_total int,
  grupo_parcelas_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Invariantes do doc 03 §3
  CONSTRAINT chk_lancamento_valor_positivo CHECK (valor > 0),
  CONSTRAINT chk_lancamento_origem_unica CHECK (operacao_id IS NULL OR manutencao_id IS NULL),
  CONSTRAINT chk_lancamento_pago_com_data CHECK ((status = 'pago') = (data_pagamento IS NOT NULL))
);
CREATE TRIGGER trg_lancamentos_updated BEFORE UPDATE ON lancamentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_lancamentos_status_venc ON lancamentos (status, data_vencimento) WHERE deleted_at IS NULL;
CREATE INDEX idx_lancamentos_operacao ON lancamentos (operacao_id);
CREATE INDEX idx_lancamentos_manutencao ON lancamentos (manutencao_id);

-- ───────────────────────────── Documentos ─────────────────────────────
CREATE TABLE documentos (
  id uuid PRIMARY KEY,
  entidade_tipo referencia_entidade NOT NULL,
  entidade_id uuid NOT NULL,
  tipo tipo_documento NOT NULL,
  nome text NOT NULL,
  arquivo_path text NOT NULL,
  mime_type text NOT NULL,
  tamanho_bytes int NOT NULL,
  data_validade date,
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TRIGGER trg_documentos_updated BEFORE UPDATE ON documentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_documentos_entidade ON documentos (entidade_tipo, entidade_id);

-- ───────────────────────────── Agenda ─────────────────────────────
CREATE TABLE eventos_agenda (
  id uuid PRIMARY KEY,
  titulo text NOT NULL,
  descricao text,
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz,
  dia_inteiro boolean NOT NULL DEFAULT false,
  responsavel_id uuid REFERENCES usuarios(id),
  entidade_tipo referencia_entidade,
  entidade_id uuid,
  concluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TRIGGER trg_eventos_agenda_updated BEFORE UPDATE ON eventos_agenda
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_eventos_agenda_data ON eventos_agenda (data_inicio) WHERE deleted_at IS NULL;

-- ───────────────────────────── Timeline ─────────────────────────────
CREATE TABLE timeline (
  id uuid PRIMARY KEY,
  entidade_tipo referencia_entidade NOT NULL,
  entidade_id uuid NOT NULL,
  evento evento_timeline NOT NULL,
  descricao text NOT NULL,
  dados jsonb,
  usuario_id uuid REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_entidade ON timeline (entidade_tipo, entidade_id, created_at DESC);
-- Imutabilidade garantida pelo banco, não por disciplina (doc 03 §3)
CREATE TRIGGER trg_timeline_imutavel BEFORE UPDATE OR DELETE ON timeline
  FOR EACH ROW EXECUTE FUNCTION timeline_imutavel();

-- ──────────────────── Serviços transversais (doc 04) ────────────────────
CREATE TABLE comentarios (
  id uuid PRIMARY KEY,
  entidade_tipo referencia_entidade NOT NULL,
  entidade_id uuid NOT NULL,
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  texto text NOT NULL,
  mencoes uuid[] NOT NULL DEFAULT '{}',
  editado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TRIGGER trg_comentarios_updated BEFORE UPDATE ON comentarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_comentarios_entidade ON comentarios (entidade_tipo, entidade_id);

CREATE TABLE tags (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  cor text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX idx_tags_nome ON tags (lower(nome)) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_tags_updated BEFORE UPDATE ON tags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tags_vinculos (
  tag_id uuid NOT NULL REFERENCES tags(id),
  entidade_tipo referencia_entidade NOT NULL,
  entidade_id uuid NOT NULL,
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, entidade_tipo, entidade_id)
);
CREATE INDEX idx_tags_vinculos_entidade ON tags_vinculos (entidade_tipo, entidade_id);

CREATE TABLE favoritos (
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  entidade_tipo referencia_entidade NOT NULL,
  entidade_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, entidade_tipo, entidade_id)
);

CREATE TABLE notificacoes (
  id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  tipo tipo_notificacao NOT NULL,
  titulo text NOT NULL,
  entidade_tipo referencia_entidade NOT NULL,
  entidade_id uuid NOT NULL,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notificacoes_usuario ON notificacoes (usuario_id, created_at DESC);

-- Índice de busca global: derivado e reconstruível (doc 04 §7)
CREATE TABLE busca_indice (
  entidade_tipo referencia_entidade NOT NULL,
  entidade_id uuid NOT NULL,
  titulo text NOT NULL,
  subtitulo text NOT NULL DEFAULT '',
  termos text NOT NULL DEFAULT '',
  termos_numericos text NOT NULL DEFAULT '',
  tsv tsvector,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entidade_tipo, entidade_id)
);
CREATE INDEX idx_busca_tsv ON busca_indice USING gin (tsv);
CREATE INDEX idx_busca_termos_trgm ON busca_indice USING gin (termos gin_trgm_ops);
CREATE INDEX idx_busca_numericos_trgm ON busca_indice USING gin (termos_numericos gin_trgm_ops);
