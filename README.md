# SEEI — andamiaje del sistema

Monorepo pnpm + Turborepo: `apps/backend` (NestJS), `apps/frontend` (Vite + React),
`apps/worker` (Node.js + BullMQ), `packages/contracts` (contrato OpenAPI generado
y versionado). Ver `openspec/changes/system-scaffolding/design.md` para el diseño
completo del walking skeleton.

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
