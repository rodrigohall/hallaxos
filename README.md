# HallaxOS

O cérebro operacional da Hallax.

HallaxOS não é um ERP. É um sistema único, com **uma base de dados centralizada**,
onde cada módulo é apenas uma forma diferente de visualizar e manipular os mesmos dados.

## Regra máxima

> Toda informação existe apenas uma vez.

Nunca duplicamos dados. Nunca criamos entidades redundantes. Tudo reutiliza o núcleo compartilhado.

## Módulos

| Módulo              | O que é, de verdade                                      |
| ------------------- | -------------------------------------------------------- |
| Guincho 24h         | Operações do tipo `guincho` sobre o núcleo compartilhado |
| Aluguel de Veículos | Operações do tipo `locacao`                              |
| Compra e Venda      | Operações dos tipos `compra` e `venda`                   |
| Financeiro          | Lançamentos — sempre com origem rastreável               |
| Dashboard Executivo | Consultas sobre o núcleo (não possui dados próprios)     |
| Agenda              | Eventos manuais + eventos derivados dos dados            |
| Relatórios          | Consultas sobre o núcleo (não possui dados próprios)     |

## Núcleo compartilhado

Pessoas · Ativos · Operações · Financeiro · Documentos · Manutenções · Usuários · Timeline

## Como rodar

Pré-requisitos: Node 22+, pnpm 10+ e Docker (para o Postgres).

```bash
pnpm install
pnpm dev        # sobe o banco, aplica migrations, semeia e inicia API (3333) + Web (5173)
```

Acesse http://localhost:5173 e entre com:

| Papel      | Login                  | Senha      |
| ---------- | ---------------------- | ---------- |
| admin      | admin@hallax.com       | hallax123  |
| gestor     | gestor@hallax.com      | hallax123  |
| operador   | operador@hallax.com    | hallax123  |
| financeiro | financeiro@hallax.com  | hallax123  |

Com Postgres próprio (sem Docker): copie `.env.example` para `.env`, ajuste `DATABASE_URL` e rode `pnpm dev`.

## Deploy em VPS (produção)

Em um VPS Ubuntu/Debian limpo, três comandos:

```bash
git clone -b claude/stoic-shannon-d3fxpi https://github.com/rodrigohall/hallaxos.git
cd hallaxos
./deploy/instalar.sh                       # acesso por IP (http)
# ou, com domínio apontado para o VPS (HTTPS automático):
DOMINIO=os.hallax.com ./deploy/instalar.sh
```

O instalador cuida de tudo: instala o Docker se faltar, gera senhas fortes em
`.env` (banco + admin), constrói as imagens, aplica as migrations e sobe
banco + API + site. Ao final, imprime o endereço e o login inicial.

- Atualizar versão: `git pull && ./deploy/instalar.sh`
- Logs: `docker compose -f docker-compose.prod.yml logs -f`
- Sem dados de demonstração em produção — o admin inicial vem do `.env`.

### Como os deploys realmente acontecem hoje (VPS Hostinger)

O ambiente de produção roda num **VPS da Hostinger** (Ubuntu), com **acesso ao
terminal** por SSH e pelo **Console web** do painel da Hostinger. O fluxo:

1. **Deploy automático (CI):** push no branch `claude/stoic-shannon-d3fxpi`
   dispara o GitHub Actions (`.github/workflows/deploy.yml`), que valida
   (typecheck/build/testes) e, se passar, envia o código por SSH/rsync ao VPS e
   roda `./deploy/instalar.sh`. Segredos em GitHub → Settings → Secrets:
   `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
2. **A conexão SSH ao VPS é intermitente.** Às vezes o job de deploy falha com
   `connect to host port 22: Connection timed out` — o sistema continua no ar,
   só a atualização não aplica. Já corrigimos o `sshd` para subir no boot
   (`systemctl enable ssh`); a estabilização completa é pendência do Sprint 9.
3. **Quando o CI falha, atualizamos manualmente pelo terminal do VPS** (o repo é
   público, então dá para baixar os arquivos alterados via `curl` e reconstruir
   só o container afetado com `docker compose ... up -d --build`).

⚠️ **Já passamos por:** perda do `.env` em produção (virou o `.env.example`) e
recuperação da senha do banco a partir dos containers em execução; cache do
Docker não pegando mudanças; senha do admin no `.env`. **Todo o passo a passo
desses cenários está em [`docs/operacao-vps.md`](docs/operacao-vps.md)** — leia
esse runbook antes de mexer em deploy/servidor.

## Documentação

A arquitetura é definida **antes** do código. Leia em ordem:

1. [`docs/01-visao-geral.md`](docs/01-visao-geral.md) — princípios, diretrizes permanentes, decisões arquitetônicas e stack
2. [`docs/02-modelo-de-dados.md`](docs/02-modelo-de-dados.md) — todas as entidades, relacionamentos e o DER
3. [`docs/03-estados-e-regras-de-negocio.md`](docs/03-estados-e-regras-de-negocio.md) — máquinas de estado e regras
4. [`docs/04-servicos-transversais.md`](docs/04-servicos-transversais.md) — notificações, tags, favoritos, comentários, anexos, auditoria e busca global
5. [`docs/05-permissoes.md`](docs/05-permissoes.md) — autenticação, papéis e matriz de permissões
6. [`docs/06-api.md`](docs/06-api.md) — convenções e contrato completo da API
7. [`docs/07-design-system.md`](docs/07-design-system.md) — identidade, tokens e biblioteca de componentes

Documentos vivos, sincronizados a cada sprint: [`CHANGELOG.md`](CHANGELOG.md) ·
[`docs/decisoes.md`](docs/decisoes.md) · [`docs/pendencias.md`](docs/pendencias.md)

## Status do projeto

**Sprint 10 concluída — em produção (18/jun/2026).** As quatro abas principais
foram completamente repaginadas:

- **Dashboard**: relógio ao vivo, seletor de período nos KPIs financeiros
  (hoje/semana/mês/ano/últimos 30d), frota clicável, aluguéis em andamento.
  Bloco financeiro separado em `GET /dashboard/financeiro?periodo=X` (decisão #60)
  — não recarrega tudo ao trocar de período.
- **Ativos**: guard anti-duplicação (decisão #58) ao criar ativo já comprado,
  campo de diária base, lucro presumido (decisão #59) e relatório de patrimônio.
- **Operações**: filtro por tipo em botões grandes com ícone, CEP com autocomplete
  nos campos de origem/destino do guincho (ViaCEP), auto-fill da diária e caução
  ao selecionar ativo na locação, desconto R$/% e toggle retroativo.
- **Manutenções**: kanban 3 colunas (em andamento · agendadas · concluídas),
  contadores de dias por card, campo peças/material (`ALTER TABLE manutencoes ADD
  COLUMN pecas text`, migration 0007).

60 testes verdes. Deploy automático confirmado (run `27735492174`, `success`).

**Sprints anteriores em produção:** sistema operacional completo (login,
permissões, clientes, ativos, operações unificadas, financeiro, relatórios,
manutenções, agenda, busca global, timeline, notificações, tags, favoritos,
copiloto de IA Fase 1+2, backup automático). Detalhes completos no
[`CHANGELOG.md`](CHANGELOG.md).

### Continuar o desenvolvimento (para uma nova sessão)

- **Branch único e fonte da verdade:** `claude/stoic-shannon-d3fxpi`. É onde o
  código vive **e** de onde o deploy automático sai (o workflow dispara em push
  nesse branch). Desenvolva e dê push aqui. Os demais branches `claude/*` são
  obsoletos — podem ser apagados na UI do GitHub (já estão contidos no histórico
  deste).
- **Último estado entregue:** Sprint 10 completa — 4 abas repaginadas + 3
  correções de build/runtime. Veja o topo do [`CHANGELOG.md`](CHANGELOG.md).
- **Operação/deploy do servidor:** leia o runbook
  [`docs/operacao-vps.md`](docs/operacao-vps.md) — VPS Hostinger, fluxo de
  deploy, o problema intermitente de SSH e como contornar (re-run ou aplicação
  manual pelo terminal), e a recuperação do `.env`.
- **Próximas tarefas conhecidas** (a pedir na próxima sessão): funcionalidades
  novas a critério do dono do produto; copiloto Fase 2 com mais ações de escrita;
  estabilização do timeout SSH do VPS (fail2ban/firewall Hostinger).
- **`paginacaoSchema` max:** 200 (foi 100 até o Sprint 10 — manutenção kanban
  precisava de `por_pagina=200`).

> **Fluxo de trabalho desta linha de desenvolvimento:** o dono do produto tem
> acesso ao terminal do VPS (Hostinger) e topa rodar comandos colados quando o
> deploy automático falha. Ao entregar algo, **dê push no branch acima** e
> confirme o deploy; se o CI não conseguir publicar, forneça o comando manual
> pronto para colar no terminal do VPS (ver runbook).
