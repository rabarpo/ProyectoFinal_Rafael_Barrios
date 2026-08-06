# syntax=docker/dockerfile:1.7
#
# Imagen multi-stage para @seei/worker. Contexto de build: raíz del monorepo. `@seei/worker` no
# tiene paso de build (ver `apps/worker/package.json`, script `build` es un no-op): corre
# directamente sobre TypeScript fuente vía `tsx`, igual en desarrollo y en producción.
# docker-compose.dev.yml apunta a la etapa `base` para correr `tsx watch` sobre bind mounts.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# `pnpm deploy` produce un directorio autocontenido; sin `--prod` para conservar `tsx`
# (devDependency, necesario para ejecutar `src/main.ts` en runtime).
FROM base AS deploy
RUN pnpm --filter @seei/worker deploy --legacy /app

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deploy /app ./
CMD ["node_modules/.bin/tsx", "src/main.ts"]
