# HallaxOS

O cérebro operacional da Hallax.

HallaxOS não é um ERP. É um sistema único, com **uma base de dados centralizada**,
onde cada módulo é apenas uma forma diferente de visualizar e manipular os mesmos dados.

## Regra máxima

> Toda informação existe apenas uma vez.

Nunca duplicamos dados. Nunca criamos entidades redundantes. Tudo reutiliza o núcleo compartilhado.

## Módulos

| Módulo              | O que é, de verdade                                      |
| ------------------- | -------------------------------------------------------- |
| Guincho 24h         | Operações do tipo `guincho` sobre o núcleo compartilhado |
| Aluguel de Veículos | Operações do tipo `locacao`                              |
| Compra e Venda      | Operações dos tipos `compra` e `venda`                   |
| Financeiro          | Lançamentos — sempre com origem rastreável               |
| Dashboard Executivo | Consultas sobre o núcleo (não possui dados próprios)     |
| Agenda              | Eventos manuais + eventos derivados dos dados            |
| Relatórios          | Consultas sobre o núcleo (não possui dados próprios)     |

## Núcleo compartilhado

Pessoas · Ativos · Operações · Financeiro · Documentos · Manutenções · Usuários · Timeline

## Como rodar

Pré-requisitos: Node 22+, pnpm 10+ e Docker (para o Postgres).

```bash
pnpm install
pnpm dev        # sobe o banco, aplica migrations, semeia e inicia API (3333) + Web (5173)
```

Acesse http://localhost:5173 e entre com:

| Papel      | Login                  | Senha      |
| ---------- | ---------------------- | ---------- |
| admin      | admin@hallax.com       | hallax123  |
| gestor     | gestor@hallax.com      | hallax123  |
| operador   | operador@hallax.com    | hallax123  |
| financeiro | financeiro@hallax.com  | hallax123  |

Com Postgres próprio (sem Docker): copie `.env.example` para `.env`, ajuste `DATABASE_URL` e rode `pnpm dev`.

## Deploy em VPS (produção)

Em um VPS Ubuntu/Debian limpo, três comandos:

```bash
git clone -b claude/stoic-shannon-d3fxpi https://github.com/rodrigohall/hallaxos.git
cd hallaxos
./deploy/instalar.sh                       # acesso por IP (http)
# ou, com domínio apontado para o VPS (HTTPS automático):
DOMINIO=os.hallax.com ./deploy/instalar.sh
```

O instalador cuida de tudo: instala o Docker se faltar, gera senhas fortes em
`.env` (banco + admin), constrói as imagens, aplica as migrations e sobe
banco + API + site. Ao final, imprime o endereço e o login inicial.

- Atualizar versão: `git pull && ./deploy/instalar.sh`
- Logs: `docker compose -f docker-compose.prod.yml logs -f`
- Sem dados de demonstração em produção — o admin inicial vem do `.env`.

## Documentação

A arquitetura é definida **antes** do código. Leia em ordem:

1. [`docs/01-visao-geral.md`](docs/01-visao-geral.md) — princípios, diretrizes permanentes, decisões arquitetônicas e stack
2. [`docs/02-modelo-de-dados.md`](docs/02-modelo-de-dados.md) — todas as entidades, relacionamentos e o DER
3. [`docs/03-estados-e-regras-de-negocio.md`](docs/03-estados-e-regras-de-negocio.md) — máquinas de estado e regras
4. [`docs/04-servicos-transversais.md`](docs/04-servicos-transversais.md) — notificações, tags, favoritos, comentários, anexos, auditoria e busca global
5. [`docs/05-permissoes.md`](docs/05-permissoes.md) — autenticação, papéis e matriz de permissões
6. [`docs/06-api.md`](docs/06-api.md) — convenções e contrato completo da API
7. [`docs/07-design-system.md`](docs/07-design-system.md) — identidade, tokens e biblioteca de componentes

Documentos vivos, sincronizados a cada sprint: [`CHANGELOG.md`](CHANGELOG.md) ·
[`docs/decisoes.md`](docs/decisoes.md) · [`docs/pendencias.md`](docs/pendencias.md)

## Status do projeto

**Sprint 1 concluída** — sistema executável: login, permissões, clientes,
busca global, timeline e dashboard. Banco completo desde a primeira migration.
Próxima: Sprint 2 (Ativos · Operações · Timeline agregada · Documentos).
