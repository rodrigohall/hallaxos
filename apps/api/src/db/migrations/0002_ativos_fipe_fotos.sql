-- Sprint 2 · Módulo de Ativos
-- Valor FIPE no ativo; ordenação e foto principal nos documentos.
ALTER TABLE ativos ADD COLUMN valor_fipe numeric(12,2);
ALTER TABLE documentos ADD COLUMN ordem int NOT NULL DEFAULT 0;
ALTER TABLE documentos ADD COLUMN principal boolean NOT NULL DEFAULT false;
