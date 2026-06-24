# Sprint 13 — Coerência de navegação e densidade visual

> **Proposta, não executado.** Tema central: *"onde estou, para onde vou e por
> que há três jeitos diferentes de fazer a mesma coisa."* Zero tabela nova,
> zero migração. Tudo é UI, rota e consolidação do que já existe.

---

## Por que este sprint

O Sprint 12 fechou o mapa de interligação — toda ficha agora leva a toda outra.
Mas no caminho a **navegação cresceu sem governança**: a sidebar tem 11 itens
planos, há **dois estilos de aba** convivendo, e **três destinos financeiros**
de topo que o usuário não sabe distinguir.

### Sintoma 1 — sidebar achatada (11 itens, sem hierarquia)

```
Dashboard · Ativos · Operações · Manutenções · Agenda · Clientes
· Financeiro · Dashboard $ · Relatórios · Usuários · Auditoria
```

Onze itens no mesmo nível. "Dashboard" e "Dashboard $" colados. "Financeiro",
"Dashboard $" e "Relatórios" são **a mesma área mental** (dinheiro) espalhada em
três cliques de topo. Admin/gestor ainda ganham "Usuários" e "Auditoria" — itens
de *configuração*, não de *operação diária*, misturados no mesmo bloco.

### Sintoma 2 — dois estilos de aba, duas estratégias de estado

| Página | Estilo visual | Estado | Deep-link? |
|---|---|---|---|
| `Ativos` | sublinhado (`border-b-2 border-ouro`) | `?aba=` na URL | ✅ |
| `Relatorios` | pílula (`bg-ouro/15`) | só `useState` | ❌ |

Duas telas, duas implementações coladas à mão. Quem abrir uma aba de Relatórios
e mandar o link para um colega manda sempre a aba "Planilha" (default), nunca a
que estava vendo. O botão "voltar" do navegador não desfaz a troca de aba.

### Sintoma 3 — a área financeira está triplicada

- **Financeiro** = lista de lançamentos + ações (pagar, estornar…)
- **Dashboard $** = KPIs e fluxo de caixa
- **Relatórios** = Planilha pivô + ROI por ativo + DRE

São três telas de topo para "ver o dinheiro de ângulos diferentes". O usuário
precisa memorizar qual ângulo mora em qual item de menu.

---

## Mapa de aceitação

> **Done do Sprint 13:** todas as caixas abaixo viram ✅.

```
[ ] Existe UM componente <Abas> reutilizável no design system.
[ ] Toda aba do sistema sincroniza com a URL (?aba=) — deep-link + botão voltar.
[ ] Ativos e Relatorios usam o mesmo <Abas> (um só estilo visual).
[ ] A sidebar tem seções nomeadas (Operação / Financeiro / Sistema).
[ ] A área financeira tem UM destino de topo com abas internas.
[ ] Nenhuma regressão de permissão: cada aba respeita o `pode(...)` da área.
```

---

## Frente A — Componente `<Abas>` unificado (fundação)

Hoje cada página recria a barra de abas. Extrair para o design system
(`componentes/ui/Abas.tsx`), com URL-sync embutido via `useSearchParams`.

API proposta:

```tsx
interface AbaItem {
  id: string;
  rotulo: string;
  icone?: LucideIcon;
  selo?: string;          // "Em breve", contadores, etc.
  oculta?: boolean;       // esconde por permissão sem furar o índice
}

<Abas
  itens={ABAS}
  ativa={aba}
  aoMudar={setAba}        // já grava ?aba= e dá replace
  param="aba"             // nome do query param (default "aba")
/>
```

- **Um estilo só.** Escolher o sublinhado do `Ativos` (mais sóbrio, ocupa menos
  altura que a pílula) e aposentar a pílula do `Relatorios`.
- **URL como fonte da verdade.** A aba inicial vem de `searchParams.get(param)`,
  com fallback para a primeira aba visível. Trocar de aba faz
  `setSearchParams(..., { replace: true })` — não polui o histórico com cada
  clique, mas mantém o estado linkável.
- **Lazy preservado.** O padrão `enabled: aba === "x"` das queries continua
  funcionando — `<Abas>` só controla qual id está ativo.

**Toque:** `Ativos.tsx` já tem 90% disso (URL-sync + lazy). A extração nasce
dele; `Relatorios.tsx` passa a consumir o componente e ganha deep-link de graça.

---

## Frente B — Sidebar em seções

Agrupar os 11 itens em três blocos com rótulo discreto (uppercase, `text-mudo`,
`text-[10px] tracking-wider`), na ordem do uso diário:

```
OPERAÇÃO
  Dashboard · Ativos · Operações · Manutenções · Agenda · Clientes

FINANCEIRO
  Financeiro   (← hub único, ver Frente C)

SISTEMA               (só admin/gestor)
  Usuários · Auditoria
```

- Cada seção é uma lista filtrada pelo mesmo `pode(...)` que já existe; uma
  seção sem itens visíveis simplesmente não renderiza o cabeçalho.
- "Dashboard $" e "Relatórios" saem da sidebar (absorvidos pelo hub financeiro).
- Implementação: `navegacao` deixa de ser um array plano e vira
  `{ secao: string; itens: ItemNav[] }[]`. O `<Item>` não muda.

---

## Frente C — Hub financeiro com abas internas

Consolidar as três telas de dinheiro sob `/financeiro`, com abas:

```
/financeiro?aba=lancamentos   → tela atual de lançamentos (default)
/financeiro?aba=painel        → Dashboard $ (KPIs + fluxo de caixa)
/financeiro?aba=relatorios    → Planilha / ROI / DRE  (sub-abas? ver nota)
```

- Reusa o `<Abas>` da Frente A — coerência total com o resto do app.
- As rotas antigas `/dashboard-financeiro` e `/relatorios` redirecionam para a
  aba certa (`<Navigate to="/financeiro?aba=painel" replace />`), como já se fez
  com `/guinchos` no Sprint 5. Ninguém perde um bookmark.
- **Nota sobre aninhamento:** Relatórios já tem 3 abas próprias (Planilha/ROI/
  DRE). Abas dentro de abas é ruído. Duas saídas:
  1. **Achatar:** o hub financeiro tem as abas
     `Lançamentos · Painel · Planilha · Por Ativo · DRE` (5 no mesmo nível).
  2. **Manter Relatórios como uma aba que abre sub-navegação própria.**
  Recomendo **(1)** — menos hierarquia, tudo a um clique. Decisão a confirmar
  com o usuário antes de executar.

---

## Frente D — Melhorias de densidade e atalho (independentes)

Pequenas, alto retorno, sem depender de A–C:

- **D1 · Atalhos de teclado.** `g` + letra para navegar (`g a` → Ativos,
  `g f` → Financeiro), `/` foca a busca global. A busca global já existe; só
  falta o atalho.
- **D2 · Persistir filtros por sessão.** Os chips de status em `Ativos`,
  `Financeiro`, `Manutencoes` resetam ao sair e voltar. Guardar em
  `sessionStorage` (ou na URL, coerente com a Frente A).
- **D3 · Breadcrumb nas fichas de detalhe.** `Ativos / KAB-1234` no topo de
  `AtivoDetalhe`, clicável. Hoje só dá para voltar pelo botão do navegador.
- **D4 · Contadores nas abas.** `<Abas>` aceita `selo` — usar para mostrar
  nº de lançamentos vencidos na aba Financeiro, devoluções atrasadas, etc.
  Os números já vêm do dashboard; é só plumbing.
- **D5 · Estado vazio com CTA em toda parte.** O Sprint 12 começou
  (`EstadoVazio acao=`). Auditar as telas restantes (Operações, Manutenções,
  Clientes) e garantir que todo vazio ofereça a próxima ação.

---

## Ordem sugerida

1. **Frente A** (fundação — desbloqueia B, C, D4).
2. **Frente C** (maior ganho percebido; depende de A).
3. **Frente B** (cosmético, mas some o ruído dos itens duplicados).
4. **Frente D** conforme tempo — cada item é independente.

## Riscos / decisões em aberto

- **Achatar vs. aninhar abas de relatório** (Frente C, nota) — decisão do
  usuário antes de codar.
- **Redirects de rota antiga** precisam cobrir links externos/bookmarks; manter
  por pelo menos um sprint antes de remover.
- **Permissão por aba**: hoje a permissão protege a *rota*. Ao virar aba, a
  proteção migra para `oculta:` + guarda no conteúdo da aba (defesa em
  profundidade — não confiar só no esconder).
