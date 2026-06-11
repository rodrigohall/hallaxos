# 05 · Permissões e Autenticação

> Simples de entender, impossível de burlar: papéis fixos, verificação no
> backend, e o frontend apenas esconde o que o usuário não pode fazer.

## 1. Autenticação

- **Sessões opacas em banco** com cookie `httpOnly` + `Secure` + `SameSite=Lax`.
  Sem JWT: sessão em banco é revogável na hora, auditável e não tem segredo
  para vazar. Simplicidade e controle > moda.
- Senhas com **argon2id**. Bloqueio progressivo após tentativas falhas.
- `login`, `logout` e `login_falhou` vão para a timeline do usuário (doc 04 §6).

### `sessoes`

| Campo       | Tipo        | Notas                          |
| ----------- | ----------- | ------------------------------ |
| id          | uuid PK     | Valor do cookie (opaco)        |
| usuario_id  | FK usuarios |                                |
| expira_em   | timestamptz | Renovada a cada uso (sliding)  |
| ip / user_agent | text    | Auditoria de acesso            |
| created_at  |             |                                |

## 2. Papéis

Quatro papéis fixos. Sem permissões finas por campo na v1 (decisão registrada
no doc 01 §7) — granularidade cresce quando houver demanda real.

| Papel        | Quem é                  | Resumo                                                        |
| ------------ | ----------------------- | ------------------------------------------------------------- |
| `admin`      | Dono / direção          | Tudo, incluindo usuários, configurações e *overrides*         |
| `gestor`     | Gerência                | Toda a operação + todo o financeiro; não gerencia usuários    |
| `operador`   | Equipe de campo/balcão  | Conduz operações, cadastros e manutenções; não vê o financeiro |
| `financeiro` | Contas a pagar/receber  | Todo o financeiro; leitura da operação para contexto          |

## 3. Matriz de permissões

`C` criar · `R` ler · `U` editar · `D` arquivar/excluir · `T` transições de estado · `—` sem acesso

| Recurso                          | admin | gestor | operador | financeiro |
| -------------------------------- | ----- | ------ | -------- | ---------- |
| Pessoas                          | CRUD  | CRUD   | CRU      | R          |
| Ativos                           | CRUD  | CRUD   | RU¹      | R          |
| Operações (todos os tipos)       | CRUDT | CRUDT  | CRUT     | R          |
| Manutenções                      | CRUDT | CRUDT  | CRUT     | R          |
| Lançamentos                      | CRUDT | CRUDT  | —²       | CRUDT      |
| Contas e categorias financeiras  | CRUD  | CRUD   | —        | CRUD       |
| Dashboard — bloco operacional    | R     | R      | R        | R          |
| Dashboard — bloco financeiro     | R     | R      | —        | R          |
| Relatórios operacionais          | R     | R      | R        | R          |
| Relatórios financeiros           | R     | R      | —        | R          |
| Documentos / Comentários / Tags  | CRUD  | CRUD   | CRUD     | CRUD       |
| Favoritos / Notificações próprias| CRUD  | CRUD   | CRUD     | CRUD       |
| Agenda                           | CRUD  | CRUD   | CRUD     | R          |
| Timeline / Auditoria             | R     | R      | R³       | R³         |
| Busca global                     | R     | R      | R⁴       | R⁴         |
| Usuários                         | CRUD  | R      | —        | —          |
| Overrides (ex.: ativar locação com CNH vencida) | T | — | —  | —          |

1. Operador atualiza estado físico (km, localização) mas não cria/arquiva patrimônio.
2. Operador dispara lançamentos **indiretamente** ao conduzir operações — nunca os manipula.
3. Timeline visível exceto eventos de entidades financeiras.
4. Busca global filtra resultados pela mesma matriz (doc 04 §7).

## 4. Regras de aplicação

1. **Toda verificação acontece no backend**, por rota + ação, a partir de uma
   única definição declarativa em `packages/shared` (a matriz acima em código,
   escrita uma vez, usada pela API para autorizar e pela UI para esconder).
2. **O frontend nunca mostra o que o papel não pode fazer** — menos cliques,
   menos erro, telas mais limpas. Mas a segurança nunca depende disso.
3. **Negações relevantes são auditadas**: tentativa de acesso negado a recurso
   financeiro gera evento na timeline do usuário.
4. **Override é sempre explícito**: exige justificativa textual, que vai para a
   timeline da entidade afetada com o autor.
