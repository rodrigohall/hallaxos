# Pendências e Próximos Passos

> Atualizado ao fim de cada sprint. O que está aqui é dívida conhecida e
> assumida — não esquecimento.

## Pendências técnicas (Sprint 1)

| Pendência | Contexto | Quando resolver |
|-----------|----------|-----------------|
| Job detector de referências órfãs (doc 04 §0) | Estrutura pronta; job agendado ainda não roda | Sprint 2 (junto com documentos) |
| Notificações: tabela existe, gatilhos não disparam | Regras definidas no doc 04 §4 | Sprint 2/3, conforme módulos que as geram |
| Reindexação completa da busca (`busca:reindexar`) | Índice é reconstruível por design; falta o comando | Sprint 3 (busca global completa) |
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

## Sprints seguintes

- **Sprint 3**: Financeiro (lançamentos, contas, fluxo de caixa, estorno) · Relatórios · Busca global completa.
- **Sprint 4–6**: Guincho · Aluguel · Compra e venda (fluxos completos por módulo sobre o núcleo já existente).
- **Sprint 7**: IA e automações (copiloto consumindo os mesmos endpoints de relatórios).
