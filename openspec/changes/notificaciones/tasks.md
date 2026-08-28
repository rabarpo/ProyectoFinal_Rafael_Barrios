# Tasks: notificaciones (Backlog #19 — Notificaciones y avisos)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2800-3400 (10 archivos nuevos + 6 modificados + 6 suites de prueba nuevas) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 migración → PR2 plantillas → PR3 emisor `emitirNotificaciones` → PR4 hooks apertura/cierre → PR5 servicio+DTO bandeja → PR6 controller+contrato → PR7 fix aislamiento de colas (C5) → PR8 worker dispatcher/repo/listener → PR9 sweep puro → PR10 sweep repo+wiring+docs |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

`design.md` marcó R1-R6 como cortes autónomos, "muy por encima del presupuesto de 400 líneas", con
R1/R2 sin dependencia mutua y el resto secuencial. Se parten R2, R4, R5 y R6 en sub-PRs (a/b) porque
cada uno combina fuente + suite de prueba completa (unit+e2e) que por sí sola ya se acerca o supera
las 400 líneas — mismo criterio que partió `#17` en 5 PRs. **Convención del repo**: no se abren
branches de GitHub por PR — la entrega real es commits secuenciales tageados `(PRx/10, #19)` sobre
la única rama larga ya existente (`feat/administracion-procesos-electorales-pr4-cimientos-backend`
o la que corresponda al momento de aplicar), igual que `#11`-`#18`. `stacked-to-main` es la
aproximación más cercana del vocabulario de la skill a ese patrón: cada PRn es un checkpoint de
commits, no una rama nueva. `auto-chain` ya fue confirmado por el usuario, así que no se pide
decisión de estrategia antes de `sdd-apply`.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----|-----------------|-------------------|
| 1 | Migración `Notificacion`/`JobCorreo.origen` (D2/D3) + `test/schema/notificaciones.spec.ts` | PR 1 | `pnpm --filter @seei/backend test -- schema` | Postgres real (Docker) | `git revert` PR1; nadie más consume las columnas nuevas todavía |
| 2 | `email/texto-libre.ts` + `plantillas-notificacion.ts` (D8), 4 funciones puras + despacho | PR 2 | `pnpm --filter @seei/backend test -- plantillas-notificacion` | Ninguno (puro) | `git revert` PR2; `correo-comprobante.spec.ts` de `#15` sigue verde sin editar |
| 3 | `emitir-notificaciones.ts` (D4), `ON CONFLICT DO NOTHING`, auditoría agregada | PR 3 | `pnpm --filter @seei/backend test -- emitir-notificaciones` | Doble de `Prisma.TransactionClient`, sin Postgres | `git revert` PR3; PR1/PR2 intactos, nadie llama al emisor todavía |
| 4 | Hooks en `procesos.service.ts::abrir()/cerrar()` (D5) + `NOTIFICACIONES_EMITIDAS` | PR 4 | `pnpm --filter @seei/backend test:e2e -- notificaciones-hooks` | Postgres real | `git revert` PR4; apertura/cierre vuelven a no notificar, resto intacto |
| 5 | `NotificacionesService`+DTOs+errores (D9/D10): *scope*, `403` uniforme, idempotencia PATCH | PR 5 | `pnpm --filter @seei/backend test -- notificaciones.service` | Doble de `PrismaService` | `git revert` PR5; sin HTTP todavía, PR1-PR4 intactos |
| 6 | `NotificacionesController`/`Module`+`app.module.ts`, contrato OpenAPI | PR 6 | `pnpm --filter @seei/backend test:e2e -- notificaciones` | Postgres real + `pnpm openapi:extract` sin Redis | `git revert` PR6; bandeja HTTP desaparece, PR1-PR5 intactos |
| 7 | Fix `outbox-correo.repo.ts::pendientes()` +`origen:'comprobante'` (D3, corrige C5) | PR 7 | `pnpm --filter @seei/worker test -- outbox-correo` | Ninguno (unit, repo mockeado) | `git revert` PR7; **reintroduce el bug C5** — aislamiento de colas queda decorativo |
| 8 | Worker: repo/dispatcher/listener `notificaciones` + wiring cola en `main.ts` (D7) | PR 8 | `pnpm --filter @seei/worker test -- notificaciones` | Postgres real (aislamiento con 500 jobs) | `git revert` PR8; PR7 sigue filtrando, pero nada despacha `notificaciones` |
| 9 | `sweep-notificaciones.ts` puro (D6), umbrales independientes, `numeroPositivo` (D12) | PR 9 | `pnpm --filter @seei/worker test -- sweep-notificaciones` | Ninguno (puro, `ahora` inyectado) | `git revert` PR9; sin consumidor todavía |
| 10 | `sweep.repo.ts`+`setInterval` en `main.ts`+env vars documentadas (D6/D12) | PR 10 | `pnpm --filter @seei/worker test:e2e -- sweep` | Postgres real (doble barrido, concurrencia) | `git revert` PR10; recordatorio/cierre próximo se apagan, resto del change intacto |

## PR 1 — Migración de `Notificacion`/`JobCorreo.origen` (D2/D3)

### Phase 1: Schema y migración
- [x] 1.1 Modificar `apps/backend/prisma/schema.prisma`: `TipoNotificacion +interna`, enums `EventoNotificacion`/`OrigenJobCorreo`, 6 columnas en `Notificacion`, `job_correo_id` nullable, `JobCorreo.origen`, 2 índices parciales + 1 único
- [x] 1.2 Crear `apps/backend/prisma/migrations/20260825010000_notificacion_bandeja_interna/migration.sql`: DDL puro en el orden exacto de D2/D3, con el comentario del gotcha de `ADD VALUE`

### Phase 2: RED/GREEN — `test/schema/notificaciones.spec.ts`
- [x] 2.1 `TipoNotificacion` tiene `correo`+`interna`; `EventoNotificacion` los 4 valores
- [x] 2.2 `INSERT` sin `usuario_id`/`evento` ⇒ error `NOT NULL`; `job_correo_id` `NULL` aceptado
- [x] 2.3 Segunda fila con el mismo `(proceso_id, evento, usuario_id)` ⇒ `23505`
- [x] 2.4 Dos filas con `proceso_id IS NULL` no colisionan
- [x] 2.5 `JobCorreo.origen` default `'comprobante'` en filas preexistentes; los 2 índices parciales existen con su predicado
- [x] 2.6 GREEN: `pnpm prisma migrate deploy` verde desde baseline; `test:schema` verde (pasa 2.1-2.5)

### Phase 3: Regresión PR1
- [x] 3.1 `pnpm --filter @seei/backend test -- schema` verde; `pnpm typecheck` verde

## PR 2 — Motor de plantillas (D8)

### Phase 4: `email/texto-libre.ts`
- [x] 4.1 Crear `apps/backend/src/email/texto-libre.ts`: mover `normalizarTextoLibre()` desde `votos/correo-comprobante.ts`
- [x] 4.2 Modificar `apps/backend/src/votos/correo-comprobante.ts`: importar el helper movido — verificar `correo-comprobante.spec.ts` verde **sin editarse**

### Phase 5: RED/GREEN — `plantillas-notificacion.spec.ts`
- [x] 5.1 Los 4 eventos producen `titulo`/`cuerpo`/`asunto` deterministas
- [x] 5.2 `asunto` **no** contiene `proceso_nombre` en ninguno de los 4 [threat: inyección SMTP]
- [x] 5.3 `proceso_nombre` con `\r\nBcc:` sale normalizado en el `cuerpo`
- [x] 5.4 Sin `app_base_url` el cuerpo omite el enlace y no lanza
- [x] 5.5 La firma no acepta `usuario` (aserción de tipo/texto del módulo) [C8]
- [x] 5.6 GREEN: crear `apps/backend/src/notificaciones/plantillas-notificacion.ts` (`construirNotificacion`, despacho congelado) — pasa 5.1-5.5

### Phase 6: Regresión PR2
- [x] 6.1 `pnpm --filter @seei/backend test -- plantillas-notificacion correo-comprobante` verde; `pnpm typecheck` verde

## PR 3 — Emisor único `emitirNotificaciones` (D4)

### Phase 7: RED/GREEN — `emitir-notificaciones.spec.ts`
- [x] 7.1 `destinatarios: []` ⇒ no ejecuta ningún `INSERT` (spy sobre doble de `tx`)
- [x] 7.2 Troceado a 500; `createMany` de `JobCorreo` recibe exactamente las filas del `RETURNING`, nunca la lista completa
- [x] 7.3 `origen:'notificacion'` en todas las filas de `JobCorreo`
- [x] 7.4 Payload de `NOTIFICACIONES_EMITIDAS` sin `usuario_id` ni identidad de elección [threat: secreto del voto/PII]
- [x] 7.5 GREEN: crear `apps/backend/src/notificaciones/emitir-notificaciones.ts` (función libre sobre `tx`, `ON CONFLICT DO NOTHING`, orden Notificacion→JobCorreo→UPDATE→auditoría) — pasa 7.1-7.4

### Phase 8: Regresión PR3
- [x] 8.1 `pnpm --filter @seei/backend test -- emitir-notificaciones` verde; `pnpm typecheck` verde

## PR 4 — Hooks transaccionales de apertura/cierre (D5)

### Phase 9: Auditoría y `RETURNING`
- [x] 9.1 Modificar `apps/backend/src/auditoria/audit-event-types.ts`: `+NOTIFICACIONES_EMITIDAS` + entrada de bitácora
- [x] 9.2 Modificar `procesos.service.ts::abrir()`: sumar `nombre, fecha_cierre_prevista` al `RETURNING`

### Phase 10: RED/GREEN — `test/procesos/notificaciones-hooks.e2e-spec.ts`
- [x] 10.1 Apertura con N habilitados ⇒ N `Notificacion` (`evento='inicio_votacion'`) + N `JobCorreo(origen='notificacion')`
- [x] 10.2 Apertura que falla ⇒ cero de ambas (rollback)
- [x] 10.3 Segunda apertura (no-op idempotente) ⇒ siguen N, sin duplicar
- [x] 10.4 Alcance `comunidad` (2 `DerechoVoto` por cuenta) ⇒ una notificación, no dos [`SELECT DISTINCT`]
- [x] 10.5 Cierre ⇒ N de `resultados`; doble cierre ⇒ siguen N
- [x] 10.6 GREEN: en `procesos.service.ts::abrir()`/`cerrar()`, llamar `emitirNotificaciones(tx, …)` tras `auditoria.log(...)` y antes del `return`, solo en la rama de transición real — pasa 10.1-10.5
- [x] 10.7 `test/schema/auditoria.spec.ts` caso `[TM4]`: `NOTIFICACIONES_EMITIDAS` cumple `CHECK ^[A-Z_]+$` y no entra en el trigger `eventoauditoria_claves_eleccion_trg`

### Phase 11: Regresión PR4
- [x] 11.1 `pnpm --filter @seei/backend test:e2e -- notificaciones-hooks` verde; `test -- auditoria` verde; `pnpm typecheck` verde

## PR 5 — `NotificacionesService`, DTOs y errores (D9/D10)

### Phase 12: DTOs y errores
- [x] 12.1 Crear `dto/listar-notificaciones.query.ts`, `notificacion-respuesta.dto.ts`, `pagina-notificaciones.dto.ts` (planos, `@ApiProperty`, sin `class-validator`)
- [x] 12.2 Crear `apps/backend/src/notificaciones/notificaciones.errors.ts`: `CAMPO_INVALIDO` (`as const` + union)

### Phase 13: RED/GREEN — `notificaciones.service.spec.ts`
- [x] 13.1 Listado filtra por `usuario_id = sesion.userId`, nunca por parámetro [threat: IDOR/oráculo]
- [x] 13.2 `pagina`/`tamano` fuera de rango ⇒ `CAMPO_INVALIDO`
- [x] 13.3 `findFirst({id, usuario_id})` nulo ⇒ `403` (idéntico para ajena e inexistente, sin cuerpo) [D9/C7]
- [x] 13.4 `PATCH` con `leido_en=NULL` ⇒ `updateMany` CAS puebla `leido_en`; segundo `PATCH` ⇒ `200` con el `leido_en` **original**, sin sobrescribir [D10]
- [x] 13.5 GREEN: crear `apps/backend/src/notificaciones/notificaciones.service.ts` — pasa 13.1-13.4

### Phase 14: Regresión PR5
- [x] 14.1 `pnpm --filter @seei/backend test -- notificaciones.service` verde (13/13); `pnpm typecheck` verde salvo el fallo preexistente de `#30` (`mis-derechos.service.spec.ts`, no tocado por PR5)

## PR 6 — `NotificacionesController`/`Module` y contrato (D9)

### Phase 15: Wiring HTTP
- [x] 15.1 Crear `notificaciones.controller.ts`: `@Controller('notificaciones')`, `@UseGuards(AuthGuard)`, sin `@Roles`; `GET /notificaciones`, `PATCH /notificaciones/:id/leido` (`@HttpCode(200)`, `ParseUUIDPipe`)
- [x] 15.2 Crear `notificaciones.module.ts` (`imports:[AuthModule]`, `cookie-parser` `forRoutes`); modificar `app.module.ts` (`+NotificacionesModule`)

### Phase 16: RED/GREEN e2e — `notificaciones.e2e-spec.ts`
- [x] 16.1 Usuario A solo ve las suyas, paginadas, nunca las de B [spec: Listado scoped] (escrito)
- [x] 16.2 `solo_no_leidas=true` filtra correctamente (escrito)
- [x] 16.3 `PATCH` propio ⇒ `200` con `leido_en` poblado; `PATCH` de ajena ⇒ `403` sin cuerpo; UUID inexistente ⇒ el **mismo** `403` byte a byte [aserción de no-oráculo] (escrito)
- [x] 16.4 Sin cookie ⇒ `401` (escrito)
- [x] 16.5 GREEN: completar wiring del controller/service — pasa 16.1-16.4 — ejecutado contra Postgres/Redis reales (`docker-compose.test.yml`), `pnpm exec jest --config test/jest-e2e.config.ts --runInBand --testPathPattern notificaciones`: 2 suites, 10/10 tests verdes (los 4 de esta suite + regresión de los 6 de `notificaciones-hooks.e2e-spec.ts` de PR4)
- [x] 16.6 Correr `pnpm openapi:extract` + `pnpm --filter @seei/contracts generate:contracts`: `packages/contracts/openapi.json`+`src/generated/api.d.ts` exponen las 2 rutas nuevas; drift check (`@seei/contracts test`) verde

### Phase 17: Regresión PR6
- [x] 17.1 `notificaciones.e2e-spec.ts` verde contra Postgres/Redis reales (10/10, ver Phase 16); `pnpm typecheck` verde salvo el fallo preexistente de `#30` (`mis-derechos.service.spec.ts`, no tocado por este PR). Nota: la suite completa `test:e2e` **no corre en paralelo** con seguridad en este entorno — varias suites de `#18`/`#26` compiten por el único `AnioEscolar` activo y devuelven `409` con el runner de Jest en paralelo (`node scripts/test-e2e.mjs`, sin `--runInBand`); es un problema preexistente de la suite completa, no de este PR — se validó `notificaciones` de forma aislada con `--runInBand`

## PR 7 — Fix de aislamiento de colas (D3, corrige C5)

### Phase 18: RED/GREEN — `outbox-correo.repo.spec.ts`
- [x] 18.1 `pendientes()` de la cola `correo` excluye filas `origen='notificacion'` (spy/mocked repo, sin Postgres)
- [x] 18.2 GREEN: modificar `apps/worker/src/outbox/outbox-correo.repo.ts::pendientes()` — sumar filtro `origen:'comprobante'` — pasa 18.1

### Phase 19: Regresión PR7
- [x] 19.1 `pnpm --filter @seei/worker test -- outbox-correo` verde (15/15 suites, 59/59 tests, incluye regresión de `#15`); `pnpm --filter @seei/worker` typecheck verde

## PR 8 — Worker: repo/dispatcher/listener de `notificaciones` (D7)

### Phase 20: Repo y dispatcher
- [ ] 20.1 Crear `apps/worker/src/notificaciones/notificaciones.repo.ts`: composición sobre `PrismaOutboxCorreoRepo`, `pendientes()` con `origen:'notificacion'`
- [ ] 20.2 RED/GREEN `notificaciones-dispatcher.spec.ts`: `jobId:'notificacion:<id>'`, `attempts:5`, backoff exponencial 2000ms; lote vacío ⇒ no llama `addBulk` — GREEN: crear `notificaciones-dispatcher.ts`

### Phase 21: Listener de fallos
- [ ] 21.1 RED/GREEN `notificaciones-fallido-listener.spec.ts`: `attemptsMade >= attempts` ⇒ `marcarFallido`; `attemptsMade < attempts` ⇒ no marca — GREEN: crear `notificaciones-fallido-listener.ts` (espejo de `crearListenerActasFallido`)

### Phase 22: Wiring en `main.ts`
- [ ] 22.1 Modificar `apps/worker/src/main.ts`: `Queue`/`Worker` de `notificaciones`, reusar `procesarCorreoComprobante` con `PrismaNotificacionesRepo`, listener `on('failed')`, `NOTIFICACIONES_POLL_MS`/`NOTIFICACIONES_BATCH` (defaults 5000/20)

### Phase 23: RED e2e — aislamiento de colas `[TM]`
- [ ] 23.1 500 `JobCorreo(origen='notificacion')` pendientes + 1 `(origen='comprobante')` ⇒ `despacharLoteOutbox` devuelve solo el de comprobante y `despacharLoteNotificaciones` ninguno de comprobante — **debe fallar si se revierte PR7**
- [ ] 23.2 GREEN: verificar wiring completo de Phase 20-22 satisface 23.1

### Phase 24: Regresión PR8
- [ ] 24.1 `pnpm --filter @seei/worker test -- notificaciones` verde (Postgres real); `pnpm typecheck` verde

## PR 9 — Sweep puro (D6/D12)

### Phase 25: RED/GREEN — `sweep-notificaciones.spec.ts`
- [ ] 25.1 `restante` justo por encima/por debajo de cada umbral (recordatorio 24h, cierre próximo 2h)
- [ ] 25.2 Proceso dentro de ambos umbrales ⇒ dos emisiones independientes, sin que la más urgente cancele la otra [spec: Cierre próximo y recordatorio son independientes]
- [ ] 25.3 `restante ≤ 0` ⇒ cero emisiones
- [ ] 25.4 Sin procesos abiertos ⇒ no llama al repo
- [ ] 25.5 `numeroPositivo(env, default)` cae al default ante `NaN`/`0`/negativo — el barrido emite igual [threat: configuración hostil/silenciosa]
- [ ] 25.6 GREEN: crear `apps/worker/src/notificaciones/sweep-notificaciones.ts` (`barrerNotificaciones`, `ahora` inyectado) — pasa 25.1-25.5

## PR 10 — Sweep repo, wiring y variables de entorno (D6/D12)

### Phase 26: Adaptador Prisma
- [ ] 26.1 Crear `apps/worker/src/notificaciones/sweep.repo.ts`: `procesosAbiertos()`, `emitirPendientes()` con atajo `count(Notificacion{proceso,evento}) > 0` antes de tocar `DerechoVoto`/`Voto`, destinatarios vía `NOT EXISTS` sobre `Voto`

### Phase 27: RED/GREEN e2e — `test/notificaciones/sweep.e2e-spec.ts`
- [ ] 27.1 Doble barrido sobre el mismo proceso dentro del umbral ⇒ N notificaciones, no 2N
- [ ] 27.2 Barrido concurrente (`Promise.all` de dos `emitirPendientes`) ⇒ N
- [ ] 27.3 Usuario que ya votó no recibe recordatorio
- [ ] 27.4 Sweep sobre proceso ya notificado ⇒ cero consultas a `DerechoVoto` (spy) [threat: denegación por barrido/transacción larga]
- [ ] 27.5 GREEN: modificar `apps/worker/src/main.ts` — `setInterval(NOTIFICACIONES_SWEEP_MS=60000)` invocando `barrerNotificaciones(sweepRepo, umbrales, new Date())` — pasa 27.1-27.4

### Phase 28: Documentación de variables de entorno
- [ ] 28.1 Modificar `infra/docker/docker-compose.yml`, `docs/onboarding.md`, `README.md`: las 5 `NOTIFICACIONES_*` junto a `OUTBOX_*`/`ACTAS_*`/`REPORTES_*`
- [ ] 28.2 Modificar `turbo.json`: sumar las env vars nuevas a `test:e2e.env`

### Phase 29: Regresión final del change
- [ ] 29.1 `pnpm --filter @seei/worker test:e2e -- sweep` verde
- [ ] 29.2 `pnpm --filter @seei/backend test` y `test:e2e` completos verdes (Postgres real)
- [ ] 29.3 `pnpm turbo run test` verde en los 4 paquetes
- [ ] 29.4 `pnpm typecheck` verde
- [ ] 29.5 Verificar `test/votos/outbox-atomicidad.e2e-spec.ts` y `correo-comprobante.spec.ts` (`#15`) siguen verdes sin editarse desde PR2/PR7

## Pendientes explícitamente fuera de este change (constancia, no se inventan aquí)

Documentados como "Preguntas abiertas" en `design.md`, ninguno bloquea `sdd-apply`:
- Los defaults de 24h/2h no vienen de una regla de negocio confirmada por el comité; quedan
  configurables por variable de entorno.
- Preferencias de notificación por usuario (silenciar tipos/canales) quedan fuera de alcance; el
  esquema las admite después sin migración destructiva.
- UI de frontend para la bandeja interna: diferida a un change posterior (mismo criterio que
  `#17`→`#26-29` y `#18`).
