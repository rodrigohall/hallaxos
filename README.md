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

**Sprint 13 concluída — em produção (25/jun/2026).** Dashboard repaginado com mapa
interativo, análises financeiras por tipo de operação e custo por ativo, melhorias
mobile-first (iOS/Android) e vinculação automática de lançamentos avulsos.

### O que está disponível hoje

| Área | Sprints |
|------|---------|
| Fundação: banco, auth argon2id, permissões, timeline imutável, busca global ⌘K | 1 |
| Design system Hallax (tokens, componentes, PWA mobile) | 1.5, 13 |
| Deploy VPS em um comando + CI/CD por push (GitHub Actions) | 1, 7 |
| Clientes/Pessoas: CRUD, fichas 360°, operações/lançamentos vinculados | 1, 12 |
| Ativos: veicular, categorias, fotos, FIPE, diária base, lucro presumido, relatório patrimônio | 2, 5, 10 |
| Financeiro: lançamentos, parcelas 60×, estorno, anulação, pagamento em lote, planilha pivot | 3, 12 |
| Relatórios: resultado/ROI por ativo, DRE, planilha pivotável com drill-down | 3, 12 |
| Operações unificadas: Guincho · Locação · Venda · Compra (máquinas de estado, financeiro automático) | 4, 5, 10 |
| Manutenções: kanban 3 colunas, contadores de dias, campo peças, custo por ativo | 6, 10, 13 |
| Agenda: calendário derivado + compromissos, filtro por tipo, seletor de período | 6, 11 |
| Confiança: backup automático, suíte de testes no CI, bloqueio progressivo de login | 7 |
| Notificações, tags, favoritos, rate limiting, auditoria de negações | 8 |
| Copiloto de IA Fase 1 (leitura) + Fase 2 (propor lançamento com confirmação) | 9 |
| Dashboard financeiro por origem (guincho/locação/venda/manutenção/avulso) | 11 |
| Ficha 360° em todas as entidades, navegação sem beco, copiloto contextual | 12 |
| Dashboard hero: relógio giant, mapa Dourados-MS, mini-sparkline, KPIs clicáveis | 13 |
| Análises financeiras: faturamento por tipo/mês, custo por ativo (manutenção/combustível) | 13 |
| Mobile: bottom nav, bottom sheets, safe areas iOS, formulários responsivos | 13 |
| 17 categorias financeiras padrão criadas no arranque (idempotente) | 13 |

**Sprints anteriores em produção:** detalhes completos no [`CHANGELOG.md`](CHANGELOG.md).

### Continuar o desenvolvimento (nova sessão)

- **Branch único e fonte da verdade:** `claude/stoic-shannon-d3fxpi`. O workflow
  CI/CD dispara em push nesse branch. Desenvolva e dê push aqui. Os demais
  branches `claude/*` são obsoletos.

- **Último commit entregue:** `ad49aee` — Sprint 13 completa (25/jun/2026).
  Ver topo do [`CHANGELOG.md`](CHANGELOG.md) para o detalhe completo.

- **Arquitetura:** leia os docs em ordem (`docs/01-visao-geral.md` → ...07).
  A regra máxima — *toda informação existe apenas uma vez* — vale para tudo.
  Nenhuma tabela nova sem decisão explícita registrada em `docs/decisoes.md`.

- **Operação/deploy:** runbook em [`docs/operacao-vps.md`](docs/operacao-vps.md) —
  VPS Hostinger, SSH intermitente, recuperação do `.env`.

- **Próximas frentes sugeridas** (conforme apetite do dono do produto):
  - Sprint 13 (pendente): componente `<Abas>` unificado (URL-sync), sidebar em
    seções (Operação / Financeiro / Sistema), hub financeiro com abas internas —
    ver [`docs/sprint13-plan.md`](docs/sprint13-plan.md).
  - Copiloto Fase 3: ações de escrita guardrailadas (criar operação, fechar
    manutenção) com confirmação humana.
  - Estabilização SSH do VPS (mover para porta alta, ajustar fail2ban/firewall).
  - Verificação visual em navegador real (ambiente remoto sem browser — validar
    no `pnpm dev` local).

- **Notas técnicas para o próximo desenvolvedor:**
  - `paginacaoSchema` max: 200 (o kanban de manutenções usa `por_pagina=200`).
  - `garantirCategoriasPadrao()` é idempotente — adicionar novas categorias ao
    array em `apps/api/src/db/bootstrap.ts` é suficiente (sem migration).
  - O `filter` CSS do mapa OpenStreetMap está em `Dashboard.tsx:MapaDourados` —
    ajustar `hue-rotate` se quiser tons diferentes.
  - Novos endpoints financeiros: `GET /financeiro/por-tipo` e
    `GET /financeiro/custo-por-ativo` — gateados por `dashboard_financeiro:ler`.

> **Fluxo de trabalho:** o dono do produto tem acesso ao terminal do VPS
> (Hostinger) e topa rodar comandos colados quando o deploy automático falha.
> Ao entregar algo, **dê push no branch acima** e confirme o deploy; se o CI
> não publicar, forneça o comando manual pronto (ver runbook).
