# Sprint 12 — Plano: Interligação e Facilidade de Uso

> Documento de **planejamento** (proposta, não executado). Tema central:
> *"abra qualquer coisa e entenda tudo, sem becos sem saída."*
> Princípio que atravessa todos os tickets: **zero dado novo** (regra máxima do
> doc 01) e **mão única** (guard #58). Quase tudo é consulta/UI sobre o núcleo
> que já existe — nenhuma migração nova prevista.

## Por que este sprint

O núcleo (Sprints 1–11) já conecta tudo no banco: `lancamento → operacao →
ativo → pessoa`, timeline, busca, agenda. Mas essa conexão **não aparece nem
flui** para o usuário de forma uniforme. As telas de detalhe são desiguais:
`AtivoDetalhe` (416 linhas) mostra tudo e cross-linka; `PessoaDetalhe` (157
linhas) mostra só dois contadores e a timeline. O cliente — centro comercial do
negócio — é hoje um beco sem saída.

## Mapa de interligação — estado atual vs. alvo

Matriz "de → para": estando na ficha da **linha**, consigo navegar para a
**coluna**?

| DE ↓ \ PARA → | Pessoa | Ativo | Operação | Manutenção | Lançamento | Agenda |
|---|---|---|---|---|---|---|
| **Pessoa**     | —              | ❌ | ❌ | n/a | ❌ | ❌ |
| **Ativo**      | ❌             | —  | ✅ | ✅  | ⚠️ | ❌ |
| **Operação**   | ✅             | ⚠️ | —  | n/a | ⚠️ | ❌ |
| **Manutenção** | n/a            | ✅ | ❌ | —   | ⚠️ | ❌ |
| **Dashboard**  | ❌             | ⚠️ | ❌ | ❌  | ❌ | ❌ |
| **Agenda**     | ✅             | ✅ | ✅ | ✅  | ✅ | — |

Legenda: ✅ navega · ⚠️ exibe mas não navega / sem ação · ❌ ausente · n/a não se aplica.

**Leitura:**
- A **Agenda já é o melhor hub** (Sprint 11 ligou os 6 tipos) — é o modelo.
- A **Pessoa é um beco sem saída** — linha quase toda vermelha. Maior prejuízo.
- **Operação/Manutenção "exibem mas não levam"** — ativos/lançamentos como texto morto.
- O **Dashboard vê o problema mas não leva até ele**.

> **Critério de done do Sprint 12:** toda célula desta matriz vira ✅
> bidirecional. Quando o mapa estiver todo verde, a interligação está completa.

---

## Frentes e tickets

### 🟦 Frente A — Ficha 360° de cada entidade

A maior alavanca de interligação: padronizar as telas de detalhe com a mesma
anatomia (Visão geral · Financeiro · Relacionados · Documentos · Comentários ·
Timeline), tomando `AtivoDetalhe` como referência.

| # | Ticket | Camada | Esforço |
|---|--------|--------|---------|
| A1 | `PessoaDetalhe`: histórico unificado (operações, financeiro do cliente, documentos, comentários, KPIs faturado/a receber/vencido). Estender `obterPessoa` (sem endpoint novo). | back leve + front | Médio |
| A2 | `OperacaoDetalhe`: ativos viram `<Link>` (hoje `<span>`); lançamentos ganham ação inline "Pagar" (`POST /lancamentos/:id/pagar`). | front | Baixo |
| A3 | `ManutencaoDetalhe`: mostrar operação de origem quando houver (`operacao_id`/`codigo` no `obterManutencao`), clicável. | back leve + front | Baixo |
| A4 | `AtivoDetalhe`: lançamento de origem `manutencao` ganha link p/ a manutenção; ação "Pagar" nos previstos. | front | Muito baixo |
| A5 | Padronizar "Ver mais N" colapsável + skeletons em todas as fichas (padrão do AtivoDetalhe). | front | Muito baixo |

### 🟩 Frente B — Navegação contextual

Cada ficha vira ponto de partida para as áreas adjacentes; eliminar becos.

| # | Ticket | Camada | Esforço |
|---|--------|--------|---------|
| B1 | CTAs cruzados nas fichas (respeitando mão única / guard #58): Pessoa→"Nova operação", Ativo→"Agendar manutenção"/"Lançar custo", Manutenção→"Ir para o ativo". | front | Baixo-médio |
| B2 | `OperacaoNova` aceita `?cliente_id=` e `?ativo_id=` na URL e pré-seleciona (suporte ao B1). | front | Muito baixo |
| B3 | `EstadoVazio` ganha prop `cta` (rótulo + rota/onClick) — estados vazios deixam de ser mensagem morta. | front | Muito baixo |
| B4 | Busca global ⌘K: agrupar resultados por `entidade_tipo` com cabeçalho de grupo (o back já devolve o tipo). | front | Muito baixo |

### 🟨 Frente C — Centro de controle do dia (Dashboard + Agenda + Notificações)

| # | Ticket | Camada | Esforço |
|---|--------|--------|---------|
| C1 | Dashboard "Atenção agora": alertas ganham `entidade_id`/`entidade_tipo` e viram deep-links + ações inline (devolução atrasada→registrar devolução; lançamento vencido→pagar; CNH→pessoa; manutenção amanhã→manutenção). | back leve + front | Médio |
| C2 | Agenda: filtro "Só os meus" (`responsavel_id` nas branches da UNION); ações inline (concluir compromisso, pagar lançamento vencido). | back leve + front | Baixo |
| C3 | Central de notificações: agrupar por tipo no sino + "Marcar todas como lidas". | front (+ endpoint trivial) | Baixo |

### 🟧 Frente D — Atrito diário

| # | Ticket | Camada | Esforço |
|---|--------|--------|---------|
| D1 | Copiloto contextual: botão "✦ Perguntar sobre este [ativo/cliente/operação]" nas fichas, abrindo o painel com prompt pré-preenchido (ativa feature existente). | front | Muito baixo |
| D2 | Pagamento em lote no Financeiro: `POST /lancamentos/pagar-lote { ids[] }` (loop transacional sobre `pagarLancamento`) + checkboxes na lista. | back + front | Médio |

### ⬜ Frente E — Clareza e confiança (transversal)

| # | Ticket | Esforço |
|---|--------|---------|
| E1 | Selo de origem visível em todo lançamento ("guincho"/"locação"/"direto"). | Muito baixo |
| E2 | Esconder itens sem permissão no menu (não mostrar desabilitado). | Muito baixo |
| E3 | Microcopy: dica "Retroativo" consistente em todo campo de data passada. | Muito baixo |

---

## Sequência recomendada

```
Semana 1:  A1 (PessoaDetalhe) + A2 (Operação cross-links) + B3 (CTAs em vazios)
Semana 2:  B1 (ações cruzadas) + B2 (query string nova op) + C1 (alertas deep-link)
Paralelo:  A4, A5, B4, E1, E2, E3 (quick wins independentes)
Sprint 13: C2, C3, D1, D2, A3
```

## Riscos e dependências

- **B1 depende de B2** (CTA "Nova operação" precisa que o formulário aceite a
  query string). Fazer B2 antes ou junto.
- **A2/A4 ações "Pagar"** reusam o modal de pagamento já existente no
  `Financeiro` — extrair para componente compartilhado evita duplicação.
- **C1** muda o shape do bloco `alertas` do `GET /dashboard` (acrescenta
  campos, não remove) — compatível com o front atual durante a transição.
- Nenhum ticket exige migração. Se algum exigir, **reavaliar** contra a regra
  máxima antes de prosseguir.

## Fora de escopo (consciente)

- Permissões finas por campo, multi-empresa, app nativo (doc 01 §7).
- Copiloto que escreve além do `propor_lancamento` (Fase 2 já entregue).
- Qualquer tabela/coluna nova — este sprint é interligação e UI sobre o núcleo.
