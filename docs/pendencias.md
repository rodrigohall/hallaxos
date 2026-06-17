# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento. Última revisão: Sprint 9 — edição pós-lançamento,
> datas retroativas e correções (2026-06-16), conferida contra o código.

## Estado atual — o que está em produção

| Área | Estado |
|------|--------|
| Fundação (banco 25 tabelas, auth argon2id, permissões por papel, timeline imutável, busca global ⌘K) | ✅ Sprint 1 |
| Design system Hallax (tokens, componentes, dashboard centro de comando) | ✅ Sprint 1.5 |
| Deploy VPS em um comando + CI/CD por push (GitHub Actions) | ✅ |
| Clientes/Pessoas (CRUD, papéis automáticos, timeline, arquivamento protegido) | ✅ Sprint 1 |
| Ativos (núcleo + veicular, categorias, fotos/documentos, comentários, timeline agregada, FIPE, expectativa de lucro de venda) | ✅ Sprints 2 e 5 |
| Financeiro (lançamentos, parcelas até 60x, estorno, contas com saldo derivado, fluxo de caixa) | ✅ Sprint 3 |
| Relatórios (resultado/ROI por ativo, DRE mensal e por categoria) | ✅ Sprint 3 |
| Operações unificadas: Guincho · Locação · Venda · Compra (máquinas de estado, financeiro automático, CNH bloqueia ativação) | ✅ Sprints 4 e 5 |
| Anexos transversais (upload múltiplo, octet-stream/HEIC, foto principal, lightbox) | ✅ Sprints 2 e 5 |
| Manutenções (máquina de estados, custo, hodômetro) e Agenda (calendário derivado + compromissos) | ✅ Sprint 6 |
| Confiança: backup automático do Postgres, suíte de testes no CI, bloqueio progressivo de login, troca de senha própria | ✅ Sprint 7 |
| Notificações (sino + job de prazos), tags, favoritos, rate limiting (200 req/min por IP), auditoria de negações | ✅ Sprint 8 |

## Pendências em aberto (consolidado, conferido no código)

### Funcional
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| ~~Aba de Manutenções quebrada em produção~~ | ✅ Corrigido — `WHERE` cru qualificado por `m` na lista (bug latente do Sprint 6, `42P01`). Teste de integração + Postgres na CI | — |
| ~~Exclusão permanente de foto no lugar errado~~ | ✅ `DELETE /documentos/:id?permanente=true` (hard delete arquivo + linha) | — |
| ~~Lançamento lançado errado ainda contava no dashboard~~ | ✅ `POST /lancamentos/:id/anular` (admin) — `cancelado` sem contrapartida, preserva vínculo de origem (decisão 41) | — |
| ~~Manutenções sem API/UI~~ | ✅ Entregue no Sprint 6 (módulo completo com máquina de estados) | — |
| ~~Agenda (tela calendário)~~ | ✅ Entregue no Sprint 6 (calendário mensal derivado + compromissos manuais) | — |
| ~~Editar op/manutenção/financeiro depois de lançados~~ | ✅ Sprint 9 — lançamento gerado/pago editável com auditoria (pago só admin, decisão #48); `PATCH /operacoes/:id` (descritivos+datas, #49); manutenção editável fora de `agendada` (#50). Valor da operação ajusta-se pelo lançamento, sem recálculo automático | — |
| ~~Datas retroativas (op/manutenção/financeiro com data antiga)~~ | ✅ Sprint 9 — `data_inicio`/`data`/`data_conclusao`/`data_pagamento` opcionais; honra a data informada (#51) | — |
| ~~Manutenção "Iniciar" dava erro interno~~ | ✅ Sprint 9 — lia o registro dentro da transação aberta; agora lê após o commit (#52), com teste de integração | — |
| ~~Excluir foto não funcionava (iPhone sem botão; PC não refletia)~~ | ✅ Sprint 9 — controles da foto sempre visíveis (não só hover) + exclusão aguarda o refetch | — |
| ~~Edição dos lançamentos antes de finalizar (conta, forma, parcelas, vencimentos)~~ | ✅ Sprint 9 — bloco `financeiro` na transição + `previa-financeira`; persiste só ao confirmar | — |
| ~~"Usar endereço do cliente" no guincho~~ | ✅ Sprint 9 — atalho preenche origem/destino a partir do endereço da pessoa (texto, sem duplicar) | — |
| ~~Cadastro e busca de oficinas por nome~~ | ✅ Sprint 9 — papel `oficina` em `pessoas`, autocomplete `?papel=oficina` + cadastro inline | — |
| ~~Notificações: tabela existe, gatilhos não disparam, sem sino na UI~~ | ✅ Sprint 8 — service + job de prazos (devolução, vencimentos, CNH/documento, manutenção) + sino na UI | — |
| ~~Tags e favoritos: tabelas sem API/UI~~ | ✅ Sprint 8 — services, rotas e UI (estrela + chips de tags) na tela de ativo | — |
| Guard anti-duplicação (porta de entrada única para ativo/compra/lançamento) | Decisão #58 — substitui Sprint 5 "compra vincula ativo" | Sprint 10 Tab 2 |
| Autocomplete no formulário "novo lançamento" para vincular (UI) | Sprint 9 interconexão | Sprint 10 |
| Link do lançamento → origem na tela do Financeiro | Sprint 9 interconexão | Sprint 10 |

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

### Sprint 10 — Repaginação de UI e interligação 🚧 EM ANDAMENTO
