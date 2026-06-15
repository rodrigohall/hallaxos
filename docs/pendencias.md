# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento. Última revisão: Sprint 9 em andamento (2026-06-15),
> conferida contra o código (não contra a memória).

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
| ~~Manutenções sem API/UI~~ | ✅ Entregue no Sprint 6 (módulo completo com máquina de estados) | — |
| ~~Agenda (tela calendário)~~ | ✅ Entregue no Sprint 6 (calendário mensal derivado + compromissos manuais) | — |
| Edição de operação (desconto, dias extras) recalculando lançamentos | Valor da locação fixado na finalização | Sprint 7 |
| ~~Notificações: tabela existe, gatilhos não disparam, sem sino na UI~~ | ✅ Sprint 8 — service + job de prazos (devolução, vencimentos, CNH/documento, manutenção) + sino na UI | — |
| ~~Tags e favoritos: tabelas sem API/UI~~ | ✅ Sprint 8 — services, rotas e UI (estrela + chips de tags) na tela de ativo | — |
| Compra vincula ativo existente em vez de criá-lo na conclusão | Decisão registrada no Sprint 5 | Se houver demanda |

### Segurança e confiabilidade
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| ~~Testes automatizados~~ | ✅ Sprint 7 — suíte `node:test` (permissões, schemas, transições, formato) rodando no CI antes do deploy | — |
| ~~Backup automático do Postgres~~ | ✅ Sprint 7 — sidecar `backup` com dump diário e retenção | — |
| ~~Bloqueio progressivo de login~~ | ✅ Sprint 7 — 5 falhas/15 min bloqueiam (429) | — |
| ~~Troca de senha do próprio usuário~~ | ✅ Sprint 7 — endpoint + modal; encerra outras sessões | — |
| ~~Rate limiting global~~ | ✅ Sprint 8 — `@fastify/rate-limit`, 200 req/min por IP em toda a API | — |
| ~~Auditoria de negações de acesso (doc 05 §4.3)~~ | ✅ Sprint 8 — todo 403 emite `req.log.warn` com usuário/papel/recurso/ação/URL | — |
| CORS de produção restritivo | Falta restringir origens em produção | Próxima |
| Deploy intermitente: SSH do VPS deu timeout na :22 em alguns momentos | Voltou a conectar após `systemctl enable ssh` (sobe no boot); últimos deploys passaram. Pode reincidir — suspeita de fail2ban/firewall do Hostinger | Sprint 9 — monitorar e estabilizar |

### Técnico (dívida pequena)
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| ~~Helpers de financeiro em `guincho.ts`~~ | ✅ Extraídos para `origemFinanceira.ts` no Sprint 6 | — |
| Índice parcial UNIQUE de `operacao_ativos` (objeto único não-terminal) | Validado no service; falta no banco (doc 03 §3) | Sprint 7 (migration) |
| Job detector de referências órfãs (doc 04 §0) | Estrutura pronta; job agendado não roda | Sprint 7 |
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

### Sprint 9 — IA e automações 🚧 EM ANDAMENTO
O destino do modelo (doc 01 §6): copiloto consumindo busca global, relatórios
e timeline — perguntas como "quanto lucro o Corolla deu em 2026?" respondidas
sobre os mesmos endpoints que as telas já usam.

Plano:
1. ~~**Camada de copiloto (backend)**~~ ✅ scaffold entregue — `POST /copiloto/perguntar`
   orquestra o Claude com a busca global como ferramenta (sem dados próprios; reusa
   o núcleo). **Desligado** até `IA_API_KEY` ser configurada (responde 503; sem custo).
   Permissões respeitadas: a busca já filtra pelo papel do usuário (doc 05).
2. **UI**: campo de pergunta no ⌘K / painel lateral, respondendo com citações
   das entidades de origem (link para a tela real). — próximo
3. **Estabilizar o deploy**: resolver o timeout SSH intermitente do VPS
   (fail2ban/firewall) para voltar a ter atualização automática confiável.
4. **Ligar a IA**: gerar a chave da Anthropic e defini-la como secret `IA_API_KEY`
   no servidor; ampliar ferramentas (relatórios, timeline) conforme a demanda.
