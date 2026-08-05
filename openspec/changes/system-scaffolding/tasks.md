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

- [ ] 1.1 `(config)` Bootstrap de NestJS en `apps/backend` (`main.ts` con `setGlobalPrefix('api')`, `AppModule`), Jest + ts-jest (`jest.config.ts`, `test/jest-e2e.config.ts`).
- [ ] 1.2 `(config)` `PrismaService` sin `$connect()` en `onModuleInit` (conexión perezosa) — gotcha D1 de `design.md`.
- [ ] 1.3 `(config)` Cliente `ioredis` instanciado con `lazyConnect: true`.
- [ ] 1.4 RED: test unitario de `HealthController` que espera `200` con `db.estado`/`redis.estado` `'ok'` cuando Prisma/Redis mockeados responden. `[R4a]`
- [ ] 1.5 GREEN: implementar `HealthModule`/`HealthController` con `GET /health` ejecutando `SELECT 1` y `PING`, devolviendo `RespuestaHealth`. `[R4a]`
- [ ] 1.6 RED: test unitario que espera `db.estado:'ok'`, `redis.estado:'error'` cuando el cliente Redis mockeado rechaza `PING`, sin devolver `200` genérico oculto. `[R4b]`
- [ ] 1.7 GREEN: manejar el fallo de Redis en `HealthController` sin ocultar el estado real. `[R4b]`

### PR 3 — Backend / ping, extractor OpenAPI y Prisma (base: PR 2)

- [ ] 1.8 RED: test unitario de `SystemPingController` que espera `202` y una llamada a `Queue.add('system.ping', …)`. `[R5]`
- [ ] 1.9 GREEN: implementar `POST /api/system/ping` que encola el job en la cola `system` (BullMQ producer). `[R5]`
- [ ] 1.10 Decorar `HealthController`/`SystemPingController`/DTOs con `@nestjs/swagger` para que aparezcan en el documento OpenAPI.
- [ ] 1.11 `(config)` Crear `apps/backend/src/openapi.ts`: `NestFactory.create(AppModule, {logger:false})` → `SwaggerModule.createDocument` → `writeFileSync('dist-openapi/openapi.json')` → `app.close()`, sin `listen()`.
- [ ] 1.12 Verificar `pnpm --filter @seei/backend exec tsx src/openapi.ts` produce `dist-openapi/openapi.json` sin Postgres/Redis vivos (confirma D1).
- [ ] 1.13 `(config)` `apps/backend/prisma/schema.prisma`: `datasource db` con `url = env("DATABASE_URL")`, `directUrl = env("MIGRATION_DATABASE_URL")`.
- [ ] 1.14 `(config)` Crear la migración baseline vacía de Prisma (`prisma migrate dev --create-only`, sin modelos de dominio). `[R9]`

## Fase 2: Pipeline de contratos OpenAPI (PR 4, base: PR 3)

- [ ] 2.1 `(config)` `packages/contracts`: script `generate:contracts` que corre `openapi-typescript` sobre `dist-openapi/openapi.json` del backend y emite `src/generated/api.d.ts`; registrar la tarea Turborepo con `dependsOn: ["@seei/backend#openapi:extract"]`.
- [ ] 2.2 RED: test de `src/client.ts` (Vitest) que espera que el cliente `openapi-fetch` invoque `GET /api/health` con la URL base configurada.
- [ ] 2.3 GREEN: implementar `src/client.ts` tipado sobre `api.d.ts`.
- [ ] 2.4 RED `[TM1]`: test del script de verificación de deriva con un archivo sucio fuera de `packages/contracts` en el árbol de trabajo — el check debe pasar (pathspec `-- packages/contracts` explícito).
- [ ] 2.5 RED `[TM2][R3b]`: test que agrega un endpoint nuevo al backend (produce un archivo generado nuevo y no rastreado) — el check debe fallar.
- [ ] 2.6 GREEN: implementar el script de verificación de deriva (`pnpm turbo run generate:contracts --force` → `git add --intent-to-add -- packages/contracts` → `git diff --exit-code -- packages/contracts`). `[R3a][R3c][TM1][TM2][R3b]`
- [ ] 2.7 Commitear `openapi.json` y `src/generated/api.d.ts` regenerados para que el árbol quede limpio tras 2.6.

## Fase 3: Frontend Vite+React (PR 5, base: PR 4)

- [ ] 3.1 `(config)` Bootstrap de Vite+React en `apps/frontend`, Vitest+RTL (bloque `test` en `vite.config.ts`, sin `globals: true`).
- [ ] 3.2 RED: test de la página de health (RTL) que espera renderizar el `db.estado`/`redis.estado` devueltos por un mock del cliente generado, no un valor hardcodeado. `[R4c]`
- [ ] 3.3 GREEN: implementar la página de health consumiendo `packages/contracts` `src/client.ts`. `[R4c]`

## Fase 4: Worker Node.js + BullMQ (PR 6, base: PR 5)

- [ ] 4.1 `(config)` Bootstrap de Node.js en `apps/worker`, conexión BullMQ a Redis, Vitest.
- [ ] 4.2 RED: test del processor `system.ping` que espera `SET system:ping:heartbeat <timestamp ISO>` en Redis, sin ninguna llamada a Prisma/Postgres. `[R6]`
- [ ] 4.3 GREEN: implementar el processor `system.ping`; agregar doc-comment explícito ("no reutilizable como andamiaje de outbox del ADR-0012, ver #12/#15") y una sección en `README.md`. `[R6]`

## Fase 5: Roles de Postgres y migración baseline (PR 7, base: PR 6)

- [ ] 5.1 `(config)` `infra/docker/postgres/init/01-roles.sql`: crear `seei_migrator` (propietario, DDL) y `seei_app` (runtime, DML por `ALTER DEFAULT PRIVILEGES`), según el SQL de `design.md`. `[R8a][R8b]`
- [ ] 5.2 `(config)` `.env.example` con `POSTGRES_PASSWORD`, `SEEI_MIGRATOR_PASSWORD`, `SEEI_APP_PASSWORD`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `REDIS_URL`.
- [ ] 5.3 `(config)` `infra/docker/docker-compose.test.yml`: solo `postgres`+`redis` en puertos alternos (`5433`/`6380`), datos en `tmpfs`.
- [ ] 5.4 RED (e2e): test que conecta con `DATABASE_URL` (rol `seei_app`) e intenta `CREATE TABLE` — Postgres debe rechazar por falta de privilegios. `[R8a]`
- [ ] 5.5 GREEN: confirmar el rechazo aplicando `01-roles.sql` contra `docker-compose.test.yml` (no requiere código de producción adicional). `[R8a]`
- [ ] 5.6 RED (e2e): test que ejecuta `prisma migrate deploy` con `MIGRATION_DATABASE_URL` contra una base nueva — debe aplicar la baseline sin error y sin crear tablas de dominio. `[R8b][R9]`
- [ ] 5.7 GREEN: verificar contra `docker-compose.test.yml`; si la versión fijada de Prisma no toma `directUrl` para `migrate deploy`, aplicar la contingencia `DATABASE_URL=$MIGRATION_DATABASE_URL prisma migrate deploy` (pregunta abierta de `design.md`). `[R8b][R9]`
- [ ] 5.8 `apps/backend/test:e2e` script: `up -d --wait` (`docker-compose.test.yml`) → `prisma migrate deploy` → Jest → `down -v`.

## Fase 6: Docker Compose y Caddy (PR 8, base: PR 7 — declarado por encima de 400 líneas, ver justificación en el Plan de PRs)

- [ ] 6.1 `(config)` `infra/docker/{backend,frontend,worker}.Dockerfile` multi-stage, etapa `dev` para `frontend`.
- [ ] 6.2 `(config)` `infra/docker/docker-compose.yml` base: `caddy`, `frontend`, `backend`, `worker`, `migrate` (one-shot), `postgres`, `redis`; healthchecks según la tabla de `design.md`; SIN `ports` publicados en `postgres`/`redis`. `[R7b]`
- [ ] 6.3 `(config)` `infra/docker/docker-compose.dev.yml`: publica `127.0.0.1:5432`/`127.0.0.1:6379`, bind mounts, `frontend` en etapa `dev`, `NODE_ENV=development`. Aditivo, no reescribe el endurecimiento base.
- [ ] 6.4 `(config)` `infra/docker/Caddyfile`: `seei.localhost { tls internal; handle /api/* {reverse_proxy backend:3000}; handle {reverse_proxy frontend:8080} }`.
- [ ] 6.5 `(config)` Script `pnpm compose:dev` que invoca ambos archivos compose; script `pnpm caddy:trust` que copia el `root.crt` de Caddy.
- [ ] 6.6 Verificar manualmente/documentar: `docker compose up` (con `.dev.yml`) deja los cinco servicios healthy y `GET /health` vía Caddy sobre HTTPS responde `200`. `[R7a]`
- [ ] 6.7 Verificar por inspección: `docker-compose.yml` base no declara `ports` en `postgres` ni `redis`. `[R7b]`

## Fase 7: CI con GitHub Actions (PR 9, base: PR 8)

- [ ] 7.1 `(config)` `.github/workflows/ci.yml`, job `build-and-check`: checkout → `pnpm/action-setup` → `setup-node` (`cache: pnpm`) → `pnpm install --frozen-lockfile` → `turbo run generate:contracts --force` → verificación de deriva (2.6) → `turbo run lint typecheck build test`. `[R3a][R3b][R3c]`
- [ ] 7.2 `(config)` Job `e2e-backend` (`needs: build-and-check`) con `services: postgres:16, redis:7`: checkout → install → `prisma migrate deploy` (rol `seei_migrator`) → `turbo run test:e2e --filter=@seei/backend`. `[R8b][R9]`
- [ ] 7.3 `(config)` `permissions: contents: read`, `concurrency` por rama con cancelación, caché de `.turbo` vía `actions/cache`.
- [ ] 7.4 Verificar que un PR con DTO cambiado y contrato no regenerado hace fallar el job antes de `test` (repite `[R3a]` en CI real).

## Fase 8: ADR y documentación (PR 10, base: PR 9)

- [ ] 8.1 Redactar `adrs/0014-monorepo-pnpm-turborepo.md` (formato MADR: Estado/Contexto/Decisión/Alternativas consideradas/Consecuencias) documentando pnpm+Turborepo y el contrato OpenAPI como artefacto generado y versionado.
- [ ] 8.2 Redactar `adrs/0015-roles-postgresql-migrador-app.md` (mismo formato) documentando `seei_migrator`/`seei_app` y el mecanismo de `ALTER DEFAULT PRIVILEGES`, dejando explícito que la revocación de auditoría es trabajo de #3.
- [ ] 8.3 `README.md`: sección `## HTTPS local` (confianza de la CA, tabla por SO, Firefox) y gotcha de `docker-entrypoint-initdb.d` (`docker compose down -v` tras tocar `01-roles.sql`).
- [ ] 8.4 `docs/onboarding.md`: referencia a `## HTTPS local`, pasos de arranque (`pnpm install`, `pnpm compose:dev`, `pnpm caddy:trust`).

## Fase 9: Verificación end-to-end del walking skeleton (PR 10, cierre de la cadena — tras integrar PR 10 en `system-scaffolding`, la rama tracker está lista para fusionar a `main`)

- [ ] 9.1 RED (e2e): test que encola `system.ping` vía `POST /api/system/ping` y espera que `GET /health` refleje `worker.ultimoPing` posterior al encolado dentro de un timeout razonable. `[R5]`
- [ ] 9.2 GREEN: confirmar el ida y vuelta con `backend` + `worker` + `redis` corriendo (`docker-compose.test.yml` + worker local, o compose completo). `[R5]`
- [ ] 9.3 Ejecutar los criterios de éxito de `proposal.md` de punta a punta: `pnpm turbo run build && pnpm turbo run test` desde la raíz, `docker compose up`, `/health` con ambas dependencias sanas, frontend renderizando vía cliente generado, migración baseline aplicada, CI verde. `[R1][R4a][R4c][R7a][R9]`

## Cobertura de escenarios no resuelta

Ninguna. Los 16 escenarios GIVEN/WHEN/THEN de `specs/system-scaffolding/spec.md` (`R1`–`R10`,
con sub-escenarios `a/b/c` donde el requisito tiene más de uno) y las dos filas aplicables de la
Matriz de amenazas (`TM1`, `TM2`) quedan referenciados en al menos una tarea de arriba.
