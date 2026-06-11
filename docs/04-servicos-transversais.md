# 04 · Serviços Transversais

> Notificações, tags, favoritos, comentários, anexos, auditoria e busca global
> **não pertencem a nenhum módulo**. São serviços centrais do HallaxOS que
> funcionam para qualquer entidade — atual ou futura.

## 0. O padrão de referência transversal (exceção aprovada)

Algumas entidades precisam, por natureza, apontar para *qualquer* registro do
sistema. Para elas — e **somente** para elas — usamos referência polimórfica:

```
entidade_tipo  (enum referencia_entidade)  +  entidade_id (uuid)
```

**Enum único e compartilhado** `referencia_entidade`:
`pessoa` | `ativo` | `operacao` | `manutencao` | `lancamento` | `documento` | `usuario`

Quem pode usar este padrão (lista fechada — adicionar exige decisão de arquitetura):

| Tabela           | Por que é transversal                          |
| ---------------- | ---------------------------------------------- |
| `timeline`       | Tudo tem história                              |
| `documentos`     | Tudo pode ter anexos                           |
| `comentarios`    | Tudo pode ser comentado                        |
| `tags_vinculos`  | Tudo pode ser etiquetado                       |
| `favoritos`      | Tudo pode ser favoritado                       |
| `notificacoes`   | Notificações apontam para o registro de origem |
| `eventos_agenda` | Compromissos podem vincular qualquer registro  |
| `busca_indice`   | Índice derivado de busca global                |

**Como a integridade é garantida sem FK** (responsabilidade da camada de aplicação):

1. **Escrita**: todo INSERT com referência transversal valida a existência do
   registro alvo **dentro da mesma transação** (`SELECT ... FOR KEY SHARE`).
   Isso é centralizado em um único helper (`refTransversal.validar()`) — não
   reimplementado por chamador.
2. **Exclusão**: como o núcleo usa soft delete, o alvo nunca desaparece — a
   referência continua resolvível para sempre. Hard delete não existe nas
   entidades referenciáveis (invariante).
3. **Verificação contínua**: job periódico de consistência varre referências
   órfãs e alerta (deve encontrar sempre zero; é um detector de bug, não uma
   rotina de limpeza).

---

## 1. Comentários internos

Conversa da equipe sobre qualquer registro ("cliente avisou que vai atrasar a
devolução"). Separado da timeline porque comentário tem ciclo de vida próprio
(editar, apagar), e a timeline é imutável. O texto vive **uma vez** aqui; a
timeline registra apenas o evento `comentario_adicionado` referenciando o id.

### `comentarios`

| Campo                       | Tipo        | Notas                                  |
| --------------------------- | ----------- | -------------------------------------- |
| id                          | uuid PK     |                                        |
| entidade_tipo / entidade_id | ref transversal |                                    |
| usuario_id                  | FK usuarios | Autor                                  |
| texto                       | text        |                                        |
| mencoes                     | uuid[]      | Usuários mencionados (@) → notificação |
| editado_em                  | timestamptz NULL | Marca visual "editado"            |
| timestamps + deleted_at     |             | Soft delete: "comentário removido"     |

---

## 2. Tags

Etiquetas livres para classificação flexível, sem inflar o schema com colunas
booleanas ("VIP", "Inadimplente", "Frota Norte", "Revisar contrato").

### `tags`

| Campo | Tipo        | Notas                          |
| ----- | ----------- | ------------------------------ |
| id    | uuid PK     |                                |
| nome  | text UNIQUE | Normalizado (case-insensitive) |
| cor   | text        | Hex, para a UI                 |
| timestamps + deleted_at | |                              |

### `tags_vinculos`

| Campo                       | Tipo            | Notas                       |
| --------------------------- | --------------- | --------------------------- |
| tag_id                      | FK tags         | PK composto com a referência |
| entidade_tipo / entidade_id | ref transversal |                             |
| usuario_id                  | FK usuarios     | Quem etiquetou              |
| created_at                  |                 |                             |

> Tags são compartilhadas (toda a equipe vê as mesmas); favoritos são pessoais.

---

## 3. Favoritos

Acesso rápido pessoal: cada usuário fixa os registros com que trabalha todo dia.

### `favoritos`

| Campo                       | Tipo            | Notas                              |
| --------------------------- | --------------- | ---------------------------------- |
| usuario_id                  | FK usuarios     | PK composto com a referência       |
| entidade_tipo / entidade_id | ref transversal |                                    |
| created_at                  |                 |                                    |

Sem soft delete: desfavoritar apaga a linha — é preferência, não história.

---

## 4. Notificações

Notificação é o **registro de entrega de um fato a um usuário** — por isso é
materializada sem violar a regra máxima: o fato vive na origem; a notificação
guarda apenas "este usuário precisa saber disso" e se ele já viu.

### `notificacoes`

| Campo                       | Tipo            | Notas                                   |
| --------------------------- | --------------- | --------------------------------------- |
| id                          | uuid PK         |                                         |
| usuario_id                  | FK usuarios     | Destinatário                            |
| tipo                        | enum            | ver tabela abaixo                       |
| titulo                      | text            | "Devolução do Corolla atrasada há 2 dias" |
| entidade_tipo / entidade_id | ref transversal | Clique leva direto ao registro          |
| lida_em                     | timestamptz NULL |                                        |
| created_at                  |                 | Imutável — sem updated_at além de `lida_em` |

### Tipos e gatilhos

| Tipo                   | Gatilho                                            | Quem recebe              |
| ---------------------- | -------------------------------------------------- | ------------------------ |
| `devolucao_atrasada`   | Locação ativa com devolução prevista vencida       | Responsável + gestores   |
| `lancamento_vencido`   | Lançamento previsto com vencimento vencido         | Papel financeiro         |
| `cnh_vencendo`         | `pessoas.cnh_validade` a ≤30 dias                  | Gestores                 |
| `documento_vencendo`   | `documentos.data_validade` a ≤30 dias (CRLV, seguro) | Gestores              |
| `manutencao_agendada`  | `manutencoes.data_agendada` amanhã                 | Responsável              |
| `operacao_atribuida`   | Usuário definido como responsável                  | O responsável            |
| `mencao`               | @ em comentário                                    | O mencionado             |
| `guincho_solicitado`   | Nova operação de guincho criada                    | Operadores + motorista   |

Gatilhos de evento disparam na transação da ação; gatilhos de prazo rodam em
job agendado (idempotente: nunca duplica notificação do mesmo fato no mesmo dia).
Canais: in-app agora; e-mail/WhatsApp depois (a tabela já serve de fila).

---

## 5. Anexos — já existe: `documentos`

Anexos **são** a tabela `documentos` (doc 02, §6). Nenhuma estrutura nova.
O serviço transversal define apenas o contrato de upload (validação de mime e
tamanho, storage em disco/S3 com path imutável, antivírus futuro) e o evento
`documento_anexado` na timeline da entidade-alvo.

## 6. Auditoria — já existe: `timeline`

Auditoria **é** a timeline (doc 02, §9): todo `atualizado` carrega o diff
estruturado em `dados`, todo evento tem autor e instante, e a tabela é
imutável por permissão de banco. O serviço transversal acrescenta apenas:

- **Eventos de acesso**: `login`, `logout`, `login_falhou` registrados na
  timeline do próprio `usuario` (por isso `usuario` está no enum transversal).
- **Visão de auditoria**: consulta da timeline filtrada por usuário, período e
  entidade — é uma *tela*, não uma tabela.

> Cliente, Ativo, Operação, Manutenção, Documento — e portanto Contrato
> (documento do tipo `contrato`), Reserva (locação em `reservada`), Compra,
> Venda e Locação (tipos de operação) — geram eventos automaticamente porque
> a gravação na timeline acontece na camada de serviço do núcleo, não em cada
> módulo. Timeline é cidadão de primeira classe por construção.

---

## 7. Busca global

Uma caixa de busca única que encontra **qualquer coisa**: placa, telefone,
CPF/CNPJ, nome, código de operação, descrição de lançamento, nome de arquivo.

### Estratégia: índice derivado dentro do próprio Postgres

Sem Elasticsearch — seria um segundo sistema para operar, sincronizar e ver
divergir. Postgres com `pg_trgm` + `unaccent` + `tsvector` cobre as
necessidades com folga nesta escala.

### `busca_indice`

Tabela **derivada e reconstruível** (é cache de busca, não fonte de verdade —
pode ser zerada e repovoada a qualquer momento; por isso não viola a regra máxima).

| Campo                       | Tipo            | Notas                                        |
| --------------------------- | --------------- | -------------------------------------------- |
| entidade_tipo / entidade_id | ref transversal | PK composto                                  |
| titulo                      | text            | O que aparece no resultado ("Corolla Prata — AT-0017") |
| subtitulo                   | text            | Contexto ("Ativo · disponível · 45.230 km")  |
| termos                      | text            | Concatenação normalizada: sem acento, minúsculo |
| termos_numericos            | text            | Só dígitos: CPF, CNPJ, telefone, placa, renavam — busca "119" acha o telefone |
| tsv                         | tsvector        | Índice GIN para texto                        |
| atualizado_em               | timestamptz     |                                              |

- Índices: GIN em `tsv`, GIN `gin_trgm_ops` em `termos` (typo-tolerante) e em `termos_numericos`.
- **Atualização síncrona** na mesma transação da escrita (helper único no
  service de cada entidade) + comando de reindexação completa.
- A consulta normaliza a entrada do usuário do mesmo jeito (dígitos → busca
  numérica; texto → trigram + tsquery) e devolve resultados agrupados por tipo.
- Respeita permissões: quem não vê financeiro não encontra lançamentos.

> **Base para IA**: o mesmo índice resolve a etapa de *grounding* do copiloto
> futuro — "o Civic" → `ativo_id` — antes de gerar a consulta SQL sobre o
> modelo relacional.
