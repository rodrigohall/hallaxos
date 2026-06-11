# Changelog

## Sprint 1 — Fundação executável (2026-06-11)

Primeira versão executável do HallaxOS: `pnpm dev` sobe banco, API e interface.

### Adicionado

- **Monorepo** pnpm: `apps/api` (Fastify + Drizzle), `apps/web` (React + Vite + Tailwind v4),
  `packages/shared` (enums, matriz de permissões e schemas Zod — fonte única usada pelos dois lados).
- **Banco completo** (migration `0001`): as 25 tabelas dos docs 02/04/05 com enums nativos,
  CHECKs do financeiro, trigger de imutabilidade da timeline, `updated_at` automático,
  códigos amigáveis (`AT-0001`/`OP-0001`) e índices de busca (pg_trgm + unaccent).
- **Autenticação**: login/logout/sessão com argon2id, sessões opacas em banco, cookie httpOnly,
  renovação deslizante, eventos `login`/`logout`/`login_falhou` na timeline do usuário.
- **Permissões**: matriz por papel aplicada na API (preHandler) e na UI (esconde o que não pode).
- **Timeline**: serviço central com validação de referência transversal, diffs estruturados
  em eventos `atualizado`, imutável por trigger no Postgres.
- **Busca global**: índice derivado (`busca_indice`) com busca textual tolerante a acentos e
  typos (`word_similarity`) e busca numérica por fragmento (CPF, telefone, placa).
- **Dashboard**: uma chamada com ativos por status, guinchos em andamento, agenda do dia
  (manual + derivada), locações atrasadas, alertas (CNH/documentos vencendo), receitas/despesas
  do dia, fluxo de caixa 7 dias e contas vencidas — bloco financeiro filtrado por papel.
- **Clientes**: CRUD completo com busca antes de cadastro, formulário em 3 etapas,
  detalhe com história completa (timeline), arquivamento protegido por vínculos.
- **Usuários** (admin): criação, edição, desativar/reativar (nunca excluir).
- **Seeds** idempotentes: 4 usuários (um por papel), pessoas, ativos (incluindo não-veiculares),
  locação ativa atrasada, reserva futura, guincho em execução, manutenção agendada e lançamentos.

### Verificado em execução

Login (sucesso/falha/sem sessão), CRUD de clientes com timeline e diff, CPF duplicado,
validações, busca global (placa, telefone, CPF formatado, typo "corola" → Corolla),
dashboard com e sem papel financeiro, bloqueio de permissões por papel, arquivamento
bloqueado com operação aberta, imutabilidade da timeline e CHECKs do financeiro no banco.
