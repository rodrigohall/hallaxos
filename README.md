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
git clone https://github.com/rodrigohall/hallaxos.git
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

1. **Deploy automático (CI):** push no branch `main`
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

**Sprint 15 concluída — em produção (05/jul/2026).** Repaginada Visual completa:
direção de arte "cockpit noturno", kit `ui/` expandido (Abas, Segmentado, Caixa,
BotaoIcone, VerMais, CampoMarcado), todas as telas convergidas ao kit e bugs
visuais corrigidos — zero mudança de comportamento. Antes dela, o Sprint 14
entregou usabilidade e interligação (locação/guincho corrigidos, tipos de
manutenção customizáveis, cancelamento com estorno, período customizado).

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
| Usabilidade e interligação: locação/guincho corrigidos, tipos de manutenção customizáveis, retroativos, cancelar c/ estorno, período customizado, `main` oficial + `estado.txt` público | 14 |
| Repaginada Visual: direção de arte, kit unificado (Abas/Segmentado/Caixa/BotaoIcone/VerMais/CampoMarcado), fichas 360° simétricas, animações coreografadas | 15 |

**Sprints anteriores em produção:** detalhes completos no [`CHANGELOG.md`](CHANGELOG.md).

### Continuar o desenvolvimento (nova sessão)

- **Regras permanentes:** leia primeiro o [`CLAUDE.md`](CLAUDE.md) na raiz —
  branch, fluxo de sessão, regra máxima e pendências de infraestrutura.

- **Branch único e fonte da verdade: `main`.** O workflow CI/CD dispara em
  push no `main`. Branches de sessão nascem do `main`, são mergeados ao final
  e apagados. Todos os branches `claude/*` remanescentes são obsoletos.

- **O que está deployado:** consulte `http://2.25.200.8/estado.txt` (commit,
  data, sprint e últimos 15 commits) — **não confie no cache do GitHub** para
  saber o que está no ar. Último sprint entregue: **15 — Repaginada Visual**
  (05/jul/2026); detalhe no topo do [`CHANGELOG.md`](CHANGELOG.md).

- **Arquitetura:** leia os docs em ordem (`docs/01-visao-geral.md` → ...07).
  A regra máxima — *toda informação existe apenas uma vez* — vale para tudo.
  Nenhuma tabela nova sem decisão explícita registrada em `docs/decisoes.md`.
  Estado real do sistema e dívidas: [`docs/pendencias.md`](docs/pendencias.md).

- **Operação/deploy:** runbook em [`docs/operacao-vps.md`](docs/operacao-vps.md) —
  VPS Hostinger, SSH intermitente, recuperação do `.env`.

- **Próximas frentes sugeridas** (conforme apetite do dono do produto):
  - Navegação (restante do plano do Sprint 13): URL-sync das abas de
    Relatórios, sidebar em seções (Operação / Financeiro / Sistema), hub
    financeiro com abas internas — ver [`docs/sprint13-plan.md`](docs/sprint13-plan.md).
  - Copiloto Fase 3: ações de escrita guardrailadas (criar operação, fechar
    manutenção) com confirmação humana.
  - Estabilização SSH do VPS (mover para porta alta, ajustar fail2ban/firewall).
  - Ação única no VPS: `docker compose -f docker-compose.prod.yml exec api pnpm busca:reindexar`.
  - Verificação visual em navegador real (ambiente remoto sem browser — validar
    no `pnpm dev` local).

- **Notas técnicas para o próximo desenvolvedor:**
  - Visual: **tudo vem do kit** `apps/web/src/componentes/ui/` + utilitários de
    `styles.css` (doc 07). Não sobrescreva utilitários via `className`
    (`p-0`, `h-8`…) — o override falha em silêncio; variação vira prop
    (decisão #68). Pills/tabs só via `<Abas>`/`<Segmentado>` (decisão #67).
  - `paginacaoSchema` max: 200 (o kanban de manutenções usa `por_pagina=200`).
  - `garantirCategoriasPadrao()` e o bootstrap de `manutencao_tipos` são
    idempotentes — adicionar itens aos arrays em `apps/api/src/db/bootstrap.ts`
    é suficiente (sem migration).
  - O `filter` CSS do mapa OpenStreetMap está em `Dashboard.tsx:MapaDourados`
    (o mini-mapa do guincho usa o mesmo filtro em `OperacaoDetalhe.tsx`).
  - `react-leaflet` foi bloqueado 2× pelo ambiente remoto — mapas usam iframe
    OSM embed; não insista nessa dependência.

> **Fluxo de trabalho:** o dono do produto tem acesso ao terminal do VPS
> (Hostinger) e topa rodar comandos colados quando o deploy automático falha.
> Ao entregar algo, **mergeie no `main` e confirme o deploy** (valide com
> `curl http://2.25.200.8/estado.txt`); se o CI não publicar, forneça o
> comando manual pronto (ver runbook).
