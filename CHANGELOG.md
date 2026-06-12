# Changelog

## Sprint 6 — Operação do dia a dia: Manutenções e Agenda (2026-06-12)

A equipe passa a viver dentro do sistema: agendar manutenções e enxergar tudo
o que vence/acontece num calendário único.

### Manutenções (módulo completo)
- API + UI sobre a tabela `manutencoes` (já existente desde a 0001).
- **Máquina de estados** `agendada → em_andamento → concluida` (+ `cancelada`),
  em transação e na timeline (doc 03 §1):
  - **iniciar** coloca o ativo em `em_manutencao` (guarda: o ativo precisa estar
    disponível/uso interno — bloqueia se alugado/reservado);
  - **concluir** devolve o ativo a `disponível`, atualiza o `km_atual` do veículo
    e gera o **custo** como despesa prevista vinculada (parcelável);
  - **cancelar** libera o ativo se estava em manutenção.
- Fornecedor ganha papel `fornecedor` automaticamente.
- Telas: lista com filtro por estado, criação (busca de ativo/fornecedor) e
  detalhe com transições, custos, timeline, documentos e comentários.

### Agenda (calendário derivado)
- Tela de **calendário mensal** que deriva tudo das origens, sem copiar nada:
  devoluções de locação, manutenções agendadas, lançamentos a vencer, CNH e
  documentos vencendo — mais **compromissos manuais** (`eventos_agenda`, única
  fonte própria, doc 03 §2), que podem ser criados, concluídos e removidos.
- Cada item leva à sua origem (operação, manutenção, financeiro, cliente).

### Refino técnico
- Helpers de geração de lançamentos (`contaPadrao`, `categoriaPadrao`,
  `gerarLancamentosOrigem`) **extraídos para `origemFinanceira.ts`** e
  compartilhados entre operações e manutenções — fecha a dívida do Sprint 4.

### Verificado em execução
Manutenção criada → iniciada (ativo→em manutenção) → concluída (ativo→
disponível, km atualizado, custo R$ 850 em 2 parcelas); agenda do mês listando
8 itens derivados de origens distintas; operações seguem gerando lançamentos
após a extração dos helpers. Typecheck e build limpos.

## Sprint 5 — Operações unificadas: Locação, Venda, Compra (e Guincho) (2026-06-12)

O Guincho do Sprint 4 e os novos fluxos convergem para um **único módulo de
Operações** (`/operacoes`), fiel ao modelo "Operação como entidade unificada"
(doc 01 §2). Todos os tipos compartilham núcleo, timeline, financeiro e busca.
As tabelas são as mesmas da migration 0001 — **nenhuma migração nova, dados de
produção preservados**; os guinchos já cadastrados aparecem no novo módulo.

### Unificação
- Módulo **Operações** com criação por tipo (guincho · locação · venda ·
  compra) e máquina de estados por tipo (doc 03 §1), com transição em
  transação, efeito no ativo, geração/cancelamento de lançamentos e timeline.
- O módulo Guincho standalone do Sprint 4 foi **aposentado**: `/guinchos`
  redireciona para `/operacoes`; `services/guincho.ts` e as telas próprias
  saíram. O comportamento do guincho foi preservado dentro do módulo unificado.
- Menu passa a ter **Operações** no lugar de Guinchos.

### Novos fluxos
- **Locação**: orçamento → reservada (ativo→reservado) → ativa (→alugado,
  `km_saida`, **CNH vencida bloqueia**, admin sobrepõe com justificativa) →
  finalizada (→disponível, `km_retorno`, atualiza `km_atual`, receita = diária
  × dias). Atraso de devolução é derivado.
- **Venda**: negociação → fechada (receita) → concluída (ativo→vendido).
- **Compra**: negociação → fechada (despesa) → concluída (ativo no patrimônio,
  vinculado à origem).
- Cancelar libera ativos bloqueados e cancela previstos; pagos não somem.
- UI: lista com filtros (tipo, em aberto, atrasadas), criação em passos com
  busca de cliente/ativo, e página de operação com transições nomeadas,
  financeiro, ativos, documentos, comentários e história completa.

### Ativos — correções e melhorias pedidas
- **Anexos corrigidos**: upload de imagens e PDFs falhava quando o arquivo
  chegava como `application/octet-stream` (comum em celular). O formato agora é
  resolvido por MIME e, como fallback, pela extensão. Aceita GIF e HEIC/HEIF;
  limite 25 MB.
- **Quadro "Expectativa de lucro de venda"** no resultado do ativo:
  `FIPE × 0,95 − (custo de compra + custos acumulados)`.

### Verificado em execução
Módulo unificado lendo guinchos já existentes (dados do Sprint 4 intactos);
fluxos completos de locação, guincho, venda e compra (com parcelamento e
cancelamento); transições movendo ativo e km; lançamentos gerados/cancelados;
upload de PNG/PDF/HEIC como octet-stream → 201; expectativa de venda conferida.
Typecheck e build limpos.

## Sprint 4 — Guincho (2026-06-12)

Primeiro fluxo de operação completo sobre o núcleo: do acionamento à receita.

### Adicionado

- **Módulo Guincho** ponta a ponta sobre o núcleo `operacoes` + extensão
  `operacoes_guincho` (sem tabela própria — a regra máxima preservada).
- **Máquina de estados** no backend (doc 03): `solicitado → a_caminho →
  em_execucao → concluido`, com `cancelada` a partir de qualquer estado não
  terminal. O frontend só solicita transições; o estado é decidido na API,
  em transação.
- **Integração com o ativo recurso** (o caminhão): `a_caminho` o coloca em
  `em_uso_interno`; `concluido`/`cancelada` o devolvem a `disponivel`. Um
  caminhão só serve a um guincho aberto por vez (guarda na criação).
- **Geração automática de financeiro**: ao concluir, gera a receita do serviço
  (`valor_total − desconto`) como lançamento `previsto` vinculado à operação —
  categoria "Guincho" e conta padrão são garantidas (criadas na 1ª vez).
- **Hodômetro**: o km percorrido informado na conclusão soma ao `km_atual` do
  caminhão.
- **Papéis automáticos**: cliente vira `cliente`, motorista vira `motorista`.
- **Telas** no design system: lista com filtros por estado e busca, criação
  com *busca antes de cadastro* de cliente/motorista e seletor de caminhões
  disponíveis, e detalhe com trajeto, envolvidos, valor, timeline, financeiro
  gerado, documentos e comentários. Botões de transição contextuais ao estado.
- Guinchos entram na **busca global** e na **timeline agregada do ativo**;
  operações terminais saem do índice de busca.

### Verificado em execução

Fluxo completo (solicitar → despachar → executar → concluir) movendo o caminhão
entre estados e somando km; receita de R$ 450 gerada e visível ao financeiro
com origem protegida; cancelamento liberando o caminhão; guardas de transição
inválida e de caminhão já ocupado; bloqueio do papel financeiro para criar;
timeline agregada do ativo com os eventos do guincho; busca por cliente.

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
