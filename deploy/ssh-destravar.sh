#!/usr/bin/env bash
# Destrava o SSH do VPS quando o deploy falha por conexão RECUSADA.
#
# QUANDO USAR: o job `deploy` falha no rsync com
#
#     kex_exchange_identification: read: Connection reset by peer
#     Connection reset by <ip> port 22
#
# Repare que isto **não é o timeout** documentado em docs/operacao-vps.md §1.
# A conexão morre em ~150ms: o TCP é aceito e algo mata o socket na troca de
# banner do SSH. Timeout = pacote descartado (rede/firewall); reset = rejeição
# ativa dentro do servidor — fail2ban com regra de reject, CrowdSec,
# tcpwrappers (`hosts.deny`) ou `MaxStartups` estourado.
#
# ONDE RODAR: terminal do VPS, de preferência pelo **Console web da Hostinger**,
# que não depende do SSH (que é justamente o que está bloqueado).
#
#   curl -fsSL https://raw.githubusercontent.com/rodrigohall/hallaxos/main/deploy/ssh-destravar.sh | sudo bash
#
# É SEGURO: o script só AFROUXA — desbanir, comentar bloqueio, aumentar limite.
# Nada aqui restringe acesso, então não há como se trancar para fora. A única
# alteração no sshd passa por `sshd -t` antes de valer; recusada, ela se reverte
# sozinha e o sshd segue de pé.
#
# NÃO RESOLVE se o reset vier do firewall do **painel** da Hostinger (fora do
# VPS). O diagnóstico distingue: se o auth.log mostra a conexão chegando e sendo
# recusada, é dentro do servidor; se não aparece nada, é o painel.
#
# Este script apaga o incêndio. Para o incêndio não voltar, veja o irmão
# `deploy/ssh-porta-alta.sh` — tira o sshd da porta 22, que é o que alimenta os
# banimentos.
set -u

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (ou prefixe com sudo)."; exit 1; }
SSHD="$(command -v sshd || echo /usr/sbin/sshd)"

echo "═══ ANTES ═══"
systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null
ss -tlnp 2>/dev/null | grep -E ':22\b' || echo "!! nada escutando na porta 22"
echo "— fail2ban —"; fail2ban-client status sshd 2>/dev/null || echo "(sem jail sshd)"
echo "— crowdsec —"; cscli decisions list 2>/dev/null | head -5 || echo "(não instalado)"
echo "— hosts.deny —"; grep -vE '^\s*(#|$)' /etc/hosts.deny 2>/dev/null || echo "(vazio)"
echo "— firewall —"; { iptables -S 2>/dev/null; nft list ruleset 2>/dev/null; } | grep -iE 'reject|drop|dport 22' | head -10
echo "— auth log —"; { tail -300 /var/log/auth.log 2>/dev/null || tail -300 /var/log/secure 2>/dev/null; } | grep -iE 'refus|deny|reset|maxstartups|too many|error' | tail -8

echo; echo "═══ DESTRAVANDO ═══"

# 1) fail2ban — a causa mais provável: a :22 recebe varredura constante de bots,
#    o jail banindo em massa acaba levando o IP do runner do GitHub junto.
if command -v fail2ban-client >/dev/null 2>&1; then
  fail2ban-client unban --all >/dev/null 2>&1 && echo "✓ fail2ban: todos os IPs desbanidos"
  mkdir -p /etc/fail2ban/jail.d
  printf '[sshd]\nmaxretry = 8\nfindtime = 10m\nbantime  = 10m\nignoreip = 127.0.0.1/8 ::1\n' > /etc/fail2ban/jail.d/sshd.local
  systemctl restart fail2ban >/dev/null 2>&1 && echo "✓ fail2ban: regra tolerante aplicada"
fi

# 2) CrowdSec — mesmo papel do fail2ban, cada vez mais comum em VPS.
if command -v cscli >/dev/null 2>&1; then
  cscli decisions delete --all >/dev/null 2>&1 && echo "✓ crowdsec: decisões limpas"
fi

# 3) tcpwrappers — bloqueio antigo que o sshd honra fechando o socket.
if [ -f /etc/hosts.deny ] && grep -qiE '^\s*(sshd|ALL)' /etc/hosts.deny; then
  cp /etc/hosts.deny "/etc/hosts.deny.bak.$(date +%s)"
  sed -i -E 's/^(\s*(sshd|ALL).*)$/#\1/I' /etc/hosts.deny
  echo "✓ hosts.deny: bloqueios comentados (backup salvo)"
fi

# 4) MaxStartups — com o padrão (10:30:100) o sshd começa a derrubar conexões
#    não autenticadas cedo demais quando há varredura de bots em curso.
mkdir -p /etc/ssh/sshd_config.d
printf 'MaxStartups 30:30:100\nLoginGraceTime 60\n' > /etc/ssh/sshd_config.d/deploy.conf
if "$SSHD" -t 2>/dev/null; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl restart ssh
  echo "✓ sshd: aceita mais conexões simultâneas"
else
  rm -f /etc/ssh/sshd_config.d/deploy.conf
  echo "✗ sshd: config recusada — ajuste revertido, sshd intacto"
fi
systemctl enable ssh >/dev/null 2>&1 || systemctl enable sshd >/dev/null 2>&1

echo; echo "═══ DEPOIS ═══"
ss -tlnp 2>/dev/null | grep -E ':22\b'
fail2ban-client status sshd 2>/dev/null | tail -3
echo
echo "Pronto. Reexecute o deploy: GitHub → Actions → Deploy VPS → Re-run failed jobs."
echo "Se falhar de novo com o MESMO reset, a saída de 'ANTES' acima diz o culpado;"
echo "se nada aparecer no auth.log, o bloqueio é no firewall do painel da Hostinger."
