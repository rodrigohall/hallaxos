-- Endereços inteligentes do guincho (Sprint 14 · B3): coordenadas e link do
-- Google Maps colados pelo usuário ficam salvos ao lado do texto livre.
-- O endereço em texto continua sendo a fonte legível; lat/lng alimentam o
-- mini-mapa e o link preserva a referência original — nada é duplicado,
-- são três facetas do mesmo local do evento.
ALTER TABLE operacoes_guincho ADD COLUMN origem_link text NULL;
ALTER TABLE operacoes_guincho ADD COLUMN origem_lat double precision NULL;
ALTER TABLE operacoes_guincho ADD COLUMN origem_lng double precision NULL;
ALTER TABLE operacoes_guincho ADD COLUMN destino_link text NULL;
ALTER TABLE operacoes_guincho ADD COLUMN destino_lat double precision NULL;
ALTER TABLE operacoes_guincho ADD COLUMN destino_lng double precision NULL;
