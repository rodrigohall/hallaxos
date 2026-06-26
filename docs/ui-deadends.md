# UI Dead-Ends — Backlog do Loop "Sem Becos"

> **O que é este arquivo:** a memória de um loop autônomo. Cada iteração do loop
> (uma instância nova do Claude, sem memória das anteriores) lê este arquivo,
> pega o **primeiro item não marcado** da fila, aplica a correção, valida
> (`pnpm --filter web build` + testes), faz commit e **marca o item como feito**
> aqui. Quando todos os itens estiverem marcados, o loop para.
>
> **Objetivo:** nenhum beco sem saída. Toda informação mostrada na tela que
> *representa outra entidade* (cliente, ativo, operação, manutenção) deve ser
> clicável e levar à ficha 360° dessa entidade — **reusando rotas existentes**.

## Regras invioláveis (todo iteração obedece)

1. **Reuse rotas existentes.** Destinos válidos já existem: `/clientes/:id`,
   `/ativos/:id`, `/operacoes/:id`, `/manutencoes/:id`. **Nenhuma rota, página
   ou tabela nova.** (Regra máxima do projeto: a informação existe uma só vez.)
2. **Um link significativo por item — nunca poluição de botões.** Se a tela já
   linka a entidade em outro lugar (ex.: no cabeçalho), tornar o texto repetido
   clicável também conta como remover o beco — mas avalie se vale; consistência > volume.
3. **Só linke se o destino existir.** Se a entidade não tem `id` disponível no
   dado (ex.: `fornecedor_nome` sem `fornecedor_id`), **NÃO invente backend** —
   marque o item como `[~]` (pulado) e escreva o porquê. Isso é progresso válido.
4. **Padrão visual:** copiar o estilo de link já usado no código —
   `className="hover:text-ouro"` para texto inline, ou o componente `<Link>`/`CardLink`.
   Referência de ouro: `apps/web/src/paginas/AtivoDetalhe.tsx` (7 links bem feitos).
5. **Gate de qualidade:** antes do commit, `pnpm --filter web build` deve passar.
   Rodar testes relevantes da API se a mudança tocar contrato. Se não passar e
   você não consegue consertar rápido, reverta o item e marque `[~]` com a razão.
6. **Commit por item** (ou por página): mensagem `fix(ui): <página> — <beco resolvido>`.
   Depois **edite este arquivo** marcando o item `[x]` com 1 linha do que foi feito.

## Definição de pronto

- **Por item:** o texto/linha que representa uma entidade vira link para a ficha
  dela; build passa; item marcado `[x]` (feito) ou `[~]` (pulado, com motivo).
- **Do loop:** todos os itens marcados `[x]` ou `[~]`. Aí o loop reporta e para.

## Legenda
`[ ]` pendente · `[x]` feito · `[~]` pulado (sem destino / fora de escopo)

---

## Fila (prioridade: alta → baixa)

### P1 — dados que pedem clique e têm destino claro

- [x] **D1 · Financeiro.tsx — tabela "Custo por ativo".** Nome do ativo agora
  linka para `/ativos/:id` (id já vinha em `row.ativo_id`). Import de `Link` add.

- [x] **D2 · Relatorios.tsx — "Resultado por ativo".** `LinhaAtivo` tem `id`;
  célula codigo+nome agora linka para `/ativos/:id`. Import de `Link` add.

- [x] **D3 · ManutencaoDetalhe.tsx — bloco de detalhes `<dl>`.** "Ativo:" no
  bloco de dados agora linka para `/ativos/:id` (consistente com o cabeçalho).

- [x] **D4 · OperacaoDetalhe.tsx — bloco de detalhes `<dl>`.** "Cliente:" no
  bloco de dados agora linka para `/clientes/:id` (consistente com o cabeçalho).

### P2 — páginas com zero navegação de saída

- [x] **D5 · Auditoria.tsx (0 links).** Cada evento traz `entidadeTipo`+
  `entidadeId`. O chip do tipo agora linka à ficha quando o tipo tem rota
  (pessoa→/clientes, ativo, operacao, manutencao); tipos sem ficha
  (lancamento/evento_agenda/documento) seguem como texto. Mapa `ROTA_ENTIDADE`.

- [~] **D6 · Relatorios.tsx — planilha pivot / DRE.** PULADO: as linhas do pivot
  são chaveadas por **rótulo (nome)**, não por id — a API emite `COALESCE(a.nome…)`.
  Linkar exigiria adivinhar id pelo nome (não confiável: "Sem ativo", homônimos)
  ou mudar o backend. Fora de escopo do loop (sem inventar campo no backend).

### P3 — varredura final de cobertura

- [ ] **D7 · Varredura geral.** Reler todas as páginas em
  `apps/web/src/paginas/` e qualquer entidade exibida (nome de cliente/ativo/
  operação/manutenção) que ainda seja texto morto **e tenha id no dado** vira
  link. Listar aqui sub-itens novos que encontrar antes de corrigir.
  Páginas já com boa cobertura: AtivoDetalhe, PessoaDetalhe, listas (Pessoas,
  Ativos, Operacoes, Manutencoes — linhas já são `<Link>`).

---

## Histórico (preenchido pelo loop)

<!-- cada iteração adiciona: AAAA-MM-DD · Dn · commit <hash> · 1 linha -->

- 2026-06-26 · D1–D4 · lote P1 · 4 becos resolvidos (Financeiro, Relatorios,
  ManutencaoDetalhe, OperacaoDetalhe) — entidades exibidas agora linkam à ficha;
  `pnpm --filter web build` verde.
- 2026-06-26 · D5 · Auditoria · chip de entidade vira link à ficha (tipos com
  rota); build verde.
- 2026-06-26 · D6 · Relatorios pivot · pulado [~] — rows por rótulo, sem id.
