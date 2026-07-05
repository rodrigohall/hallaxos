-- Tipos de manutenção customizáveis (Sprint 14 · C1). O enum fixo vira uma
-- tabela de registro (padrão das categorias financeiras): o usuário pode criar
-- tipos novos (ex.: "Compra de Peças") sem migration. A coluna manutencoes.tipo
-- continua existindo com os MESMOS valores de antes, mas agora referencia o
-- registro por chave natural (nome) com ON UPDATE CASCADE — renomear um tipo
-- propaga para as manutenções sem duplicar dado nem quebrar consultas.
CREATE TABLE manutencao_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO manutencao_tipos (nome, padrao) VALUES
  ('preventiva', true),
  ('corretiva', true),
  ('revisao', true),
  ('melhoria', true);

ALTER TABLE manutencoes ALTER COLUMN tipo TYPE text USING tipo::text;
ALTER TABLE manutencoes
  ADD CONSTRAINT manutencoes_tipo_fk
  FOREIGN KEY (tipo) REFERENCES manutencao_tipos(nome) ON UPDATE CASCADE;

DROP TYPE tipo_manutencao;
