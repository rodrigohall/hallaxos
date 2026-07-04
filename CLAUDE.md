# CLAUDE.md — Regras permanentes do HallaxOS

## O que é este projeto

HallaxOS é o sistema de gestão da empresa do Rodrigo (Dourados-MS): guincho,
locação de veículos, compra/venda de ativos, financeiro, manutenções e agenda.
Monorepo TypeScript com pnpm workspaces: `apps/api` (Fastify 5 + Postgres 16),
`apps/web` (Vite + React + Tailwind), `packages/shared`. Roda em produção num
VPS Hostinger (`http://2.25.200.8`) via Docker Compose, com deploy automático
por GitHub Actions (`.github/workflows/deploy.yml` → rsync → `deploy/instalar.sh`).

## REGRA MÁXIMA — uma informação, um lugar

Cada informação existe exatamente UMA vez no sistema, fluindo pelo núcleo
compartilhado (Pessoas, Ativos, Operações, Financeiro, Manutenções, Timeline)
via foreign keys. **Nunca duplique dado; sempre referencie.** Se uma feature
parecer pedir duplicação, pare e proponha alternativa ao Rodrigo.

## Branches e deploy

- **`main` é o único branch de longa duração.** Deploy dispara em push no `main`.
- Branches de sessão são efêmeros: nascem do `main`, recebem commits pequenos
  e frequentes, são mergeados no `main` ao final da sessão e **apagados**.
- Nunca deixe branch órfão no remoto — histórico vive no `main`.

## estado.txt — fonte de verdade externa do estado deployado

`http://2.25.200.8/estado.txt` publica, a cada deploy: commit deployado, data,
branch, sprint atual e últimos 15 commits. Existe porque o cache do GitHub
(raw/blobs) serve versões desatualizadas a consultas externas, o que engana a
retomada de sessões — consulte o estado.txt, não o GitHub, para saber o que
está no ar. É gerado pelo CI (step "Gerar estado.txt" no deploy.yml) em
`apps/web/public/estado.txt` e servido como estático pelo Caddy.
**Qualquer mudança no fluxo de deploy deve manter o estado.txt funcionando** —
valide com `curl http://2.25.200.8/estado.txt` após deploy.

## Fluxo de trabalho de toda sessão

1. **Leitura antes de código**: `docs/pendencias.md` (estado real do sistema),
   `CHANGELOG.md` (histórico por sprint), `docs/operacao-vps.md` (produção).
2. **Plano antes de código**: apresente o plano e aguarde aprovação do Rodrigo
   antes de implementar.
3. **Frente a frente / tab a tab**: implemente uma frente por vez, com commit
   pequeno e descritivo ao final de cada uma.
4. **Docs no mesmo PR**: `CHANGELOG.md` e `docs/pendencias.md` são atualizados
   junto com o código, nunca depois.
5. **Navegação sem becos**: toda entidade mencionada em qualquer tela é
   clicável e leva à sua página (playbook em `docs/loop-sem-becos.md`).
6. **Validação visível**: nenhum formulário falha silenciosamente — erro de
   validação sempre aparece na tela.
7. O ambiente remoto não tem navegador: liste ao final o que precisa de
   validação visual manual pelo Rodrigo.

## Pendências conhecidas de infraestrutura

- **SSH do VPS intermitente na porta 22** (fail2ban/firewall × runners do
  GitHub). Runbook completo em `docs/operacao-vps.md §1` — retry 4× já está no
  workflow; correção permanente (porta alta + `VPS_PORT`) ainda não aplicada.
- `react-leaflet` foi bloqueado duas vezes pelo ambiente — mapas usam iframe
  OSM embed (padrão do dashboard). Não insista nessa dependência.
