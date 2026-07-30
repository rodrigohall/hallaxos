#!/usr/bin/env bash
# Move o SSH do VPS para uma porta alta e afrouxa o fail2ban.
#
# POR QUÊ: a porta 22 recebe varredura constante de bots; o fail2ban reage
# banindo IPs e, de vez em quando, leva junto o runner do GitHub Actions — é a
# causa do "ssh: connect to host *** port 22: Connection timed out" que derruba
# o deploy (docs/operacao-vps.md §1). Numa porta alta o ruído praticamente
# desaparece e o gatilho some.
#
# ONDE RODAR: no terminal do VPS — de preferência pelo **Console web da
# Hostinger**, que não depende do SSH. Se rodar por SSH, NÃO feche a sessão
# atual até o teste do passo final passar.
#
# É IDEMPOTENTE: rodar de novo não quebra nada.
#
#   sudo bash deploy/ssh-porta-alta.sh [PORTA]   # padrão: 2222
#
# DEPOIS DE RODAR, falta um passo que só existe fora do servidor:
#   1) libere a porta no firewall do PAINEL da Hostinger (fora do VPS — se ela
#      estiver fechada lá, nada aqui dentro resolve);
#   2) GitHub → Settings → Secrets and variables → Actions → Variables →
#      crie VPS_PORT com o valor da porta. O deploy.yml já lê essa variável.
set -euo pipefail

PORTA="${1:-2222}"

if [[ ! "$PORTA" =~ ^[0-9]+$ ]] || (( PORTA < 1024 || PORTA > 65535 )); then
  echo "Porta inválida: $PORTA (use algo entre 1024 e 65535)." >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Rode como root (sudo)." >&2
  exit 1
fi

echo "==> 1/5 sshd passa a escutar TAMBÉM na porta $PORTA"
# Mantém a 22 ativa por enquanto: derrubá-la agora arriscaria trancar você para
# fora se algo der errado. Fechar a 22 é o passo final, manual e consciente.
cat >/etc/ssh/sshd_config.d/porta-alta.conf <<CFG
Port 22
Port $PORTA
CFG

echo "==> 2/5 liberando a porta no firewall local"
if command -v ufw >/dev/null 2>&1; then
  ufw allow "${PORTA}/tcp" || true
fi
if command -v iptables >/dev/null 2>&1 && ! command -v ufw >/dev/null 2>&1; then
  iptables -C INPUT -p tcp --dport "$PORTA" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT -p tcp --dport "$PORTA" -j ACCEPT
fi

echo "==> 3/5 afrouxando o fail2ban (mais tolerância, ban curto)"
if systemctl list-unit-files 2>/dev/null | grep -q '^fail2ban'; then
  mkdir -p /etc/fail2ban/jail.d
  cat >/etc/fail2ban/jail.d/sshd.local <<CFG
[sshd]
maxretry = 8
findtime = 10m
bantime  = 10m
ignoreip = 127.0.0.1/8 ::1
CFG
  systemctl restart fail2ban || true
  # Solta quem já está banido — pode ser justamente um runner do GitHub.
  fail2ban-client unban --all >/dev/null 2>&1 || true
else
  echo "    (fail2ban não instalado — nada a afrouxar)"
fi

echo "==> 4/5 validando a configuração antes de recarregar"
sshd -t   # se a config estiver inválida, o script morre aqui e o sshd atual segue de pé

echo "==> 5/5 recarregando o sshd"
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl restart ssh

echo
echo "Escutando agora em:"
ss -tlnp 2>/dev/null | grep -E ":(22|${PORTA})\b" || true

cat <<FIM

──────────────────────────────────────────────────────────────────────
Feito no servidor. AGORA, sem fechar esta sessão:

  1. De outra máquina, teste:  ssh -p $PORTA <usuario>@<ip-do-vps>
     Só continue se entrar.

  2. Libere a porta $PORTA no firewall do PAINEL da Hostinger.

  3. No GitHub → Settings → Secrets and variables → Actions → Variables:
     VPS_PORT = $PORTA

  4. Dispare um deploy (Actions → Deploy VPS → Run workflow) e confirme
     que passou.

  5. Só depois disso, se quiser fechar a porta 22, edite
     /etc/ssh/sshd_config.d/porta-alta.conf deixando apenas
     "Port $PORTA", rode 'sshd -t' e recarregue o sshd.
──────────────────────────────────────────────────────────────────────
FIM
