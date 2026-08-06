# syntax=docker/dockerfile:1.7
#
# Imagen multi-stage para @seei/frontend (Vite + React). Contexto de build: raíz del monorepo,
# porque el frontend importa `@seei/contracts` (workspace) directamente desde su código fuente
# (`@seei/contracts/src/client`, sin paso de build propio del paquete de contratos).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

# Etapa de desarrollo (docker-compose.dev.yml la selecciona vía `build.target: dev`): sirve el
# servidor de Vite directamente sobre el código montado por bind mount, en el mismo puerto 8080
# que la etapa de producción, para que el Caddyfile no tenga que ramificarse entre entornos.
FROM base AS dev
WORKDIR /repo/apps/frontend
EXPOSE 8080
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "8080"]

FROM base AS build
RUN pnpm --filter @seei/frontend build

# Etapa final: solo el estático compilado (`dist/`), sin el toolchain de Node del build.
# `serve` sirve el SPA en :8080 con fallback a index.html.
FROM node:22-alpine AS runtime
WORKDIR /app
RUN npm install --global serve@14 --no-fund --no-audit
COPY --from=build /repo/apps/frontend/dist ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
