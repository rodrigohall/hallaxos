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
1. ~~**Camada de copiloto (backend)**~~ ✅ entregue — `POST /copiloto/perguntar`
   orquestra o Claude com ferramentas de **leitura** sobre os serviços existentes
   (busca, dashboard, operações, relatórios), cada uma revalidando o papel
   (decisão #45). Sem dados próprios; reusa o núcleo. **Desligado** até
   `IA_API_KEY` (responde 503; sem custo). Degradação graciosa + rate limit próprio.
2. ~~**UI**: pergunta no ⌘K / painel lateral~~ ✅ entregue — painel lateral
   (Drawer) com fontes clicáveis (link para a tela real) + entrada no ⌘K (`⌘↵`).
3. ~~**Ligar a IA**~~ ✅ a `IA_API_KEY` é injetada no `.env` do VPS pelo deploy a
   partir do secret do GitHub Actions (`instalar.sh` upsert + `deploy.yml`,
   decisão #54). Definir o secret e dar push liga o copiloto; vazio = desligado
   (503, sem custo). Modelo `claude-haiku-4-5` confirmado válido/atual.
4. **Interconexão dos módulos (em andamento)**: ✅ lançamento avulso vincula a
   operação/manutenção/ativo (`POST /lancamentos`); ✅ `lancamentos.ativo_id`
   (classificação que coexiste, decisão #53); ✅ resultado/ROI e histórico do
   ativo somam diretos + herdados; ✅ `GET /ativos/:id/lancamentos` + origem na
   tela. **Falta**: autocomplete no formulário "novo lançamento" para vincular
   (UI); link do lançamento → origem na tela do Financeiro.
5. **Copiloto que escreve (Fase 2)**: *proposta de ação* confirmada pelo humano,
   disparando os endpoints existentes (nunca escreve direto; máquina de estados e
   autoria intactas — decisão #43). 1º conjunto: **criar lançamento avulso
   previsto**. Ações destrutivas ficam de fora.
6. **Estabilizar o deploy**: resolver o timeout SSH intermitente do VPS
   (fail2ban/firewall) para voltar a ter atualização automática confiável.
