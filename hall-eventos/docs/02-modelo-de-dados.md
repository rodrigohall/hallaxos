# 02 · Modelo de Dados — Hall Eventos

> Rascunho para validação. Nada aqui é final — é o ponto de partida pra discussão.
> Ver `01-visao-geral.md` para o raciocínio por trás de cada decisão.

## Entidades principais

### Pessoas
O cliente (e, no futuro, o fornecedor terceirizado — mesmo cadastro, papéis diferentes).

| Campo | Observação |
|---|---|
| `id` | |
| `nome` | |
| `telefone` | **Identificador de fato hoje** — muitos clientes não têm CPF cadastrado |
| `cpf_cnpj` | opcional |
| `email` | opcional, raramente preenchido |
| `endereco_padrao` | opcional — endereço pode variar por pedido (evento em local diferente de casa) |
| `como_conheceu` | opcional (Google, Indicação, boca a boca) |
| `papeis` | `cliente` (padrão) · `fornecedor` (quando terceirizamos algo dele) |
| `observacoes` | texto livre |
| `criado_em` | |

### Itens
Catálogo de peças de estoque próprio. **Peça individual, não kit.**

| Campo | Observação |
|---|---|
| `id` | |
| `nome` | ex: "Mesa Isabela", "Cadeira Isabela", "Toalha" |
| `categoria` | mesas_cadeiras · toalhas · caixas_termicas · cama_elastica · outros |
| `variacao` | cor/tamanho (ex: preta, branca, 1,40×1,40m) |
| `quantidade_total` | estoque próprio |
| `preco_diaria` | preço de referência — **negociável por pedido**, não fixo |
| `preco_reposicao` | custo de reposição em caso de dano/perda (usado raramente) |
| `ativo` | visível para novos pedidos ou descontinuado |

**Nota:** "jogo completo" (1 mesa + 4 cadeiras) **não é um item de estoque**. É uma regra de
composição usada só para exibir preço combinado — internamente sempre vira quantidade de mesa +
quantidade de cadeira. Ver princípio 3 em `01-visao-geral.md`.

### Fornecedores
Quem a Hall Eventos contrata quando terceiriza (tenda, piso deck, som, iluminação; ocasionalmente
toalha). Pode ser a mesma tabela `pessoas` com papel `fornecedor`, ou tabela própria — **decisão
em aberto**, ver seção 4.

### Pedidos
O núcleo da operação. Um pedido = um evento, na prática observada.

| Campo | Observação |
|---|---|
| `id` / `codigo` | ex: sequencial ou formato herdado do EstoqueNow (AAMMDD/NNN) |
| `pessoa_id` | cliente |
| `tipo_evento` | texto livre, opcional (ex: "aniversário", "evento religioso") — visto no campo "Objetivo" do EstoqueNow |
| `data_emissao` | quando o orçamento foi feito |
| `data_confirmacao` | quando o cliente confirmou |
| `data_entrega_planejada` / `data_entrega_realizada` | ver `Logistica` abaixo — nunca é um único campo fixo |
| `data_devolucao_planejada` / `data_devolucao_realizada` | idem |
| `situacao` | ver máquina de estados em `03-estados-e-regras-de-negocio.md` |
| `desconto` | valor livre, negociado |
| `frete` | valor cobrado pela entrega+retirada (ou 0 se retirada na loja) |
| `observacoes` | texto livre — aqui entra o histórico de "porquês" (chuva, favor, etc.) |

### ItensDoPedido
Cada item (próprio ou terceirizado) dentro de um pedido.

| Campo | Observação |
|---|---|
| `pedido_id` | |
| `item_id` | nulo se for item terceirizado sem cadastro no catálogo próprio |
| `descricao_livre` | usado quando não há `item_id` (ex: tenda alugada de terceiro, item avulso fora do catálogo — motto "corremos atrás de tudo") |
| `quantidade` | |
| `preco_unitario_combinado` | o que foi de fato cobrado — pode diferir do `preco_diaria` de referência |
| `tipo` | proprio · terceirizado |
| `fornecedor_id` | se terceirizado |
| `custo_fornecedor` | quanto a Hall Eventos pagou ao terceiro (para saber se houve markup) |

### Pagamentos (parcelas)
Um pedido pode ter várias parcelas (sinal + saldo é comum).

| Campo | Observação |
|---|---|
| `pedido_id` | |
| `vencimento` | |
| `descricao` | ex: "sinal", "saldo", "parcela única" |
| `forma_pagamento` | pix · transferência · cartão · à vista/dinheiro |
| `situacao` | pendente · pago · atrasado |
| `valor_bruto` / `valor_liquido` | (líquido relevante se um dia cobrarem taxa de cartão) |
| `comprovante` | anexo opcional — hoje é print mandado no WhatsApp |
| `data_execucao` | quando de fato caiu |

### Logística (eventos de entrega/devolução)
Cada pedido gera dois eventos logísticos — entrega e devolução — cada um rastreado
separadamente, porque **a data combinada muda várias vezes até acontecer de verdade**.

| Campo | Observação |
|---|---|
| `pedido_id` | |
| `tipo` | entrega · devolução |
| `data_hora_planejada` | a estimativa vigente — **muda com reagendamentos** |
| `data_hora_realizada` | quando de fato aconteceu |
| `retirada_na_loja` | boolean — se true, não precisa de endereço |
| `endereco` | se não for retirada na loja |
| `situacao` | planejada · concluída · atrasada |
| `responsavel` | quem entregou/buscou |

### ReposicaoMulta (raro)
Cobrança extra por item danificado/perdido — não um campo do pedido, um registro à parte que só
existe quando acontece.

| Campo | Observação |
|---|---|
| `pedido_id` | |
| `item_id` | qual peça |
| `quantidade` | quantas unidades |
| `motivo` | dano · extravio |
| `valor_cobrado` | geralmente = `preco_reposicao` do item, mas pode ser negociado |
| `evidencia` | foto/vídeo anexado |

### Documentos
Anexos por pedido: nota fiscal, comprovante de pagamento, foto/vídeo de dano. Hoje tudo isso
circula solto pelo WhatsApp.

## Relacionamentos (resumo)

```
Pessoas 1──N Pedidos
Pedidos 1──N ItensDoPedido ──N:1── Itens
Pedidos 1──N Pagamentos
Pedidos 1──N Logistica (tipicamente 2: entrega + devolução)
Pedidos 1──N ReposicaoMulta (raro)
Pedidos 1──N Documentos
Fornecedores 1──N ItensDoPedido (quando terceirizado)
```

## 4. Decisões em aberto (preciso da sua validação)

1. **Fornecedor como `pessoas` com papel, ou tabela própria?** O sistema irmão (HallaxOS,
   veículos) usa `pessoas` + papéis pra isso. Faz sentido aqui também, já que fornecedor às
   vezes é uma pessoa física conhecida (ex: o dono da empresa de som). Minha recomendação:
   reaproveitar o mesmo padrão.
2. **Vale a pena ter uma tabela `Kits` formal** (ex: "Jogo Completo Branco" = 1 Mesa Isabela
   Branca + 4 Poltronas Isabela Branca), só pra facilitar a tela de novo pedido (clicar "5
   jogos" em vez de calcular manualmente mesa+cadeira)? Ou isso fica só na lógica da tela, sem
   virar tabela? Minha recomendação: fica só na tela (não persiste como entidade), porque a
   proporção real de entrega varia.
3. **Código do pedido**: mantemos o formato do EstoqueNow (`AAMMDD/NNN`) pra facilitar
   comparação com o histórico, ou simplificamos pra um sequencial simples?
