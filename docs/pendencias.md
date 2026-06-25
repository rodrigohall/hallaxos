# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento. Última revisão: Sprint 13 — Dashboard/Mobile/Análises
> Financeiras — 2026-06-25, conferida contra o código.

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
| Copiloto de IA Fase 1 (leitura) + Fase 2 (propor lançamento com confirmação) | ✅ Sprint 9 |
| Dashboard financeiro por origem (guincho/locação/venda/manutenção/avulso), drill-down | ✅ Sprint 11 |
| Ficha 360° em todas as entidades, navegação sem beco, copiloto contextual, pagamento em lote | ✅ Sprint 12 |
| Dashboard hero (relógio giant, mapa Dourados-MS, mini-sparkline, KPIs clicáveis) | ✅ Sprint 13 |
| Análises financeiras: faturamento por tipo/mês e custo por ativo (manutenção/combustível) | ✅ Sprint 13 |
| Mobile-first: bottom nav, bottom sheets, safe areas iOS, grids responsivos | ✅ Sprint 13 |
| 17 categorias financeiras padrão no arranque (idempotente, sem migration) | ✅ Sprint 13 |
| Auto-vincular lançamentos avulsos a operações/manutenções (dry_run + confirmação) | ✅ Sprint 13 |

## Pendências em aberto

### Funcional
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| Componente `<Abas>` unificado com URL-sync | Sprint 13 planejado — dois estilos convivendo (sublinhado em Ativos × pílula em Relatórios), deep-link quebrado em Relatórios | Próximo sprint |
| Sidebar em seções (Operação / Financeiro / Sistema) | Sprint 13 planejado — 11 itens planos sem hierarquia, "Dashboard" e "Dashboard $" colados | Próximo sprint |
| Hub financeiro com abas internas (`/financeiro?aba=lancamentos\|painel\|planilha`) | Sprint 13 planejado — três destinos de topo para "ver dinheiro" que o usuário precisa memorizar | Próximo sprint |
| Copiloto Fase 3: ações de escrita guardrailadas (criar operação, fechar manutenção) | Fase 1 (leitura) + Fase 2 (propor lançamento) entregues | Sprint futuro |
| Verificação visual em navegador real | Ambiente remoto sem browser; validar no `pnpm dev` local | Contínuo |

### Segurança e confiabilidade
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| Deploy intermitente: SSH do VPS com timeout na :22 | Mitigado no Sprint 9 — retry 4× + runbook. **Ação no VPS** (recomendada, ainda não aplicada): mover SSH p/ porta alta + `VPS_PORT` no CI + afrouxar fail2ban (ver `docs/operacao-vps.md §1`) | VPS |

### Técnico (dívida pequena)
| Pendência | Contexto | Plano |
|-----------|----------|-------|
| Seed cria guinchos no estilo antigo | Novos indexam certo; `busca:reindexar` resolve | Sprint futuro |
| Instalar `react-leaflet` para mapa com marcadores custom | Bash classifier bloqueou instalação nos dois tries; mapa atual usa iframe OSM com filter CSS | Sprint futuro |

## Roadmap — próximos sprints sugeridos

### Sprint 13 (frentes restantes do plano) — próximo

Ver [`docs/sprint13-plan.md`](sprint13-plan.md) para especificação completa.

**Frente A — Componente `<Abas>` unificado**
Um só estilo (sublinhado), URL como fonte da verdade (`?aba=`), lazy preservado.
Nasce do `Ativos.tsx` que já tem 90% da lógica.

**Frente B — Sidebar em seções**
`OPERAÇÃO · FINANCEIRO · SISTEMA`. Seção sem itens visíveis não renderiza.
"Dashboard $" e "Relatórios" saem da sidebar (absorvidos pelo hub financeiro).

**Frente C — Hub financeiro com abas internas**
`/financeiro?aba=lancamentos|painel|planilha|por-ativo|dre`.
Redirects de `/dashboard-financeiro` e `/relatorios` preservam bookmarks.

**Frente D — Melhorias de densidade**
Atalhos de teclado (`g a` → Ativos, `g f` → Financeiro, `/` foca busca),
persistir filtros por sessão (`sessionStorage`), contadores nas abas.

### Sprint 14 e além

- Copiloto Fase 3: escrever com confirmação humana (criar operação, fechar manutenção).
- Mapa com Leaflet + marcadores gold (quando o Bash classifier liberar o `pnpm add`).
- Estabilização SSH do VPS (mover para porta alta, afrouxar fail2ban).
- Notificações push (PWA ServiceWorker) para guinchos iniciados fora do horário.
