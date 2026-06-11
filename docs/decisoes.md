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

## Como propor mudança

Discordou de uma decisão? Escreva a proposta com o contexto novo que a justifica
e o impacto (arquitetura, banco, financeiro, timeline, relatórios) antes de
qualquer implementação.
