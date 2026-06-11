# 01 · Visão Geral da Arquitetura

> Este documento define **como** o HallaxOS é construído e **por quê**.
> Toda decisão aqui foi tomada pensando em um software que deve durar décadas.

## 1. Princípios inegociáveis

1. **Uma única fonte de verdade.** Um banco de dados PostgreSQL centralizado.
   Nenhum dado existe em dois lugares. Módulos não possuem dados próprios —
   possuem apenas *visões* sobre o núcleo compartilhado.
2. **Nada importante se perde.** Toda ação relevante gera evento na timeline.
   Registros com histórico nunca são apagados fisicamente (soft delete).
   A timeline é *append-only*: nunca é editada nem apagada.
3. **Todo dinheiro tem origem.** Nenhum lançamento financeiro relevante nasce
   solto: ele aponta para a operação ou manutenção que o gerou. Lançamentos
   avulsos existem, mas são a exceção explícita, não a regra.
4. **Simplicidade vence funcionalidade.** Na dúvida entre A (mais features) e
   B (mais simples), escolhemos B. Sempre.
5. **Preparado para IA desde o dia 1.** O modelo relacional bem normalizado,
   com origem rastreável e timeline completa, é exatamente o que permite
   responder "quanto lucro tivemos com o Corolla em 2026?" sem retrabalho.

## 2. A grande sacada: Operação como entidade unificada

Guincho, locação, compra e venda **não são sistemas diferentes**. São todos a
mesma coisa: *uma operação entre a Hallax e uma pessoa, envolvendo ativos e
gerando movimentação financeira*.

```
operacoes (núcleo: cliente, status, valores, datas, responsável)
   ├── operacoes_guincho       (extensão 1:1 — só campos de guincho)
   ├── operacoes_locacao       (extensão 1:1 — só campos de locação)
   └── operacoes_compra_venda  (extensão 1:1 — só campos de compra/venda)
```

Esse padrão (**núcleo + extensão por tipo**) é o coração da arquitetura:

- O Financeiro, a Timeline, os Documentos, a Agenda e os Relatórios se
  conectam **uma vez só** a `operacoes` — e automaticamente funcionam para
  todos os módulos, inclusive módulos futuros.
- Criar um novo módulo de negócio no futuro = criar uma nova tabela de
  extensão. Zero mudança no financeiro, na timeline ou nos relatórios.
- Evita o anti-padrão de uma tabela gigante cheia de colunas nulas, e o
  anti-padrão oposto de N tabelas desconexas que duplicam cliente/valor/status.

O mesmo padrão se aplica a **Ativos**: `ativos` é o núcleo (qualquer
patrimônio — mesa, empilhadeira, cama elástica) e `ativos_veiculos` é a
extensão 1:1 com os campos que só fazem sentido para veículos (placa,
renavam, km...).

E a **Pessoas**: não existe tabela de "clientes" separada de "fornecedores".
Existe `pessoas`, e papéis (`cliente`, `fornecedor`, `motorista`...) são
atribuições. O mecânico que conserta os carros e um dia aluga um veículo é
**um único cadastro** — com histórico completo unificado.

## 3. Stack tecnológica

| Camada       | Escolha                                      | Por quê                                                                                                     |
| ------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Banco        | **PostgreSQL 16**                            | Relacional, maduro, FKs e constraints de verdade, JSONB para a timeline, decades-proof. É a fundação de tudo. |
| Backend      | **Node.js + TypeScript + Fastify**           | Leve, rápido, sem mágica. Monólito modular — simples de operar, simples de raciocinar.                       |
| Acesso a dados | **Drizzle ORM + migrations SQL versionadas** | Schema definido em código, migrations explícitas e auditáveis. O SQL nunca fica escondido.                   |
| Validação    | **Zod** (compartilhado front/back)           | Cada regra de validação escrita **uma vez** e usada nos dois lados — a regra máxima aplicada até nos tipos.  |
| Frontend     | **React + Vite + TypeScript + Tailwind CSS** | Mobile-first, dark por padrão, componentes reutilizáveis, build rápido.                                      |
| Estado/HTTP  | **TanStack Query**                           | Cache e sincronização de dados do servidor sem estado duplicado no cliente.                                  |
| Estrutura    | **Monorepo (pnpm workspaces)**               | `apps/api`, `apps/web`, `packages/shared` — tipos e validações vivem uma vez só.                             |

**Decisão consciente: monólito modular, não microsserviços.** Para uma
operação do porte da Hallax, microsserviços trariam complexidade operacional
sem nenhum benefício. Um monólito bem modularizado sobre um banco único é
mais simples, mais confiável e mais barato — e os módulos internos bem
separados permitem extração futura *se um dia* for necessário.

```
hallaxos/
├── apps/
│   ├── api/          # Fastify — rotas finas, regras de negócio em services
│   └── web/          # React PWA — mobile first, dark por padrão
├── packages/
│   └── shared/       # Tipos, schemas Zod, enums, constantes — fonte única
└── docs/             # Esta documentação
```

## 4. Camadas do backend

```
rota (HTTP)  →  service (regra de negócio)  →  repositório (SQL)  →  PostgreSQL
                      │
                      ├── timeline (toda mutação relevante registra evento)
                      └── financeiro (operações geram lançamentos, nunca o contrário)
```

- **Rotas são finas**: validam entrada (Zod), chamam o service, devolvem resposta.
- **Services concentram as regras**: transições de estado, geração de
  lançamentos, gravação na timeline. Tudo dentro de **transações** — ou a
  operação inteira acontece, ou nada acontece.
- **Nenhuma regra de negócio no frontend.** O front guia o usuário; o back garante a consistência.

## 5. Convenções de banco

- IDs: `uuid` (v7 — ordenável por tempo) em todas as tabelas.
- Códigos amigáveis: humanos não falam UUID. Operações e ativos têm um
  `codigo` sequencial curto (ex.: `OP-0042`, `AT-0017`) para busca e conversa.
- `created_at` e `updated_at` em todas as tabelas; `deleted_at` (soft delete)
  em tudo que carrega histórico.
- Enums de status como tipos nativos do Postgres — estados inválidos são
  rejeitados pelo próprio banco.
- Valores monetários: `numeric(12,2)`. Nunca float.
- Constraints no banco (FK, UNIQUE, CHECK) — a integridade não depende de
  disciplina do código de aplicação.

## 6. Dashboard, Relatórios e IA

Dashboard e Relatórios **não possuem tabelas próprias**. São consultas (e
views materializadas quando necessário) sobre o núcleo. Isso garante que o
número exibido no dashboard é, por construção, o mesmo número do relatório e
o mesmo número do financeiro — porque é **o mesmo dado**.

A preparação para IA não é um módulo: é consequência do modelo. Com origem
rastreável (`lancamento → operacao → ativo → pessoa`) e timeline completa,
qualquer pergunta de negócio vira uma consulta SQL determinística que um LLM
consegue gerar com segurança sobre um schema bem documentado.

## 7. O que fica explicitamente para depois (e por quê)

- **Permissões finas por campo** — começamos com papéis simples (ver doc 03);
  granularidade extrema agora é complexidade sem demanda.
- **Multi-empresa / multi-filial** — o modelo não impede, mas não pagamos o
  custo antes de existir a necessidade.
- **App nativo** — a PWA mobile-first cobre o uso em campo (guincho) sem
  duplicar código.
- **Camada de IA conversacional** — entra depois que o núcleo estiver estável;
  o modelo já nasce pronto para ela.
