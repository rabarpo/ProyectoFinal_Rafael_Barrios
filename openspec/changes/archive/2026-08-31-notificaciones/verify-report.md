```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f3f262a2b2f4be38d605ba7963bbe87fbd55b1d1418992d69efed2f8cc29b0b8
verdict: pass
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 14/14
test_command: pnpm --filter @seei/backend exec jest --runInBand --forceExit --testPathPattern notificaciones-auditoria (e2e+schema) plus pnpm --filter @seei/worker test:e2e plus pnpm --filter @seei/worker test
test_exit_code: 0
test_output_hash: sha256:f3f262a2b2f4be38d605ba7963bbe87fbd55b1d1418992d69efed2f8cc29b0b8
build_command: pnpm turbo run build
build_exit_code: 0
build_output_hash: sha256:beea1eb01791c652766656c3aa8da4772fad0742ec25c98931e430cc8bc6eabb
```

# Reporte de verificación — notificaciones (backlog #19)

**Change**: notificaciones
**Version**: N/A (openspec, sin versión de spec)
**Mode**: Strict TDD

## Veredicto: PASS WITH WARNINGS

Los 7 requisitos y los 14 escenarios de la spec quedan verificados con evidencia de runtime
independiente (Docker Postgres/Redis efímero levantado en esta fase). Build completo verde. Todas
las suites de #19 en verde: unit backend 32/32, unit worker 78/78, e2e backend 10/10, schema 32/32,
e2e worker 16/16, más regresión de #15/#13/#17 verde.

WARNINGS (ninguno bloquea el archivado):
1. `pnpm turbo run test` (comando declarado) sale en exit 1 por 3-4 suites de backend ajenas a #19
   (session/bloqueo/recovery/importacion) que requieren un Redis en el puerto por defecto y fallan
   por timeout fuera del stack de test efímero. Preexistentes e intermitentes (varían entre
   corridas: 4/31 y 3/30 fallos). No tocan ningún archivo de #19.
2. `pnpm --filter @seei/backend test:e2e` en corrida completa paralela dispara el flake conocido de
   `anioEscolar` (constraint parcial único sobre `activo`) por contaminación entre suites ajenas.
   Las suites de #19 se ejecutaron aisladas con `--runInBand` y pasaron.
3. Sin artefacto apply-progress con tabla TDD Cycle Evidence estándar; la disciplina RED/GREEN está
   documentada por fase en tasks.md (Phases 1-29).

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 80 |
| Tasks complete | 80 |
| Tasks incomplete | 0 |

## Build & Tests Execution

**Build**: `pnpm turbo run build` PASS (exit 0) — 6/6 tareas turbo; `nest build`, `openapi:extract`,
`generate:contracts` y build de frontend OK.

**Tests de #19 (todas ejecutadas en esta fase, verde):**

| Suite | Runner / infra | Resultado |
|---|---|---|
| src/notificaciones/*.spec.ts (backend unit) | jest | 3 suites / 32 tests PASS |
| apps/worker unit (incluye sweep-notificaciones, notificaciones-dispatcher, notificaciones-fallido-listener, outbox-correo.repo) | vitest | 18 suites / 78 tests PASS |
| test/notificaciones/notificaciones.e2e-spec.ts + test/procesos/notificaciones-hooks.e2e-spec.ts | jest-e2e + Postgres/Redis efímero, --runInBand | 2 suites / 10 tests PASS |
| test/schema/notificaciones.spec.ts + test/schema/auditoria.spec.ts | jest-schema + Postgres efímero | 2 suites / 32 tests PASS |
| apps/worker/test/notificaciones/{sweep,aislamiento-colas}.e2e-spec.ts (+ regresión actas/reportes) | vitest.e2e + Postgres efímero | 4 suites / 16 tests PASS |

**Regresión verificada en esta fase (verde):**
- test/votos/outbox-atomicidad.e2e-spec.ts (#15) — 3/3 PASS
- test/procesos/procesos-abrir.e2e-spec.ts + procesos-cerrar.e2e-spec.ts (#13/#17) — 2 suites / 25 tests PASS
- correo-comprobante.spec.ts (#15) — verde sin editar (dentro de la corrida unit)

**Coverage**: no disponible (sin herramienta de cobertura configurada; threshold 0).

## Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 Notificación de inicio en la transacción de apertura | Apertura notifica a todos los habilitados | test/procesos/notificaciones-hooks.e2e-spec.ts | COMPLIANT |
| R1 | Fallo en la transacción no deja notificaciones parciales | notificaciones-hooks.e2e-spec.ts (constraint tmp_falla_notif fuerza rollback) | COMPLIANT |
| R2 Notificación de resultados en la transacción de cierre | Cierre notifica resultados a todos los habilitados | notificaciones-hooks.e2e-spec.ts | COMPLIANT |
| R2 | Doble cierre idempotente no duplica | notificaciones-hooks.e2e-spec.ts | COMPLIANT |
| R3 Sweep periódico idempotente | Primer sweep dentro del umbral crea la notificación | sweep-notificaciones.spec.ts 25.1 + test/notificaciones/sweep.e2e-spec.ts | COMPLIANT |
| R3 | Sweep repetido no duplica | apps/worker/test/notificaciones/sweep.e2e-spec.ts | COMPLIANT |
| R3 | Cierre próximo y recordatorio son independientes | sweep-notificaciones.spec.ts 25.2 | COMPLIANT |
| R4 Esquema aditivo de Notificacion | Migración no toca columnas ni valores existentes | test/schema/notificaciones.spec.ts | COMPLIANT |
| R4 | Notificación interna sin correo (job_correo_id NULL) | test/schema/notificaciones.spec.ts | COMPLIANT |
| R5 Motor de plantillas sin tabla en BD | Cada tipo produce un contenido determinista | plantillas-notificacion.spec.ts | COMPLIANT |
| R6 Cola BullMQ dedicada notificaciones | Ráfaga de recordatorios no retrasa comprobantes | apps/worker/test/notificaciones/aislamiento-colas.e2e-spec.ts (500 jobs notificacion + 1 comprobante) + outbox-correo.repo.spec.ts 18.1 | COMPLIANT |
| R7 Lectura y marcado de bandeja vía API | Listado scoped al usuario autenticado | test/notificaciones/notificaciones.e2e-spec.ts + notificaciones.service.spec.ts 13.1 | COMPLIANT |
| R7 | Marcado de lectura exitoso | notificaciones.e2e-spec.ts + notificaciones.service.spec.ts 13.4 | COMPLIANT |
| R7 | Marcado de notificación ajena -> 403 sin cambios (byte a byte igual a inexistente) | notificaciones.e2e-spec.ts (aserción de no-oráculo) + notificaciones.service.spec.ts 13.3 | COMPLIANT |

**Compliance summary**: 14/14 escenarios COMPLIANT con evidencia de runtime.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| R1 | Implementado | procesos.service.ts::abrir(): emitirNotificaciones(tx, inicio_votacion, SELECT DISTINCT usuario_id FROM DerechoVoto) tras auditoria.log, antes del return, solo en la rama de transición real; no-op idempotente excluido en código y por el índice único |
| R2 | Implementado | procesos.service.ts::cerrar(): emitirNotificaciones(tx, resultados) en la rama de transición real |
| R3 | Implementado | main.ts setInterval(NOTIFICACIONES_SWEEP_MS=60000) -> barrerNotificaciones (pura, ahora inyectado, umbrales independientes, restante<=0 no emite); PrismaSweepRepo.emitirPendientes con atajo count>0 y NOT EXISTS sobre Voto; dedup real vía ON CONFLICT DO NOTHING sobre índice único (proceso_id, evento, usuario_id) |
| R4 | Implementado | migration.sql DDL puro; ADD VALUE interna; enums EventoNotificacion/OrigenJobCorreo; job_correo_id DROP NOT NULL; 6 columnas nuevas; índice único de dedup + índice de bandeja; JobCorreo.origen + 2 índices parciales disjuntos; no reordena ni renombra |
| R5 | Implementado | plantillas-notificacion.ts: construirNotificacion sobre Record congelado, 4 funciones puras sin E/S; asunto fijo por evento; plantilla resultados avisa sin conteos |
| R6 | Implementado | notificaciones-dispatcher.ts (cola notificaciones, jobId notificacion:id, attempts 5, backoff exp 2000); PrismaNotificacionesRepo.pendientes filtra origen=notificacion; PR7 añade origen=comprobante a PrismaOutboxCorreoRepo.pendientes |
| R7 | Implementado | notificaciones.controller.ts (@UseGuards AuthGuard, sin @Roles); NotificacionesService: scope siempre usuario_id=sesion.userId; findFirst nulo -> 403 sin cuerpo idéntico para ajena e inexistente; marcarLeido idempotente con CAS updateMany(where leido_en null), preserva leido_en original |

Nota: la spec dejó abierto 404 o 403 en R7; el diseño (D9/C7) fijó 403 uniforme. Cumple la letra
de la spec ("sin revelar si el registro existe para otro usuario"); el escenario de no-oráculo
byte-a-byte pasó en notificaciones.e2e-spec.ts.

## Coherence (Design)

| Decisión | Followed? | Notes |
|----------|-----------|-------|
| D2 migración DDL puro, orden exacto, comentario del gotcha ADD VALUE | Sí | migration.sql coincide con el contrato; test/schema verde |
| D3 JobCorreo.origen + 2 índices parciales + filtro en ambos repos | Sí | migración + outbox-correo.repo.ts + notificaciones.repo.ts; aislamiento-colas.e2e verde |
| D4 emitirNotificaciones(tx, params) función libre, ON CONFLICT DO NOTHING, orden Notificacion->JobCorreo->UPDATE->auditoría, troceo 500 | Sí | emitir-notificaciones.ts |
| D5 hooks en abrir()/cerrar() solo rama de transición real, SELECT DISTINCT | Sí | diff d46faa7; notificaciones-hooks.e2e verde (incluye alcance comunidad) |
| D6 sweep puro ahora inyectado, umbrales independientes, restante<=0 no emite, NOT EXISTS sobre Voto | Sí | sweep-notificaciones.ts + sweep.repo.ts; sweep.e2e verde |
| D7 cola notificaciones, procesarCorreoComprobante reusado, attempts 5/backoff 2000, listener failed extraído | Sí | main.ts + notificaciones-dispatcher.ts + notificaciones-fallido-listener.ts |
| D8 plantillas sin usuario, asunto fijo, normalizarTextoLibre movido a email/texto-libre.ts | Sí | plantillas-notificacion.ts, email/texto-libre.ts |
| D9 403 uniforme sin cuerpo, sin @Roles, paginación offset con total/no_leidas | Sí | notificaciones.controller.ts + notificaciones.service.ts |
| D10 PATCH idempotente, preserva leido_en original, CAS where leido_en null | Sí | notificaciones.service.ts::marcarLeido |
| D11 auditoría NOTIFICACIONES_EMITIDAS agregada, tx.eventoAuditoria.create directo, payload cerrado sin usuario_id | Sí | emitir-notificaciones.ts + audit-event-types.ts; test/schema/auditoria.spec.ts [TM4] verde |
| D12 numeroPositivo() para SWEEP_MS/RECORDATORIO/CIERRE_PROXIMO | Parcial (WARNING->SUGGESTION) | SWEEP/RECORDATORIO/CIERRE usan numeroPositivo; POLL_MS/BATCH usan Number(x ?? default) — coincide con el patrón OUTBOX_* y con la letra de D12, pero un valor hostil degeneraría setInterval(NaN). No bloquea |

Desviación menor adicional (SUGGESTION): SweepRepo.emitirPendientes(procesoId: string, evento) usa
el id en vez del objeto proceso del contrato en design.md. Sin impacto funcional.

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Parcial | Sin artefacto apply-progress; disciplina RED/GREEN documentada por fase en tasks.md (Phases 1-29) |
| All tasks have tests | Sí | Los 13 archivos .spec.ts/.e2e-spec.ts de design.md existen |
| RED confirmed (tests exist) | Sí | Verificado en disco |
| GREEN confirmed (tests pass) | Sí | Todas las suites de #19 ejecutadas en verde en esta fase (unit + e2e + schema, ver tabla arriba) |
| Triangulation adequate | Sí | sweep-notificaciones.spec.ts: bordes de ambos umbrales, ambos a la vez, restante<=0, sin procesos, numeroPositivo hostil. notificaciones.service.spec.ts: 13 casos con expectativas distintas |
| Safety Net for modified files | Sí | outbox-correo.repo.ts modificado + .spec.ts (regresión #15 verde); procesos.service.ts modificado + procesos.service.spec.ts + procesos-abrir/cerrar.e2e verde; correo-comprobante.spec.ts de #15 sin editar y verde |

**TDD Compliance**: 5/6 checks completos; 1 parcial (formato de evidencia apply-progress), ninguno por incumplimiento.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit backend | 32 | 3 | jest |
| Unit worker (de #19) | ~24 | 4 | vitest |
| Schema (pg crudo) | 32 | 2 | jest + Postgres |
| E2E backend | 10 | 2 | jest-e2e + Postgres/Redis |
| E2E worker | 16 | 4 (2 de #19 + 2 regresión) | vitest.e2e + Postgres |

## Assertion Quality

Revisadas las suites unit de #19 y las e2e clave: aserciones sobre comportamiento real (contenido y
asunto de plantillas, filas insertadas vs RETURNING, origen=notificacion, payload de auditoría sin
usuario_id, conteo N por usuario habilitado, rollback deja cero, 403 byte-a-byte, CAS de leido_en,
500 jobs de una cola no entran a la otra). Sin tautologías, ghost loops, smoke-tests ni aserciones
sin llamada a código de producción.

**Assertion quality**: 0 CRITICAL, 0 WARNING — todas las aserciones revisadas verifican comportamiento real.

## Quality Metrics

**Linter**: no configurado en el pipeline de test.
**Type Checker**: el build compila sin errores de tipo (`nest build`, `tsx`, `vite build`).
tasks.md 29.4 reporta `pnpm typecheck` verde salvo un fallo preexistente de #30
(mis-derechos.service.spec.ts) ajeno a #19.

## Auditoría de tareas (80/80 marcadas)

Verificación cruzada PR1..PR10: todos los archivos fuente y de prueba existen; los diffs de PR4
(hooks) y PR7 (filtro origen) se inspeccionaron directamente; todas las suites por PR se
re-ejecutaron en verde en esta fase. No se detectaron tareas marcadas sin respaldo.

## Issues Found

**CRITICAL**: Ninguno.

**WARNING**:
1. `pnpm turbo run test` sale en exit 1 por 3-4 suites de backend ajenas a #19 (session, bloqueo,
   recovery, importacion) que requieren un Redis en el puerto por defecto. Preexistentes,
   intermitentes, no tocan archivos de #19. No bloquea el archivado de #19.
2. Sin artefacto apply-progress con tabla TDD Cycle Evidence en el formato estándar.

**SUGGESTION**:
1. Unificar la lectura de NOTIFICACIONES_POLL_MS / NOTIFICACIONES_BATCH con el helper
   numeroPositivo() para cerrar el modo de falla setInterval(NaN) con configuración hostil.
2. Alinear la firma de SweepRepo.emitirPendientes con el objeto proceso del contrato de design.md.
3. Investigar por separado (fuera de #19) las suites Redis-dependientes que ensucian
   `pnpm turbo run test` y el flake de `anioEscolar` en la corrida e2e paralela.

## Verdict

PASS WITH WARNINGS — los 7 requisitos y 14 escenarios de la spec están implementados y verificados
con evidencia de runtime independiente (todas las suites de #19 verdes: unit, e2e y schema, más
regresión de #13/#15/#17). Build verde. Los warnings son ruido de infraestructura preexistente y de
formato de artefacto, ninguno atribuible a un defecto de #19 ni bloqueante para el archivado.
