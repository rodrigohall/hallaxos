-- Sprint 16.
--
-- 1) Tipos de manutenção deixam de ser só-criação. Ganham desativação, para
--    tirar um tipo do seletor sem apagar o histórico das manutenções que já o
--    usam (a FK por chave natural com ON UPDATE CASCADE da 0009 continua
--    cuidando do rename).
ALTER TABLE manutencao_tipos
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- 2) meta_sistema: pares chave/valor de estado interno do próprio sistema —
--    não é dado de negócio. Nasce para versionar o índice de busca, que hoje
--    exige rodar `pnpm busca:reindexar` na mão no VPS a cada mudança de
--    formato. Com a versão gravada aqui, a API compara no arranque e reindexa
--    sozinha quando o formato mudou.
CREATE TABLE IF NOT EXISTS meta_sistema (
  chave text PRIMARY KEY,
  valor text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
