# SEEI — andamiaje del sistema

Monorepo pnpm + Turborepo: `apps/backend` (NestJS), `apps/frontend` (Vite + React),
`apps/worker` (Node.js + BullMQ), `packages/contracts` (contrato OpenAPI generado
y versionado). Ver `openspec/changes/system-scaffolding/design.md` para el diseño
completo del walking skeleton, y `docs/onboarding.md` para los pasos de arranque
local.

Ver [`adrs/0014-monorepo-pnpm-turborepo.md`](adrs/0014-monorepo-pnpm-turborepo.md) para la
decisión de herramental de monorepo y contrato OpenAPI versionado, y
[`adrs/0015-roles-postgresql-migrador-app.md`](adrs/0015-roles-postgresql-migrador-app.md) para
la decisión de los dos roles de PostgreSQL (`seei_migrator`/`seei_app`).

## HTTPS local

`infra/docker/Caddyfile` usa `tls internal`: Caddy emite certificados desde una CA local propia,
persistida en el volumen `caddy_data`. El navegador no confía en esa CA por defecto — hasta que se
confía explícitamente, la SPA no puede llamar a `https://seei.localhost/api/*` (el navegador
bloquea la petición) y las cookies `Secure` se comportan de forma anómala, un síntoma fácil de
diagnosticar erróneamente como un bug de la aplicación.

Paso único de onboarding, ya encapsulado en el script raíz `pnpm caddy:trust` (requiere que
`caddy` esté corriendo vía `pnpm compose:dev`):

```bash
pnpm caddy:trust
# equivalente a:
# docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml \
#   cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-local-root.crt
```

Después de generar `caddy-local-root.crt`, hay que confiarlo en el almacén de certificados del
sistema operativo:

| Sistema | Comando |
|---|---|
| Windows | `certutil -addstore -f "ROOT" caddy-local-root.crt` (consola con privilegios de administrador) |
| macOS | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-local-root.crt` |
| Linux | copiar a `/usr/local/share/ca-certificates/` y ejecutar `sudo update-ca-certificates` |

**Firefox no usa el almacén del sistema operativo** — mantiene su propio almacén de confianza y
requiere importar `caddy-local-root.crt` por separado (`about:preferences#privacy` → Certificados →
Ver certificados → Autoridades → Importar).

`seei.localhost` resuelve a `127.0.0.1` en los navegadores y sistemas modernos (RFC 6761); si el
resolutor DNS del sistema no lo hace, agregar la entrada manualmente al archivo `hosts`.

### Gotcha: `docker-entrypoint-initdb.d` solo corre una vez

`infra/docker/postgres/init/01-roles.sql` (aprovisiona los roles `seei_migrator`/`seei_app`, ver
[`adrs/0015-roles-postgresql-migrador-app.md`](adrs/0015-roles-postgresql-migrador-app.md)) es
ejecutado por el entrypoint oficial de la imagen de Postgres **solo cuando el volumen `pgdata` está
vacío**. Si se modifica `01-roles.sql` con el volumen ya inicializado, el cambio **no** se aplica —
Postgres no vuelve a correr los scripts de `docker-entrypoint-initdb.d` sobre una base de datos
existente. Para que el cambio surta efecto:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml down -v
```

`down -v` borra el volumen `pgdata` (y `caddy_data`/`redis_data` si existieran) — solo seguro en
desarrollo local o en el compose de test efímero (`docker-compose.test.yml`, ya usa `tmpfs`), nunca
en un entorno con datos reales.

## Worker — `system.ping`

`apps/worker` corre un `Worker` de BullMQ (`bullmq`) escuchando la cola `system`
de Redis. El único job que procesa hoy es `system.ping`
(`apps/worker/src/processors/system-ping.processor.ts`): al recibirlo, escribe
la marca de tiempo actual en formato ISO 8601 en la clave de Redis
`system:ping:heartbeat`. `GET /api/health` del backend lee esa misma clave para
reportar `worker.ultimoPing`.

Este processor **no toca PostgreSQL** — es, a propósito, el andamiaje mínimo del
walking skeleton (`[R6]`) y **no es reutilizable como base para el patrón outbox
del ADR-0012** (issues #12/#15). El outbox exige que la fuente de verdad viva en
una tabla de PostgreSQL escrita en la misma transacción que el hecho notificado;
este heartbeat vive únicamente en Redis, sin esquema. Ver el doc-comment en el
propio archivo del processor y el diagrama de secuencia en `design.md`.

Ejecutar en local (requiere Redis accesible en `REDIS_URL`, por defecto
`redis://localhost:6379`):

```bash
pnpm --filter @seei/worker start
```

Pruebas del worker:

```bash
pnpm --filter @seei/worker test
```
