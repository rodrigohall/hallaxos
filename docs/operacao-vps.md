# Operação e deploy no VPS (runbook)

> Guia prático de produção. Escrito a partir do que realmente aconteceu/ajustamos
> no servidor — não da teoria. Última atualização: 2026-06-15.

## Onde roda

- **Provedor:** VPS na **Hostinger** (Ubuntu/Debian). Há **acesso ao terminal**
  por SSH e também pelo **Console web** do painel da Hostinger (uma "tela preta"
  no navegador que funciona mesmo se o SSH estiver fora — útil para emergências).
- **Stack em produção:** Docker Compose (`docker-compose.prod.yml`) com 4
  containers: `db` (Postgres 16), `api` (Fastify), `web` (site + Caddy como
  reverse-proxy/HTTPS) e `backup` (pg_dump diário). Caddy faz proxy de `/api/*`
  para a API e serve o site no resto.
- **Diretório do projeto no VPS:** `~/hallaxos` (é onde fica o `.env`, o
  `docker-compose.prod.yml` e o código enviado pelo deploy).

## Como o deploy automático funciona

1. Push no branch **`claude/stoic-shannon-d3fxpi`** dispara o workflow
   **`.github/workflows/deploy.yml`** (GitHub Actions).
2. Job **`verificar`**: typecheck + build + testes. Se algo quebra, **não chega
   ao VPS** (porta de qualidade).
3. Job **`deploy`**: conecta no VPS por SSH, envia o código por **rsync** e roda
   **`./deploy/instalar.sh`** (rebuild das imagens + migrations + sobe tudo).
   O código vai do runner para o VPS — **o VPS não precisa de acesso ao GitHub**.

### Segredos do GitHub Actions (Settings → Secrets and variables → Actions)
- `VPS_HOST` — IP/host do servidor
- `VPS_USER` — usuário SSH (ex.: `root`)
- `VPS_SSH_KEY` — chave **privada** com acesso ao servidor
- (opcional) variável `VPS_PORT` (padrão 22), `DOMINIO`, `DEPLOY_ATIVO`

## Problemas que já enfrentamos (e como resolver)

### 1. Deploy falha com `ssh: connect to host *** port 22: Connection timed out`
Conexão do GitHub até o VPS instável/intermitente — o `verificar` passa, mas o
job `deploy` não consegue enviar o código. **O sistema em produção continua no
ar**; só a atualização não foi aplicada.

**O que já corrigimos:** o `sshd` não subia sozinho após reboot. Resolvido com
`sudo systemctl enable --now ssh` (agora sobe no boot). Mesmo assim a conexão
ainda pode falhar em janelas ruins (suspeita de fail2ban banindo os IPs dos
runners do GitHub, ou firewall da Hostinger).

**Diagnóstico (cole no terminal do VPS):**
```bash
# sshd está de pé e escutando?
sudo systemctl is-active ssh && sudo ss -tlnp | grep -E ':(22|2222)\b'
# fail2ban está banindo? (jail do sshd + lista de IPs banidos)
sudo systemctl is-active fail2ban && sudo fail2ban-client status sshd 2>/dev/null
# firewall local (ufw e/ou iptables/nftables)
sudo ufw status verbose 2>/dev/null; sudo iptables -S 2>/dev/null | grep -E '22|DROP|REJECT' | head
# bans recentes no log
sudo grep -E 'Ban|Found' /var/log/fail2ban.log 2>/dev/null | tail -20
```
Sinais: `fail2ban-client status sshd` listando muitos IPs banidos (bots varrendo
a :22) confirma a suspeita; um runner pode cair junto. Lembre que a **Hostinger
tem firewall no painel** (fora do VPS) — se a :22 não estiver liberada lá,
nenhum ajuste no servidor resolve.

**Correção imediata (destravar agora):**
```bash
# desbanir tudo do jail sshd (efeito imediato; não persiste reboot)
sudo fail2ban-client unban --all
```

**Correção permanente (recomendada) — tirar o SSH da porta 22 e tolerar mais:**
A :22 recebe varredura constante de bots, que alimenta o fail2ban e gera os
banimentos que às vezes pegam o runner. Mover para uma porta alta corta quase
todo esse ruído. O `deploy.yml` já lê a porta da variável `VPS_PORT`.
```bash
# 1) escolha uma porta (ex.: 2222) e habilite no sshd
echo 'Port 2222' | sudo tee /etc/ssh/sshd_config.d/porta.conf
# 2) libere no firewall local (ajuste conforme ufw/iptables/nftables)
sudo ufw allow 2222/tcp 2>/dev/null || true
# 3) abra a porta TAMBÉM no firewall do painel da Hostinger
# 4) reinicie o sshd (mantenha a sessão atual aberta até testar a nova!)
sudo systemctl restart ssh
# 5) afrouxe o fail2ban para os deploys (mais tolerância, ban curto) e ignore redes confiáveis
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'CFG'
[sshd]
maxretry = 8
findtime = 10m
bantime  = 10m
ignoreip = 127.0.0.1/8 ::1
CFG
sudo systemctl restart fail2ban
```
Depois, no GitHub → Settings → Secrets and variables → Actions → **Variables**,
crie `VPS_PORT = 2222`. Teste autenticação por chave na nova porta **antes de
fechar a sessão atual** (`ssh -p 2222 root@SEU_IP`). Pendência considerada
estável quando alguns deploys seguidos passarem sem timeout.

**Como destravar quando acontecer:**
- **Opção A — reexecutar:** no GitHub → Actions → o run que falhou → "Re-run
  failed jobs". Às vezes passa na 2ª tentativa.
- **Opção B — aplicar manualmente pelo terminal do VPS** (confiável). O repo é
  público, então dá para baixar arquivos direto do GitHub e reconstruir só o que
  mudou. Exemplo para uma mudança **só de frontend** (rebuild apenas do `web`):
  ```bash
  cd ~/hallaxos
  # baixar o(s) arquivo(s) alterado(s) — o ?$(date +%s) evita cache do GitHub
  curl -fsSL "https://raw.githubusercontent.com/rodrigohall/hallaxos/claude/stoic-shannon-d3fxpi/apps/web/src/paginas/Financeiro.tsx?$(date +%s)" -o apps/web/src/paginas/Financeiro.tsx
  docker compose -f docker-compose.prod.yml up -d --build web
  ```
  Para mudança de **backend**, baixe os arquivos de `apps/api/...` (e
  `pnpm-lock.yaml`/`package.json` se dependências mudaram) e rode
  `docker compose -f docker-compose.prod.yml up -d --build api`.
  > Se o Docker reaproveitar cache e não pegar a mudança, force:
  > `docker compose -f docker-compose.prod.yml build --no-cache web && docker compose -f docker-compose.prod.yml up -d`.

### 2. `required variable DB_SENHA is missing a value` ao rodar o compose
O arquivo **`.env`** do VPS foi perdido/sobrescrito (já aconteceu de virar o
conteúdo do `.env.example`). Os containers em execução **mantêm os valores
corretos** (foram criados quando o `.env` estava certo), então dá para
reconstruir o `.env` lendo deles — **sem gerar senha nova e sem perder dados**.

> ⚠️ **NÃO rode `./deploy/instalar.sh` com o `.env` quebrado**: o instalador gera
> um `.env` novo com **senha de banco nova**, o que quebra o acesso ao Postgres
> existente.

A senha **autoritativa** do banco é a que a **API** usa (ela conecta com
sucesso) — extraia da `DATABASE_URL` da API, não do `POSTGRES_PASSWORD` do db
(o Postgres só usa esse env na criação do volume; depois ele pode não refletir a
senha real):

```bash
cd ~/hallaxos
APIC=hallaxos-api-1; WEBC=hallaxos-web-1
DBURL=$(docker exec "$APIC" printenv DATABASE_URL)
DB_SENHA=$(printf %s "$DBURL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
ADMIN_EMAIL=$(docker exec "$APIC" printenv ADMIN_EMAIL | tr -d '\r\n')
ADMIN_SENHA=$(docker exec "$APIC" printenv ADMIN_SENHA | tr -d '\r\n')
COOKIE_SECURE=$(docker exec "$APIC" printenv COOKIE_SECURE | tr -d '\r\n')
DOMINIO=$(docker exec "$WEBC" printenv DOMINIO | tr -d '\r\n')
[ "$DOMINIO" = ":80" ] && DOMINIO=""
cat > .env <<FIM
DB_SENHA=$DB_SENHA
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_SENHA=$ADMIN_SENHA
DOMINIO=$DOMINIO
COOKIE_SECURE=$COOKIE_SECURE
IA_API_KEY=
IA_MODELO=claude-haiku-4-5
FIM
echo "DB_SENHA tem $(printf %s "$DB_SENHA" | wc -c) caracteres"
```

### 3. Ver o que está acontecendo / depurar
```bash
cd ~/hallaxos
docker compose -f docker-compose.prod.yml ps                 # status dos containers
docker compose -f docker-compose.prod.yml logs -f --tail=50 api   # logs da API (Ctrl+C para sair)
```
Erros de aplicação aparecem com `"level":50`. Toda requisição loga "incoming
request" — se um POST não aparece no log, a requisição não chegou ao servidor
(problema de cliente/proxy, não da API).

### 4. Recuperar a senha do admin (login da aplicação)
```bash
grep ADMIN_SENHA ~/hallaxos/.env     # admin@hallax.com + esse valor
```
Em produção a senha do admin é a gerada no `.env` (não é a `hallax123`, que é só
do ambiente de desenvolvimento com seed).

## Checklist rápido pós-deploy
- `docker compose -f docker-compose.prod.yml ps` → todos `Up`/healthy.
- Logs da API sem `level:50` repetindo (crash loop).
- Abrir o site e fazer login.
