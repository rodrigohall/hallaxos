# Registro de Decisões

> Log cumulativo. Cada decisão relevante de arquitetura ou implementação entra
> aqui com o porquê — para que ninguém precise rearguir o passado.

## Fundação (Etapas 1–2)

| # | Decisão | Por quê |
|---|---------|---------|
| 1 | Banco único PostgreSQL; módulos são visões | Regra máxima: toda informação existe uma vez |
| 2 | Padrão núcleo + extensão (`operacoes_*`, `ativos_veiculos`) | Serviços transversais conectam-se uma vez e servem todos os módulos |
| 3 | `pessoas` com papéis em vez de tabelas cliente/fornecedor | Uma pessoa, um cadastro, histórico unificado |
| 4 | Referência polimórfica restrita a lista fechada de 8 tabelas | Transversalidade sem dezenas de junções; integridade na aplicação (doc 04 §0) |
| 5 | Agregados sempre derivados (saldo, custo de manutenção, "vencido") | Número gravado em dois lugares é número que diverge |
| 6 | Monólito modular, não microsserviços | Escala da operação não justifica o custo operacional |
| 7 | Sessões opacas em banco + cookie httpOnly (sem JWT) | Revogável, auditável, sem segredo para vazar |
| 8 | Comentários separados da timeline | Comentário edita/apaga; timeline é imutável |
| 9 | Busca global no próprio Postgres (sem Elasticsearch) | Um sistema a menos para operar e ver divergir |

## Sprint 1

| # | Decisão | Por quê |
|---|---------|---------|
| 10 | Migrations SQL escritas à mão + Drizzle só como query builder tipado | O DDL (triggers, CHECKs, índices GIN) fica explícito e auditável; "o SQL nunca fica escondido" (doc 01) |
| 11 | O banco nasce completo na migration 0001 | Sprints 2+ adicionam API/UI sem tocar estrutura; evita migração de dados precoce |
| 12 | UUID v7 gerado na aplicação | Ordenável por tempo (cursores de timeline) sem extensão de banco |
| 13 | Imutabilidade da timeline por trigger, não por permissão de role | Vale para qualquer conexão, inclusive superusuário de dev |
| 14 | argon2id via `@node-rs/argon2` | Binário pré-compilado confiável, sem toolchain nativa no install |
| 15 | Busca textual: `unaccent` + `LIKE` normalizado + `word_similarity` | `similarity` simples falha em consultas curtas contra termos longos (achado em teste real: "corola" não achava o Corolla) |
| 16 | Placas indexadas como texto E como dígitos | Placa é alfanumérica; o campo numérico serve a CPF/telefone (achado em teste real) |
| 17 | Status `vencido`/`atrasada` calculados na consulta do dashboard | Coerente com a decisão 5 — nunca gravados |
| 18 | Erros da API com código estável + mensagem pt-BR pronta para exibir | O frontend não traduz nem interpreta; mostra |

## Sprint 1.5 — Design System

| # | Decisão | Por quê |
|---|---------|---------|
| 19 | Marca extraída da arte vetorial, nunca interpretada | O monograma é o path do PDF oficial; cores lidas do arquivo (#F3C625 / #002044). Identidade não se "recria" |
| 20 | Dourado restrito a CTA, estado ativo e momentos de marca | Escassez = valor. Aviso é laranja para nunca competir com a marca |
| 21 | Montserrat (display) + Inter (UI) | Montserrat é a fonte embutida na arte; Inter é o equivalente digital do Roboto do impresso |
| 22 | Mapa status→cor centralizado no componente Selo | Telas nunca escolhem cores de status — consistência por construção |
| 23 | Busca global como paleta de comando (⌘K) | Sempre acessível, navegável por teclado; será a porta da IA |
| 24 | Skeletons por bloco, nunca spinner de tela cheia | O layout aparece imediatamente; o conteúdo preenche |
| 25 | Confirmação destrutiva sempre em Modal explicando consequência | `confirm()` nativo quebra a experiência e não educa sobre soft delete |

## Sprint 4 — Guincho

| # | Decisão | Por quê |
|---|---------|---------|
| 26 | Guincho concluído gera receita `previsto` (a receber), não `pago` | Operador transiciona a operação mas não toca o caixa; o financeiro concilia o recebimento (separação de papéis, doc 05) |
| 27 | Categoria "Guincho" e conta padrão são garantidas (criadas se faltarem) na geração | A regra "operação gera lançamento" não pode falhar por falta de cadastro prévio; produção nasce sem dados (bootstrap só cria o admin) |
| 28 | Operação terminal (`concluido`/`cancelada`) sai do índice de busca | Coerente com ativo arquivado: a busca mostra o que está em jogo; o histórico permanece na timeline e no detalhe |
| 29 | Um caminhão só serve a um guincho aberto por vez — guarda na criação, além do estado do ativo | Entre `solicitado` e `a_caminho` o ativo ainda está `disponivel`; sem a guarda, dois chamados pegariam o mesmo caminhão (integridade do doc 03 regra 1) |
| 30 | Km percorrido informado na conclusão soma ao hodômetro do caminhão | O número existe uma vez e o ativo reflete a realidade sem digitação dupla |

## Sprint 9 — Atritos do uso real

| # | Decisão | Por quê |
|---|---------|---------|
| 31 | Edição financeira na finalização via bloco `financeiro` na **mesma** transição, não em duas fases | A confirmação do modal já é o ponto de persistência — nada é gravado antes do "Confirmar". Evita estado intermediário "rascunho de lançamento" e mantém a transição atômica (doc 01 §4) |
| 32 | Reusar colunas de `lancamentos` (conta, forma, vencimento, parcelas) em vez de criar campos novos | Os 5 dados pedidos já existem no modelo; faltava só deixar o usuário escolhê-los na origem. Zero migração de dados; rastreabilidade origem→lançamento intacta (regra máxima) |
| 33 | `previa-financeira` read-only para a UI montar as parcelas | Na locação o valor é diárias × dias, calculado no fim — a tela precisa do total para ratear sem reimplementar a regra no front (nenhuma regra de negócio no front, doc 01 §4) |
| 34 | "Usar endereço do cliente" preenche o texto livre da origem/destino do guincho; **não** vira FK nem tabela de endereços | Local de guincho é um evento (onde o carro está), não o endereço cadastrado; o snapshot preserva o histórico mesmo se o cliente mudar de endereço. Mantém "um endereço por pessoa" (doc 02 §1) |
| 35 | Oficina = papel `oficina` em `pessoas` (marcado no cadastro), não entidade nova | A oficina já era `fornecedor_id` (pessoa) nas manutenções (doc 02 §5). O papel a torna pesquisável/filtrável sem duplicar cadastro — confirmado contra o doc 02 antes de criar qualquer tabela |
| 36 | Papel `oficina` é o único atribuído **manualmente** (toggle "É oficina") | Diferente de `cliente`/`fornecedor` (derivados de participação), "ser oficina" é uma classificação do negócio que o usuário declara — escolha do dono do produto |
| 37 | Filtro `?papel=` movido para SQL (EXISTS) em vez de pós-paginação | A filtragem após o `LIMIT` perdia resultados além da 1ª página; o autocomplete de oficina precisa ser correto |

## Sprint 9 — Correções do uso real (II)

| # | Decisão | Por quê |
|---|---------|---------|
| 38 | Lista de Manutenções: WHERE cru qualificado pelo alias `m`, não interpolando fragmento do Drizzle | A query principal aliasa `manutencoes` como `m`; um fragmento do Drizzle renderiza `"manutencoes"."deleted_at"`, que o Postgres rejeita depois do alias (`42P01`) — a aba quebrava 100% das vezes. Bug latente desde o Sprint 6, exposto quando a aba passou a ser usada de fato |
| 39 | Porta de qualidade da CI ganha um Postgres real + teste de integração | Typecheck e build não veem erro de SQL cru (só estoura em runtime, contra um banco). Mesma filosofia do `boot.test.ts` para plugins: o que só falha em produção precisa de um teste que rode de verdade |
| 40 | Foto/anexo no lugar errado → **hard delete** real (arquivo + linha), distinto do soft delete | Anexo é serviço transversal e **não é origem** de nada (não há vínculo a preservar); para "posto na entidade errada" a remoção total é o que o usuário quer. Soft delete (`?permanente=false`) segue como padrão |
| 41 | Lançamento errado → **anulação** (`status=cancelado`, sem contrapartida), não estorno nem hard delete | Estorno cria contrapartida (dois lançamentos seguem contando bruto no dashboard) — certo para reversão de dinheiro real, errado para engano de digitação. Anular tira de **todos** os indicadores (todos filtram `pago`/`previsto`) na hora, **preservando a linha + o vínculo origem→lançamento** (a operação ainda mostra que gerou e que foi anulado). Hard delete atingiria o mesmo no dashboard, mas destruiria a trilha e deixaria a origem órfã. Reservado ao `admin` (anular um pago reescreve números) |
| 42 | Anular limpa `data_pagamento` junto com o status | Invariante `chk_lancamento_pago_com_data` (`status='pago' ⇔ data_pagamento NOT NULL`): um lançamento anulado não é um pagamento real, então a data sai com o status |

## Como propor mudança

Discordou de uma decisão? Escreva a proposta com o contexto novo que a justifica
e o impacto (arquitetura, banco, financeiro, timeline, relatórios) antes de
qualquer implementação.
