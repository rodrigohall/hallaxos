#!/usr/bin/env bash
# Instalador do HallaxOS em VPS (Ubuntu/Debian). Idempotente.
# Uso:  ./deploy/instalar.sh            → acesso por IP (http)
#       DOMINIO=os.hallax.com ./deploy/instalar.sh  → HTTPS automático
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── HallaxOS · Instalador ──"

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# 2. Configuração (.env) — gerada uma única vez, com senhas aleatórias
if [ ! -f .env ]; then
  DB_SENHA=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  ADMIN_SENHA=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')
  DOMINIO_VALOR="${DOMINIO:-}"
  if [ -n "$DOMINIO_VALOR" ]; then COOKIE_SECURE=true; else COOKIE_SECURE=false; fi
  cat > .env <<FIM
DB_SENHA=$DB_SENHA
ADMIN_EMAIL=admin@hallax.com
ADMIN_SENHA=$ADMIN_SENHA
DOMINIO=$DOMINIO_VALOR
COOKIE_SECURE=$COOKIE_SECURE
FIM
  echo "Arquivo .env criado com senhas geradas."
fi

# 3. Sobe tudo
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "── HallaxOS no ar ──"
. ./.env
if [ -n "${DOMINIO:-}" ]; then
  echo "Acesse: https://$DOMINIO"
else
  IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "SEU_IP")
  echo "Acesse: http://$IP"
fi
echo "Login inicial: $ADMIN_EMAIL"
echo "Senha inicial: $ADMIN_SENHA   (guarde — está salva no arquivo .env)"
