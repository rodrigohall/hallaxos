# HallaxOS

O cérebro operacional da Hallax.

HallaxOS não é um ERP. É um sistema único, com **uma base de dados centralizada**,
onde cada módulo é apenas uma forma diferente de visualizar e manipular os mesmos dados.

## Regra máxima

> Toda informação existe apenas uma vez.

Nunca duplicamos dados. Nunca criamos entidades redundantes. Tudo reutiliza o núcleo compartilhado.

## Módulos

| Módulo              | O que é, de verdade                                      |
| ------------------- | -------------------------------------------------------- |
| Guincho 24h         | Operações do tipo `guincho` sobre o núcleo compartilhado |
| Aluguel de Veículos | Operações do tipo `locacao`                              |
| Compra e Venda      | Operações dos tipos `compra` e `venda`                   |
| Financeiro          | Lançamentos — sempre com origem rastreável               |
| Dashboard Executivo | Consultas sobre o núcleo (não possui dados próprios)     |
| Agenda              | Eventos manuais + eventos derivados dos dados            |
| Relatórios          | Consultas sobre o núcleo (não possui dados próprios)     |

## Núcleo compartilhado

Pessoas · Ativos · Operações · Financeiro · Documentos · Manutenções · Usuários · Timeline

## Como rodar

Pré-requisitos: Node 22+, pnpm 10+ e Docker (para o Postgres).

```bash
pnpm install
pnpm dev        # sobe o banco, aplica migrations, semeia e inicia API (3333) + Web (5173)
```

Acesse http://localhost:5173 e entre com:

| Papel      | Login                  | Senha      |
| ---------- | ---------------------- | ---------- |
| admin      | admin@hallax.com       | hallax123  |
| gestor     | gestor@hallax.com      | hallax123  |
| operador   | operador@hallax.com    | hallax123  |
| financeiro | financeiro@hallax.com  | hallax123  |

Com Postgres próprio (sem Docker): copie `.env.example` para `.env`, ajuste `DATABASE_URL` e rode `pnpm dev`.

## Deploy em VPS (produção)

Em um VPS Ubuntu/Debian limpo, três comandos:

```bash
git clone -b claude/stoic-shannon-d3fxpi https://github.com/rodrigohall/hallaxos.git
cd hallaxos
./deploy/instalar.sh                       # acesso por IP (http)
# ou, com domínio apontado para o VPS (HTTPS automático):
DOMINIO=os.hallax.com ./deploy/instalar.sh
```

O instalador cuida de tudo: instala o Docker se faltar, gera senhas fortes em
`.env` (banco + admin), constrói as imagens, aplica as migrations e sobe
banco + API + site. Ao final, imprime o endereço e o login inicial.

- Atualizar versão: `git pull && ./deploy/instalar.sh`
- Logs: `docker compose -f docker-compose.prod.yml logs -f`
- Sem dados de demonstração em produção — o admin inicial vem do `.env`.

### Como os deploys realmente acontecem hoje (VPS Hostinger)

O ambiente de produção roda num **VPS da Hostinger** (Ubuntu), com **acesso ao
terminal** por SSH e pelo **Console web** do painel da Hostinger. O fluxo:

1. **Deploy automático (CI):** push no branch `claude/stoic-shannon-d3fxpi`
   dispara o GitHub Actions (`.github/workflows/deploy.yml`), que valida
   (typecheck/build/testes) e, se passar, envia o código por SSH/rsync ao VPS e
   roda `./deploy/instalar.sh`. Segredos em GitHub → Settings → Secrets:
   `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
2. **A conexão SSH ao VPS é intermitente.** Às vezes o job de deploy falha com
   `connect to host port 22: Connection timed out` — o sistema continua no ar,
   só a atualização não aplica. Já corrigimos o `sshd` para subir no boot
   (`systemctl enable ssh`); a estabilização completa é pendência do Sprint 9.
3. **Quando o CI falha, atualizamos manualmente pelo terminal do VPS** (o repo é
   público, então dá para baixar os arquivos alterados via `curl` e reconstruir
   só o container afetado com `docker compose ... up -d --build`).

⚠️ **Já passamos por:** perda do `.env` em produção (virou o `.env.example`) e
recuperação da senha do banco a partir dos containers em execução; cache do
Docker não pegando mudanças; senha do admin no `.env`. **Todo o passo a passo
desses cenários está em [`docs/operacao-vps.md`](docs/operacao-vps.md)** — leia
esse runbook antes de mexer em deploy/servidor.

## Documentação

A arquitetura é definida **antes** do código. Leia em ordem:

1. [`docs/01-visao-geral.md`](docs/01-visao-geral.md) — princípios, diretrizes permanentes, decisões arquitetônicas e stack
2. [`docs/02-modelo-de-dados.md`](docs/02-modelo-de-dados.md) — todas as entidades, relacionamentos e o DER
3. [`docs/03-estados-e-regras-de-negocio.md`](docs/03-estados-e-regras-de-negocio.md) — máquinas de estado e regras
4. [`docs/04-servicos-transversais.md`](docs/04-servicos-transversais.md) — notificações, tags, favoritos, comentários, anexos, auditoria e busca global
5. [`docs/05-permissoes.md`](docs/05-permissoes.md) — autenticação, papéis e matriz de permissões
6. [`docs/06-api.md`](docs/06-api.md) — convenções e contrato completo da API
7. [`docs/07-design-system.md`](docs/07-design-system.md) — identidade, tokens e biblioteca de componentes

Documentos vivos, sincronizados a cada sprint: [`CHANGELOG.md`](CHANGELOG.md) ·
[`docs/decisoes.md`](docs/decisoes.md) · [`docs/pendencias.md`](docs/pendencias.md)

## Status do projeto

**Sprint 8 concluída — em produção.** Sistema operacional de ponta a ponta:
login e permissões por papel, clientes, **ativos** (fotos, documentos, FIPE,
resultado financeiro e expectativa de lucro de venda), **operações unificadas**
(guincho · locação · venda · compra, com máquinas de estado e financeiro
automático), **financeiro** (parcelas, estorno, contas, fluxo de caixa),
**relatórios** (ROI por ativo, DRE), **manutenções** e **agenda** derivada,
busca global, timeline imutável e dashboard. Confiabilidade: **backup
automático** do Postgres, **suíte de testes** como porta de qualidade no CI,
**bloqueio progressivo de login** e troca de senha própria. Serviços
transversais: **notificações** (sino na UI + job de prazos), **tags**,
**favoritos**, **rate limiting** (200 req/min por IP) e auditoria de negações.
Deploy contínuo no VPS a cada push.

**Sprint 9 em andamento — Copiloto de IA (leitura + UI, em produção).**
`POST /copiloto/perguntar` orquestra o modelo Claude por *function calling* sobre
os **serviços que as telas já usam** (busca, dashboard, operações, relatórios),
sem dados próprios e revalidando o papel do usuário em cada ferramenta. **Fase 1
é só leitura** ("quanto faturei em maio?", "quais guinchos estão abertos?"): cita
as fontes e nunca inventa número. UI no **⌘K + painel lateral** com fontes
clicáveis. **Desligado por padrão** (sem custo) até o secret `IA_API_KEY`; modelo
`claude-haiku-4-5` (configurável por `IA_MODELO`). Escrita guardrailada fica para
a Fase 2 e a estabilização do deploy segue pendente. Roadmap em
[`docs/pendencias.md`](docs/pendencias.md).

**Atritos do uso real resolvidos (jun/2026):** edição dos lançamentos
financeiros **antes de finalizar** a operação (conta, forma, parcelas e
vencimentos, persistindo só ao confirmar), atalho **"Usar endereço do cliente"**
no guincho e **cadastro/busca de oficinas** (papel `oficina` em Pessoas, sem
tabela nova). Detalhes no [`CHANGELOG.md`](CHANGELOG.md).

**Ajustes recentes em produção (jun/2026):** correção do login (rate-limit
incompatível com Fastify 5), **upload pelo iPhone** (iOS Safari invalidava o
arquivo ao limpar o input cedo demais), **criar categoria/conta direto no
lançamento** (necessário porque em produção não há seed) e **CEP com
autocomplete** no cadastro de cliente (ViaCEP). Detalhes no
[`CHANGELOG.md`](CHANGELOG.md).

**Correções do uso real II (15/jun/2026 — em produção):** a **aba de Manutenções**
voltou a abrir (bug latente desde o Sprint 6: `WHERE` cru referenciando o nome
real da tabela depois do alias `m`, `42P01`); **exclusão permanente de foto**
(`DELETE /documentos/:id?permanente=true` faz hard delete real do arquivo + linha,
com modal e evento na timeline); e **anulação de lançamento** (`POST
/lancamentos/:id/anular`, só admin) que tira o valor de todos os indicadores sem
contrapartida, **preservando a linha e o vínculo origem→lançamento** — diferente
do estorno e do hard delete. Porta de qualidade: a CI ganhou um **Postgres real**
no job `verificar` + **testes de integração** (lista de manutenções e anulação),
porque erro de SQL cru passa pelo typecheck/build e só estoura em runtime. **33
testes verdes; deploy automático no VPS concluído** (run verde, sem timeout SSH).
Detalhes no [`CHANGELOG.md`](CHANGELOG.md) e em [`docs/decisoes.md`](docs/decisoes.md) (#41).

### Continuar o desenvolvimento (para uma nova sessão)

- **Branch único e fonte da verdade:** `claude/stoic-shannon-d3fxpi`. É onde o
  código vive **e** de onde o deploy automático sai (o workflow dispara em push
  nesse branch). Desenvolva e dê push aqui. Os demais branches `claude/*` são
  obsoletos — podem ser apagados na UI do GitHub (já estão contidos no histórico
  deste).
- **Estado e próximos passos:** consolidados em [`CHANGELOG.md`](CHANGELOG.md) e
  [`docs/pendencias.md`](docs/pendencias.md) (seção Roadmap → Sprint 9).
- **Operação/deploy do servidor:** leia o runbook
  [`docs/operacao-vps.md`](docs/operacao-vps.md) — VPS Hostinger, fluxo de
  deploy, o problema intermitente de SSH e como contornar (re-run ou aplicação
  manual pelo terminal), e a recuperação do `.env`. Importante porque o deploy
  automático ainda falha às vezes e exige passos manuais no VPS.
- **Próximas tarefas conhecidas:** copiloto com escrita guardrailada (Fase 2 —
  proposta de ação confirmada pelo humano, via endpoints existentes),
  **estabilizar o deploy** (timeout SSH intermitente do VPS — investigar
  fail2ban/firewall da Hostinger), e ligar a IA quando houver chave
  (`IA_API_KEY`). O usuário tem mais funcionalidades a pedir na próxima sessão.

> **Fluxo de trabalho desta linha de desenvolvimento:** o dono do produto tem
> acesso ao terminal do VPS (Hostinger) e topa rodar comandos colados quando o
> deploy automático falha. Ao entregar algo, **dê push no branch acima** e
> confirme o deploy; se o CI não conseguir publicar, forneça o comando manual
> pronto para colar no terminal do VPS (ver runbook).
