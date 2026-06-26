# Playbook — Loop "Sem Becos" (auditoria de UI recorrente)

> Este arquivo é o **roteiro durável** do loop que mantém a UI sem becos sem
> saída. Qualquer sessão futura (manual, cron ou trigger agendado) executa o
> mesmo loop colando o prompt abaixo. A fila de trabalho vive em
> [`ui-deadends.md`](ui-deadends.md); este arquivo é só o *como rodar*.

## O que o loop garante

Toda entidade exibida na UI (cliente, ativo, operação, manutenção) que tenha um
**id disponível no dado** deve ser clicável até sua ficha 360°, **reusando rotas
existentes** (`/clientes/:id`, `/ativos/:id`, `/operacoes/:id`, `/manutencoes/:id`).
Sem rotas/páginas/tabelas novas. Sem poluição de botões. Sem inventar backend.

## Como rodar (cole este prompt numa sessão Claude Code no repo)

```
Rode o loop "sem becos" da UI do HallaxOS.

1. Leia docs/ui-deadends.md (a fila) e docs/loop-sem-becos.md (as regras).
2. VARREDURA: releia todas as páginas em apps/web/src/paginas/. Para cada
   entidade exibida como texto morto que tenha id no dado e tenha rota de ficha,
   acrescente um item [ ] novo na fila de docs/ui-deadends.md.
3. Para cada item [ ] pendente, faça a correção mínima e significativa:
   - <Link to={...} className="hover:text-ouro"> reusando rota existente.
   - Importe Link de react-router-dom se faltar.
   - PULE [~] (com motivo) se: não há id, não há rota de ficha p/ o tipo, a
     linha já é um <Link> (evitar <a> dentro de <a>), ou é form/seletor.
4. GATE: rode `pnpm --filter web build`. Tem que passar antes de commitar.
5. Commit por lote: `fix(ui): <páginas> — becos resolvidos`. Marque os itens
   [x]/[~] em docs/ui-deadends.md e registre 1 linha no Histórico.
6. Push para a branch de desenvolvimento vigente.
7. Pare quando a fila estiver toda [x]/[~]. Reporte: quantos fechados, quantos
   pulados (com motivo) e o resultado do build. Se nada novo foi encontrado,
   diga isso explicitamente — é um resultado terminal válido.

Pode usar subagentes (um por página/item) para paralelizar — eles editam e
rodam typecheck; você (orquestrador) faz build, commit e push.
```

## Regras invioláveis (resumo — detalhe em `ui-deadends.md`)

1. Só rotas existentes. Nenhuma rota/página/tabela/campo-de-backend novo.
2. Um link significativo por referência. Consistência > volume.
3. Só linke se o destino existir (id presente + tipo com ficha). Senão `[~]`.
4. Padrão visual de `AtivoDetalhe.tsx` (referência de ouro).
5. `pnpm --filter web build` verde é pré-condição de todo commit.

## Agendar semanalmente (execução garantida na nuvem)

O cron de sessão do Claude Code é efêmero (expira em 7 dias e só roda com uma
sessão viva). Para um agendamento semanal **confiável** neste ambiente remoto,
use um **trigger agendado do Claude Code na web** apontando para o prompt acima:
veja https://code.claude.com/docs/en/claude-code-on-the-web (seção de triggers/
agendamento). Crie um trigger semanal cujo prompt seja "Rode o loop 'sem becos'
da UI do HallaxOS (ver docs/loop-sem-becos.md)".

## Histórico de execuções do loop

- 2026-06-26 — primeira rodada: 6 becos fechados, 3 recusas corretas, build verde.
  Detalhe em `ui-deadends.md`.
