-- Sprint 9 · Interconexão dos módulos no financeiro
-- Lançamento → ativo: um custo direto do ativo (IPVA, seguro, multa) que não é
-- operação nem manutenção. Decisão: `ativo_id` é vínculo de CLASSIFICAÇÃO que
-- COEXISTE com a origem — não é uma terceira origem mutuamente exclusiva
-- (decisão #53). Por isso o CHECK de origem única (operacao_id × manutencao_id)
-- permanece intacto: um lançamento pode ter origem (operação/manutenção) E ainda
-- assim apontar para o ativo, ou ter só `ativo_id` (custo direto avulso).
-- Sem duplicar dado: reusa o ativo do núcleo via FK + consulta (regra máxima).
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS ativo_id uuid REFERENCES ativos(id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_ativo ON lancamentos (ativo_id);
