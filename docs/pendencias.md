# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento. Última revisão: Sprint 10 — UI repaginada
> (Dashboard, Ativos, Operações, Manutenções) — 2026-06-18, conferida contra o código.

## Estado atual — o que está em produção

| Área | Estado |
|------|--------|
| Fundação (banco 25 tabelas, auth argon2id, permissões por papel, timeline imutável, busca global ⌘K) | ✅ Sprint 1 |
| Design system Hallax (tokens, componentes, dashboard centro de comando) | ✅ Sprint 1.5 |
| Deploy VPS em um comando + CI/CD por push (GitHub Actions) | ✅ |
| Clientes/Pessoas (CRUD, papéis automáticos, timeline, arquivamento protegido) | ✅ Sprint 1 |
| Ativos (núcleo + veicular, categorias, fotos/documentos, comentários, timeline agregada, FIPE, expectativa de lucro de venda, diária base, relatório patrimônio) | ✅ Sprints 2, 5, 10 |
| Financeiro (lançamentos, parcelas até 60x, estorno, contas com saldo derivado, fluxo de caixa) | ✅ Sprint 3 |
| Relatórios (resultado/ROI por ativo, DRE mensal e por categoria, patrimônio) | ✅ Sprints 3, 10 |
| Operações unificadas: Guincho · Locação · Venda · Compra (máquinas de estado, financeiro automático, CNH bloqueia ativação, CEP, auto-fill, desconto, retroativo) | ✅ Sprints 4, 5, 10 |
| Anexos transversais (upload múltiplo, octet-stream/HEIC, foto principal, lightbox) | ✅ Sprints 2 e 5 |
| Manutenções (máquina de estados, custo, hodômetro, kanban 3 colunas, contadores de dias, campo peças) e Agenda (calendário derivado + compromissos) | ✅ Sprints 6, 10 |
| Dashboard (relógio ao vivo, seletor de período, split em 2 endpoints, frota navegável, aluguéis em andamento) | ✅ Sprint 10 |
| Confiança: backup automático do Postgres, suíte de testes no CI, bloqueio progressivo de login, troca de senha própria | ✅ Sprint 7 |
| Notificações (sino + job de prazos), tags, favoritos, rate limiting (200 req/min por IP), auditoria de negações | ✅ Sprint 8 |
| Copiloto de IA Fase 1 (leitura guardrailada) + Fase 2 (propor lançamento com confirmação) | ✅ Sprint 9 |

## Pendências em aberto (consolidado, conferido no código)

### Funcional
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| ~~Guard anti-duplicação (porta de entrada única para ativo/compra/lançamento)~~ | ✅ Sprint 10 — decisão #58 (mão única por porta de entrada) | — |
| ~~Dashboard com relógio e seletor de período~~ | ✅ Sprint 10 — `RelogioVivo`, `SeletorPeriodo`, split em 2 endpoints (decisão #60) | — |
| ~~Ativos com diária base e relatório patrimônio~~ | ✅ Sprint 10 — `valor_diaria_base`, lucro presumido (decisão #59), `RelatorioPatrimonio` | — |
| ~~Operações com CEP, auto-fill, desconto e retroativo~~ | ✅ Sprint 10 — ViaCEP, auto-fill locação (diária+caução), desconto R$/%, toggle retroativo | — |
| ~~Manutenções em kanban com contadores de dias e campo peças~~ | ✅ Sprint 10 — kanban 3 colunas, `diasDesde`/`diasAte`/`Contador`, migration 0007, field `pecas` | — |
| ~~paginacaoSchema max 100 → 200~~ | ✅ Sprint 10 — kanban precisa de `por_pagina=200` | — |
| Funcionalidades novas (a pedir) | — | Próximo sprint |

### Segurança e confiabilidade
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| ~~Testes automatizados~~ | ✅ Sprint 7 — suíte `node:test` (permissões, schemas, transições, formato) rodando no CI antes do deploy | — |
| ~~Backup automático do Postgres~~ | ✅ Sprint 7 — sidecar `backup` com dump diário e retenção | — |
| ~~Bloqueio progressivo de login~~ | ✅ Sprint 7 — 5 falhas/15 min bloqueiam (429) | — |
| ~~Troca de senha do próprio usuário~~ | ✅ Sprint 7 — endpoint + modal; encerra outras sessões | — |
| ~~Rate limiting global~~ | ✅ Sprint 8 — `@fastify/rate-limit`, 200 req/min por IP em toda a API | — |
| ~~Auditoria de negações de acesso (doc 05 §4.3)~~ | ✅ Sprint 8 — todo 403 emite `req.log.warn` com usuário/papel/recurso/ação/URL | — |
| ~~CORS de produção restritivo~~ | ✅ Sprint 9 — `@fastify/cors` fechado por padrão (`origin:false`), liberável por `CORS_ORIGINS` (decisão #57) | — |
| Deploy intermitente: SSH do VPS deu timeout na :22 | ✅ Mitigado no Sprint 9 — retry 4× no passo do instalador (além do rsync) + runbook com diagnóstico/correção fail2ban+firewall. **Ação no VPS** (recomendada, ainda não aplicada): mover SSH p/ porta alta + `VPS_PORT` no CI + afrouxar fail2ban (ver operacao-vps §1) | VPS |

### Técnico (dívida pequena)
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| ~~Helpers de financeiro em `guincho.ts`~~ | ✅ Extraídos para `origemFinanceira.ts` no Sprint 6 | — |
| ~~Objeto único de `operacao_ativos` no banco~~ | ✅ Sprint 9 — **trigger** `trg_operacao_ativo_objeto_unico` (migration 0005); índice parcial não serve (condição cruza com `operacoes.status`, decisão #56) | — |
| ~~Job detector de referências órfãs (doc 04 §0)~~ | ✅ Sprint 9 — `integridade.ts` roda 1×/dia, alerta no log (deve achar zero) | — |
| Seed cria guinchos no estilo antigo | Novos indexam certo; `busca:reindexar` resolve | Sprint 7 |
| Verificação visual em navegador real | Ambiente remoto sem browser; validar no `pnpm dev` local | Contínuo |

## Roadmap proposto

### Sprint 6 — Operação do dia a dia (Manutenções + Agenda) ✅ ENTREGUE
Módulo de Manutenções completo (máquina de estados, custo, hodômetro) e Agenda
(calendário mensal derivado + compromissos manuais). Helpers financeiros
extraídos para módulo comum. Falta apenas o refino de Operações (edição com
recálculo, índice parcial) — movido para o Sprint 7.

### Sprint 7 — Confiança ✅ ENTREGUE (segurança, testes, backup)
Backup automático do Postgres, suíte de testes com porta de qualidade no CI,
bloqueio progressivo de login e troca de senha própria. **Notificações** foram
movidas para o Sprint 8 (com tags/favoritos e rate limiting global).

### Sprint 8 — Notificações, tags e rate limiting ✅ ENTREGUE
**Notificações** que disparam de verdade (devolução atrasada, vencimentos,
CNH/documento vencendo, manutenção agendada) + sino na UI; **tags** e
**favoritos** com API e UI; **rate limiting** global (200 req/min por IP) e
**auditoria de negações** de acesso em todo 403. (Testes, backup e
endurecimento de login foram antecipados no Sprint 7.)

### Sprint 9 — IA e automações ✅ ENTREGUE
Copiloto de IA (leitura + proposta de lançamento), interconexão dos módulos
(lançamento vincula operação/manutenção/ativo, ROI agregado), edição
pós-lançamento com auditoria, datas retroativas, correções de uso real (manutenção
iniciar, foto excluir, endereço do cliente no guincho, cadastro de oficinas) e
estabilização do deploy (CORS restritivo, trigger de objeto único, job de
referências órfãs, retry no instalador).

### Sprint 10 — Repaginação de UI e interligação ✅ ENTREGUE

Dashboard com relógio ao vivo, seletor de período (hoje/semana/mês/ano/últimos 30d),
split em dois endpoints (operacional + financeiro). Ativos com guard anti-duplicação,
diária base, lucro presumido e relatório de patrimônio. Operações com filtro por tipo
em botões grandes, CEP com autocomplete (ViaCEP), auto-fill de diária/caução, desconto
R$/%, toggle retroativo. Manutenções em kanban 3 colunas com contadores de dias e
campo peças. 60 testes verdes. Deploy confirmado (run `27735492174`, `success`).

### Sprint 11 — Agenda estendida e Dashboard Financeiro por Origem ✅ ENTREGUE

Nenhuma migração nova. Agenda repaginada com filtro por tipo (CTE), seletor de período
(semana/mês/trimestre/semestre), itens clicáveis com link para origem e criação de
evento + lançamento em transação atômica. Nova rota `/dashboard-financeiro` com linha
de contas (localStorage), linha de origens (guincho/locação/venda/compra/manutenção/avulso)
com indicador selecionável, drill-down e linkar lançamento → ativo via `PATCH /lancamentos/:id`.
Novo endpoint `GET /dashboard/financeiro/por-origem`. 5 testes de integração (sprint11.test.ts).
