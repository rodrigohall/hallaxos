#!/usr/bin/env bash
# Zera o financeiro para recomeçar do zero, SEM apagar nada.
#
# QUANDO USAR: os lançamentos acumulados não refletem mais a realidade (ex.: o
# hiato de ago–set/2026) e a decisão é recomeçar com tudo em R$ 0, lançando à mão
# daqui em diante. Ativos (valor de aquisição, FIPE, diária) NÃO são tocados —
# são colunas do ativo, não lançamentos.
#
# O QUE FAZ, nesta ordem:
#   1. Backup em ~/backups-hallaxos/zerar-financeiro-<data>/ — dump completo do
#      Postgres + CSVs (abrem no Excel). Fica FORA de ~/hallaxos de propósito:
#      o rsync do deploy roda com --delete e apagaria o backup. Se o backup
#      falhar, o script para antes de mexer em qualquer coisa.
#   2. Mostra os saldos ANTES.
#   3. Numa transação só: arquiva todos os lançamentos (soft delete — o mesmo
#      `deleted_at` que todo indicador já ignora), zera o saldo inicial das
#      contas, tira os lançamentos da busca e marca como lidas as notificações
#      que apontavam para eles. Grava em meta_sistema o instante e os saldos
#      iniciais antigos, que é o que permite desfazer.
#   4. Mostra os saldos DEPOIS (tudo zero) e como desfazer.
#
# ONDE RODAR: terminal do VPS (Console web da Hostinger), como root:
#
#   curl -fsSL https://raw.githubusercontent.com/rodrigohall/hallaxos/main/deploy/financeiro-zerar.sh | sudo bash
#
# DESFAZER (devolve os lançamentos arquivados e os saldos iniciais antigos; o
# que foi lançado depois do zeramento continua lá, somando junto):
#
#   curl -fsSL https://raw.githubusercontent.com/rodrigohall/hallaxos/main/deploy/financeiro-zerar.sh | sudo bash -s -- --desfazer
#
# Roda uma vez só: se já houver um zeramento registrado, recusa — rodar de novo
# semanas depois arquivaria o que foi lançado à mão desde então.
set -euo pipefail

# Tudo dentro de main(), chamada só na última linha: rodando por `curl | bash`,
# o script chega pelo stdin, e o primeiro `docker compose exec -T` engolia o
# resto dele — o bash terminava calado, sem backup nem erro. Com a função, o
# bash lê o arquivo inteiro antes de executar; e o stdin passa a ser /dev/null,
# para nenhum comando disputar a entrada (os heredocs do SQL trazem a própria).
main() {
exec </dev/null

MODO="zerar"
[ "${1:-}" = "--desfazer" ] && MODO="desfazer"

DIR="${HALLAXOS_DIR:-$HOME/hallaxos}"
BACKUPS="${HALLAXOS_BACKUP_DIR:-$HOME/backups-hallaxos}"
# Prefixo dos comandos do banco. Em produção, dentro do container `db`; nos
# testes locais, sobrescrito para falar com um Postgres comum.
DB_EXEC="${HALLAXOS_DB_EXEC:-docker compose -f docker-compose.prod.yml exec -T db}"

cd "$DIR"
psql_db() { $DB_EXEC psql -U hallax -d hallaxos -X -q -v ON_ERROR_STOP=1 "$@"; }
valor() { psql_db -At -c "$1"; }

marca="$(valor "SELECT valor FROM meta_sistema WHERE chave = 'financeiro_zerado_em'")"
if [ "$MODO" = "zerar" ] && [ -n "$marca" ]; then
  echo "✗ O financeiro já foi zerado em $marca. Nada foi alterado."
  echo "  Rodar de novo arquivaria o que foi lançado desde então."
  exit 1
fi
if [ "$MODO" = "desfazer" ] && [ -z "$marca" ]; then
  echo "✗ Não há zeramento registrado para desfazer. Nada foi alterado."
  exit 1
fi

saldos() {
  psql_db -c "
    SELECT c.nome AS conta,
           c.saldo_inicial
             + coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita' AND l.status = 'pago'), 0)
             - coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa' AND l.status = 'pago'), 0) AS saldo
    FROM contas c
    LEFT JOIN lancamentos l ON l.conta_id = c.id AND l.deleted_at IS NULL
    GROUP BY c.id ORDER BY c.nome"
  psql_db -c "
    SELECT count(*) AS lancamentos_ativos,
           coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'previsto'), 0) AS a_receber,
           coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'previsto'), 0) AS a_pagar
    FROM lancamentos WHERE deleted_at IS NULL"
}

# ── 1. Backup ────────────────────────────────────────────────────────────────
TS="$(date +%Y%m%d-%H%M%S)"
DESTINO="$BACKUPS/$( [ "$MODO" = zerar ] && echo zerar-financeiro || echo desfazer-zeramento )-$TS"
mkdir -p "$DESTINO"
echo "═══ BACKUP → $DESTINO ═══"

$DB_EXEC pg_dump -U hallax -d hallaxos | gzip > "$DESTINO/hallaxos-completo.sql.gz"
gzip -t "$DESTINO/hallaxos-completo.sql.gz"
grep -q "COPY public.lancamentos" <(gunzip -c "$DESTINO/hallaxos-completo.sql.gz") \
  || { echo "✗ Dump sem a tabela de lançamentos — abortado, nada foi alterado."; exit 1; }
echo "✓ dump completo ($(du -h "$DESTINO/hallaxos-completo.sql.gz" | cut -f1))"

# CSV para Excel em português: separador ';', decimal com vírgula e BOM UTF-8
# (sem o BOM o Excel quebra os acentos).
csv() {
  { printf '\xEF\xBB\xBF'; psql_db -c "COPY ($2) TO STDOUT WITH (FORMAT csv, HEADER, DELIMITER ';')"; } > "$DESTINO/$1"
}
csv lancamentos-legivel.csv "
  SELECT l.data_vencimento AS vencimento, l.data_pagamento AS pagamento, l.status, l.tipo,
         l.descricao, replace(l.valor::text, '.', ',') AS valor,
         cf.nome AS categoria, co.nome AS conta, p.nome AS pessoa,
         op.codigo AS operacao, a.codigo AS ativo, l.forma_pagamento,
         CASE WHEN l.parcela_total IS NOT NULL THEN l.parcela_numero || '/' || l.parcela_total END AS parcela,
         l.id
  FROM lancamentos l
  LEFT JOIN categorias_financeiras cf ON cf.id = l.categoria_id
  LEFT JOIN contas co ON co.id = l.conta_id
  LEFT JOIN pessoas p ON p.id = l.pessoa_id
  LEFT JOIN operacoes op ON op.id = l.operacao_id
  LEFT JOIN ativos a ON a.id = l.ativo_id
  WHERE l.deleted_at IS NULL
  ORDER BY l.data_vencimento, l.created_at"
csv lancamentos-tabela-completa.csv "SELECT * FROM lancamentos ORDER BY created_at"
csv contas.csv "
  SELECT c.nome, replace(c.saldo_inicial::text, '.', ',') AS saldo_inicial,
         replace((c.saldo_inicial
           + coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'receita' AND l.status = 'pago'), 0)
           - coalesce(sum(l.valor) FILTER (WHERE l.tipo = 'despesa' AND l.status = 'pago'), 0))::text, '.', ',') AS saldo,
         c.id
  FROM contas c LEFT JOIN lancamentos l ON l.conta_id = c.id AND l.deleted_at IS NULL
  GROUP BY c.id ORDER BY c.nome"
echo "✓ CSVs: lancamentos-legivel.csv, lancamentos-tabela-completa.csv, contas.csv"

# ── 2–4. Antes, mudança, depois ──────────────────────────────────────────────
echo; echo "═══ ANTES ═══"; saldos

if [ "$MODO" = "zerar" ]; then
  echo "═══ ZERANDO ═══"
  # now() é o mesmo instante em toda a transação: todos os arquivados recebem
  # exatamente o mesmo deleted_at, e é por ele que o --desfazer os encontra.
  psql_db <<'SQL'
BEGIN;
INSERT INTO meta_sistema (chave, valor) VALUES
  ('financeiro_zerado_em', now()::text),
  ('financeiro_zerado_saldos_iniciais',
   (SELECT coalesce(jsonb_object_agg(id, saldo_inicial), '{}')::text FROM contas));
UPDATE notificacoes SET lida_em = now()
  WHERE lida_em IS NULL AND entidade_tipo = 'lancamento'
    AND entidade_id IN (SELECT id FROM lancamentos WHERE deleted_at IS NULL);
DELETE FROM busca_indice
  WHERE entidade_tipo = 'lancamento'
    AND entidade_id IN (SELECT id FROM lancamentos WHERE deleted_at IS NULL);
UPDATE lancamentos SET deleted_at = now() WHERE deleted_at IS NULL;
UPDATE contas SET saldo_inicial = 0;
COMMIT;
SQL
  echo "✓ lançamentos arquivados e saldos iniciais zerados"
else
  echo "═══ DESFAZENDO ═══"
  psql_db <<'SQL'
BEGIN;
UPDATE lancamentos SET deleted_at = NULL
  WHERE deleted_at = (SELECT valor::timestamptz FROM meta_sistema WHERE chave = 'financeiro_zerado_em');
UPDATE contas c SET saldo_inicial = (s.saldos ->> c.id::text)::numeric
  FROM (SELECT valor::jsonb AS saldos FROM meta_sistema WHERE chave = 'financeiro_zerado_saldos_iniciais') s
  WHERE s.saldos ? c.id::text;
DELETE FROM meta_sistema
  WHERE chave IN ('financeiro_zerado_em', 'financeiro_zerado_saldos_iniciais',
                  -- sem a versão gravada, a API reconstrói a busca no arranque
                  'busca_indice_versao');
COMMIT;
SQL
  echo "✓ lançamentos e saldos iniciais restaurados"
  if [ -z "${HALLAXOS_DB_EXEC:-}" ]; then
    docker compose -f docker-compose.prod.yml restart api >/dev/null
    echo "✓ API reiniciada — a busca é reconstruída no arranque"
  fi
fi

echo; echo "═══ DEPOIS ═══"; saldos
echo "Backup: $DESTINO"
if [ "$MODO" = "zerar" ]; then
  echo "Para desfazer: o mesmo comando, com '| sudo bash -s -- --desfazer' no fim."
fi
}

main "$@"
