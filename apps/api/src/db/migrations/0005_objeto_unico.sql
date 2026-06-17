-- Sprint 9 · Invariante do objeto único (doc 03 §3)
-- "O mesmo ativo não pode ser OBJETO de duas operações não-terminais ao mesmo
-- tempo." Um índice UNIQUE parcial não basta: a condição "não-terminal" mora em
-- operacoes.status (outra tabela), e índices não cruzam tabelas. Então o banco
-- garante via trigger (filosofia do doc 03 §3: "o banco garante, não a disciplina").
-- O service já bloqueia pelo status do ativo (exigirAtivoLivre); isto é a rede de
-- segurança contra bugs/corridas. Não valida linhas históricas — só novas escritas.
CREATE OR REPLACE FUNCTION chk_operacao_ativo_objeto_unico() RETURNS trigger AS $$
BEGIN
  IF NEW.papel = 'objeto' THEN
    IF EXISTS (
      SELECT 1
      FROM operacao_ativos oa
      JOIN operacoes o ON o.id = oa.operacao_id
      WHERE oa.ativo_id = NEW.ativo_id
        AND oa.papel = 'objeto'
        AND oa.operacao_id <> NEW.operacao_id
        AND o.deleted_at IS NULL
        AND o.status NOT IN ('concluido', 'finalizada', 'concluida', 'cancelada')
    ) THEN
      RAISE EXCEPTION 'ativo % já é objeto de uma operação não-terminal', NEW.ativo_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_operacao_ativo_objeto_unico ON operacao_ativos;
CREATE TRIGGER trg_operacao_ativo_objeto_unico
  BEFORE INSERT OR UPDATE ON operacao_ativos
  FOR EACH ROW EXECUTE FUNCTION chk_operacao_ativo_objeto_unico();
