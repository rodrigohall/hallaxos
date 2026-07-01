# 03 · Estados e Regras de Negócio — Hall Eventos

> Baseado nos status reais observados nos relatórios do EstoqueNow (abr–jun/2026), não em um
> ideal teórico.

## Máquina de estados do Pedido

```
Em Orçamento ──confirma──▶ Confirmado ──entrega──▶ Em Andamento ──devolução──▶ Finalizado
     │                          │                                                  ▲
     └──────────────cancela─────┴───────────────────cancela────────────────────────┘
                                                                          (Cancelado)
```

- **Em Orçamento**: mensagem de valores foi enviada, cliente ainda não confirmou. Boa parte
  desses nunca vira pedido de fato (vi vários "Em Orçamento" que nunca saem desse estado nos
  dados reais).
- **Confirmado**: cliente confirmou data e itens. Pagamento pode ou não já ter caído (sinal é
  comum).
- **Em Andamento**: itens já saíram (entrega concluída), aguardando devolução.
- **Finalizado**: itens devolvidos, pagamento quitado.
- **Cancelado**: pode acontecer a partir de qualquer estado anterior a Finalizado.

Nota: nos dados reais, "situação do pedido" e "situação de pagamento" às vezes aparecem
misturadas (ex: pedido em estado "Pago" mesmo antes da entrega). O modelo deve tratar **situação
do pedido** e **situação financeira** como dois eixos independentes, não um único status.

## Estado da Logística (por evento: entrega ou devolução)

```
Planejada ──────concluída no prazo──────▶ Concluída
     │
     └──passou da data prevista sem acontecer──▶ Atrasada ──acontece──▶ Concluída
```

Cada replanejamento (novo horário combinado) atualiza `data_hora_planejada` e deveria registrar
o motivo em `observacoes`/timeline — não sobrescrever silenciosamente, porque o histórico de
"por que atrasou" é operacionalmente relevante (ex: "atolou o caminhão", "problema na picape").

## Estado do Pagamento (por parcela)

```
Pendente ──pago até o vencimento──▶ Pago
     │
     └──passou do vencimento sem pagar──▶ Atrasado ──pago──▶ Pago
```

## Regras de negócio observadas (não inventadas)

1. **Preço não é calculado — é registrado.** O sistema não deve ter uma engine de precificação
   automática. Cada `ItemDoPedido.preco_unitario_combinado` é digitado por quem está atendendo,
   com o preço de tabela (`Itens.preco_diaria`) como referência/sugestão, não trava.

2. **Desconto e frete grátis são decisões humanas caso a caso**, registradas livremente no
   pedido — nunca calculadas por regra fixa (ex: "cliente recorrente ganha X% automaticamente").
   Exceção: se no futuro a Hall Eventos quiser formalizar uma política de desconto para
   parceiros recorrentes, isso é uma decisão de produto a ser tomada explicitamente — não algo
   a inferir do histórico.

3. **Reposição/multa é evento raro e manual.** Não faz parte do fluxo padrão de finalização do
   pedido — é um registro à parte, criado só quando algo de fato quebra ou some, com evidência
   (foto/vídeo).

4. **"Jogo" nunca é a unidade real de baixa de estoque.** Toda baixa/reserva de estoque acontece
   por peça (mesa, cadeira, toalha individual). "Jogo" é só uma forma de exibir/cobrar.

5. **Retirada na loja não gera evento de "entrega".** Quando o cliente busca/devolve
   pessoalmente, a Logística ainda existe (para rastrear quando saiu/voltou do estoque), mas sem
   endereço — só a flag `retirada_na_loja`.

## Em aberto — precisa de validação com o dono do produto

- **Conflito de agenda/estoque**: hoje, quando dois pedidos disputam o mesmo item na mesma
  janela de datas, como é resolvido na prática? (Não observamos um caso real nos dados
  exportados.) Isso decide se o sistema precisa de um "calendário de disponibilidade" com
  bloqueio automático, ou se basta um alerta informativo que o humano decide.
- **Múltiplos dias de aluguel**: vimos um caso (Casulo, 28/05→31/05, 3 dias) cobrado como se
  fosse 1 diária, por cortesia. Existe uma regra padrão de precificação por dia adicional
  quando não é cortesia, ou isso também é sempre negociado?
