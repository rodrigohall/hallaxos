# 01 · Visão Geral — Hall Eventos

> Este documento define o negócio real por trás do sistema, antes de qualquer entidade ou tela.
> Rascunhado a partir de: relatórios reais do EstoqueNow (abr–jun/2026), conversas reais de
> WhatsApp Business de 4 pedidos completos, e material de posicionamento da marca.

## 1. Quem é a Hall Eventos

Empresa de Dourados-MS, fundada por Rodrigo Hall e Carlos Eduardo ("Kadu") Pelegrino. Duas
frentes de serviço que **quase nunca coexistem no mesmo pedido**, mas compartilham a base de
clientes:

- **Locação** — a atividade principal, disparado. Mesas e cadeiras de plástico, caixas
  térmicas, toalhas de mesa, camas elásticas (itens próprios); tendas, piso deck, som e
  iluminação (terceirizados, sob demanda).
- **Coquetelaria** — bar completo com equipe qualificada, carta de drinks personalizável.
  Começando agora, não é prioridade do sistema na primeira fase.

Ainda sem CNPJ próprio (MEI a caminho). O dinheiro cai numa conta Mercado Pago no nome do Kadu
(Carlos Eduardo Pelegrino Carvalho Santos). Quando o cliente precisa de nota fiscal, ela é
emitida pelo CNPJ da Hallax (outra empresa do Rodrigo).

## 2. Volume real (abr–jun/2026)

- **~20 pedidos/mês** (59 pedidos em 3 meses).
- **Ticket médio ~R$ 147** (com frete).
- 57 clientes cadastrados, na esmagadora maioria pessoa física de Dourados-MS.
- 539 peças em estoque, 22 tipos de item — quase tudo mesa/cadeira Isabela (branca/preta) e
  toalha (17 variações de cor).

## 3. Princípios extraídos da operação real

Estes não são aspirações — são o que a Hall Eventos já faz hoje, todos os dias, e que o sistema
precisa respeitar em vez de tentar "corrigir":

1. **O WhatsApp é onde o negócio de fato acontece.** Orçamento, negociação, confirmação de
   horário, comprovante de pagamento, nota fiscal — tudo circula por lá, hoje sem nenhum
   registro estruturado. O sistema deve se aproximar desse fluxo, não substituí-lo por
   formulários rígidos.

2. **Preço é humano, não uma tabela.** R$ 13/jogo é a referência, mas descontos e cortesias são
   dados caso a caso — por fidelidade, causa social, ou simplesmente um favor. **O sistema não
   deve automatizar essa decisão**; deve só registrar o valor combinado livremente, sem forçar
   fórmula.

3. **O "jogo" (1 mesa + 4 cadeiras) é uma conveniência de cobrança, não uma unidade de
   estoque.** O controle real de estoque é por peça individual — os números batem exatamente
   (ex: 40 mesas pretas × 4 = 160 cadeiras pretas em estoque). Além disso, a proporção entregue
   na prática pode variar do "jogo padrão" quando negociado (ex: pedido de 100 cadeiras + 20
   mesas, fora da proporção 1:4, cobrado como "20 jogos" por conveniência).

4. **Terceirização de toalha é comum; terceirização de tenda/piso/som/luz é rara.** Quando
   terceirizado, às vezes há markup, às vezes não (nunca em toalha, às vezes nos itens raros) —
   de novo, decisão humana caso a caso.

5. **Reposição e multa por dano/perda existem, mas são raras.** Exemplo real: evento com 100
   cadeiras entregues, 99 devolvidas + 1 quebrada (evidência: foto/vídeo mandado no WhatsApp) →
   cobrança de R$ 53/cadeira à parte, por transferência bancária (não Pix, porque era cliente
   PJ que precisava de rastreabilidade). O sistema deve permitir registrar isso quando
   acontece, sem exigir preenchimento em todo pedido.

6. **Logística é o caos operacional real do negócio.** Horário de entrega/retirada é
   renegociado várias vezes por pedido, até o último minuto (chuva, veículo quebrado,
   trânsito, correria). O sistema deve tratar data/hora de entrega como uma **estimativa que se
   reconfirma perto da hora**, com histórico de replanejamento — nunca como um campo fixo e
   definitivo.

7. **"Corremos atrás de tudo que o cliente precisa."** O motto da marca. O catálogo de itens
   não pode ser fechado — pedidos aceitam itens avulsos/personalizados fora do catálogo
   interno, normalmente terceirizados.

8. **Pix é o meio de pagamento padrão.** Transferência bancária/dados completos só quando o
   cliente (normalmente pessoa jurídica) precisa de comprovante formal para prestação de
   contas.

## 4. O que ainda não sabemos (em aberto)

- Como funciona, na prática, um conflito de agenda/estoque (dois pedidos querendo os mesmos
  itens na mesma data) — ainda não vimos um caso real nos dados.
  - Trâmite completo da Coquetelaria (como um orçamento de bar nasce, evolui, é servido) — não
  prioridade agora, mas deixado como frente futura.

## 5. Stack e localização no repositório

Este é um projeto **conceitualmente independente** do HallaxOS (o sistema irmão de guincho/
locação de veículos/compra-venda que já existe neste mesmo repositório, em `apps/` e `docs/`).
Não há reaproveitamento de código ou de dados entre os dois — só o método de trabalho
(arquitetura definida antes do código, documentação viva). O código e docs da Hall Eventos
vivem em `hall-eventos/`, isolados do restante do monorepo.
