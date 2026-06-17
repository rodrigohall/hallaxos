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

# 2.1 Copiloto de IA (Sprint 9) — a chave nunca é versionada nem gerada aqui.
# Quem dispara o deploy (CI) injeta o secret IA_API_KEY como variável de ambiente;
# gravamos/atualizamos a linha no .env DO VPS, que é o que o compose lê em runtime
# (definir só o secret do GitHub Actions NÃO chega ao container — ver operacao-vps).
# Idempotente: regrava a cada deploy. Sem a variável, não toca no .env (degradação
# graciosa: copiloto segue desligado, 503, sem custo).
upsert_env() {
  chave="$1"; valor="$2"
  [ -n "$valor" ] || return 0
  [ -f .env ] || : > .env
  if grep -q "^${chave}=" .env 2>/dev/null; then
    grep -v "^${chave}=" .env > .env.tmp && mv .env.tmp .env
  fi
  printf '%s=%s\n' "$chave" "$valor" >> .env
}
if [ -n "${IA_API_KEY:-}" ]; then
  upsert_env IA_API_KEY "$IA_API_KEY"
  echo "IA_API_KEY aplicada ao .env (copiloto ligado)."
fi
upsert_env IA_MODELO "${IA_MODELO:-}"

# 3. Sobe tudo
# HALLAX_SHA carimba o commit na imagem (vira build arg → /api/v1/versao) e,
# por mudar a cada deploy, invalida o cache das camadas de código no Dockerfile.
# --force-recreate garante que os containers sejam substituídos mesmo quando o
# compose acha que "nada mudou" — era o sintoma do deploy verde com código antigo.
# Respeita HALLAX_SHA vindo do CI (o VPS não tem o .git); senão, deriva do git local.
export HALLAX_SHA="${HALLAX_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo dev)}"
docker compose -f docker-compose.prod.yml up -d --build --force-recreate

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
echo "Versão publicada: ${HALLAX_SHA:-dev}  (confira em /api/v1/versao)"
