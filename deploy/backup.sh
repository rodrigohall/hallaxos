#!/bin/sh
# Backup automático do Postgres: dump comprimido em intervalo fixo, com
# retenção dos N mais recentes. Roda como serviço sidecar (ver docker-compose).
set -eu

INTERVALO="${BACKUP_INTERVALO_SEG:-86400}"   # padrão: a cada 24h
RETENCAO="${BACKUP_RETENCAO:-7}"             # mantém os 7 últimos
DESTINO="/backups"
mkdir -p "$DESTINO"

echo "[backup] ativo — intervalo ${INTERVALO}s, retenção ${RETENCAO} arquivos"

while true; do
  TS="$(date +%Y%m%d-%H%M%S)"
  ARQ="$DESTINO/hallaxos-$TS.sql.gz"
  if pg_dump -h db -U hallax -d hallaxos | gzip > "$ARQ.parcial"; then
    mv "$ARQ.parcial" "$ARQ"
    echo "[backup] gerado: $ARQ ($(du -h "$ARQ" | cut -f1))"
  else
    echo "[backup] FALHA ao gerar dump em $TS" >&2
    rm -f "$ARQ.parcial"
  fi
  # Retenção: remove os mais antigos além do limite
  ls -1t "$DESTINO"/hallaxos-*.sql.gz 2>/dev/null | tail -n "+$((RETENCAO + 1))" | while read -r velho; do
    rm -f "$velho" && echo "[backup] removido antigo: $velho"
  done
  sleep "$INTERVALO"
done
