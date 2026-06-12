# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento.

## Pendências técnicas (Sprint 1)

| Pendência | Contexto | Quando resolver |
|-----------|----------|-----------------|
| Job detector de referências órfãs (doc 04 §0) | Estrutura pronta; job agendado ainda não roda | Sprint 2 (junto com documentos) |
| Notificações: tabela existe, gatilhos não disparam | Regras definidas no doc 04 §4 | Sprint 2/3, conforme módulos que as geram |
| Bloqueio progressivo de login após falhas (doc 05 §1) | Falhas já vão para a timeline | Sprint 3 |
| Rate limiting e CORS de produção | Deploy existe; rate limit ainda não | Próxima sprint que tocar a API |
| Tela de troca de senha do próprio usuário | Admin define senhas; usuário ainda não troca a sua | Sprint 3 |
| Backup automático do Postgres em produção | Volume persiste, mas sem rotina de dump | Antes de uso real intenso |
| Auditoria de negações de acesso (doc 05 §4.3) | Negações retornam 403 mas não geram evento | Sprint 3 |
| Testes automatizados | Verificação da Sprint 1 foi manual via API real | Iniciar na Sprint 2 (services críticos primeiro) |
| Comentários, tags e favoritos: tabelas existem, sem API/UI | Schema completo desde a 0001 | Sprint 2 (junto com timeline/documentos) |
| Verificação visual em navegador real | Ambiente remoto sem browser (CDN bloqueada); design validado por build/tipos/API | Validar no primeiro `pnpm dev` local |
| Componentes especificados sem implementação: Calendário, paginação visual, upload arrastar-soltar | Doc 07 §6 | Entram com as telas que os usam (Sprints 2+) |

## Próximos passos — Sprint 2 (Ativos · Operações · Timeline · Documentos)

1. API + UI de **ativos** (núcleo + extensão veicular, categorias, status com máquina de estados).
2. API + UI de **operações** (núcleo + criação por tipo; transições viram endpoints nomeados).
3. **Timeline agregada do ativo** (eventos próprios + operações + manutenções, por consulta).
4. **Documentos**: upload, vínculo transversal, validade alimentando alertas.
5. Papéis automáticos de pessoa acionados pelas operações (`garantirPapel` já existe).
6. Início dos testes automatizados pelos services de operação (transições de estado).

## Próximos passos — Sprint 5 (Aluguel / Locação)

1. Fluxo completo de **locação** sobre o núcleo: `orcamento → reservada → ativa
   → finalizada` + `cancelada`, com extensão `operacoes_locacao` (diária,
   caução, km saída/retorno, devolução prevista/real).
2. Reaproveitar a **máquina de estados** e a **geração de financeiro** do
   guincho (extrair os helpers `garantirCategoriaReceita`/`contaPadrao` para um
   módulo comum quando o 2º consumidor entrar).
3. **CNH vencida bloqueia ativação** com override do admin justificado (doc 03
   regra 9) — primeiro uso do recurso `overrides`.
4. Devolução gera/ajusta lançamentos (dias extras, desconto) e atualiza
   `km_atual` do veículo.

## Sprints seguintes

- **Sprint 6**: Compra e venda (compra concluída cria o ativo; venda leva a
  status terminal `vendido`).
- **Sprint 7**: IA e automações (copiloto consumindo os mesmos endpoints de relatórios).

## Dívida conhecida da Sprint 4

| Pendência | Contexto | Quando resolver |
|-----------|----------|-----------------|
| Helpers de financeiro (`garantirCategoriaReceita`, `contaPadrao`) vivem em `guincho.ts` | Só há um consumidor hoje | Extrair para módulo comum na Sprint 5, com o 2º consumidor |
| Guinchos do seed indexados sem `veiculo_cliente_descricao` | Seed é anterior ao service; novos guinchos indexam certo | Próxima reescrita do seed ou `busca:reindexar` |
| Notificação `guincho_solicitado` (tabela existe, gatilho não dispara) | Regra no doc 04 §4 | Junto com o módulo de notificações |
