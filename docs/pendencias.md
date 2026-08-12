# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento. Última revisão: Sprint 17 — Pró-labore —
> 2026-08-12, conferida contra o código.

## Estado atual — o que está em produção

| Área | Estado |
|------|--------|
| Fundação (banco 25 tabelas, auth argon2id, permissões por papel, timeline imutável, busca global ⌘K) | ✅ Sprint 1 |
| Design system Hallax (tokens, componentes, animações, PWA mobile) | ✅ Sprints 1.5, 13 |
| Deploy VPS em um comando + CI/CD por push (GitHub Actions) | ✅ |
| Clientes/Pessoas (CRUD, ficha 360°, KPIs, operações/lançamentos vinculados, timeline) | ✅ Sprints 1, 12 |
| Ativos (núcleo + veicular, categorias, fotos/documentos, FIPE, diária base, lucro presumido, relatório patrimônio) | ✅ Sprints 2, 5, 10 |
| Financeiro (lançamentos, parcelas até 60x, estorno, anulação, pagamento em lote, planilha pivot) | ✅ Sprints 3, 12 |
| Relatórios (resultado/ROI por ativo, DRE, planilha pivotável com drill-down e export CSV) | ✅ Sprints 3, 12 |
| Operações unificadas: Guincho · Locação · Venda · Compra (máquinas de estado, financeiro automático, CEP, auto-fill, desconto, retroativo) | ✅ Sprints 4, 5, 10 |
| Anexos transversais (upload múltiplo, octet-stream/HEIC, foto principal, lightbox) | ✅ Sprints 2, 5 |
| Manutenções (kanban 3 colunas, contadores de dias, campo peças) e Agenda (calendário derivado + filtro por tipo) | ✅ Sprints 6, 10, 11 |
| Confiança: backup automático do Postgres, suíte de testes no CI, bloqueio progressivo de login | ✅ Sprint 7 |
| Notificações (sino + job de prazos), tags, favoritos, rate limiting, auditoria de negações | ✅ Sprint 8 |
| Dashboard financeiro por origem (guincho/locação/venda/manutenção/avulso), drill-down | ✅ Sprint 11 |
| Ficha 360° em todas as entidades, navegação sem beco, copiloto contextual, pagamento em lote | ✅ Sprint 12 |
| Dashboard hero (relógio giant, mapa Dourados-MS, mini-sparkline, KPIs clicáveis) | ✅ Sprint 13 |
| Análises financeiras: faturamento por tipo/mês e custo por ativo (manutenção/combustível) | ✅ Sprint 13 |
| Mobile-first: bottom nav, bottom sheets, safe areas iOS, grids responsivos | ✅ Sprint 13 |
| 17 categorias financeiras padrão no arranque (idempotente, sem migration) | ✅ Sprint 13 |
| Auto-vincular lançamentos avulsos a operações/manutenções (dry_run + confirmação) | ✅ Sprint 13 |
| Repo organizado: `main` oficial, deploy no main, `estado.txt` público, `CLAUDE.md` | ✅ Sprint 14 |
| Locação/Guincho/Manutenções/Operação/Ativo: correções e atalhos do Sprint 14 | ✅ Sprint 14 |
| Repaginada visual: direção de arte "cockpit noturno", kit unificado, bugs visuais corrigidos | ✅ Sprint 15 |
| **Hub financeiro**: 5 abas em `/financeiro` (Lançamentos · Painel · Planilha · Por Ativo · DRE), aba na URL, redirects das rotas antigas | ✅ Sprint 16 |
| **Estado de tela na URL**: `useAbaUrl`/`useParamUrl`; aba e filtros sobrevivem a refresh, ao botão voltar e ao link compartilhado | ✅ Sprint 16 |
| **Sidebar em seções** (Operação/Financeiro/Sistema), navegação declarativa e rotas protegidas por permissão | ✅ Sprint 16 |
| **Atalhos de teclado** (`g`+letra, `/`, `?`, ⌘K num listener só) e trilha nas fichas de detalhe | ✅ Sprint 16 |
| **Copiloto Fase 3**: propor operação com confirmação humana no formulário oficial | ✅ Sprint 16 |
| **Tipos de manutenção**: renomear e desativar pela UI | ✅ Sprint 16 |
| **Busca**: manutenções indexadas + reindexação automática versionada no arranque | ✅ Sprint 16 |
| **Pró-labore**: 6ª aba do hub calcula o acordo salarial (fixo + 30% das vendas + 20% do excedente de guincho+locação), com memória de cálculo mês a mês e parâmetros editáveis em `meta_sistema` | ✅ Sprint 17 |

## Pendências em aberto

### Ação do Rodrigo (fora do alcance do ambiente remoto)

| Pendência | Contexto | Plano |
|-----------|----------|-------|
| **Destravar o SSH do VPS** (deploy dos Sprints 16 e 17 parado) | O deploy do `926a580` falhou nas duas execuções — 8 tentativas, todas com `kex_exchange_identification: read: Connection reset by peer`. **Não é o timeout que o runbook documentava**: a conexão morre em ~150ms, o que indica rejeição ativa no servidor (fail2ban/CrowdSec/`hosts.deny`/`MaxStartups`), não pacote descartado. Rodar `deploy/ssh-destravar.sh` pelo Console web e reexecutar o deploy | VPS · 1 min |
| **Estabilizar o SSH do VPS** (porta alta) | Correção definitiva, para o problema acima não voltar. O `deploy.yml` já lê `VPS_PORT`; o script `deploy/ssh-porta-alta.sh` empacota a mudança no servidor (idempotente, mantém a :22 até você confirmar a porta nova). Falta rodar no Console web da Hostinger, liberar a porta no firewall do painel e criar a variável `VPS_PORT` no GitHub. Runbook em `docs/operacao-vps.md §1` | VPS · ~10 min |
| **Apagar 10 branches órfãos no remoto** | Deleção segue bloqueada para sessões remotas (o proxy responde "Everything up-to-date" sem apagar). Todos com prefixo `claude/`: `admiring-meitner-9m9ks9`, `admiring-wright-03b5np`, `event-hall-operational-planning-3rtgki`, `hallaxos-dev-status-ohoo7m`, `hallaxos-dev-status-w0bskq`, `hallaxos-repo-sprint14-srh9ct`, `inspiring-goldberg-vzsjgd`, `stoic-shannon-d3fxpi`, `test-coverage-analysis-wby40m`, `zealous-mayer-iwls56` | GitHub · 2 min |
| Verificação visual em navegador real | Ambiente remoto sem browser; validar no `pnpm dev` local | Contínuo |

### Funcional

| Pendência | Contexto | Plano |
|-----------|----------|-------|
| Copiloto Fase 3 — demais ações de escrita | Propor operação entregue no Sprint 16. Ficaram fora, por escolha: concluir manutenção, agendar manutenção e baixar lançamento. Todas cabem no mesmo padrão (ferramenta `propor_*` + card de confirmação) | Sprint futuro |
| Despesa do ativo conta nas duas comissões | Um ativo que foi **locado e depois vendido** tem a manutenção descontada duas vezes: no lucro da locação (base dos 20%) e de novo no lucro da venda (base dos 30%), porque a venda olha a vida inteira do ativo. Desconta duas vezes **contra** o Rodrigo, nunca a favor. Resolver exigiria marcar quais despesas já foram comissionadas — decisão do Rodrigo se compensa | Sprint futuro |
| Pró-labore não gera lançamento | A aba calcula e mostra; pagar ainda é criar o lançamento na mão em Lançamentos. Um botão "gerar despesa de pró-labore do período" fecharia o ciclo, mas escrever dinheiro a partir de um relatório merece decisão à parte | Sprint futuro |
| Filtros por sessão nas telas restantes | Operações, Ativos e Manutenções já levam filtro na URL. Financeiro/Lançamentos ainda usa `useState` — de propósito: os params sem prefixo são contrato dos deep-links e mudá-los exige cuidado maior que o resto | Sprint futuro |

### Técnico (dívida pequena)

| Pendência | Contexto | Plano |
|-----------|----------|-------|
| `pnpm build` na raiz está quebrado | `apps/api` aponta para um `tsconfig.build.json` que nunca existiu no repo. **Não afeta produção nem o CI** (o `deploy.yml` roda `--filter @hallaxos/api typecheck` e `--filter @hallaxos/web build`), nem a imagem Docker, que roda por `tsx`. É só o script agregador que falha | Sprint futuro |
| Registro de tipo de manutenção fora da timeline | Criar/renomear/desativar tipo não gera evento — o tipo não é entidade referenciável. A auditoria indireta existe (a manutenção que usa o tipo registra o nome no evento) | Sprint futuro |
| Instalar `react-leaflet` para mapa com marcadores custom | Bloqueado duas vezes pelo ambiente; o `CLAUDE.md` orienta a não insistir. Mapas seguem em iframe OSM com filtro CSS | Congelado |
| Sem testes de frontend | Nenhum `*.test.*` em `apps/web`. O hub, os redirects e os atalhos não têm cobertura automatizada — por isso a lista de validação visual a cada sprint | Sprint futuro |

## Roadmap — próximos sprints sugeridos

Com as pendências do Sprint 13 finalmente zeradas, o que sobra é escolha de
rumo, não dívida:

- **Copiloto Fase 3 completa**: concluir manutenção e baixar lançamento, no
  mesmo padrão proposta → confirmação.
- **Notificações push (PWA ServiceWorker)** para guinchos iniciados fora do
  horário e devoluções atrasadas.
- **Testes de frontend** (Vitest + Testing Library) começando pelo hub
  financeiro e pelos redirects — o que mais quebraria em silêncio.
- **Mapa com Leaflet + marcadores gold**, se o ambiente liberar o `pnpm add`.
- **Tabela FIPE** (aba já existe marcada como "em breve" em Ativos).
