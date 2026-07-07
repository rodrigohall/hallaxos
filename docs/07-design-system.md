# 07 · Design System

> A identidade visual do HallaxOS nasce da marca Hallax — extraída diretamente
> da arte vetorial oficial (cartão de visitas), não interpretada. Dourado e
> navy profundo são inegociáveis. O resto existe para fazê-los brilhar.

## 1. Filosofia visual

Stripe, Linear, Notion e Raycast construindo um centro de comando operacional:
**escuro por padrão, mínimo, espaçoso, rápido**. O dourado da marca aparece
pouco — e por isso importa: ele marca a ação principal, o estado ativo e os
momentos de marca. Uma tela cheia de dourado não é premium; é poluída.

Direção de arte (Sprint 15) — **"cockpit noturno"**: profundidade em
camadas (fundo ambiente com brilhos radiais sutis + painéis com luz de cima +
superfícies flutuantes em vidro), **ouro como luz e não como tinta** (gradiente
no CTA, glow no hover, gradiente `texto-ouro-vivo` no número-herói) e
**movimento coreografado** (cascatas de entrada, skeleton com varredura de
luz, sublinhado de aba que cresce, lift de 1px em cards clicáveis).

Regras de ouro:

1. Cada tela responde uma pergunta (doc 01). O design reforça isso: uma
   hierarquia, um CTA dourado por contexto.
2. Nenhuma tela define cor, fonte, raio, sombra ou espaçamento próprio. Tudo
   vem dos tokens (`apps/web/src/styles.css`) e da biblioteca
   (`apps/web/src/componentes/ui/`).
3. Animações são discretas: 150–300 ms, easing suave, e respeitam
   `prefers-reduced-motion`.
4. Mobile first: listas tocáveis em vez de tabelas densas; tabelas só em
   relatórios.

## 2. Marca

- **Monograma**: vetor extraído do PDF oficial → `apps/web/src/marca/monograma.svg`
  e componente `<Monograma/>`. **Nunca redesenhar, distorcer ou recolorir fora
  da paleta** (dourado sobre navy, ou tom-sobre-tom como marca d'água).
- **Wordmark**: HALLAX em Montserrat Bold com tracking largo (0.18em), sufixo
  `OS` em dourado.
- Usos: sidebar (monograma + wordmark), login (momento de marca, com marca
  d'água do monograma como no verso do cartão), favicon.

## 3. Cor

### Paleta principal (da arte oficial)

| Token | Hex | Origem/Uso |
|---|---|---|
| `ouro` | `#F3C625` | Cor dominante do cartão. CTA, estado ativo, foco, destaques |
| `ouro-claro` | `#FFD95C` | Hover do CTA |
| `ouro-escuro` | `#C79F12` | Pressed |
| `navy` | `#002044` | Navy do cartão. Texto sobre dourado |

### Superfícies (escala navy, dark-first)

| Token | Hex | Uso |
|---|---|---|
| `fundo` | `#060C16` | Fundo da aplicação |
| `painel` | `#0B1422` | Cards, sidebar, modais |
| `elevado` | `#101B2E` | Hover, inputs de overlays, skeletons |
| `borda` | `#1B283D` | Bordas padrão e divisores |
| `borda-forte` | `#2B3C58` | Bordas em hover/foco secundário |

### Texto

`texto #E9EEF6` (principal) · `suave #93A1B8` (secundário) · `mudo #5C6B86` (terciário/rótulos)

### Semânticas

`ok #3DD68C` (sucesso/receita) · `alerta #FB923C` (aviso — laranja, para nunca competir com o dourado) · `erro #F0506E` (erro/despesa/atraso) · `info #4D9FFF` (estados neutros em andamento)

> Regra: dourado **não é** cor de aviso. Aviso é laranja. O dourado pertence à marca e à ação.

## 4. Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Display | **Montserrat** 600/700/800 (fonte da marca no cartão) | Títulos, wordmark, números de KPI, códigos (`OP-0001`) |
| UI | **Inter Variable** | Todo o resto (equivalente digital do Roboto do material impresso) |

- Números sempre tabulares (`font-feature-settings: "tnum"`) — valores alinham em colunas.
- Escala: 11px (meta/rótulos) · 12px (secundário) · 14px (corpo, padrão) · 18px (título de página) · 24px (KPI).
- Títulos de card: 12px, caps, tracking largo, cor `suave` — hierarquia sem peso.

## 5. Espaço, grid e forma

- **Espaçamento**: escala Tailwind base-4 (4/8/12/16/24/32). Padding padrão de card: 16px. Gap padrão de grid: 16px.
- **Grid**: conteúdo em `max-w-6xl` centralizado; dashboard em grid de 2/4 colunas conforme breakpoint.
- **Breakpoints**: `sm 640` · `md 768` (sidebar aparece) · `lg 1024` (grids de 4) · `xl 1280`.
- **Raio**: `sm 6px` (inputs, botões) · `md 10px` · `lg 14px` (cards) · `xl 20px` · `full` (selos/chips).
- **Sombras**: `painel` (sutil, repouso) · `flutuante` (modais/drawers/toasts) · `brilho-ouro` (reservada a momentos de marca).
- **Ícones**: Lucide, 16px no corpo, 14px em botões `sm`, stroke padrão. Nunca emoji na UI.

### Utilitários de superfície e movimento (styles.css)

| Utilitário | O que faz | Onde usar |
|---|---|---|
| `superficie` | Painel com luz de cima (gradiente 2.5% de branco) | Todo card/moldura — substitui `bg-painel` cru |
| `vidro` | Blur + saturação sobre painel translúcido | Topbar, bottom nav, modais, dropdowns, toasts |
| `elevar` | Lift de 1px + borda acesa no hover | Cards/KPIs clicáveis |
| `texto-ouro-vivo` | Gradiente dourado recortando o texto | Número-herói (relógio do dashboard) |
| `animar-cascata` | Filhos diretos entram escalonados (45ms/item) | Grades de KPI, listas, colunas de kanban |
| `animar-cintilar` | Skeleton com varredura de luz (substitui pulse) | Interno do `<Skeleton>` |
| `animar-riscar` | Sublinhado cresce da esquerda | Interno do `<Abas>` |

## 6. Biblioteca de componentes (`componentes/ui/`)

| Componente | Arquivo | Notas |
|---|---|---|
| `Botao` | Botao.tsx | `primario` (gradiente dourado + glow, 1 por contexto), `secundario`, `fantasma`, `perigo`, `link`; tamanhos `xs/sm/md`; press físico; estado `carregando` |
| `BotaoIcone` | Botao.tsx | Botão quadrado só-ícone com tons semânticos — fim dos icon-buttons crus |
| `VerMais` | Botao.tsx | Expansor "Ver mais/menos" com chevron rotativo — padrão das fichas |
| `Abas` | Abas.tsx | Aba de página única (sublinhado dourado animado); aceita ícone e selo |
| `Segmentado` | Abas.tsx | Toggle compacto 2-5 opções (período, R$/%, receita/despesa) — único estilo de pill permitido |
| `Caixa` | Caixa.tsx | Painel de destaque embutido, tons neutro/info/ok/alerta/erro/ouro (avisos, validação, banners) |
| `Campo` + `Entrada`/`Selecao`/`AreaTexto` | Campo.tsx | Rótulo, erro e dica padronizados; foco dourado; `tamanho="sm"` para barras de filtro; `color-scheme: dark` |
| `CampoMarcado` | Campo.tsx | Checkbox padronizado com rótulo clicável e dica |
| `Card` | Card.tsx | Título caps + ícone opcional + ação |
| `Kpi` | Card.tsx | Número display + rótulo + tom semântico; `para=` vira link com lift+chevron; `acao=` no cabeçalho |
| `Selo` | Selo.tsx | Mapa central status→cor; telas nunca escolhem cor de status |
| `Chip` | Selo.tsx | Selo interativo (filtros, etapas, tags removíveis) |
| `Lista`/`ListaLinha` | Tabela.tsx | Linhas tocáveis mobile-first com chevron |
| `Tabela` | Tabela.tsx | Densa, só para relatórios |
| `Modal`/`Drawer` | Sobreposicao.tsx | Backdrop blur, Escape fecha, animação de entrada |
| `useToast`/`ProvedorToast` | Toast.tsx | 4 tipos, auto-dismiss, canto inferior |
| `Skeleton`/`SkeletonLinhas` | Estados.tsx | Loading — nunca spinner em tela cheia |
| `EstadoVazio`/`EstadoErro` | Estados.tsx | Ícone + título + descrição + ação |
| `Timeline` | Timeline.tsx | Assinatura visual do sistema (§8) |
| `dinheiro`/`dataCurta`/`dataHora`/`horaCurta` | formato.ts | Formatação única pt-BR |

> **Não sobrescreva utilitários por `className`** (`p-0`, `h-8`, `w-auto`…):
> o vencedor é decidido pela ordem do stylesheet do Tailwind, não pela ordem no
> atributo — o override falha em silêncio. Se um componente do kit não cobre o
> caso, adicione uma prop ao componente (como `tamanho="sm"` em `Entrada`) ou
> crie a moldura própria com os utilitários canônicos.

## 7. Padrões de tela

- **Página de lista**: título + CTA à direita → busca → `Card` com `Lista` →
  skeleton em loading, `EstadoVazio` com ação quando vazio.
- **Página de detalhe**: cabeçalho com nome + selos + ações → grid com dados à
  esquerda e **timeline à direita** (ela merece a maior coluna).
- **Formulários**: etapas curtas em `Chip`, nunca uma parede de campos; erros
  por campo vindos direto da API; sucesso = toast + navegação.
- **Confirmações destrutivas**: sempre `Modal` explicando consequência (e que
  a história é preservada) — nunca `confirm()` nativo.

## 8. Timeline (assinatura visual)

Trilho vertical contínuo; cada evento é um nó com:
ícone por tipo (criação +, edição ✎, status ⇄, financeiro $, segurança ⚠) ·
cor semântica · resumo legível · diff campo a campo quando houver ·
tipo + data + hora + responsável em metadados discretos · link "ver detalhes"
quando o evento aponta para outra entidade.

## 9. Busca global (⌘K)

Paleta de comando estilo Raycast: acessível em qualquer tela pelo campo no
topo ou `⌘K`/`Ctrl+K`; resultados agrupados por tipo com ícone, navegação por
teclado (↑ ↓ Enter), e respostas em milissegundos. É a futura porta da IA — o
mesmo campo receberá perguntas em linguagem natural.

## 10. Dashboard (centro de comando)

Ordem fixa de leitura, do crítico ao contextual:

1. **Atenção agora** — pendências críticas (atrasos, vencidos, alertas), só aparece se existir.
2. **KPIs financeiros do dia** — receita, despesa, lucro estimado (dourado), a vencer em 7 dias.
3. **Frota/patrimônio** — ativos por status em um relance.
4. **Cards operacionais** — agenda do dia, guinchos em andamento, reservas futuras, próximas manutenções.
5. **Fluxo de caixa 7 dias** — barras receita×despesa.

Atualização automática a cada 30s. Cada bloco com skeleton e estado vazio próprios.
