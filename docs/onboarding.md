# Onboarding — arranque local del walking skeleton

Guía mínima para dejar corriendo el monorepo `seei` en local. Para el diseño completo (grafo de
Turborepo, roles de Postgres, topología de Docker Compose) ver
`openspec/changes/system-scaffolding/design.md`; para las decisiones ya cerradas,
`adrs/0014-monorepo-pnpm-turborepo.md` y `adrs/0015-roles-postgresql-migrador-app.md`.

## Requisitos previos

- Node.js `>=20` (ver `engines` en `package.json` raíz).
- pnpm `11.20.0` (fijado en `packageManager`; usar `corepack enable` o instalar esa versión exacta).
- Docker Desktop (o equivalente con `docker compose` v2) corriendo.

## Pasos de arranque

1. **Instalar dependencias del workspace:**

   ```bash
   pnpm install
   ```

2. **Copiar las variables de entorno de ejemplo** (`.env.example` → `.env` bajo `infra/docker/`,
   ver ese archivo para la lista completa: `POSTGRES_PASSWORD`, `SEEI_MIGRATOR_PASSWORD`,
   `SEEI_APP_PASSWORD`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `REDIS_URL`).

3. **Levantar el stack completo** (Caddy + frontend + backend + worker + Postgres + Redis, con el
   override de desarrollo — bind mounts, puertos de DB/Redis publicados solo en `127.0.0.1`):

   ```bash
   pnpm compose:dev
   ```

   Esto invoca `docker-compose.yml` + `docker-compose.dev.yml`. El servicio `migrate` corre una vez
   y aplica la migración baseline con el rol `seei_migrator` antes de que `backend`/`worker` queden
   `healthy`.

4. **Confiar la CA local de Caddy** (una sola vez por máquina; necesario para que el navegador
   acepte `https://seei.localhost` sin advertencia y para que las cookies `Secure` funcionen):

   ```bash
   pnpm caddy:trust
   ```

   Ver la sección **`## HTTPS local`** en `README.md` para el paso siguiente por sistema operativo
   (Windows/macOS/Linux) y la nota específica de Firefox (almacén de certificados propio).

5. **Verificar:** `https://seei.localhost/api/health` debe responder `200` con `db.estado`,
   `redis.estado` en `ok`, y `worker.ultimoPing` (puede ser `null` hasta el primer
   `POST /api/system/ping`).

## Comandos útiles desde la raíz

| Comando | Qué hace |
|---|---|
| `pnpm turbo run build` | Build de todo el workspace, respetando el grafo de Turborepo |
| `pnpm turbo run test` | Tests unitarios de `backend`/`frontend`/`worker`/`contracts` |
| `pnpm compose:dev` | `docker compose up` con base + override de desarrollo |
| `pnpm caddy:trust` | Copia la CA local de Caddy a `./caddy-local-root.crt` (ver `## HTTPS local`) |

## Gotcha a tener presente

Si se modifica `infra/docker/postgres/init/01-roles.sql`, el cambio **no** se aplica solo con
reiniciar los contenedores — hace falta `docker compose ... down -v` para recrear el volumen
`pgdata` vacío y que el entrypoint de Postgres vuelva a correr el script. Ver el detalle en la
sección `## HTTPS local` de `README.md`.
