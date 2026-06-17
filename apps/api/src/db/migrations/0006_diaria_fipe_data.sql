-- Sprint 10 · Tab 2 · Diária padrão do ativo e data de atualização da FIPE
ALTER TABLE ativos ADD COLUMN valor_diaria      numeric(12,2) NULL;
ALTER TABLE ativos ADD COLUMN data_fipe_atualizacao date       NULL;
