# Changelog

## Sprint 11 — Agenda estendida e Dashboard Financeiro por Origem (2026-06-23)

Nenhuma tabela nova, nenhuma migração. Toda a informação já existia no núcleo —
Sprint 11 expõe, filtra e agrega de formas novas.

### Agenda estendida (Tab 1)

- **Filtro por tipo**: chips de toggle (operações / manutenções / vencimentos /
  CNH / documentos / compromissos) filtram a lista e o calendário. Internamente
  a query UNION ALL foi encapsulada em CTE (`todos_eventos`) + `WHERE tipo = ANY($1)`
  — evita duplicar o predicado em cada branch.
- **Seletor de período**: Semana / Mês / Trimestre / Semestre. Mês mantém
  navegação de mês com setas; os outros calculam automaticamente a janela a
  partir da data de hoje.
- **Itens clicáveis**: eventos derivados (operação, manutenção, vencimento, CNH,
  documento) abrem a tela de origem via `useNavigate`. Compromissos manuais
  toggleiam `concluido` via `PATCH /agenda/:id`.
- **Criar evento + lançamento em transação** (guard #58): campo `gerar_lancamento`
  no modal de novo compromisso; quando preenchido, o evento e o lançamento são
  inseridos atomicamente. O evento recebe `entidade_tipo = "lancamento"` e
  `entidade_id = lancamento.id` automaticamente. Retorna `{ evento, lancamentoId }`.
- **Repaginação visual**: chips coloridos por tipo, fundo `bg-elevado` para o
  mês/período ativo no mini-calendário, ring de destaque no dia atual.

### Dashboard Financeiro por Origem (Tab 2 — nova rota `/dashboard-financeiro`)

- **Linha 1 — 4 caixas por conta**: seleção persistida em localStorage
  (`hallax_dashboard_fin_contas`). Exibe saldo de `GET /contas`; clicar abre
  drill-down dos lançamentos da conta.
- **Linha 2 — 6 caixas por origem**: guincho / locação / venda / compra /
  manutenção / avulso. Cada caixa exibe o indicador escolhido pelo usuário
  (receita_paga / despesa_paga / líquido / receita_prevista / despesa_prevista /
  vencido_receitas / vencido_despesas / qtd). Clicar abre drill-down.
- **Totais**: linha de totais abaixo das caixas de origem.
- **Novo endpoint `GET /dashboard/financeiro/por-origem?periodo=`**: CTE-SQL que
  classifica cada lançamento por origem (via `operacoes.tipo`, `manutencao_id`,
  ou nenhum → `avulso`) e agrega os 7 indicadores por tipo. Pago filtrado
  por `data_pagamento` dentro do período; previsto sem filtro de período.
- **Drill-down por ativo**: busca de ativo com debounce 250 ms, carrega
  `GET /ativos/:id/lancamentos` ao selecionar.
- **Linkar lançamento → ativo**: botão "Linkar" no drill-down abre modal de busca;
  `PATCH /lancamentos/:id { ativo_id }` seta ou limpa o vínculo (decisão #53).

### Backend — melhorias transversais

- `editarLancamento` suporta campo `ativo_id` (null para deslinkar — decisão #53).
- `listarLancamentos` suporta filtro `operacao_tipo` (guincho/locação/…/avulso);
  `avulso` = sem `operacao_id` e sem `manutencao_id`.
- `eventoAgendaCriarSchema` com campos `entidade_tipo?`, `entidade_id?`,
  `gerar_lancamento?` (refine: linkar OU gerar, não ambos).
- `lancamentoEditarSchema` com campo `ativo_id?` (uuid | null).

### Testes

- `sprint11.test.ts`: 5 testes de integração cobrindo agenda/filtro-tipo,
  agenda/gerar-lançamento, linkar-lançamento→ativo, dashboard/por-origem
  estrutura e agrupamento.

## Sprint 10 — UI repaginada: Dashboard, Ativos, Operações e Manutenções (2026-06-18)

Quatro abas completamente repaginadas em sequência. Nenhuma tabela nova, nenhum dado
duplicado — só novas formas de consultar e exibir o núcleo.

### Dashboard repaginado (Tab 1)

- **Relógio ao vivo** (`RelogioVivo`): hora atual do VPS exibida no cabeçalho do
  dashboard, atualizada a cada segundo — indica que o sistema está respondendo.
- **Seletor de período** (`SeletorPeriodo`): KPIs financeiros filtráveis por
  *hoje / semana / mês / ano / últimos 30 dias*, com chips clicáveis. Dispara
  `GET /dashboard/financeiro?periodo=X&a_vencer=Y`.
- **Dashboard separado em dois endpoints** (decisão #60): `GET /dashboard` devolve
  o bloco operacional (frota, guinchos, locações, agenda, alertas); `GET
  /dashboard/financeiro` devolve receitas, despesas, fluxo 7 dias, contas vencidas
  e a vencer — filtrado por papel (`dashboard_financeiro`). Evita que um único
  payload enorme seja recarregado a cada mudança de período.
- **Frota navegável**: cards de ativo clicáveis abrindo a tela de detalhe; status
  exibido por `Selo` colorido.
- **Aluguéis em andamento**: lista inline com cliente, ativo e data de início.

### Ativos repaginados (Tab 2)

- **Guard anti-duplicação** (decisão #58): ao criar ativo, pode-se marcar "já
  comprado" — gera ativo + operação de compra em cadeia unidirecional (ativo →
  compra). Criar compra separadamente também pode gerar ativo, mas nunca em cadeia
  que recriaria o outro. Mão única por porta de entrada.
- **Campo de diária base** (`valor_diaria_base`) no cadastro do ativo: preenche
  automaticamente o valor de diária ao abrir uma locação para este ativo.
- **Lucro presumido** (decisão #59): exibido na tela do ativo como expectativa de
  receita de locação — calcula `diária × (dias desde aquisição × taxa de ocupação)`.
- **Relatório Patrimônio** (`RelatorioPatrimonio`): nova aba na tela de Ativos
  com valor patrimonial total, breakdown por status e por categoria, exportável.
- `categoria_nome` adicionado ao `ativoFiltrosSchema` e ao `listarAtivos` — permite
  filtrar ativos pelo nome da categoria (usado no Seletor de guincho:
  `categoria_nome=Caminhão`).

### Operações repaginadas (Tab 3)

- **Filtro por tipo em botões grandes**: em vez de chips, 4 botões ícone-texto
  (`grid-cols-2 sm:grid-cols-4`) com os ícones Truck / KeyRound / TrendingUp /
  ShoppingCart — visualmente mais claros.
- **CEP com autocomplete** nos campos de origem e destino do guincho: ao sair do
  campo CEP (`onBlur`), consulta a ViaCEP e preenche o endereço completo.
- **Auto-fill da locação**: ao selecionar o ativo, preenche `valor_diaria` a partir
  de `valor_diaria_base` do ativo e sugere `caucao = valorFipe × 0,05`.
- **Desconto com toggle R$/%)**: campo de desconto com botão de alternância entre
  valor absoluto e percentual.
- **Retroativo toggle**: checkbox que exibe campo `data_inicio` para registrar
  operações com data passada.
- Seletor de caminhão guincho filtrado por `status=disponivel&categoria_nome=Caminhão`.

### Manutenções repaginadas (Tab 4)

- **Kanban 3 colunas**: *Em andamento* / *Agendadas* / *Concluídas* — as
  manutenções sempre foram uma lista plana; agora são agrupadas por estado.
- **Contadores de dias** por card: "X dias em andamento", "hoje", "X dias
  atrasada", "há X dias" — calculados no cliente sem dado novo.
- **Campo peças/material** (`pecas: text NULL`): novo campo em manutenções para
  registrar os itens utilizados ou previstos. Migration `0007_manutencao_pecas.sql`;
  schema Drizzle, schemas Zod (criar/editar), service (criar/editar) e UI (criar
  modal + edição pós-lançamento) atualizados.
- Botões Iniciar/Concluir maiores (`flex-1 justify-center`) em container destacado.

### Correções desta sprint

- **`paginacaoSchema` max 100 → 200**: o kanban pedia `por_pagina=200` mas o
  schema limitava a 100, resultando em 400 em toda listagem de manutenções —
  aba em branco.
- **`Selo` não aceita `className`**: agente havia escrito
  `<Selo className="shrink-0">` — envolto em `<span>` para corrigir a falha de
  build.
- **Teste `financeiro-anular.test.ts`**: após a separação do dashboard em dois
  endpoints, o teste chamava `montarDashboard("admin").financeiro.receitas_dia`
  que não existe mais. Corrigido para `montarFinanceiro("admin","hoje",7).receitas`.

### Qualidade

60 testes verdes (Postgres real na CI). Typecheck e build limpos. Deploy automático
confirmado (run `27735492174`, `success`, commit `ff2b2a4`).

---

## Sprint 9 — Estabilizar deploy + dívida técnica (2026-06-17)

Fechando os Itens 4 e 5 do sprint.

### Deploy mais resiliente (Item 4)
- **Retry no passo do instalador:** o job `deploy` reexecuta o `instalar.sh` via
  SSH até 4× com backoff (ele é idempotente), igual ao rsync — absorve o timeout
  SSH intermitente do VPS sem falhar o deploy à toa.
- **Runbook com diagnóstico fail2ban/firewall:** `docs/operacao-vps.md §1` ganhou
  comandos prontos para diagnosticar (`fail2ban-client status sshd`, `ufw`,
  `iptables`, log de bans), destravar (`fail2ban-client unban --all`) e a correção
  **permanente recomendada**: mover o SSH para uma porta alta + `VPS_PORT` no CI +
  afrouxar o fail2ban. Lembrete do firewall do painel da Hostinger.

### Dívida técnica (Item 5)
- **CORS restritivo:** `@fastify/cors` registrado **fechado por padrão**
  (`origin:false`); libere origens específicas via `CORS_ORIGINS`. Front e API são
  same-origin, então nada muda no uso — é a postura explícita e configurável
  (decisão #57).
- **Invariante "objeto único" no banco:** trigger `trg_operacao_ativo_objeto_unico`
  (migration 0005) impede o mesmo ativo de ser `objeto` de duas operações
  não-terminais. Trigger (não índice parcial) porque a condição cruza com
  `operacoes.status` (decisão #56, doc 03 §3).
- **Detector de referências órfãs:** job diário (`integridade.ts`, doc 04 §0) varre
  as tabelas com referência transversal e alerta no log se achar uma referência a
  um registro inexistente (deve achar zero — é detector de bug, não limpeza).
- **Qualidade:** testes de integração novos para o trigger (bloqueia o 2º objeto;
  libera após a 1ª operação terminar) e para o detector de órfãs. 60 testes verdes;
  `pnpm install --frozen-lockfile` ok (lockfile do `@fastify/cors`).

## Sprint 9 — Copiloto Fase 2: propor lançamento com confirmação (2026-06-17)

O copiloto ganha a primeira ação de **escrita guardrailada** — e continua sem
escrever direto no banco (decisão #43).

- **Propor, não criar:** nova ferramenta `propor_lancamento` (única de mutação,
  fora de `FERRAMENTAS_LEITURA`). Ela devolve uma **proposta** inerte
  (`POST /lancamentos` + payload), exposta **só a quem pode lançar** e revalidada
  por papel. O modelo nunca escreve.
- **Confirmação humana na UI:** o painel do copiloto mostra um card de proposta;
  o humano escolhe conta/categoria, ajusta o vencimento e **confirma** — só então
  a UI dispara `POST /lancamentos`, com a **própria autoria**. Máquina de estados
  e timeline intactas; a criação entra na auditoria como qualquer lançamento.
- **Fora de escopo (destrutivo):** anular/estornar/transicionar/excluir ficam de
  fora — entram só com demanda e guardrails próprios (decisão #55).
- `POST /copiloto/perguntar` passa a retornar `propostas[]` ao lado de
  `resposta`/`fontes`. Decisões #43/#55; doc 06 atualizado.
- **Qualidade:** testes garantem o invariante pedido — `propor_lancamento` está
  fora da leitura, só aparece para quem pode lançar, devolve proposta e **não
  cria linha no banco** (contagem antes/depois, Postgres real na CI).

## Sprint 9 — Ligar o copiloto + interconexão dos módulos (2026-06-17)

Duas frentes, sem duplicar dado nem criar fonte paralela: ligar o copiloto de
verdade em produção e começar a costurar lançamento ↔ operação/manutenção/ativo.

### Copiloto: a chave chega ao container (Item 1)
- **`IA_API_KEY` agora é injetada no `.env` do VPS pelo deploy**, a partir do
  secret do GitHub Actions (`deploy.yml` passa o secret; `instalar.sh` faz
  **upsert idempotente** no `.env`). Antes, definir só o secret do Actions **não
  ligava** o copiloto: o compose lê `${IA_API_KEY}` do `.env` do VPS em runtime e
  o rsync exclui o `.env` (decisão #54). Vazia = copiloto segue desligado (503,
  sem custo) — degradação graciosa intacta.
- Confirmado o fluxo ponta a ponta da Fase 1 (leitura): com a chave, `POST
  /copiloto/perguntar` responde de verdade, a UI (painel + ⌘K) aparece quando
  `auth.copiloto.ativo`, e cada ferramenta revalida o papel (doc 05). Modelo
  padrão `claude-haiku-4-5` — válido e atual; trocável por `IA_MODELO`.

### Interconexão no financeiro (Item 2)
- **Lançamento avulso agora vincula** a operação **ou** manutenção (origem, no
  máximo uma — espelha o CHECK) e/ou a um **ativo**: `POST /lancamentos` aceita
  `operacao_id?`, `manutencao_id?`, `ativo_id?`. Antes o vínculo só nascia das
  transições; o avulso não tinha como apontar a origem.
- **Lançamento → ativo (novo):** nova coluna `lancamentos.ativo_id` (migration
  0004) para o **custo direto** do ativo (IPVA, seguro, multa) que não é operação
  nem manutenção. É **classificação que coexiste**, não uma terceira origem
  exclusiva — o CHECK de origem única **não muda** (decisão #53). O resultado/ROI
  e o histórico financeiro do ativo passam a somar os lançamentos **diretos** +
  os **herdados** (operação-objeto, manutenção).
- **Navegação cruzada:** `GET /ativos/:id/lancamentos` (diretos + herdados, com
  `origem`); a tela do ativo marca a origem de cada lançamento e linka para a
  operação. Consulta, nunca cópia (doc 02 §9). O guincho não conta como "1 ativo
  da operação" (caminhão é recurso; veículo do cliente é texto — doc 03).

### Qualidade
- Testes (`node:test`): contrato aceita `ativo_id`, aceita ativo+operação juntos,
  **rejeita** operação+manutenção juntas; integração (Postgres real na CI) prova
  o vínculo lançamento→ativo (persistência, custo direto no resultado do ativo,
  aparição na tela) e que o **CHECK** `chk_lancamento_origem_unica` barra
  operação+manutenção no banco. Typecheck, build do web e suíte verdes.

## Sprint 9 — Edição pós-lançamento, datas retroativas e correções (2026-06-16)

Pedidos do uso real: poder corrigir o que já foi lançado e registrar datas
antigas — mais dois bugs vistos em produção. Sem duplicar dado nem criar tabela.

### Editar depois de lançado (com auditoria)
- **Financeiro:** lançamento **gerado** por operação/manutenção agora é editável
  (valor, vencimento, conta, categoria, forma) — o **vínculo de origem é
  preservado** e a mudança vai para a timeline (de→para). Editar um **pago**
  reescreve indicadores e é **restrito ao admin** (decisão #48). Relaxa a antiga
  trava da regra 5 (doc 03). UI: botão *Editar* na lista do Financeiro.
- **Operação:** novo `PATCH /operacoes/:id` — observações, **datas (início/fim)**
  e descritivos por tipo (origem/destino/veículo do guincho, devolução prevista,
  km no ato). O valor segue pelo lançamento vinculado, não pela operação
  (decisão #49). UI: botão *Editar* na página da operação.
- **Manutenção:** editável em **qualquer status exceto cancelada** (antes só
  `agendada`), incluindo as datas (decisão #50). UI: botão *Editar* na página.

### Datas retroativas (registrar histórico antigo)
- A data informada tem precedência sobre "agora" (decisão #51), tudo **opcional**:
  - Operação: `data_inicio` na criação; `data` na transição (retirada/devolução/
    conclusão/encerramento) — já existia no contrato e era **ignorada**.
  - Manutenção: `data_inicio` em iniciar, `data_conclusao` em concluir.
  - Financeiro: `data_pagamento` ao criar/editar um lançamento pago.
- Sem migração: as colunas de data já existiam no modelo.

### Correções (uso real)
- **Manutenção "Iniciar" dava erro interno (corrigido):** `iniciarManutencao`
  lia o registro **dentro** da transação aberta (por uma 2ª conexão da pool,
  enquanto ela segurava locks), devolvendo estado pré-commit e podendo falhar.
  Agora lê **após o commit**, como concluir/cancelar (decisão #52). Teste de
  integração cobre agendar → iniciar → concluir.
- **Excluir foto no iPhone/PC (corrigido):** os controles da foto (incl. a
  lixeira) só apareciam no **hover** (`group-hover`), inacessíveis no toque do
  iPhone — agora ficam **sempre visíveis**. A exclusão aguarda o refetch concluir
  e mostra carregando/erro, garantindo que a galeria reflita a remoção.

### Qualidade
- Testes (`node:test`): contratos de edição/datas (puro) + integração (Postgres
  na CI) — a regressão do "iniciar", o gate admin para editar um lançamento pago,
  e edição de operação/datas. Typecheck, build do web e suíte verdes.

## Sprint 9 — Copiloto de IA (leitura + UI) (2026-06-16)

O copiloto sai do scaffold e ganha utilidade real — **Fase 1: só leitura**.
Continua sem dados próprios (regra máxima): consome os mesmos serviços que as
telas usam, por *function calling* no backend, escopado ao papel do usuário.

### Backend — da busca a um conjunto de ferramentas de leitura
- `POST /copiloto/perguntar` deixa de ter só `busca_global` e ganha
  **`dashboard_resumo`** (payload do dashboard), **`operacoes_abertas`**
  (operações em andamento/atrasadas) e **`relatorio_financeiro`** (DRE +
  resultado/ROI por ativo). Todas chamam os **serviços existentes** — nenhuma
  consulta nova, nenhuma tabela nova.
- **Permissão por ferramenta** (decisão #45): a busca já filtrava por papel; as
  novas revalidam `pode(papel, recurso, 'ler')` antes de qualquer query — um
  `operador` não extrai o financeiro pelo copiloto. A negação não vaza o dado.
- **Degradação graciosa** (decisão #47): falhas/limites do SDK da Anthropic viram
  `503 IA_INDISPONIVEL` / `429 IA_LIMITE` no envelope pt-BR; o resto do sistema
  (busca, telas) segue de pé. Sem `IA_API_KEY` segue `503 IA_NAO_CONFIGURADA`,
  sem custo. Rate limit próprio de 20 req/min por IP no endpoint.
- **Modelo padrão `claude-haiku-4-5`** (`IA_MODELO`, configurável). Requisição
  **model-agnostic** (sem `thinking`/`effort`, que Haiku rejeita) para permitir
  troca por Sonnet/Opus sem mexer no código (decisão #46).
- `GET /auth/sessao` e o login passam a trazer `copiloto: { ativo }` — a UI
  esconde o copiloto quando a IA está desligada (sem round-trip que volta 503).

### UI — ⌘K + painel lateral
- **Painel lateral** (Drawer) "Copiloto": pergunta em linguagem natural, resposta
  com **fontes clicáveis** (chips que abrem a tela real da entidade — operação,
  ativo, pessoa, lançamento). Botão de copiloto no header (só quando a IA está
  ligada).
- **Integração com o ⌘K**: a paleta de busca ganha "Perguntar ao copiloto:
  '…'" (e atalho `⌘↵`) que leva a pergunta para o painel — coerente com a
  decisão #23 ("⌘K é a porta da IA").

### Qualidade
- Testes (`node:test`): o invariante pedido — **o copiloto não tem ferramenta de
  escrita** (a lista é a garantia, em código); um `operador` é **negado** no
  `relatorio_financeiro` sem tocar o banco; sem `IA_API_KEY` responde 503 **sem
  custo**. Testes de integração (Postgres real na CI) rodam o SQL das ferramentas
  de leitura. Typecheck, build do web e suíte verdes.

## Sprint 9 — Correções do uso real II (2026-06-15)

Dois problemas vistos em produção, sem duplicar dado nem criar tabela.

### Aba de Manutenções quebrada (regressão) — corrigido
- **Causa raiz:** a lista (`listarManutencoes`) montava o `WHERE` interpolando um
  fragmento do Drizzle (`isNull(manutencoes.deletedAt)` → `"manutencoes"."deleted_at"`)
  numa query crua que **aliasa** a tabela como `m`. Depois do alias, o Postgres
  rejeita a referência ao nome real (`42P01 invalid reference to FROM-clause
  entry`) — a aba quebrava 100% das vezes. **Bug latente desde o Sprint 6**
  (não foi a leva de oficinas: `/pessoas?papel=oficina` e a migração 0003 estão
  ok); só apareceu quando a aba passou a ser usada de fato. Reproduzido contra um
  PostgreSQL 16 real antes do patch.
- **Correção:** o `WHERE` (e o `count`) passam a usar condições cruas
  qualificadas por `m.`, consistentes com a query principal.
- **Porta de qualidade:** a CI ganhou um **Postgres real** no job `verificar` e um
  **teste de integração** que roda migrations e exercita a lista de manutenções
  (e o filtro `papel=oficina`). Typecheck/build não veem erro de SQL cru — só
  estoura em runtime; agora há quem pegue. Mesma ideia do `boot.test.ts`.

### Exclusão permanente, por tipo de dado
- **Fotos no lugar errado:** `DELETE /documentos/:id?permanente=true` faz **hard
  delete real** (apaga o arquivo do disco e a linha), com confirmação em modal e
  evento na timeline. Soft delete segue como padrão. Anexo não é origem de nada —
  não há vínculo a preservar.
- **Lançamento lançado errado:** novo `POST /lancamentos/:id/anular { motivo }`
  (**só admin**). Marca `status=cancelado` **sem** contrapartida — sai de **todos**
  os indicadores (dashboard, DRE, ROI, saldo, que já somam só `pago`/`previsto`)
  na hora, **preservando a linha + o vínculo de origem** `operacao_id`/
  `manutencao_id` (rastreabilidade origem→lançamento intacta). Difere do estorno
  (reversão de dinheiro real, com contrapartida) e do hard delete (que destruiria
  a trilha e deixaria a origem órfã). Decisão registrada em `docs/decisoes.md`
  (#41). Sem migração — reusa o status `cancelado`.

### Qualidade
- Suíte: testes de integração novos (lista de manutenções; anulação tirando o
  valor do saldo e do dashboard sem contrapartida; vínculo origem→lançamento
  preservado). 33 testes, typecheck e build do web verdes.

## Sprint 9 — Atritos do uso real (2026-06-15)

Ajustes pedidos após o uso real do sistema, antes de seguir com a UI do
copiloto. Tudo reusa o núcleo — nenhuma tabela ou dado duplicado.

### Edição financeira antes de finalizar a operação
- Na transição que gera financeiro (locação `finalizada`, guincho `concluido`,
  compra/venda `fechada`), o modal de finalização passa a permitir **revisar e
  editar os lançamentos antes de confirmar**: conta de destino/origem, forma de
  pagamento, nº de parcelas, data do lançamento e o **vencimento de cada
  parcela**. Só persiste no "Confirmar".
- Contrato: bloco opcional `financeiro` em `POST /operacoes/:id/transicao`
  (retrocompatível — omitir mantém o padrão: parcelas mensais, conta padrão).
  Se `valor` for informado por parcela, a soma precisa bater com o total
  (422 `REGRA_NEGOCIO`); só datas → total rateado igualmente.
- Novo `GET /operacoes/:id/previa-financeira` (read-only): valor previsto,
  conta padrão e categoria — a UI monta as parcelas sem reimplementar a regra
  (na locação o valor é diárias × dias). Sem mudança de schema; rastreabilidade
  origem → lançamento preservada (doc 03 regra 5).

### "Usar endereço do cliente" no guincho
- Atalho nos campos de origem/destino que **preenche** o endereço cadastrado do
  cliente (núcleo `pessoas`). Origem/destino seguem sendo texto livre (o local
  do guincho é um evento) — o atalho é um snapshot de conveniência, sem tabela
  paralela. Aparece quando o cliente tem endereço cadastrado.

### Cadastro e busca de oficinas
- Oficina é **papel de `pessoas`** (não tabela nova — confirmado no doc 02 §5):
  novo papel `oficina`, marcado pelo campo **"É oficina"** no cadastro (PJ).
- O campo de oficina na manutenção virou **autocomplete filtrado a oficinas**
  (`GET /pessoas?papel=oficina`), com **cadastro rápido inline** de oficina
  (nome + CNPJ) — mesma ideia do "+ nova categoria/conta" do lançamento.
- Filtro `?papel=` corrigido para filtrar no SQL (antes filtrava só a página
  paginada, perdendo resultados).

### Qualidade
- Testes (`node:test`): rateio/validação de parcelas do `financeiro`,
  retrocompatibilidade da transição, papel `oficina` e `eh_oficina` no schema.
  Typecheck, build do web e suíte verdes.

## Sprint 9 — Copiloto de IA (em andamento) (2026-06-13)

Início do copiloto de IA (doc 01 §6) — **scaffold desligado**, sem custo até
configurar a chave.

- **Backend** `POST /copiloto/perguntar`: orquestra o modelo Claude com a
  **busca global** existente como ferramenta (o copiloto não tem dados próprios
  — reusa o núcleo, conforme a regra máxima). A busca já filtra pelo papel do
  usuário, então o copiloto só enxerga o que ele poderia ver (doc 05).
- **Desligado por padrão**: sem `IA_API_KEY`, responde `503 IA_NAO_CONFIGURADA`
  e nenhuma chamada paga é feita. Ativar = definir o secret `IA_API_KEY` no
  servidor (exposto em `.env.example` e no compose; nunca versionado).
- SDK oficial da Anthropic carregado sob demanda (import dinâmico) — não pesa
  no arranque enquanto a IA está desligada.
- Próximos passos: UI (campo de pergunta no ⌘K / painel) e estabilização do
  deploy.

## Melhorias de usabilidade (2026-06-15)

- **CEP com autocomplete no cadastro de cliente**: ao digitar o CEP (8 dígitos),
  o navegador consulta o ViaCEP e preenche logradouro, bairro, cidade e UF
  automaticamente (dispara ao completar 8 dígitos e no blur; em falha, deixa
  preencher manualmente). Adicionado também o campo Bairro na tela (já existia
  no modelo). Sem mudança de backend.

## Correções pós-Sprint 8 (2026-06-13)

Hotfixes após o Sprint 8 entrar em produção — login estava inacessível.

- **Criar categoria e conta no próprio lançamento**: em produção o seed não
  roda, então `categorias_financeiras` e `contas` nascem vazias e era impossível
  finalizar uma receita/despesa (ambos os campos são obrigatórios). O formulário
  de lançamento agora tem um mini-campo "+ nova" para criar a categoria (no tipo
  do lançamento) e a conta na hora, já selecionando a recém-criada. (API de
  criação já existia desde o Sprint 3.) Gated por permissão.
- **Upload pelo iPhone (iOS Safari)**: o campo de arquivo era limpo
  (`input.value = ""`) logo após a escolha, ainda de forma síncrona — no iOS
  isso **invalida o arquivo selecionado** antes do `fetch` ler o corpo, então a
  requisição falhava no aparelho e nem chegava ao servidor (no desktop o
  arquivo seguia válido, por isso funcionava lá). Agora o input só é limpo
  **depois** que o envio conclui, nos dois pontos (galeria/documentos e
  substituição). Vale para fotos e PDFs.

- **API não subia (`FST_ERR_PLUGIN_VERSION_MISMATCH`)**: `@fastify/rate-limit`
  estava em `^9.x` (só Fastify 4), enquanto rodamos Fastify 5. O registro do
  plugin derrubava a API em loop de reinício e todo login retornava "erro
  inesperado". Subido para `^10.x` (compatível com Fastify 5).
- **Porta de qualidade de arranque**: novo teste `boot.test.ts` que dá
  `app.ready()` no CI — pega incompatibilidade de plugin (que typecheck/build
  não veem) antes do deploy. Teria barrado o bug acima.
- **Rate limit atrás de proxy**: `trustProxy: true` no Fastify (o Caddy faz
  reverse-proxy), para `req.ip` refletir o cliente real, e `errorResponseBuilder`
  padroniza o 429 no envelope `{erro:{...}}` da API.
- **SSH do VPS não subia no boot**: `systemctl enable ssh` no servidor — após
  reinícios o `sshd` ficava desligado e o deploy não conectava (timeout :22).

## Sprint 8 — Notificações, tags, favoritos e rate limiting (2026-06-13)

Os serviços transversais que faltavam ganham vida, e a API fica pronta para uso real.

### Notificações (sino na UI)
- Tabelas `notificacoes`, `tags`, `tags_vinculos` e `favoritos` no schema Drizzle.
- Service completo: criar, listar, contar não lidas, marcar lida / todas lidas.
- Job de prazos (`verificarPrazos`): devolução atrasada, lançamento vencido,
  CNH/documento vencendo em 30 dias e manutenção agendada para amanhã —
  idempotente por dedupção diária. Roda no arranque e a cada hora.
- Sino (Bell/BellDot) no header com badge de não lidas, painel dropdown com
  ícones por tipo, navegação para a entidade de origem e polling de 30 s.

### Tags e favoritos
- Services de tags (criar, listar, soft delete, vincular/desvincular) e
  favoritos (adicionar, remover, listar, verificar), com rotas dedicadas.
- Frontend `TagsFavoritos`: estrela de favorito com update otimístico + chips
  de tags coloridas + popover de busca/criação, na tela de detalhe do ativo.

### Rate limiting e auditoria
- `@fastify/rate-limit`: 200 req/min por IP em toda a API.
- `exigirPermissao` passa a emitir `req.log.warn` com usuário, papel, recurso,
  ação e URL em todo 403 — auditoria de negações de acesso.

## Sprint 7 — Confiança: backup, testes e endurecimento (2026-06-13)

Antes de intensificar o uso real, blindar o que já está em produção.

### Backup automático do Postgres
- Serviço sidecar (`backup`) no `docker-compose.prod.yml` que roda `pg_dump`
  comprimido em intervalo configurável (`BACKUP_INTERVALO_SEG`, padrão 24h) com
  retenção dos N últimos (`BACKUP_RETENCAO`, padrão 7), em volume próprio.

### Testes automatizados + porta de qualidade no CI
- Suíte com o runner nativo do Node (`node:test`, zero dependências novas):
  matriz de permissões, schemas Zod, transições de operações/manutenções e o
  sniffing de formato de upload. 18 testes.
- Workflow de deploy ganhou o job **`verificar`** (typecheck + build + testes)
  do qual o `deploy` depende — **código quebrado não chega mais ao VPS**.

### Endurecimento de acesso (doc 05)
- **Bloqueio progressivo de login**: a partir de 5 falhas em 15 min a conta é
  temporariamente bloqueada (429), usando a timeline que já registrava as
  falhas — freia força bruta.
- **Troca da própria senha**: endpoint + modal na interface; confere a senha
  atual e **encerra as outras sessões** ao trocar.

### Correções (anexos e ativo)
- **Upload definitivo**: além de MIME e extensão, o formato é identificado
  pelos **magic bytes** do conteúdo — resolve celulares que enviam o arquivo
  como `application/octet-stream` e sem extensão no nome. Erros de disco viram
  mensagem clara e há checagem de gravabilidade no arranque.
- Quadro **"Expectativa de lucro de venda"** reformatado num card próprio.

### Verificado em execução
Bloqueio na 6ª tentativa (429); troca de senha invalidando a antiga; backup
gerando dump de 26 tabelas; 18/18 testes verdes; typecheck e build limpos;
upload de JPEG/PDF/HEIC como octet-stream sem extensão → 201.

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
