# Changelog

## Sprint 3 — Financeiro e Relatórios (2026-06-12)

- Lançamentos: listagem com filtros, criação avulsa com parcelamento (até 60x,
  vencimentos mensais, centavos ajustados na 1ª), edição restrita quando há
  origem, pagar, cancelar (só previstos) e estorno por contrapartida.
- Contas com saldo derivado e categorias financeiras (CRUD).
- Fluxo de caixa por período; relatórios: resultado/ROI por ativo e DRE
  mensal + por categoria.
- Telas Financeiro e Relatórios no design system; reindexação completa da
  busca (`busca:reindexar`); workflow de deploy com porta configurável
  (VPS_PORT) e diagnósticos claros.
- Verificado: parcelas, saldo derivado mudando ao pagar, estorno, guarda de
  cancelamento de pagos, relatório com ROI, bloqueio do operador, reindex.

## Deploy em produção (2026-06-11)

- Dockerfiles de API (migrations automáticas no arranque) e web (build
  estático servido pelo Caddy, HTTPS automático com domínio).
- `docker-compose.prod.yml` com Postgres persistente e reinício automático.
- `deploy/instalar.sh`: instalador idempotente para VPS — instala Docker se
  faltar, gera senhas fortes em `.env`, builda e sobe tudo, imprime o login.
- Bootstrap do administrador inicial por variáveis de ambiente no primeiro
  arranque (testado contra banco vazio, incluindo idempotência). Produção não
  recebe dados de demonstração.
- Instruções no README (§ Deploy em VPS).

## Sprint 1.5 — Design System oficial (2026-06-11)

A identidade Hallax entra no produto. Nenhuma funcionalidade nova — toda a
experiência refeita sobre a marca real.

### Adicionado

- **Marca extraída da arte oficial**: monograma vetorial extraído do PDF do
  cartão de visitas (path SVG fiel, 548 bytes), paleta dourado `#F3C625` +
  navy `#002044` lidas dos valores CMYK/RGB do arquivo, tipografia Montserrat
  (a fonte embutida na arte) + Inter. Favicon gerado do monograma.
- **Design tokens** (`styles.css @theme`): superfícies em escala navy,
  semânticas (ok/alerta/erro/info), tipografia, raios, sombras, animações com
  `prefers-reduced-motion`.
- **Biblioteca de componentes** (`componentes/ui/`): Botão (4 variantes +
  loading), Campo/Entrada/Seleção/ÁreaTexto, Card, KPI, Selo (mapa central
  status→cor), Chip, Lista/ListaLinha, Tabela, Modal, Drawer, Toasts,
  Skeleton, EstadoVazio, EstadoErro, Timeline e formatadores pt-BR.
- **Busca global como paleta de comando**: `⌘K`/`Ctrl+K` em qualquer tela,
  resultados agrupados por tipo com ícones e navegação por teclado.
- **Timeline visual** (assinatura do sistema): trilho com nós iconografados
  por tipo de evento, diff campo a campo, data/hora/responsável; a API passou
  a devolver o nome do autor de cada evento.
- **Dashboard centro de comando**: ordem fixa de leitura (atenção → KPIs do
  dia com lucro estimado → frota → operação → fluxo de caixa), skeletons e
  estados vazios por bloco.
- **Login como momento de marca**: monograma em marca d'água, como no verso
  do cartão de visitas.
- `docs/07-design-system.md` com todas as decisões visuais.

### Verificado

Typecheck e build de produção limpos; API + web servindo; timeline com autor
e dashboard testados via API real. Verificação visual em navegador não foi
possível neste ambiente (CDN de browser bloqueada) — validar no `pnpm dev`.

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
