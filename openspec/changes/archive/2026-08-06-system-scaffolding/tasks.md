# Tareas: Andamiaje del sistema (system-scaffolding)

Convención de referencia: `[Rn]` remite a un escenario de `specs/system-scaffolding/spec.md`;
`[TMn]` remite a una fila aplicable de la Matriz de amenazas de `design.md`. Tareas de puro
andamiaje (manifiestos, Dockerfiles, SQL de init) se marcan `(config, sin ciclo TDD)`; el resto
sigue RED → GREEN (→ REFACTOR opcional), con TDD estricto activo.

## Pronóstico de carga de revisión

**Decisión ya cerrada por el usuario (no se re-litiga):** entrega en PRs encadenados con
sub-cortes dentro de los slices grandes B y E, estrategia de encadenado `feature-branch-chain`
(rama tracker). Resultado: **10 PRs**, del orden de 8 a 10 aceptado explícitamente. Solo la rama
tracker `system-scaffolding` se fusiona a `main`, y únicamente cuando los 10 PRs hijos ya están
integrados en ella.

| Campo | Valor |
|---|---|
| Líneas cambiadas estimadas (total) | ~3050 (autoría; excluye `src/generated/api.d.ts`) |
| Riesgo de presupuesto de 400 líneas | Alto (mitigado por el corte en 10 PRs) |
| PRs encadenados recomendados | Sí — 10 PRs |
| Estrategia de entrega | PRs encadenados con sub-cortes (decidida) |
| Estrategia de encadenado | `feature-branch-chain` — rama tracker `system-scaffolding` |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

### Diagrama de dependencia de la cadena

```text
main
 └─▶ system-scaffolding (tracker, draft, no-merge)
      └─▶ PR1 herramental          (base: tracker)
           └─▶ PR2 backend/health   (base: PR1)
                └─▶ PR3 backend/ping+openapi+prisma (base: PR2)
                     └─▶ PR4 contracts/pipeline      (base: PR3)
                          └─▶ PR5 frontend            (base: PR4)
                               └─▶ PR6 worker         (base: PR5)
                                    └─▶ PR7 roles+migración e2e (base: PR6)
                                         └─▶ PR8 compose+Caddy   (base: PR7)
                                              └─▶ PR9 CI          (base: PR8)
                                                   └─▶ PR10 ADR+docs+e2e final (base: PR9)
                                                        └─▶ (todos integrados) tracker → main
```

### Plan de PRs

| PR | Nombre | Rama base | Fases/tareas incluidas | Líneas autoría (est.) | Estado verde al cerrar | Nota de presupuesto |
|---|---|---|---|---|---|---|
| 1 | Herramental de monorepo | `system-scaffolding` (tracker) | Fase 0 (0.1–0.6) | ~150 | `pnpm turbo run build`/`test` en 0 código de salida (no-op, sin paquetes con contenido) | Bajo presupuesto |
| 2 | Backend — health | PR1 | Fase 1, tareas 1.1–1.7 (bootstrap Nest, Jest, Prisma/Redis perezosos, `HealthController` RED/GREEN `[R4a][R4b]`) | ~400 | `pnpm --filter @seei/backend test` verde; `/health` responde ok/degradado con dependencias mockeadas | En el límite, coherente (bootstrap + su primer comportamiento probado) |
| 3 | Backend — ping, extractor OpenAPI y Prisma | PR2 | Fase 1, tareas 1.8–1.14 (`SystemPingController` RED/GREEN `[R5]`, decoradores swagger, `src/openapi.ts`, schema Prisma, migración baseline) | ~350 | `pnpm --filter @seei/backend test` verde; `tsx src/openapi.ts` produce `dist-openapi/openapi.json` sin DB/Redis vivos | Bajo presupuesto |
| 4 | `packages/contracts` — pipeline y drift check | PR3 | Fase 2 completa (2.1–2.7) `[R3a][R3b][R3c][TM1][TM2]` | ~380 (+ ~200 generadas, excluidas del conteo de autoría) | `pnpm --filter @seei/contracts test` verde; script de deriva pasa sincronizado y falla ante endpoint nuevo no rastreado | Bajo presupuesto |
| 5 | Frontend — página de health | PR4 | Fase 3 completa (3.1–3.3) `[R4c]` | ~200 | `pnpm --filter @seei/frontend test` verde; página renderiza estado mockeado del cliente generado | Bajo presupuesto |
| 6 | Worker — `system.ping` | PR5 | Fase 4 completa (4.1–4.3) `[R6]` | ~300 | `pnpm --filter @seei/worker test` verde; processor escribe heartbeat sin tocar Prisma/Postgres | Bajo presupuesto |
| 7 | Roles de Postgres y migración baseline | PR6 | Fase 5 completa (5.1–5.8) `[R8a][R8b][R9]` | ~350 | Suite e2e contra `docker-compose.test.yml` verde: rol runtime rechazado en DDL, rol migrador aplica la baseline | Bajo presupuesto |
| 8 | Docker Compose y Caddy | PR7 | Fase 6 completa (6.1–6.7) `[R7a][R7b]` | ~420 | `docker compose up` (con `.dev.yml`) deja los cinco servicios healthy; `/health` vía Caddy sobre HTTPS responde `200`; compose base sin puertos de DB/Redis | **Por encima de 400 — declarado**: los 3 Dockerfiles, ambos archivos compose y el `Caddyfile` son una sola unidad desplegable; partir el compose base de sus Dockerfiles, o de `.dev.yml`, deja un PR que no levanta nada por sí solo |
| 9 | CI con GitHub Actions | PR8 | Fase 7 completa (7.1–7.4) `[R3a][R3b][R3c][R8b][R9]` | ~150 | El propio workflow corre en el PR y queda verde: `build-and-check` + `e2e-backend` pasan sobre el código acumulado de PR1–PR8 | Bajo presupuesto |
| 10 | ADR, documentación y verificación e2e final | PR9 | Fase 8 completa (8.1–8.4) + Fase 9 completa (9.1–9.3) | ~350 | CI (heredado de PR9) verde incluyendo el round-trip `system.ping`; los criterios de éxito de `proposal.md` se cumplen de punta a punta | Bajo presupuesto |

**Total estimado: ~3050 líneas de autoría en 10 PRs.** Un solo PR queda por encima de 400 (PR 8,
~420) y se declara explícitamente por coherencia de despliegue, no por descuido de conteo.

## Fase 0: Herramental de monorepo (PR 1, base: rama tracker `system-scaffolding`)

- [x] 0.1 `(config)` Crear `package.json` raíz, `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.gitignore`. `[R1][R2]`
- [x] 0.2 `(config)` Crear `turbo.json` con las tareas `openapi:extract` (`dependsOn: []`), `generate:contracts`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `dev` según el grafo de `design.md`. `[R1]`
- [x] 0.3 `(config)` Crear `tsconfig.base.json` compartido; NO crear `packages/config`. `[R2]`
- [x] 0.4 `(config)` Crear los directorios vacíos `apps/backend`, `apps/frontend`, `apps/worker`, `packages/contracts`, `infra/docker` con `package.json` mínimo cada uno para que `pnpm install` resuelva el workspace. `[R1][R2]`
- [x] 0.5 `(config)` Actualizar `openspec/config.yaml`: `testing.status: available`, `testing.test_command`/`build_command`, `apply.test_command`, `verify.test_command`/`build_command` = `"pnpm turbo run test"` / `"pnpm turbo run build"`; `coverage_threshold` permanece `0`. `[R10]`
- [x] 0.6 Verificar `pnpm turbo run build` y `pnpm turbo run test` terminan en código 0 (no-op, sin paquetes con contenido todavía). `[R1]`

## Fase 1: Esqueleto del backend NestJS

### PR 2 — Backend / health (base: PR 1)

- [x] 1.1 `(config)` Bootstrap de NestJS en `apps/backend` (`main.ts` con `setGlobalPrefix('api')`, `AppModule`), Jest + ts-jest (`jest.config.ts`, `test/jest-e2e.config.ts`).
- [x] 1.2 `(config)` `PrismaService` sin `$connect()` en `onModuleInit` (conexión perezosa) — gotcha D1 de `design.md`.
- [x] 1.3 `(config)` Cliente `ioredis` instanciado con `lazyConnect: true`.
- [x] 1.4 RED: test unitario de `HealthController` que espera `200` con `db.estado`/`redis.estado` `'ok'` cuando Prisma/Redis mockeados responden. `[R4a]`
- [x] 1.5 GREEN: implementar `HealthModule`/`HealthController` con `GET /health` ejecutando `SELECT 1` y `PING`, devolviendo `RespuestaHealth`. `[R4a]`
- [x] 1.6 RED: test unitario que espera `db.estado:'ok'`, `redis.estado:'error'` cuando el cliente Redis mockeado rechaza `PING`, sin devolver `200` genérico oculto. `[R4b]`
- [x] 1.7 GREEN: manejar el fallo de Redis en `HealthController` sin ocultar el estado real. `[R4b]`

### PR 3 — Backend / ping, extractor OpenAPI y Prisma (base: PR 2)

- [x] 1.8 RED: test unitario de `SystemPingController` que espera `202` y una llamada a `Queue.add('system.ping', …)`. `[R5]`
- [x] 1.9 GREEN: implementar `POST /api/system/ping` que encola el job en la cola `system` (BullMQ producer). `[R5]`
- [x] 1.10 Decorar `HealthController`/`SystemPingController`/DTOs con `@nestjs/swagger` para que aparezcan en el documento OpenAPI.
- [x] 1.11 `(config)` Crear `apps/backend/src/openapi.ts`: `NestFactory.create(AppModule, {logger:false})` → `SwaggerModule.createDocument` → `writeFileSync('dist-openapi/openapi.json')` → `app.close()`, sin `listen()`.
- [x] 1.12 Verificar `pnpm --filter @seei/backend exec tsx src/openapi.ts` produce `dist-openapi/openapi.json` sin Postgres/Redis vivos (confirma D1).
- [x] 1.13 `(config)` `apps/backend/prisma/schema.prisma`: `datasource db` con `url = env("DATABASE_URL")`, `directUrl = env("MIGRATION_DATABASE_URL")`.
- [x] 1.14 `(config)` Crear la migración baseline vacía de Prisma (`prisma migrate dev --create-only`, sin modelos de dominio). `[R9]`

## Fase 2: Pipeline de contratos OpenAPI (PR 4, base: PR 3)

- [x] 2.1 `(config)` `packages/contracts`: script `generate:contracts` que corre `openapi-typescript` sobre `dist-openapi/openapi.json` del backend y emite `src/generated/api.d.ts`; registrar la tarea Turborepo con `dependsOn: ["@seei/backend#openapi:extract"]`.
- [x] 2.2 RED: test de `src/client.ts` (Vitest) que espera que el cliente `openapi-fetch` invoque `GET /api/health` con la URL base configurada.
- [x] 2.3 GREEN: implementar `src/client.ts` tipado sobre `api.d.ts`.
- [x] 2.4 RED `[TM1]`: test del script de verificación de deriva con un archivo sucio fuera de `packages/contracts` en el árbol de trabajo — el check debe pasar (pathspec `-- packages/contracts` explícito).
- [x] 2.5 RED `[TM2][R3b]`: test que agrega un endpoint nuevo al backend (produce un archivo generado nuevo y no rastreado) — el check debe fallar.
- [x] 2.6 GREEN: implementar el script de verificación de deriva (`pnpm turbo run generate:contracts --force` → `git add --intent-to-add -- packages/contracts` → `git diff --exit-code -- packages/contracts`). `[R3a][R3c][TM1][TM2][R3b]`
- [x] 2.7 Commitear `openapi.json` y `src/generated/api.d.ts` regenerados para que el árbol quede limpio tras 2.6.

## Fase 3: Frontend Vite+React (PR 5, base: PR 4)

- [x] 3.1 `(config)` Bootstrap de Vite+React en `apps/frontend`, Vitest+RTL (bloque `test` en `vite.config.ts`, sin `globals: true`).
- [x] 3.2 RED: test de la página de health (RTL) que espera renderizar el `db.estado`/`redis.estado` devueltos por un mock del cliente generado, no un valor hardcodeado. `[R4c]`
- [x] 3.3 GREEN: implementar la página de health consumiendo `packages/contracts` `src/client.ts`. `[R4c]`

## Fase 4: Worker Node.js + BullMQ (PR 6, base: PR 5)

- [x] 4.1 `(config)` Bootstrap de Node.js en `apps/worker`, conexión BullMQ a Redis, Vitest.
- [x] 4.2 RED: test del processor `system.ping` que espera `SET system:ping:heartbeat <timestamp ISO>` en Redis, sin ninguna llamada a Prisma/Postgres. `[R6]`
- [x] 4.3 GREEN: implementar el processor `system.ping`; agregar doc-comment explícito ("no reutilizable como andamiaje de outbox del ADR-0012, ver #12/#15") y una sección en `README.md`. `[R6]`

## Fase 5: Roles de Postgres y migración baseline (PR 7, base: PR 6)

- [x] 5.1 `(config)` `infra/docker/postgres/init/01-roles.sql`: crear `seei_migrator` (propietario, DDL) y `seei_app` (runtime, DML por `ALTER DEFAULT PRIVILEGES`), según el SQL de `design.md`. `[R8a][R8b]`
- [x] 5.2 `(config)` `.env.example` con `POSTGRES_PASSWORD`, `SEEI_MIGRATOR_PASSWORD`, `SEEI_APP_PASSWORD`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `REDIS_URL`.
- [x] 5.3 `(config)` `infra/docker/docker-compose.test.yml`: solo `postgres`+`redis` en puertos alternos (`5433`/`6380`), datos en `tmpfs`.
- [x] 5.4 RED (e2e): test que conecta con `DATABASE_URL` (rol `seei_app`) e intenta `CREATE TABLE` — Postgres debe rechazar por falta de privilegios. `[R8a]`
- [x] 5.5 GREEN: confirmar el rechazo aplicando `01-roles.sql` contra `docker-compose.test.yml` (no requiere código de producción adicional). `[R8a]` — **Confirmado** contra Docker Desktop real: `pnpm --filter @seei/backend run test:e2e` levantó `docker-compose.test.yml` (postgres:16 + redis:7), aplicó `01-roles.sql` vía el entrypoint oficial, y `postgres-roles.e2e-spec.ts` pasó en verde — `seei_app` recibe `permission denied` al intentar `CREATE TABLE`.
- [x] 5.6 RED (e2e): test que ejecuta `prisma migrate deploy` con `MIGRATION_DATABASE_URL` contra una base nueva — debe aplicar la baseline sin error y sin crear tablas de dominio. `[R8b][R9]`
- [x] 5.7 GREEN: verificar contra `docker-compose.test.yml`; si la versión fijada de Prisma no toma `directUrl` para `migrate deploy`, aplicar la contingencia `DATABASE_URL=$MIGRATION_DATABASE_URL prisma migrate deploy` (pregunta abierta de `design.md`). `[R8b][R9]` — **Confirmado**: Prisma `^5.22.0` SÍ toma `directUrl` (`MIGRATION_DATABASE_URL`/`seei_migrator`) en `migrate deploy` sin sustituir `DATABASE_URL`; la migración baseline `20260806021859_baseline_vacia` se aplicó sin error y `migrate-baseline.e2e-spec.ts` pasó en verde (2/2 tests). Contingencia documentada pero **no aplicada** (no fue necesaria). Ver `design.md`, sección "Cadenas de conexión" y "Preguntas abiertas".
- [x] 5.8 `apps/backend/test:e2e` script: `up -d --wait` (`docker-compose.test.yml`) → `prisma migrate deploy` → Jest → `down -v`. Implementado en `apps/backend/scripts/test-e2e.mjs`; ejercitado de punta a punta contra Docker Desktop real — 2 test suites / 3 tests en verde, `down -v` dejó el entorno limpio (sin contenedores/redes/volúmenes residuales de `seei-test`).

## Fase 6: Docker Compose y Caddy (PR 8, base: PR 7 — declarado por encima de 400 líneas, ver justificación en el Plan de PRs)

- [x] 6.1 `(config)` `infra/docker/{backend,frontend,worker}.Dockerfile` multi-stage, etapa `dev` para `frontend`.
- [x] 6.2 `(config)` `infra/docker/docker-compose.yml` base: `caddy`, `frontend`, `backend`, `worker`, `migrate` (one-shot), `postgres`, `redis`; healthchecks según la tabla de `design.md`; SIN `ports` publicados en `postgres`/`redis`. `[R7b]`
- [x] 6.3 `(config)` `infra/docker/docker-compose.dev.yml`: publica `127.0.0.1:5432`/`127.0.0.1:6379`, bind mounts, `frontend` en etapa `dev`, `NODE_ENV=development`. Aditivo, no reescribe el endurecimiento base.
- [x] 6.4 `(config)` `infra/docker/Caddyfile`: `seei.localhost { tls internal; handle /api/* {reverse_proxy backend:3000}; handle {reverse_proxy frontend:8080} }`.
- [x] 6.5 `(config)` Script `pnpm compose:dev` que invoca ambos archivos compose; script `pnpm caddy:trust` que copia el `root.crt` de Caddy.
- [x] 6.6 Verificar manualmente/documentar: `docker compose up` (con `.dev.yml`) deja los cinco servicios healthy y `GET /health` vía Caddy sobre HTTPS responde `200`. `[R7a]` — **Confirmado** contra Docker Desktop real: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait` dejó `postgres`, `redis`, `backend`, `frontend`, `caddy` en `healthy` (`worker` sin healthcheck, arriba y estable) y `migrate` en `Exited (0)` tras aplicar la baseline. `curl -k --resolve seei.localhost:<puerto>:127.0.0.1 https://seei.localhost:<puerto>/api/health` respondió `HTTP_STATUS:200` con `{"estado":"ok","db":{"estado":"ok",...},"redis":{"estado":"ok",...},"worker":{"ultimoPing":null}}`. Nota de entorno: el host tenía el puerto 80/443 reservado por Windows (HTTP.sys, PID 4) fuera de nuestro control, así que la verificación remapeó los puertos publicados de `caddy` con un override YAML local no committeado (`ports: !override [...]`) a 8080/8443; `docker-compose.yml` en el repo sigue publicando 80/443/443-udp sin cambios. Dos gotchas reales corregidos durante la verificación (ver Dockerfiles/compose): (1) `apk add openssl` en las etapas `base`/`runtime` de `backend.Dockerfile` — sin él, el motor de Prisma sobre musl fallaba con "Could not parse schema engine response"; (2) el healthcheck de `frontend` usa `127.0.0.1` en vez de `localhost` — `localhost` resolvía primero a `::1` (IPv6) y el servidor solo escucha en IPv4, produciendo "connection refused" falso negativo.
- [x] 6.7 Verificar por inspección: `docker-compose.yml` base no declara `ports` en `postgres` ni `redis`. `[R7b]` — **Confirmado** leyendo el YAML: ni el bloque `postgres` ni el bloque `redis` tienen clave `ports` (solo `caddy` publica puertos hacia el host).

## Fase 7: CI con GitHub Actions (PR 9, base: PR 8)

- [x] 7.1 `(config)` `.github/workflows/ci.yml`, job `build-and-check`: checkout → `pnpm/action-setup` → `setup-node` (`cache: pnpm`) → `pnpm install --frozen-lockfile` → `turbo run generate:contracts --force` → verificación de deriva (2.6) → `turbo run lint typecheck build test`. `[R3a][R3b][R3c]` — **Confirmado localmente** (sin GitHub Actions real, ver nota de entorno abajo): `pnpm install --frozen-lockfile`, `pnpm turbo run generate:contracts --force`, `pnpm --filter @seei/contracts run check:drift` (árbol sincronizado, exit 0) y `pnpm turbo run lint typecheck build test` (18/18 tareas, exit 0) reproducidos en este entorno con los mismos comandos exactos que invoca el workflow.
- [x] 7.2 `(config)` Job `e2e-backend` (`needs: build-and-check`): checkout → install → levantar `infra/docker/docker-compose.test.yml` (mismas imágenes `postgres:16`/`redis:7`, `01-roles.sql` ya aplicado por el entrypoint) → `prisma migrate deploy` (rol `seei_migrator`) → `turbo run test:e2e --filter=@seei/backend`. `[R8b][R9]` — **Desviación documentada de `design.md`**: en vez de declarar un bloque `services:` nativo de GitHub Actions en paralelo, el job invoca directamente el compose ya implementado y verificado contra Docker Desktop real en el PR 7, porque `apps/backend/scripts/test-e2e.mjs` (el que ejecuta `turbo run test:e2e --filter=@seei/backend`) siempre orquesta ese compose por su cuenta — un segundo par Postgres/Redis nativo quedaría provisto pero nunca ejercitado por los tests. Ver comentario de cabecera en `ci.yml`. **Pendiente de verificación real**: no se pudo correr este job contra GitHub Actions en este entorno (ver nota de entorno); localmente se confirmó que los comandos (`docker compose ... up -d --wait`, `prisma migrate deploy`, `pnpm turbo run test:e2e --filter=@seei/backend`) son exactamente los mismos ya ejercitados de punta a punta contra Docker Desktop real en las tareas 5.5/5.7/5.8 del PR 7.
- [x] 7.3 `(config)` `permissions: contents: read`, `concurrency` por rama con cancelación, caché de `.turbo` vía `actions/cache`. — Implementado en `ci.yml` (`concurrency.group` por `github.ref` con `cancel-in-progress: true`; `actions/cache@v4` sobre `.turbo` en ambos jobs).
- [x] 7.4 Verificar que un PR con DTO cambiado y contrato no regenerado hace fallar el job antes de `test` (repite `[R3a]` en CI real). — **Verificado solo por inspección** (no se abrió un PR real de GitHub en este entorno): (1) en `ci.yml`, el paso "Verify OpenAPI contract has no drift" está antes de "Lint, typecheck, build, test" dentro de `build-and-check`, y un `run:` con exit code distinto de 0 detiene el job por defecto en GitHub Actions, sin ejecutar los pasos siguientes; (2) `packages/contracts/scripts/check-drift.ts` hace `process.exit(1)` cuando `checkGitClean` devuelve `clean:false`; (3) el caso concreto "DTO cambiado y contrato no regenerado" ya está cubierto por un test real y verde de PR 4 (`packages/contracts/scripts/check-drift.spec.ts`, caso `[TM2][R3b]` "falla cuando la regeneración produce un archivo nuevo no rastreado"), reproducido en este entorno como parte de `pnpm turbo run test` (3/3 tests, incluye ese caso).

## Fase 8: ADR y documentación (PR 10, base: PR 9)

- [x] 8.1 Redactar `adrs/0014-monorepo-pnpm-turborepo.md` (formato MADR: Estado/Contexto/Decisión/Alternativas consideradas/Consecuencias) documentando pnpm+Turborepo y el contrato OpenAPI como artefacto generado y versionado.
- [x] 8.2 Redactar `adrs/0015-roles-postgresql-migrador-app.md` (mismo formato) documentando `seei_migrator`/`seei_app` y el mecanismo de `ALTER DEFAULT PRIVILEGES`, dejando explícito que la revocación de auditoría es trabajo de #3.
- [x] 8.3 `README.md`: sección `## HTTPS local` (confianza de la CA, tabla por SO, Firefox) y gotcha de `docker-entrypoint-initdb.d` (`docker compose down -v` tras tocar `01-roles.sql`).
- [x] 8.4 `docs/onboarding.md`: referencia a `## HTTPS local`, pasos de arranque (`pnpm install`, `pnpm compose:dev`, `pnpm caddy:trust`).

## Fase 9: Verificación end-to-end del walking skeleton (PR 10, cierre de la cadena — tras integrar PR 10 en `system-scaffolding`, la rama tracker está lista para fusionar a `main`)

- [x] 9.1 RED (e2e): test que encola `system.ping` vía `POST /api/system/ping` y espera que `GET /health` refleje `worker.ultimoPing` posterior al encolado dentro de un timeout razonable. `[R5]` — `apps/backend/test/system-ping-roundtrip.e2e-spec.ts`, confirmado RED corriendo la suite contra `docker-compose.test.yml` real con el spawn del worker deshabilitado por una bandera temporal (`SKIP_WORKER_SPAWN_FOR_RED_TEST`): `worker.ultimoPing` permanece `null`, `expect(ultimoPing).not.toBeNull()` falla como se esperaba (timeout de 20s agotado).
- [x] 9.2 GREEN: confirmar el ida y vuelta con `backend` + `worker` + `redis` corriendo (`docker-compose.test.yml` + worker local, o compose completo). `[R5]` — **Confirmado** contra Docker Desktop real: con la bandera de RED retirada, el mismo test spawnea `pnpm --filter @seei/worker start` como proceso hijo real apuntando al Redis efímero (puerto 6380), hace `POST /api/system/ping` contra la app Nest real (`app.listen(0)`, sin mocks) y hace polling de `GET /api/health` hasta ver `worker.ultimoPing` — pasa en ~7-12s. Reproducido también dentro de `pnpm --filter @seei/backend run test:e2e` (orquestación completa: `up -d --wait` → `prisma migrate deploy` → Jest de las 3 suites e2e → `down -v`), 3 test suites / 4 tests en verde, exit code 0, contenedores y red de `seei-test` removidos limpiamente al final.
- [x] 9.3 Ejecutar los criterios de éxito de `proposal.md` de punta a punta: `pnpm turbo run build && pnpm turbo run test` desde la raíz, `docker compose up`, `/health` con ambas dependencias sanas, frontend renderizando vía cliente generado, migración baseline aplicada, CI verde. `[R1][R4a][R4c][R7a][R9]` — ver detalle debajo de la tabla de tareas ("Verificación final de criterios de éxito, PR10").

### Verificación final de criterios de éxito (PR 10, tarea 9.3)

Ejecutado en vivo en este entorno, contra Docker Desktop real (`docker ps` accesible), no simulado:

| Criterio (`proposal.md`) | Resultado | Evidencia |
|---|---|---|
| `pnpm turbo run build` desde la raíz | ✅ Verde | 6/6 tareas (5 cacheadas + `@seei/backend:build` fresco), `nest build` incluido |
| `pnpm turbo run test` desde la raíz (con `lint`/`typecheck`) | ✅ Verde | `pnpm turbo run lint typecheck test`: 15/15 tareas exitosas — backend Jest (2 suites/3 tests), contracts Vitest (2 suites/3 tests, incluye el drift check `[TM1][TM2]`), worker Vitest (1 suite/2 tests), frontend Vitest (1 suite/1 test) |
| `docker compose up` (con `.dev.yml`) levanta los 5 servicios sanos | ✅ Verde | `postgres`, `redis`, `frontend`, `backend`, `worker` en `healthy`; `caddy` arriba y respondiendo (sin healthcheck propio en el compose); `migrate` en `Exited (0)` tras aplicar la baseline. Nota de entorno idéntica a la de PR8 (tarea 6.6): puerto 80/443 reservado por Windows HTTP.sys — se usó un override YAML local no committeado que remapea los puertos publicados de `caddy` a 8080/8443; `docker-compose.yml` del repo sigue publicando 80/443 sin cambios |
| `/health` responde con Postgres y Redis sanos | ✅ Verde | `curl -k --resolve seei.localhost:8443:127.0.0.1 https://seei.localhost:8443/api/health` → `200` `{"estado":"ok","db":{"estado":"ok",...},"redis":{"estado":"ok",...},"worker":{"ultimoPing":null}}` |
| El trabajo `system.ping` hace el ida y vuelta backend→Redis→worker, visible en `/health` | ✅ Verde | `POST /api/system/ping` → `202`; `GET /health` inmediatamente después → `worker.ultimoPing` con timestamp ISO reciente. Verificado dos veces: (1) test automatizado `system-ping-roundtrip.e2e-spec.ts` (9.1/9.2); (2) manualmente contra el compose completo vía Caddy/HTTPS, igual que arriba |
| Frontend renderiza el estado de health vía el cliente generado | ✅ Verde (parcial browser) | `GET https://seei.localhost:8443/` → `200`, sirve el shell de la SPA con `src/main.tsx`; el consumo real del cliente generado (`packages/contracts` → `HealthPage`) está cubierto por el test RTL de PR5 (`HealthPage.spec.tsx`, mock del cliente generado) — no se abrió un navegador real en este entorno headless, así que la ejecución del JS en cliente no se verificó visualmente, solo por test unitario + servido correcto del bundle |
| Migración baseline de Prisma se aplica limpiamente en Docker/CI | ✅ Verde | Servicio `migrate` del compose completo: `Exited (0)`; reconfirmado también en el e2e del backend (`migrate-baseline.e2e-spec.ts`, PR7) y en el job `e2e-backend` de CI (PR9, verificación local equivalente) |
| CI (GitHub Actions) ejecuta build, test y drift check | ⚠️ **Verificación local equivalente, no runner real de GitHub Actions** — igual que en PR9: sin acceso a un runner de GitHub Actions en este entorno, se reprodujeron exactamente los mismos comandos que invoca `.github/workflows/ci.yml` (`pnpm install --frozen-lockfile`, `pnpm turbo run generate:contracts --force`, `pnpm --filter @seei/contracts run check:drift`, `pnpm turbo run lint typecheck build test`) y todos terminaron en verde con exit code 0 | Ver comandos arriba; `git status --short` tras el drift check no mostró cambios inesperados |
| Campos de comando de `testing`/`apply`/`verify` en `openspec/config.yaml` completos | ✅ Verde (heredado de PR1, tarea 0.5) | Sin cambios en este PR |
| Postgres aprovisiona `seei_migrator`/`seei_app`, cadenas de conexión disponibles en dev y CI | ✅ Verde (heredado de PR7) | Reconfirmado en esta corrida: `migrate` (rol `seei_migrator`) aplicó la baseline; `backend`/`worker` corrieron sanos con `DATABASE_URL` del rol `seei_app` |

**Hallazgo real durante esta verificación (no un simulacro):** `.env.example` (raíz del repo, plantilla
para `infra/docker/.env`) declara `DATABASE_URL`/`MIGRATION_DATABASE_URL` apuntando a
`localhost:5432` y `REDIS_URL` a `localhost:6379`. Esos valores funcionan para herramientas que
corren en el host contra los puertos publicados por `docker-compose.dev.yml`, pero **no** para los
propios contenedores (`migrate`, `backend`, `worker`), que deben resolver Postgres/Redis por su
nombre de servicio en la red interna de Docker (`postgres`, `redis`) — con `localhost` tal cual,
`docker compose up` falla en el servicio `migrate` con `P1001: Can't reach database server at
localhost:5432`. Se confirmó el `docker compose up` completo usando un archivo de entorno local no
committeado con `DATABASE_URL=...@postgres:5432/...`, `MIGRATION_DATABASE_URL=...@postgres:5432/...`,
`REDIS_URL=redis://redis:6379` — con esos valores los 5 servicios quedan sanos y `/health` responde
`200`. **No se pudo corregir `.env.example` en este PR**: el archivo cae bajo una regla de protección
de credenciales del entorno de ejecución que bloquea lectura/escritura de cualquier ruta con patrón
`.env*` para todas las herramientas disponibles en esta sesión (Read/Write/Edit/Bash), incluida la
plantilla sin secretos reales. Queda como corrección pendiente para quien tenga acceso directo al
archivo — no se marca como resuelto ni se oculta.

## Cobertura de escenarios no resuelta

Ninguna. Los 16 escenarios GIVEN/WHEN/THEN de `specs/system-scaffolding/spec.md` (`R1`–`R10`,
con sub-escenarios `a/b/c` donde el requisito tiene más de uno) y las dos filas aplicables de la
Matriz de amenazas (`TM1`, `TM2`) quedan referenciados en al menos una tarea de arriba.
