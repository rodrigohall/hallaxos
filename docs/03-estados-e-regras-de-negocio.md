# 03 · Estados e Regras de Negócio

> Toda transição de estado acontece em **transação** no backend e gera evento
> na timeline. O frontend nunca decide estado — apenas solicita transições.

## 1. Máquinas de estado

### Ativo

```
disponivel ──→ reservado ──→ alugado ──→ disponivel
    │                                       
    ├──→ em_manutencao ──→ disponivel       
    ├──→ em_uso_interno ──→ disponivel      
    ├──→ vendido        (terminal — nunca deletado)
    └──→ baixado        (terminal — perda total, sucata, descarte)
```

| Estado           | Significado                                          |
| ---------------- | ---------------------------------------------------- |
| `disponivel`     | Pronto para operar/alugar                            |
| `reservado`      | Locação confirmada, aguardando retirada              |
| `alugado`        | Com cliente                                          |
| `em_manutencao`  | Manutenção em andamento bloqueia o ativo             |
| `em_uso_interno` | Caminhão guincho em serviço, ativo em uso da empresa |
| `vendido`        | Terminal. Histórico preservado integralmente         |
| `baixado`        | Terminal. Saiu do patrimônio sem venda               |

### Operação · Locação

```
orcamento ──→ reservada ──→ ativa ──→ finalizada
    │             │           │
    └─────────────┴───────────┴──→ cancelada
```

- `orcamento` → não afeta o ativo nem o financeiro.
- `reservada` → ativo vai para `reservado`.
- `ativa` (retirada do veículo) → ativo vai para `alugado`; registra `km_saida`.
- `finalizada` (devolução) → ativo volta a `disponivel`; registra `km_retorno`
  e atualiza `km_atual`; gera/ajusta lançamentos.
- `cancelada` → ativo volta a `disponivel` (se estava reservado); lançamentos
  previstos são cancelados.
- *Locação atrasada* (`ativa` + devolução prevista no passado) é **derivada**, não gravada.

### Operação · Guincho

```
solicitado ──→ a_caminho ──→ em_execucao ──→ concluido
     │             │              │
     └─────────────┴──────────────┴──→ cancelado
```

- `a_caminho` → caminhão guincho vai para `em_uso_interno`.
- `concluido` → caminhão volta a `disponivel`; gera lançamento de receita.

### Operação · Compra / Venda

```
negociacao ──→ fechada ──→ concluida
     │            │
     └────────────┴──→ cancelada
```

- **Venda** `fechada` → gera lançamentos de receita; `concluida` (pagamento +
  transferência) → ativo vai para `vendido`.
- **Compra** `fechada` → gera lançamentos de despesa; `concluida` → **cria o
  ativo** no patrimônio com status `disponivel`, já vinculado à operação de
  origem (a timeline do ativo nasce contando de onde ele veio e quanto custou).

### Lançamento

```
previsto ──→ pago
    │
    └──→ cancelado
```

`vencido` = `previsto` com vencimento no passado — sempre derivado.

### Manutenção

```
agendada ──→ em_andamento ──→ concluida
    │             │
    └─────────────┴──→ cancelada
```

- `em_andamento` → ativo vai para `em_manutencao`.
- `concluida`/`cancelada` → ativo volta ao estado anterior; se veículo,
  atualiza `km_atual`.

## 2. Regras de negócio centrais

### Integridade entre módulos

1. **Um ativo só participa de uma operação bloqueante por vez.** Não existe
   reservar/alugar um ativo `em_manutencao`, nem agendar manutenção iniciando
   durante uma locação ativa. O backend valida na transição, não na tela.
2. **Operações nunca deletam ativos; vendas nunca apagam histórico.** Status
   terminal preserva tudo — é isso que permite "quanto lucro o Corolla deu?"
   anos depois da venda.
3. **Toda transição de status grava na timeline** com autor, descrição legível
   e diff estruturado. Sem exceção.

### Financeiro

4. **Operações geram lançamentos; nunca o contrário.** Fechar uma locação gera
   as receitas previstas automaticamente. O usuário não digita de novo um
   valor que o sistema já conhece (regra máxima aplicada a processo).
5. **Lançamento gerado por operação não é editável livremente** — ajustes
   passam pela operação (desconto, dias extras), que recalcula. Lançamentos
   avulsos são livres. **Antes de finalizar**, porém, o usuário revisa e ajusta
   o que será gerado na própria página da operação — conta, forma de pagamento,
   nº de parcelas e o vencimento de cada parcela (`financeiro` na transição,
   doc 06). A finalização só persiste após essa confirmação; depois de
   finalizada, vale o fluxo acima (edição pelo Financeiro, com auditoria). A
   geração não muda a máquina de estados — só os parâmetros do lançamento.
6. **Cancelar operação cancela os lançamentos `previsto` vinculados.**
   Lançamentos já pagos não somem: geram contrapartida (estorno) — dinheiro
   que entrou no caixa nunca desaparece do histórico.
7. **Saldo de conta, custo de manutenção e total de parcelas são sempre
   derivados.** Nenhum agregado financeiro é armazenado.

### Cadastros e UX

8. **Busca antes de cadastro.** Criar operação começa buscando a pessoa por
   nome/CPF/telefone; só oferece criar se não existir. Idem para ativos.
9. **CNH vencida do condutor bloqueia ativação de locação** (admin pode
   sobrepor com justificativa — que vai para a timeline).
10. **Papéis de pessoa são automáticos.** Fechou operação → ganha `cliente`;
    executou manutenção → ganha `fornecedor`. O usuário não gerencia isso.
11. **Soft delete com proteção.** Pessoa/ativo com operações vinculadas não
    pode ser excluído — pode ser *arquivado* (some das buscas, permanece no
    histórico).

### Agenda (eventos derivados — sem cópia)

A agenda exibe, por consulta direta às origens:

| Evento na agenda            | Fonte                                              |
| --------------------------- | -------------------------------------------------- |
| Devolução de locação        | `operacoes_locacao.data_devolucao_prevista`        |
| Manutenção agendada         | `manutencoes.data_agendada`                        |
| Lançamento a vencer/vencido | `lancamentos.data_vencimento`                      |
| CNH vencendo                | `pessoas.cnh_validade`                             |
| Documento vencendo (CRLV, seguro) | `documentos.data_validade`                   |
| Compromissos manuais        | `eventos_agenda` (única fonte própria)             |

## 3. Invariantes (o banco garante, não a disciplina)

- `lancamentos`: CHECK de origem única (`operacao_id` e `manutencao_id` não
  simultâneos); CHECK `valor > 0`; CHECK `status = 'pago' ⇔ data_pagamento IS NOT NULL`.
- `operacao_ativos`: UNIQUE parcial impedindo o mesmo ativo como `objeto` em
  duas operações não-terminais ao mesmo tempo.
- `ativos_veiculos`: só existe se a categoria do ativo for veicular (validado
  no service; placa UNIQUE no banco).
- Extensões 1:1 (`operacoes_*`, `ativos_veiculos`): PK = FK, impossível haver
  duas extensões para o mesmo registro.
- `timeline`: sem permissão de UPDATE/DELETE para o papel da aplicação no
  Postgres — imutabilidade garantida pelo banco.
