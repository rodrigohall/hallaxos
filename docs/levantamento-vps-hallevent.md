# Levantamento da VPS Hostinger — viabilidade do HallEventOS ao lado do HallaxOS

> **Objetivo:** avaliar se dá para subir um segundo stack (HallEventOS: Postgres +
> Node/Fastify + nginx, em Docker Compose) na mesma VPS onde o HallaxOS roda,
> sem risco para o HallaxOS.
> **Natureza:** levantamento **somente leitura**. Nada foi alterado, instalado,
> reiniciado ou derrubado.
> **Data:** 2026-08-08

---

## ⚠️ Leia isto primeiro — o que este documento é e o que não é

**Não consegui executar um único comando na VPS.** A sessão remota onde este
levantamento foi feito é um contêiner efêmero isolado, e nele:

| Tentativa | Resultado |
|---|---|
| `ssh` / `sshpass` | **binário não existe** no ambiente |
| `~/.ssh/` | vazio — sem chave privada, sem `config`, sem `known_hosts` |
| `curl http://2.25.200.8/estado.txt` | `403 host_not_allowed` — IP fora da allowlist de egresso do proxy |
| Variáveis de ambiente com host/credencial da VPS | nenhuma presente |

Ou seja: **não há caminho de rede nem credencial** desta sessão até a Hostinger.
Um levantamento ao vivo é impossível daqui — não por falta de `sudo`, mas por
falta de qualquer acesso.

Então este documento entrega o que **é** possível entregar com rigor, em duas
camadas bem separadas:

- **Camada A — o que o repositório prova.** O deploy é 100% declarativo
  (`docker-compose.prod.yml`, `deploy/instalar.sh`, `.github/workflows/deploy.yml`,
  `deploy/Caddyfile`). Isso determina, com alta confiança, o que o HallaxOS
  coloca na máquina: containers, portas publicadas, volumes, proxy, backup e
  método de deploy. Itens **2, 3, 4, 9 e 10** ficam essencialmente respondidos.
- **Camada B — o que só a máquina sabe.** RAM, disco, SO, firewall, DNS, portas
  realmente em escuta e serviços fora do Docker. Itens **1, 5, 6, 7 e 8**
  dependem da VPS. Para esses, há na §11 um **script de auditoria read-only,
  pronto para colar**, que devolve as respostas na mesma numeração desta lista.

Cada afirmação abaixo está marcada:
**✅ verificado no repo** · **🔶 inferido** (dedução com base sólida, confirme) ·
**❓ requer a VPS**.

---

## 1. SO, RAM e disco

**❓ requer a VPS.**

O que já se sabe por evidência indireta:

- `deploy/instalar.sh` assume **Ubuntu/Debian** (usa `get.docker.com`, `systemctl`,
  `ufw`); `docs/operacao-vps.md` diz literalmente "VPS na **Hostinger**
  (Ubuntu/Debian)". 🔶
- Nenhum documento registra RAM, disco ou número de vCPUs. Não vou inventar
  número de plano.

Rode o **Bloco 1** da §11 para obter SO/versão, RAM total e livre, e disco livre
na raiz.

> **Por que isso importa aqui:** o HallaxOS já roda 4 containers, um deles um
> Postgres 16. O HallEventOS traria um **segundo Postgres**. Dois Postgres na
> mesma máquina competem por RAM de forma não-trivial (cada um reserva
> `shared_buffers` e cache próprios). Em VPS de 4 GB isso é apertado; em 2 GB é
> pedir OOM-killer. **Esse é o número que decide o projeto** — meça antes de
> qualquer outra coisa.

---

## 2. Docker: containers, volumes e redes

**✅ verificado no repo** (o que o deploy cria) · **❓ confirmar o estado real na VPS**

Docker está instalado — o `instalar.sh` o instala se faltar (linhas 11-14), e todo
o deploy depende dele.

### Containers em produção

Definidos em `docker-compose.prod.yml`, projeto `hallaxos` (o diretório é
`~/hallaxos`), portanto nomes `hallaxos-<serviço>-1` — confirmado em
`docs/operacao-vps.md:162`, que usa `hallaxos-api-1` e `hallaxos-web-1`.

| Container | Imagem | Portas publicadas no host | Papel |
|---|---|---|---|
| `hallaxos-db-1` | `postgres:16-alpine` | **nenhuma** | Banco. Só acessível na rede Docker |
| `hallaxos-api-1` | build de `apps/api/Dockerfile` (node:22-alpine) | **nenhuma** | Fastify, `EXPOSE 3333`, interno |
| `hallaxos-web-1` | build de `apps/web/Dockerfile` (**caddy:2-alpine**) | **`80:80` e `443:443`** | Caddy: front estático + proxy `/api/*` |
| `hallaxos-backup-1` | `postgres:16-alpine` | **nenhuma** | Sidecar de `pg_dump` diário |

> **O achado mais importante de todo o levantamento está nesta tabela:** o único
> serviço que publica porta no host é o `web`, e ele publica **80 e 443**.
> Detalhe crítico na §7.

### Volumes (nomeados, prefixados pelo projeto)

`hallaxos_pgdata` · `hallaxos_caddy_dados` · `hallaxos_arquivos` · `hallaxos_backups`

- `pgdata` — **todos os dados do negócio**. É o volume insubstituível.
- `arquivos` — uploads/anexos (fotos de ativos, documentos). Também insubstituível.
- `caddy_dados` — certificados e estado do Caddy.
- `backups` — dumps `.sql.gz` (ver §9).

### Redes

Nenhuma rede é declarada, então o Compose cria a default: **`hallaxos_default`**
(bridge). O HallEventOS, num diretório próprio, ganhará a sua
(`hallevent_default`) — **isoladas por padrão**, o que é bom: um stack não
enxerga o Postgres do outro.

Confirme o estado real com o **Bloco 2** da §11.

---

## 3. Quem atende 80 e 443

**✅ verificado no repo.** É o **Caddy** — não nginx, não Traefik, não Apache, e
**não há painel** (Coolify/Dokploy/EasyPanel/CloudPanel/aaPanel) em lugar nenhum
do repositório ou dos runbooks.

O Caddy roda **dentro do container `hallaxos-web-1`** (imagem base `caddy:2-alpine`,
`apps/web/Dockerfile`), não como serviço do host.

### Onde fica a configuração — e o detalhe que mais engana

`deploy/Caddyfile`, no repositório. Mas ele é **copiado para dentro da imagem em
build time**:

```dockerfile
FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
```

**Consequência prática:** editar `/etc/caddy/Caddyfile` dentro do container
**não persiste** — o próximo deploy reconstrói a imagem e sobrescreve. A única
forma correta de mexer no proxy do HallaxOS é editar `deploy/Caddyfile` no repo e
fazer deploy. Guarde isso: é exatamente o que você precisará fazer se optar por
rotear o HallEventOS pelo Caddy existente (§ Opinião).

O Caddyfile inteiro, hoje:

```caddy
{$DOMINIO::80} {
	encode zstd gzip
	handle /api/* { reverse_proxy api:3333 }
	handle { root * /srv
	         try_files {path} /index.html
	         file_server }
}
```

Sem `DOMINIO`, o endereço vira `:80`. Site estático em `/srv`, `/api/*` para a
API. O `estado.txt` é servido como estático a partir de `apps/web/public/`.

---

## 4. HTTPS: emissão e renovação

**✅ mecanismo verificado** · **🔶 estado atual**

**Não há certbot.** O Caddy faz **HTTPS automático** (ACME/Let's Encrypt nativo),
com emissão e renovação transparentes, e persiste tudo no volume
`hallaxos_caddy_dados` montado em `/data`.

O gatilho é a variável `DOMINIO`:

- `DOMINIO` **preenchido** → Caddy emite e renova o certificado sozinho. O
  `instalar.sh` também põe `COOKIE_SECURE=true` nesse caso.
- `DOMINIO` **vazio** → o Compose cai em `:80` (`DOMINIO: ${DOMINIO:-:80}`) e o
  sistema roda em **HTTP puro, sem certificado**.

**Estado hoje: quase certamente HTTP puro.** 🔶 O `CLAUDE.md` descreve a produção
como `http://2.25.200.8` e o `estado.txt` é validado pelo CI por HTTP. Acesso por
IP não pode ter certificado Let's Encrypt de qualquer forma. O valor real vem da
variável `DOMINIO` no GitHub (Settings → Secrets and variables → Actions →
Variables), que o `deploy.yml:137` repassa ao instalador.

> **Ponto de atenção que vale além deste levantamento:** se o HallaxOS está
> mesmo em HTTP puro, o login trafega sem TLS e os cookies vão sem a flag
> `Secure`. Vale um domínio, independentemente do HallEventOS.

---

## 5. Domínios e DNS

**❓ requer a VPS / painéis externos** — e sinceramente, aqui o repositório quase
não ajuda.

O que existe:

- `README.md:59` usa `os.hallax.com` apenas como **exemplo** de uso do instalador.
- `hallax.com` aparece só em e-mails de seed (`admin@hallax.com`).
- Nenhum documento diz qual domínio, se algum, aponta para a VPS.
- **Nada no repositório indica onde o DNS é gerenciado** (Hostinger, Cloudflare
  ou outro). Não há nenhum sinal de Cloudflare (sem `cloudflared`, sem menção a
  proxy laranja, sem headers `CF-*`).

Como fechar, sem depender de mim:

1. **Qual domínio o servidor acha que tem:** valor da variável `DOMINIO` no
   GitHub, e `docker exec hallaxos-web-1 printenv DOMINIO` (leitura pura).
2. **Onde o DNS mora:** consulte os NS do domínio (Bloco 5 da §11). Se vierem
   `ns1.dns-parking.com`/`ns2.dns-parking.com` → **Hostinger**; se vierem nomes
   `*.ns.cloudflare.com` → **Cloudflare**.
3. **Painel da Hostinger** → hPanel → Domínios / Zona DNS.

> Se o DNS estiver na Cloudflare **com proxy ativo (nuvem laranja)**, isso muda o
> plano de TLS do HallEventOS: o Caddy não consegue validar por HTTP-01 atrás do
> proxy da Cloudflare. Confirme antes de escolher a estratégia de certificado.

---

## 6. Firewall

**❓ requer a VPS**, mas há evidência forte de contexto.

`deploy/ssh-porta-alta.sh` trata **ufw e iptables como possibilidades**, testando
qual existe (`command -v ufw`, senão `iptables`) — ou seja, quem escreveu o script
não sabia qual está ativo. Não dá para afirmar. Bloco 6 da §11 responde.

O que **é** certo e importa muito:

- **Existe um firewall no painel da Hostinger, fora da VPS.** `operacao-vps.md`
  bate nessa tecla três vezes: *"se a :22 não estiver liberada lá, nenhum ajuste
  no servidor resolve"*. Ele **não é visível por nenhum comando** dentro da
  máquina — só pelo hPanel (Servidores → seu VPS → Firewall).
- **`fail2ban` está ativo** (ou esteve): o runbook inteiro §1 gira em torno dele,
  e há um script dedicado (`ssh-destravar.sh`) para desbanir.

> **Para o HallEventOS isto é ação obrigatória, não detalhe:** se o novo sistema
> for exposto em qualquer porta que não 80/443, você precisa liberá-la **nos dois
> lugares** — ufw/iptables na VPS **e** no firewall do painel Hostinger.
> Esquecer o painel é o erro clássico, e o sintoma é "a porta está escutando mas
> ninguém conecta".

---

## 7. Portas em escuta — 8080, 3001, 5432, 5433 estão livres?

**✅ o que o HallaxOS ocupa** · **❓ a lista completa**

Do lado do HallaxOS, a resposta é limpa e é uma boa notícia:

| Porta | Status pelo HallaxOS | Observação |
|---|---|---|
| **80** | 🔴 **OCUPADA** | `hallaxos-web-1` (Caddy) |
| **443** | 🔴 **OCUPADA** | `hallaxos-web-1` — **leia o alerta abaixo** |
| **5432** | 🟢 livre no host | o `db` de produção **não publica porta** |
| **5433** | 🟢 livre | não usado em lugar nenhum |
| **8080** | 🟢 livre | não usado em lugar nenhum |
| **3001** | 🟢 livre | não usado em lugar nenhum |
| **3333** | 🟢 livre no host | a API só faz `EXPOSE`, sem publicar |
| **22** (ou 2222) | 🔴 SSH | ver §6 e a pendência de porta alta |

### 🚨 A pegadinha da 443

O `docker-compose.prod.yml` publica `"443:443"` **incondicionalmente**, mesmo
quando `DOMINIO` está vazio e o Caddy, lá dentro, escuta só na `:80`.

O `docker-proxy` **reserva a porta no host de qualquer jeito**, tenha ou não
alguém atendendo. Então a 443 vai aparecer ocupada em `ss -tulpn`, e um
`nginx` do HallEventOS tentando bindar 443 vai falhar com *address already in
use* — **mesmo com o HallaxOS sem HTTPS nenhum**. Não interprete "443 sem
serviço" como "443 livre".

⚠️ **Uma ressalva honesta sobre 5432:** ela está livre *do ponto de vista do
HallaxOS*. Se existir um Postgres instalado direto no host (§8), ela estará
ocupada por ele. Só o Bloco 7 fecha isso.

Rode o **Bloco 7** da §11 para a lista completa e definitiva.

---

## 8. Postgres ou MySQL direto no host?

**🔶 provavelmente não** · **❓ confirmar**

O HallaxOS **não precisa** de banco no host: seu Postgres é container e conversa
pela rede Docker (`postgres://hallax:...@db:5432/hallaxos`). Nenhum documento,
script ou runbook menciona instalar Postgres ou MySQL na máquina. O
`instalar.sh` instala **apenas** o Docker.

Mas a VPS pode ter vindo com algo pré-instalado da imagem da Hostinger, ou ter
sido usada antes. O Bloco 8 da §11 verifica serviço, binário e porta.

---

## 9. Backup: o que salva e para onde

**✅ verificado no repo.** Existe rotina, é automática, e roda como container.

Serviço `backup` (`docker-compose.prod.yml:44-57`) executando `deploy/backup.sh`:

- **O quê:** `pg_dump -h db -U hallax -d hallaxos` — o banco inteiro do HallaxOS.
- **Como:** comprimido em gzip, nome `hallaxos-<AAAAMMDD-HHMMSS>.sql.gz`. Escreve
  em `.parcial` e só renomeia se o dump concluir — **não deixa dump truncado se
  falhar**. Bem feito.
- **Frequência:** `BACKUP_INTERVALO_SEG`, padrão **86400s (24h)**.
- **Retenção:** `BACKUP_RETENCAO`, padrão **7 arquivos**; os mais antigos são
  apagados.
- **Onde:** volume Docker `hallaxos_backups` → `/backups`.

### Três limitações que você precisa saber

1. **O backup nunca sai da máquina.** Fica num volume Docker no **mesmo disco**
   do banco que ele protege. Perda de disco, VPS ou conta = perda do backup
   junto. Não é backup contra desastre; é contra erro lógico ("apaguei sem
   querer").
2. **Não cobre o volume `arquivos`.** Fotos de ativos, anexos e documentos
   **não têm backup nenhum**. Se o `hallaxos_arquivos` for perdido, os arquivos
   se foram — e o dump SQL não os traz de volta.
3. **Disco compartilhado.** 7 dumps + imagens Docker + um segundo stack
   disputam o mesmo espaço (ver Opinião).

> Isso é dívida do HallaxOS, anterior ao HallEventOS — mas o segundo sistema
> **aumenta a pressão de disco**, então entra na conta.

---

## 10. Onde ficam os arquivos e como o deploy é feito

**✅ verificado no repo.**

**Local:** `~/hallaxos` no VPS (`$HOME` do `VPS_USER`; se for `root`, então
`/root/hallaxos`). Lá vivem o código, o `docker-compose.prod.yml` e — o mais
sensível — o **`.env` com as senhas de produção**.

**Deploy: nem `git pull`, nem upload manual. É rsync a partir do CI.**
`.github/workflows/deploy.yml`, disparado por push no `main`:

1. **Job `verificar`** (porta de qualidade): typecheck, build e testes contra um
   Postgres 16 real. Falhou, **não chega na VPS**.
2. **Gerar `estado.txt`** com commit, data, branch, sprint e últimos 15 commits.
3. **`rsync -az --delete`** do runner para `~/hallaxos/`, excluindo `.git`,
   **`.env`**, `node_modules`, `dados` e `dist`. Até 4 tentativas com backoff.
4. **`./deploy/instalar.sh`** via SSH, com `HALLAX_SHA`, `DOMINIO`, `IA_API_KEY`
   — que roda `docker compose -f docker-compose.prod.yml up -d --build --force-recreate`.
5. **Validação externa:** faz `curl` no `estado.txt` público e confere se o commit
   bate. Não bateu, o deploy falha.

**A VPS não fala com o GitHub** — o código vem empurrado pelo runner. (A exceção
são os procedimentos manuais de emergência do runbook, que baixam arquivos via
`raw.githubusercontent.com`.)

### 🔥 A armadilha do `--delete` — leia antes de criar qualquer pasta

O `rsync` roda com **`--delete`** sobre `~/hallaxos/`. **Qualquer arquivo ou
diretório dentro de `~/hallaxos/` que não exista no repositório é APAGADO no
próximo deploy** — sem aviso, sem confirmação.

Só `.env`, `node_modules`, `dados`, `dist` e `.git` estão protegidos por
`--exclude`.

**Portanto: o HallEventOS NUNCA pode morar dentro de `~/hallaxos/`.** Use um
diretório irmão — `~/hallevent` — e o problema deixa de existir.

### Estado atual do deploy: atenção

`docs/pendencias.md:47` registra que **o deploy do Sprint 16 (`926a580`) falhou**
— 8 tentativas, todas com `kex_exchange_identification: Connection reset by peer`.
Se ninguém rodou `deploy/ssh-destravar.sh` desde então, **a VPS está rodando um
commit mais antigo que o `main`**, e o SSH pode ainda estar travado. Confirme o
que está no ar com `curl http://2.25.200.8/estado.txt` (do seu computador — daqui
o egresso é bloqueado) antes de assumir que a produção reflete o repositório.

---

## 11. Script de auditoria read-only (cole na VPS)

Responde os itens **1, 2, 5, 6, 7, 8** e confirma **3, 4, 9, 10**. Cabeçalhos na
mesma numeração deste documento.

**Todos os comandos são de leitura.** Nenhum instala, altera, reinicia ou remove
nada. Ele nunca imprime senha: o bloco de `.env` mostra só os **nomes** das
chaves. Rode pelo terminal SSH ou pelo **Console web da Hostinger** (que funciona
mesmo com o SSH travado).

```bash
# ===== AUDITORIA READ-ONLY DA VPS — HallaxOS / HallEventOS =====
# Nada aqui altera o sistema. Pode rodar com o HallaxOS no ar.
# Ideal: 'sudo bash' (itens de firewall e dono de porta exigem root).
{
echo "###### 1. SO, RAM E DISCO ######"
. /etc/os-release 2>/dev/null && echo "SO: $PRETTY_NAME"
echo "Kernel: $(uname -r)   Arquitetura: $(uname -m)   vCPUs: $(nproc)"
echo "Uptime:$(uptime -p 2>/dev/null | sed 's/^up//')"
echo "--- Memória ---"; free -h
echo "--- Disco (raiz) ---"; df -h /
echo "--- Uso do Docker (imagens/volumes/cache) ---"; docker system df 2>/dev/null || echo "(docker indisponível)"

echo; echo "###### 2. DOCKER ######"
if command -v docker >/dev/null 2>&1; then
  echo "Versão: $(docker --version)"; docker compose version 2>/dev/null
  echo "--- Containers RODANDO (nome | imagem | portas) ---"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
  echo "--- Containers PARADOS também ---"
  docker ps -a --filter status=exited --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
  echo "--- Projetos Compose ---"; docker compose ls 2>/dev/null
  echo "--- Volumes ---"; docker volume ls
  echo "--- Redes ---"; docker network ls
  echo "--- Subredes já em uso (evitar colisão de CIDR) ---"
  docker network ls -q | xargs -r docker network inspect -f '{{.Name}}: {{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null
  echo "--- Restart policy (quem volta sozinho no boot) ---"
  docker ps -aq | xargs -r docker inspect -f '{{.Name}}: {{.HostConfig.RestartPolicy.Name}}' 2>/dev/null
else
  echo "Docker NÃO instalado."
fi

echo; echo "###### 3+4. PROXY 80/443 E HTTPS ######"
echo "--- Quem escuta 80/443 ---"; ss -tlnp 2>/dev/null | grep -E ':(80|443)\b' || echo "(nada — inesperado)"
echo "--- Serviços de proxy NO HOST (fora do Docker) ---"
for s in nginx apache2 httpd caddy traefik haproxy; do
  printf '%-10s: %s\n' "$s" "$(systemctl is-active $s 2>/dev/null || echo n/d)"
done
echo "--- Painéis (Coolify/Dokploy/EasyPanel/CloudPanel/aaPanel) ---"
ls -d /opt/coolify /opt/dokploy /etc/easypanel /home/cloudpanel /www/server 2>/dev/null || echo "nenhum diretório de painel encontrado"
echo "--- Configs de site no host (se houver nginx/apache) ---"
ls -la /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ /etc/apache2/sites-enabled/ 2>/dev/null || echo "(sem configs de nginx/apache no host)"
echo "--- DOMINIO do container web (define se há HTTPS) ---"
docker exec hallaxos-web-1 printenv DOMINIO 2>/dev/null || echo "(container web não encontrado com esse nome)"
echo "--- Certificados que o Caddy emitiu ---"
docker exec hallaxos-web-1 sh -c 'ls -R /data/caddy/certificates 2>/dev/null | head -30' 2>/dev/null || echo "(nenhum — coerente com HTTP puro)"
echo "--- Certbot existe? ---"; command -v certbot >/dev/null && certbot certificates 2>/dev/null || echo "certbot não instalado (esperado)"

echo; echo "###### 5. DOMÍNIOS E DNS ######"
echo "IP público: $(curl -s --max-time 8 ifconfig.me 2>/dev/null || echo '(sem saída)')"
echo "Hostname: $(hostname -f 2>/dev/null)"
# Troque SEUDOMINIO.com pelo domínio real, se houver:
DOM="SEUDOMINIO.com"
if command -v dig >/dev/null 2>&1; then
  echo "--- A record de $DOM ---";  dig +short A "$DOM"
  echo "--- NS de $DOM (revela onde o DNS é gerenciado) ---"; dig +short NS "$DOM"
else
  echo "(dig ausente: 'host -t NS $DOM' ou consulte pelo hPanel da Hostinger)"
fi
echo "NOTA: ns*.dns-parking.com = Hostinger | *.ns.cloudflare.com = Cloudflare"

echo; echo "###### 6. FIREWALL ######"
echo "--- ufw ---"; ufw status verbose 2>/dev/null || echo "ufw ausente ou requer root"
echo "--- iptables (filter) ---"; iptables -S 2>/dev/null | head -40 || echo "requer root"
echo "--- nftables ---"; nft list ruleset 2>/dev/null | head -30 || echo "nft ausente/sem permissão"
echo "--- fail2ban ---"; systemctl is-active fail2ban 2>/dev/null; fail2ban-client status 2>/dev/null || echo "(fail2ban ausente ou requer root)"
echo ">>> LEMBRETE: o firewall do PAINEL da Hostinger NÃO aparece aqui."
echo ">>> Confira em hPanel -> Servidores -> VPS -> Firewall."

echo; echo "###### 7. PORTAS EM ESCUTA ######"
echo "--- Todas (TCP+UDP, com processo) ---"; ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null
echo "--- Veredito para as portas de interesse ---"
for p in 80 443 3001 3333 5432 5433 8080 8443 9000; do
  if ss -tlnH "sport = :$p" 2>/dev/null | grep -q .; then
    echo "  porta $p -> OCUPADA :: $(ss -tlnpH "sport = :$p" 2>/dev/null | head -1 | sed 's/.*users://')"
  else
    echo "  porta $p -> LIVRE"
  fi
done

echo; echo "###### 8. BANCO DE DADOS NO HOST (fora do Docker) ######"
for s in postgresql mysql mariadb mongod redis-server; do
  printf '%-14s: %s\n' "$s" "$(systemctl is-active $s 2>/dev/null || echo n/d)"
done
echo "Binários: $(command -v psql postgres mysqld mysql 2>/dev/null | tr '\n' ' ' || echo nenhum)"
echo "Clusters Postgres do host:"; pg_lsclusters 2>/dev/null || echo "(nenhum — bom sinal)"

echo; echo "###### 9. BACKUP ######"
echo "--- Container de backup ---"; docker ps --filter name=backup --format '{{.Names}} | {{.Status}}' 2>/dev/null
echo "--- Dumps existentes ---"
docker run --rm -v hallaxos_backups:/b alpine sh -c 'ls -lh /b 2>/dev/null | tail -15' 2>/dev/null || echo "(não foi possível listar o volume)"
echo "--- Tamanho dos volumes ---"
for v in hallaxos_pgdata hallaxos_arquivos hallaxos_backups hallaxos_caddy_dados; do
  echo -n "$v: "; docker run --rm -v $v:/d alpine du -sh /d 2>/dev/null | cut -f1 || echo "?"
done
echo "--- Cron do host (backup externo?) ---"
crontab -l 2>/dev/null || echo "(sem crontab para este usuário)"
ls -la /etc/cron.d/ 2>/dev/null | tail -10
echo "--- Snapshot da Hostinger: verifique no hPanel, não aparece aqui ---"

echo; echo "###### 10. ARQUIVOS E DEPLOY DO HALLAXOS ######"
echo "Diretório: $(ls -d ~/hallaxos 2>/dev/null || echo 'NÃO encontrado em ~')"
ls -la ~/hallaxos 2>/dev/null | head -25
echo "--- Chaves presentes no .env (SEM VALORES) ---"
sed -E 's/=.*/=<oculto>/' ~/hallaxos/.env 2>/dev/null || echo "(.env não encontrado)"
echo "--- Commit no ar ---"
curl -s --max-time 10 http://localhost/estado.txt 2>/dev/null | head -6 || echo "(estado.txt não respondeu em localhost)"
echo "--- Versão da API ---"; curl -s --max-time 10 http://localhost/api/v1/versao 2>/dev/null; echo
echo; echo "###### FIM DA AUDITORIA ######"
} 2>&1 | tee /tmp/auditoria-vps.txt
```

O relatório fica também em `/tmp/auditoria-vps.txt`.

> Se algum bloco disser **"requer root"** e você não tiver `sudo`, me avise: os
> afetados são o firewall (§6) e o **dono** do processo em cada porta (§7) — a
> lista de portas ocupadas ainda sai, só sem o nome do processo. Todo o resto
> funciona como usuário comum, desde que ele esteja no grupo `docker`.

---

## Minha opinião: portas livres e o que pode quebrar

### Portas — o veredito

**Livres e recomendadas para o HallEventOS:** `8080` (nginx HTTP), `3001` (API
Fastify), `5433` (Postgres). Nenhuma tem qualquer uso no HallaxOS. `5432` também
está livre *no host*, mas **prefira 5433** para o novo banco: elimina ambiguidade
e sobrevive ao dia em que alguém publicar o Postgres do HallaxOS para depuração.

**Ocupadas, sem negociação:** `80` e `443`, ambas pelo `hallaxos-web-1` —
**incluindo a 443, mesmo sem HTTPS ativo** (§7). Mais `22` (ou `2222`) do SSH.

**A recomendação que mais reduz risco:** publique as portas do HallEventOS
**apenas em loopback** — `"127.0.0.1:8080:80"`, `"127.0.0.1:5433:5432"` — em vez
de `"8080:80"`. Assim o serviço fica inacessível da internet, você não depende do
firewall do painel Hostinger para se proteger, e o acesso externo passa a ser uma
decisão consciente (via proxy) e não um efeito colateral do `docker-compose up`.

### O que poderia quebrar o HallaxOS — em ordem de risco real

**1. 🔴 Guerra pela porta 80/443 — o risco número um.**
O HallEventOS traz nginx. Se o compose dele publicar `80:80`/`443:443`, um dos
dois stacks não sobe. E o pior caso não é hoje: é **depois de um reboot**. Ambos
os stacks têm containers com `restart: unless-stopped`; na volta, quem iniciar
primeiro fica com as portas e **o outro entra em crash-loop**. Se o perdedor for
o `hallaxos-web-1`, **o HallaxOS sai do ar inteiro** — front e API, já que tudo
passa pelo Caddy. Você descobriria pelo cliente ligando, não por alerta.
→ *Mitigação:* o HallEventOS **não publica 80/443**. Nunca.

**2. 🔴 Arquivos apagados pelo `rsync --delete`.**
Instalar o HallEventOS dentro de `~/hallaxos/` (um `~/hallaxos/hallevent/`, por
exemplo) faz o próximo deploy do HallaxOS **apagar tudo silenciosamente** —
inclusive o `docker-compose.yml` e o `.env` do HallEventOS. O volume Docker do
banco sobreviveria, mas o stack ficaria órfão.
→ *Mitigação:* diretório irmão, `~/hallevent`.

**3. 🟠 Disco cheio — o modo de falha mais cruel.**
Um segundo Postgres, mais imagens, mais camadas de build, mais logs de container.
Se a raiz encher, o Postgres do HallaxOS **para de aceitar escrita**: o sistema
fica "no ar" mas nenhuma operação salva, e os dumps de backup passam a falhar
justamente quando você mais precisaria deles. Some-se que o HallEventOS terá seu
próprio ciclo de `--build`, acumulando imagens órfãs.
→ *Mitigação:* medir o disco livre **antes** (Bloco 1); manter margem folgada;
`docker image prune` (só imagens penduradas) periodicamente — **jamais**
`docker system prune -a --volumes`, ver risco 4.

**4. 🔴 Um comando de limpeza destruindo o banco.**
`docker system prune -a --volumes` apaga **volumes não utilizados** — e se o
HallaxOS estiver parado por um instante, `hallaxos_pgdata` e `hallaxos_arquivos`
se encaixam nessa definição. **Isso destrói o banco e os anexos de forma
irreversível**, e o backup mora no mesmo disco (§9). É o comando que mais gente
roda "para liberar espaço" quando o disco enche — ou seja, o risco 3 alimenta
diretamente este.
→ *Mitigação:* proibir `--volumes` em prune nessa máquina; e, urgentemente,
**tirar uma cópia dos backups para fora da VPS**.

**5. 🟠 RAM e o OOM-killer.**
Dois Postgres, dois Node, dois proxies. Sob pressão, o kernel mata o processo de
maior footprint — que muito provavelmente é um dos Postgres. Se for o do
HallaxOS, você ganha corrupção potencial e downtime.
→ *Mitigação:* medir a RAM (Bloco 1) e, se o espaço for apertado, definir
`mem_limit` no compose do HallEventOS para que ele **não possa** crescer sobre o
vizinho.

**6. 🟡 Pressão sobre o SSH, que já está frágil.**
`docs/pendencias.md` registra o deploy do Sprint 16 **falhando 8 vezes seguidas**
por bloqueio ativo (fail2ban/CrowdSec). Um segundo sistema significa mais um
pipeline de deploy batendo na mesma porta 22 — mais tentativas, mais chance de
ban, e o ban derruba **os dois** deploys.
→ *Mitigação:* rodar `deploy/ssh-porta-alta.sh` **antes** de montar o
HallEventOS. Isso já era pendência do HallaxOS; o segundo sistema apenas a torna
urgente.

**7. 🟢 Colisão de nomes e de rede — baixo risco, fácil de evitar.**
O Compose prefixa tudo com o nome do projeto (diretório). Com `~/hallevent`, os
nomes viram `hallevent-*` e não colidem. Só há problema se alguém clonar o
HallEventOS numa pasta também chamada `hallaxos`. Colisão de sub-rede bridge é
possível mas rara — o Bloco 2 lista as faixas em uso.

**8. 🟢 Não há painel para atrapalhar.** Sem Coolify/Dokploy/CloudPanel na
máquina, ninguém vai "gerenciar" seus containers por trás. Simplifica bastante.

### Como eu subiria o HallEventOS

1. **Antes de tudo:** rodar a auditoria (§11) e conferir RAM e disco. Esse número
   decide se o projeto é viável — ou se vale mais uma segunda VPS pequena.
2. **Diretório irmão** `~/hallevent`, nunca dentro de `~/hallaxos`.
3. **Zero portas públicas:** tudo em `127.0.0.1` (`127.0.0.1:8080:80`,
   `127.0.0.1:5433:5432`).
4. **Um só porteiro na internet.** Você tem duas opções honestas:
   - **(a) Estender o Caddy do HallaxOS** (edite `deploy/Caddyfile` no repo, com
     um bloco de site novo para o domínio do HallEventOS apontando para
     `host.docker.internal:8080` ou uma rede compartilhada). Aproveita o HTTPS
     automático e mantém **um** processo na 80/443. Custo: mexe no repo do
     HallaxOS e o deploy dele passa a afetar o roteamento do outro.
   - **(b) nginx do HallEventOS só em loopback**, acessado por túnel SSH quando
     precisar. Isolamento total, zero mudança no HallaxOS. Ideal enquanto o
     HallEventOS for interno.
   Se o HallEventOS precisa ser público com HTTPS, vá de **(a)**. Se é uso
   interno, **(b)** é claramente mais seguro.
5. **Antes de qualquer coisa em produção:** copie os dumps de
   `hallaxos_backups` para fora da VPS — e resolva o backup do volume
   `arquivos`, que hoje **não tem nenhum**. Mexer numa máquina cujo único backup
   mora no disco que você está prestes a lotar é o risco que eu menos aceitaria.

**Resumo:** a convivência é perfeitamente viável — os dois stacks se isolam bem
por Docker, e as portas que você citou (8080, 3001, 5433) estão livres. Os riscos
sérios não são de arquitetura, são de **operação**: a 443 que parece livre e não
é, o `rsync --delete` que apaga pasta intrusa, o `prune --volumes` que come o
banco, e o disco que enche. Todos evitáveis com as regras acima.

---

## Validação que depende de você

Não tenho acesso à VPS nem aos painéis, então estes pontos ficam com você:

1. **Rodar o script da §11** e me devolver a saída — fecho os itens 1, 5, 6, 7 e 8
   com dado real, não inferência.
2. **hPanel da Hostinger → Firewall** — as regras de fora da VPS, invisíveis por
   comando.
3. **hPanel → Zona DNS**, ou os NS do domínio, para responder onde o DNS mora.
4. **GitHub → Settings → Secrets and variables → Actions → Variables** — o valor
   de `DOMINIO` e se `VPS_PORT` existe; confirma o estado de HTTPS (§4).
5. **`curl http://2.25.200.8/estado.txt`** do seu computador — confirma qual
   commit está realmente no ar, dado o deploy do Sprint 16 que falhou (§10).
