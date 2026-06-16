# Web — build estático servido pelo Caddy (HTTPS automático com domínio).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @hallaxos/web...

# SHA do commit publicado: muda a cada deploy e invalida o cache das camadas
# de código abaixo, garantindo que o bundle reflita o código atual.
ARG GIT_SHA=dev
ENV HALLAX_VERSAO=$GIT_SHA

COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @hallaxos/web build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
