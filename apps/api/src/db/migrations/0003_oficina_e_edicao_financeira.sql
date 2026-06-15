-- Sprint 9 · Atritos do uso real
-- Oficina como papel de `pessoas` (não tabela nova — doc 02 §1): permite marcar
-- e buscar oficinas. A edição financeira na finalização da operação não exige
-- mudança de schema — reusa colunas já existentes em `lancamentos`.
ALTER TYPE papel_pessoa ADD VALUE IF NOT EXISTS 'oficina';
