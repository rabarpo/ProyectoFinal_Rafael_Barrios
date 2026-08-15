# syntax=docker/dockerfile:1.7
#
# Imagen multi-stage para @seei/worker. Contexto de build: raíz del monorepo. `@seei/worker` no
# tiene paso de build (ver `apps/worker/package.json`, script `build` es un no-op): corre
# directamente sobre TypeScript fuente vía `tsx`, igual en desarrollo y en producción.
# docker-compose.dev.yml apunta a la etapa `base` para correr `tsx watch` sobre bind mounts.
#
# outbox-correo-comprobante-autenticado (#15, PR2; design.md D9/D10): el worker consume
# `@seei/backend` como dependencia de workspace (`EmailSender`/`SmtpEmailSender`/
# `ConsoleEmailSender` compilados en `dist/email/*`) y comparte el ÚNICO schema Prisma del
# backend (sin segundo `schema.prisma`, D10). Ambos pasos deben completarse ANTES de
# `pnpm deploy`, porque `pnpm deploy` sólo empaqueta lo ya construido/generado del paquete
# filtrado — no reconstruye sus dependencias de workspace.

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# D9: `@seei/backend` debe estar compilado (`dist/email/*`) antes del deploy del worker.
RUN pnpm --filter @seei/backend build

# `pnpm deploy` produce un directorio autocontenido; sin `--prod` para conservar `tsx`
# (devDependency, necesario para ejecutar `src/main.ts` en runtime).
FROM base AS deploy
RUN pnpm --filter @seei/worker deploy --legacy /app
# D10, contingencia VERIFICADA en apply (PR2): `pnpm deploy` resuelve `@prisma/client` en un
# virtual store nuevo que NO conserva el cliente generado por `pnpm --filter @seei/worker
# generate` en la etapa `base` — `node_modules/.prisma/client` queda ausente en `/app` tras el
# deploy. Se copia el schema único del backend al directorio desplegado y se genera ahí mismo,
# contra el `@prisma/client` ya instalado por el deploy (misma versión exacta que el backend).
COPY apps/backend/prisma /app/backend-prisma
RUN cd /app && node_modules/.bin/prisma generate --schema=./backend-prisma/schema.prisma

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deploy /app ./
CMD ["node_modules/.bin/tsx", "src/main.ts"]
