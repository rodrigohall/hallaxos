# 06 · Contrato da API

> REST sobre HTTPS, JSON, prefixo **`/api/v1`**. Rotas finas → services →
> transações (doc 01 §4). Toda rota valida entrada com schema Zod de
> `packages/shared` — o mesmo schema que o frontend usa no formulário.

## 1. Convenções

### Respostas

```jsonc
// Sucesso (item)            // Sucesso (lista)
{ "dados": { ... } }         { "dados": [ ... ], "meta": { "total": 124, "pagina": 1, "por_pagina": 25 } }

// Erro — códigos estáveis, mensagens em pt-BR prontas para exibir
{ "erro": { "codigo": "TRANSICAO_INVALIDA",
            "mensagem": "Este ativo está em manutenção e não pode ser reservado.",
            "detalhes": { "campo": "..." } } }
```

| HTTP | Uso                                                |
| ---- | -------------------------------------------------- |
| 200/201 | Sucesso / criado                                |
| 400  | `VALIDACAO` — entrada inválida (detalhes por campo) |
| 401  | `NAO_AUTENTICADO`                                  |
| 403  | `SEM_PERMISSAO`                                    |
| 404  | `NAO_ENCONTRADO`                                   |
| 409  | `TRANSICAO_INVALIDA`, `CONFLITO` (ex.: placa duplicada, ativo ocupado) |
| 422  | `REGRA_NEGOCIO` (ex.: CNH vencida sem override)    |

### Listas

- Paginação: `?pagina=1&por_pagina=25` (máx. 100). Timeline e notificações
  usam cursor (`?antes_de=<id>`) por serem fluxos infinitos.
- Ordenação: `?ordem=campo` / `?ordem=-campo`.
- Filtros declarados por recurso (abaixo). Busca textual local: `?busca=`.
- Soft-deletados nunca aparecem; `?incluir_arquivados=true` para quem pode.

### Mutações

- **Transições de estado são endpoints nomeados** (`POST .../ativar`), nunca
  `PATCH status` — cada transição tem payload e regras próprios, e a URL
  documenta a intenção.
- Toda mutação responde com o registro completo atualizado.
- Efeitos colaterais (timeline, lançamentos, notificações, busca_indice)
  acontecem na mesma transação — o cliente nunca os orquestra.

## 2. Endpoints

### Autenticação

```
POST   /auth/login                { email, senha }
POST   /auth/logout
GET    /auth/sessao               → usuário atual + permissões (a UI monta-se a partir daqui)
```

### Pessoas

```
GET    /pessoas                   ?busca ?papel ?cnh_vencendo
POST   /pessoas
GET    /pessoas/:id               → inclui papéis, tags, contadores (operações, pendências)
PATCH  /pessoas/:id
DELETE /pessoas/:id               → arquiva (soft delete; 409 se houver vínculos ativos)
GET    /pessoas/:id/timeline      cursor
GET    /pessoas/:id/operacoes
GET    /pessoas/:id/lancamentos   (papel financeiro)
```

### Ativos

```
GET    /ativos                    ?status ?categoria_id ?busca ?parado_ha_dias
POST   /ativos                    (com bloco `veiculo` se categoria veicular)
GET    /ativos/:id                → núcleo + extensão veicular + tags + resumo financeiro derivado
PATCH  /ativos/:id
DELETE /ativos/:id                → arquiva
POST   /ativos/:id/baixar         { motivo }            (terminal)
GET    /ativos/:id/timeline       cursor — inclui operações e manutenções agregadas
GET    /ativos/:id/operacoes
GET    /ativos/:id/manutencoes
GET    /ativos/:id/financeiro     → receitas, despesas, resultado, ROI (derivados)
GET    /ativos/categorias         | POST | PATCH /ativos/categorias/:id
```

### Operações

```
GET    /operacoes                 ?tipo ?status ?cliente_id ?ativo_id ?responsavel_id ?periodo
POST   /operacoes                 { tipo, cliente_id, extensão por tipo, ativos: [...] }
GET    /operacoes/:id             → núcleo + extensão + ativos + lançamentos vinculados
PATCH  /operacoes/:id             (campos editáveis conforme status)
GET    /operacoes/:id/timeline    cursor
```

Transições (validadas pela máquina de estados do doc 03):

```
Locação:   POST /operacoes/:id/reservar | /ativar {km_saida} | /finalizar {km_retorno, data} | /cancelar {motivo}
Guincho:   POST /operacoes/:id/despachar {motorista_id} | /iniciar | /concluir {km_percorrido} | /cancelar {motivo}
Compra/Venda: POST /operacoes/:id/fechar {parcelas?} | /concluir | /cancelar {motivo}
```

> Override (ex.: CNH vencida): mesmas rotas com `{ override: { justificativa } }` — só `admin` (doc 05).

### Manutenções

```
GET    /manutencoes               ?ativo_id ?status ?tipo ?periodo
POST   /manutencoes
GET    /manutencoes/:id           → inclui custo derivado dos lançamentos
PATCH  /manutencoes/:id
POST   /manutencoes/:id/iniciar | /concluir {km_no_momento?} | /cancelar {motivo}
```

### Financeiro

```
GET    /lancamentos               ?tipo ?status ?categoria_id ?conta_id ?pessoa_id ?periodo ?origem
POST   /lancamentos               (avulso; com `parcelas: n` gera o grupo de parcelas)
GET    /lancamentos/:id           → com cadeia de origem completa (operação → ativo → pessoa)
PATCH  /lancamentos/:id           (livre se avulso; restrito se gerado — doc 03 regra 5)
POST   /lancamentos/:id/pagar     { data_pagamento, conta_id, forma_pagamento }
POST   /lancamentos/:id/estornar  { motivo }   | POST /lancamentos/:id/cancelar { motivo }
GET    /contas                    → com saldo derivado        | POST | PATCH /contas/:id
GET    /categorias-financeiras    | POST | PATCH /categorias-financeiras/:id
GET    /financeiro/fluxo-caixa    ?periodo ?conta_id → realizado + previsto, por dia
```

### Serviços transversais

`:tipo/:id` = referência transversal (doc 04 §0) — os mesmos endpoints servem todas as entidades.

```
Documentos:    GET /documentos?entidade=:tipo/:id ?vencendo
               POST /documentos (multipart) | GET /documentos/:id/arquivo | PATCH | DELETE /documentos/:id
Comentários:   GET /comentarios?entidade=:tipo/:id · POST /comentarios · PATCH | DELETE /comentarios/:id (só autor)
Tags:          GET /tags · POST /tags · PATCH | DELETE /tags/:id
               POST | DELETE /tags/:id/vinculos { entidade_tipo, entidade_id }
Favoritos:     GET /favoritos · POST | DELETE /favoritos { entidade_tipo, entidade_id }
Notificações:  GET /notificacoes ?nao_lidas cursor · POST /notificacoes/:id/ler · POST /notificacoes/ler-todas
Timeline:      GET /timeline?entidade=:tipo/:id cursor
Auditoria:     GET /auditoria ?usuario_id ?entidade ?periodo cursor   (visão filtrada da timeline)
Busca global:  GET /busca?q=...  → resultados agrupados por tipo, filtrados por permissão
```

### Agenda

```
GET    /agenda                    ?de ?ate ?responsavel_id
                                  → eventos manuais + derivados (devoluções, manutenções,
                                    vencimentos, CNH/documentos) consultados das fontes — doc 03 §2
POST   /agenda                    (evento manual)
PATCH  /agenda/:id | POST /agenda/:id/concluir | DELETE /agenda/:id
```

### Dashboard

```
GET    /dashboard                 → um único payload com todos os blocos do dia:
                                    agenda_do_dia, ativos { disponiveis, alugados, em_manutencao },
                                    guinchos_em_andamento, receitas_dia, despesas_dia,
                                    fluxo_caixa_7d, pendencias, alertas, proximas_manutencoes,
                                    contas_vencidas, reservas_futuras
```

Uma chamada, uma tela. Blocos financeiros omitidos para quem não tem o papel
(doc 05). Tudo derivado do núcleo em tempo real — o dashboard não tem tabelas.

### Relatórios

```
GET    /relatorios/dre                    ?periodo ?agrupar_por=mes|categoria
GET    /relatorios/resultado-por-ativo    ?periodo  → receita, despesa, manutenção, resultado, ROI
GET    /relatorios/utilizacao-frota       ?periodo  → dias alugado/parado/manutenção por ativo
GET    /relatorios/clientes               ?periodo  → ranking por volume e receita
GET    /relatorios/manutencoes            ?periodo  → custo por ativo, por tipo, recorrência
GET    /relatorios/inadimplencia          → vencidos por pessoa, idade da dívida
```

> Cada relatório responde diretamente uma das perguntas da diretriz de IA
> ("qual ativo tem pior ROI?", "qual cliente mais alugou?"). O futuro copiloto
> consumirá **estes mesmos endpoints** — mais um motivo para não existir
> nenhum número que não venha do núcleo.

### Usuários (admin)

```
GET    /usuarios · POST /usuarios · GET | PATCH /usuarios/:id
POST   /usuarios/:id/desativar | /reativar      (nunca DELETE — autoria na timeline é eterna)
```

## 3. Versionamento e estabilidade

- `v1` no path. Mudanças **aditivas** (novos campos/endpoints) não quebram a
  versão; remoção ou mudança de significado exige `v2` — que esperamos nunca
  precisar criar.
- Todo enum trafega como string estável (`"em_manutencao"`), nunca número.
- O contrato vive em código em `packages/shared` (schemas Zod + tipos) — esta
  página descreve, o código garante.
