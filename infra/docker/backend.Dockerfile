# syntax=docker/dockerfile:1.7
#
# Imagen multi-stage para @seei/backend (NestJS). Contexto de build: raíz del monorepo (ver
# infra/docker/docker-compose.yml), porque pnpm workspaces necesita el árbol completo para
# resolver `pnpm-lock.yaml` y las dependencias internas.
#
# También la reutiliza el servicio `migrate` (design.md, "Topología de Docker Compose"): misma
# imagen `runtime`, comando distinto (`prisma migrate deploy` con el rol `seei_migrator`).
# docker-compose.dev.yml apunta a la etapa `base` para correr `nest start --watch` sobre
# bind mounts (no hay etapa `dev` propia: task 6.1 solo la exige para `frontend`).

# `openssl` es requerido en runtime por los binarios de motor de Prisma sobre musl (alpine); sin
# él, `@prisma/client`/`prisma migrate deploy` fallan con "Could not parse schema engine
# response" (gotcha real, confirmado durante la verificación en vivo de la tarea 6.6).
FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS build
RUN pnpm --filter @seei/backend build

# `pnpm deploy` produce un directorio autocontenido (node_modules reales, sin symlinks al
# store del workspace), listo para copiarse a una imagen final delgada. Se deja fuera
# `--prod` a propósito: el servicio `migrate` necesita `prisma` (devDependency) en runtime.
FROM build AS deploy
RUN pnpm --filter @seei/backend deploy --legacy /app

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deploy /app ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
