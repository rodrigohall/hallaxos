# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento. Última revisão: fim do Sprint 5 (2026-06-12),
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

## Pendências em aberto (consolidado, conferido no código)

### Funcional
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| **Manutenções sem API/UI de criação** | Tabela e leitura no detalhe do ativo existem; não há como criar/transicionar pela interface | Sprint 6 |
| **Agenda** (tela calendário) | Todas as fontes derivadas existem (devoluções, manutenções, vencimentos, CNH, documentos); falta a tela | Sprint 6 |
| Edição de operação (desconto, dias extras) recalculando lançamentos | Valor da locação fixado na finalização | Sprint 6 |
| Notificações: tabela existe, gatilhos não disparam, sem sino na UI | Regras no doc 04 §4 | Sprint 7 |
| Tags e favoritos: tabelas sem API/UI | Schema desde a 0001 | Sprint 7 (com notificações) |
| Compra vincula ativo existente em vez de criá-lo na conclusão | Decisão registrada no Sprint 5 | Se houver demanda |

### Segurança e confiabilidade
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| **Testes automatizados: zero** | Toda verificação foi manual via API real | Sprint 7 — começar pelos services de transição e financeiro |
| **Backup automático do Postgres** | Volume persiste, mas sem rotina de dump | Sprint 7 — urgente com uso real |
| Rate limiting e CORS de produção | API sem proteção de volume | Sprint 7 |
| Bloqueio progressivo de login após falhas (doc 05 §1) | Falhas já vão para a timeline | Sprint 7 |
| Tela de troca de senha do próprio usuário | Hoje só o admin define senhas | Sprint 7 |
| Auditoria de negações de acesso (doc 05 §4.3) | 403 não gera evento | Sprint 7 |

### Técnico (dívida pequena)
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| Índice parcial UNIQUE de `operacao_ativos` (objeto único não-terminal) | Validado no service; falta no banco (doc 03 §3) | Sprint 6 (migration) |
| Job detector de referências órfãs (doc 04 §0) | Estrutura pronta; job agendado não roda | Sprint 7 |
| Seed cria guinchos no estilo antigo | Novos indexam certo; `busca:reindexar` resolve | Sprint 6 |
| Verificação visual em navegador real | Ambiente remoto sem browser; validar no `pnpm dev` local | Contínuo |

## Roadmap proposto

### Sprint 6 — Operação do dia a dia (Manutenções + Agenda)
O que falta para a equipe viver dentro do sistema:
1. **Manutenções completas**: criar/agendar pela UI (do ativo e de tela própria),
   máquina de estados `agendada → em_andamento → concluida` movendo o ativo
   para `em_manutencao` e de volta, custo via lançamentos vinculados,
   fornecedor ganha papel automático.
2. **Agenda** (componente Calendário do doc 07 §6): visão semana/mês com
   devoluções de locação, manutenções agendadas, lançamentos a vencer, CNH e
   documentos vencendo + compromissos manuais (`eventos_agenda`).
3. **Refinos de Operações**: edição com recálculo de lançamentos previstos,
   índice parcial UNIQUE no banco, seed atualizado.

### Sprint 7 — Confiança (segurança, testes, notificações)
Antes de intensificar o uso real:
1. **Testes automatizados** dos services críticos (transições de operação,
   geração/estorno financeiro, permissões) rodando no CI antes do deploy.
2. **Backup automático** do Postgres (dump diário + retenção no VPS).
3. **Endurecimento**: rate limiting, bloqueio progressivo de login, troca de
   senha própria, auditoria de negações.
4. **Notificações** que disparam de verdade (devolução atrasada, vencimentos,
   CNH/documento vencendo, guincho solicitado) + sino na UI; tags/favoritos.

### Sprint 8 — IA e automações
O destino do modelo (doc 01 §6): copiloto consumindo busca global, relatórios
e timeline — perguntas como "quanto lucro o Corolla deu em 2026?" respondidas
sobre os mesmos endpoints que as telas já usam.
