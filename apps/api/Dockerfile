# API — imagem de produção. Roda migrations e sobe o servidor.
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

# Camada de dependências (cacheável)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @hallaxos/api...

# SHA do commit publicado. Declarado ANTES do COPY do código: muda a cada
# deploy, invalida o cache das camadas de código e garante que o build pegue
# as mudanças (era a causa do "deploy verde" rodando código antigo).
# Exposto em runtime via GET /api/v1/versao.
ARG GIT_SHA=dev
ENV HALLAX_VERSAO=$GIT_SHA

COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /app/apps/api
EXPOSE 3333
CMD ["sh", "-c", "pnpm migrate && exec pnpm exec tsx src/index.ts"]
