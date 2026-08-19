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

   Login con Google y recuperación de contraseña (backlog #5, `adrs/0017-*.md`) agregan estas
   variables, todas opcionales en desarrollo — sin `GOOGLE_CLIENT_ID`/`GOOGLE_HOSTED_DOMAINS` el
   login OAuth rechaza todo pedido en tiempo de request; sin `SMTP_HOST` la recuperación funciona
   igual y el enlace sale por consola (`ConsoleEmailSender`):

   | Variable | Uso |
   |---|---|
   | `GOOGLE_CLIENT_ID` | `audience` esperado al verificar el ID token de Google |
   | `GOOGLE_HOSTED_DOMAINS` | Dominios institucionales permitidos, separados por coma |
   | `VITE_GOOGLE_CLIENT_ID` (frontend, `apps/frontend/.env`) | `client_id` que usa Google Identity Services para renderizar el botón "Continuar con Google" del login (`administracion-procesos-electorales`, design.md D10). **Debe ser el mismo valor** que `GOOGLE_CLIENT_ID` del backend — el backend lo verifica como `audience`. Sin esta variable el botón de Google no se renderiza (fail-closed); el login por código sigue funcionando |
   | `RECOVERY_TTL_SECONDS` | TTL del token de recuperación en Redis (por defecto `1800`) |
   | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Credenciales SMTP de `SmtpEmailSender`; sin `SMTP_HOST` se usa `ConsoleEmailSender` |
   | `APP_BASE_URL` | Base para armar el enlace de recuperación (`${APP_BASE_URL}/recuperar?token=...`) |

   Bloqueo y desbloqueo de cuentas (backlog #6) agrega estas tres variables, todas opcionales en
   desarrollo (`BloqueoService` cae a sus valores por defecto sin ellas):

   | Variable | Uso |
   |---|---|
   | `LOGIN_INTENTOS_MAX` | Umbral de intentos fallidos consecutivos que dispara el bloqueo automático (por defecto `5`) |
   | `LOGIN_INTENTOS_VENTANA_SEGUNDOS` | TTL fijo (no deslizante) del contador de intentos fallidos en Redis (por defecto `900`) |
   | `LOGIN_BLOQUEO_SEGUNDOS` | Duración del bloqueo automático antes de la expiración perezosa (por defecto `900`) |

   El outbox de correo y comprobante autenticado (backlog #15, `adrs/0018-ventana-temporal-
   jobcorreo-diferido.md`, ya superado) agrega estas variables al servicio `worker`:

   | Variable | Uso |
   |---|---|
   | `DATABASE_URL` | Misma cadena `seei_app` que usa `backend` — el worker lee/escribe `JobCorreo` con su propio `PrismaClient`, generado del **mismo** schema (`design.md` D10, sin segundo `schema.prisma`) |
   | `SMTP_USER` / `SMTP_PASSWORD` | Credenciales SMTP que el worker compone junto con `Configuracion.smtp_host`/`smtp_puerto`/`smtp_remitente` (leídos de la base, no de variables de entorno) para armar `SmtpEmailSender`; sin `Configuracion.smtp_host` cae a `ConsoleEmailSender` (`design.md` D9) |
   | `OUTBOX_POLL_MS` | Intervalo del despachador de *polling* sobre `JobCorreo` (por defecto `5000`) |
   | `OUTBOX_BATCH` | Tamaño de lote que el despachador encola por cada ciclo (por defecto `20`) |

   Resultados en vivo (backlog #16) agrega esta variable, opcional en desarrollo
   (`resultados-cache.ts` cae a su valor por defecto sin ella):

   | Variable | Uso |
   |---|---|
   | `RESULTADOS_CACHE_TTL_SECONDS` | TTL en segundos de la caché Redis de `GET /procesos/:id/resultados` (por defecto `8`) |

   Cierre y actas de escrutinio (backlog #17, `design.md` D10/D15) agrega estas variables,
   opcionales en desarrollo, al servicio `worker`:

   | Variable | Uso |
   |---|---|
   | `ACTAS_POLL_MS` | Intervalo del despachador de *polling* sobre `Acta WHERE estado='borrador'` (por defecto `5000`) |
   | `ACTAS_BATCH` | Tamaño de lote que el despachador encola por cada ciclo (por defecto `20`) |

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
