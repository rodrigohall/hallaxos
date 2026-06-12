# API — imagem de produção. Roda migrations e sobe o servidor.
FROM node:22-alpine
RUN corepack enable
WORKDIR /app

# Camada de dependências (cacheável)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @hallaxos/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /app/apps/api
EXPOSE 3333
CMD ["sh", "-c", "pnpm migrate && exec pnpm exec tsx src/index.ts"]
