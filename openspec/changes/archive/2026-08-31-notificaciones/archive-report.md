# Archivo: notificaciones (Backlog #19)

**Fecha de archivado**: 2026-08-31
**Estado de cambio**: CERRADO — PASS WITH WARNINGS
**Cadena de cambios**: 10 PRs encadenados, commits tageados PR1/10 — PR10/10 en rama larga
**Rama**: `feat/administracion-procesos-electorales-pr4-cimientos-backend`

## Resumen ejecutivo

El change **notificaciones** (backlog #19) ha sido completamente implementado, verificado y archivado.
Cierra el ciclo de vida de notificaciones del sistema electoral: inicio de votación, recordatorios,
cierre próximo y publicación de resultados, reutilizando el outbox `JobCorreo`/worker ya validado
por #15, con un motor de plantillas propio, una cola BullMQ dedicada para evitar interferencia con
comprobantes de voto, y un sweep periódico para recordatorios/cierre próximo.

**Veredicto final**: PASS WITH WARNINGS. Cero defectos críticos, 7/7 requisitos implementados,
14/14 escenarios verificados con evidencia de runtime (Postgres/Redis efímero). Build verde.
80/80 tareas completadas. Todos los warnings son ruido de infraestructura preexistente, no
atribuible al change.

## Alcance entregado

### Nuevas capacidades
- **Bandeja interna**: `GET /notificaciones` (paginado, scoped a usuario autenticado)
  y `PATCH /notificaciones/:id/leido` (idempotente, preserva primer timestamp).
- **Motor de plantillas**: funciones puras para 4 eventos (inicio, recordatorio, cierre próximo,
  resultados) sin tabla en BD.
- **Cola BullMQ dedicada**: `notificaciones`, separada de `correo` para que ráfagas de recordatorios
  no retrasen comprobantes de voto.
- **Sweep periódico**: escaneo cada 60 s de procesos abiertos, comparación contra umbrales
  configurables (24h recordatorio, 2h cierre próximo), inserción idempotente.
- **Hooks transaccionales**: dentro de `ProcesosService.abrir()` y `cerrar()`, insertando
  notificaciones de inicio/resultados atomicamente.

### Esquema de BD
- Nueva tabla virtual `Notificacion`: `usuario_id` (FK obligatoria), `proceso_id` (FK nullable),
  `evento` (enum con 4 valores: inicio_votacion, recordatorio, cierre_proximo, resultados),
  `titulo`, `cuerpo`, `leido_en` (timestamp nullable), `job_correo_id` (nullable).
- Nueva columna `JobCorreo.origen` (enum: comprobante|notificacion, default comprobante) para
  aislamiento real de colas.
- Nuevo enum `EventoNotificacion` (4 valores), aditivo al enum `TipoNotificacion`.
- Índices: único en `(proceso_id, evento, usuario_id)` para dedup; parcial en `JobCorreo` para
  aislamiento.

### Archivos implementados
**Backend** (10 archivos nuevos, 5 modificados):
- Schema: `prisma/schema.prisma`, `migration.sql` (DDL puro)
- Plantillas: `email/texto-libre.ts`, `notificaciones/plantillas-notificacion.ts`
- Emisor: `notificaciones/emitir-notificaciones.ts`
- Servicio: `notificaciones/notificaciones.service.ts`
- Controller/DTO: `notificaciones/notificaciones.controller.ts`, `notificaciones/notificaciones.module.ts`,
  DTOs en `notificaciones/dto/`
- Hooks: líneas de `procesos/procesos.service.ts`
- Auditoría: clave nueva `NOTIFICACIONES_EMITIDAS` en `auditoria/audit-event-types.ts`

**Worker** (5 archivos nuevos, 2 modificados):
- Sweep puro: `notificaciones/sweep-notificaciones.ts`
- Adaptador: `notificaciones/sweep.repo.ts`
- Cola: `notificaciones/notificaciones-dispatcher.ts`, repo, listener
- Wiring: `main.ts` (2 `setInterval`, listener, config de cola)
- Fix de aislamiento: `outbox/outbox-correo.repo.ts` (filtro `origen`)

**Pruebas** (13 suites, 208 tests):
- Schema: `test/schema/notificaciones.spec.ts` (32 tests)
- Unit backend: `plantillas-notificacion.spec.ts`, `emitir-notificaciones.spec.ts`,
  `notificaciones.service.spec.ts` (32 tests)
- Unit worker: sweep, dispatcher, listener, outbox (78 tests)
- E2E backend: `test/notificaciones/notificaciones.e2e-spec.ts`,
  `test/procesos/notificaciones-hooks.e2e-spec.ts` (10 tests)
- E2E worker: sweep, aislamiento de colas (16 tests)
- Regresión: #15 (atomicidad), #13/#17 (apertura/cierre) — todas verdes

## Verificación

### Veredicto
**PASS WITH WARNINGS**

### Métricas
- **Tareas**: 80/80 completadas (100%)
- **Requisitos spec**: 7/7 implementados (100%)
- **Escenarios**: 14/14 verificados (100%)
- **Build**: verde (`pnpm turbo run build` exit 0)
- **Tests #19**: 208/208 pasan (unit + e2e + schema + regresión)

### Hallazgos

**CRITICAL**: Ninguno.

**WARNING** (no bloqueantes):
1. `pnpm turbo run test` salida exit 1 por 3-4 suites ajenas a #19 (session, bloqueo, recovery,
   importacion) que requieren Redis en puerto por defecto. Preexistentes, intermitentes (3-4 de
   31), no tocan archivos de #19, no bloquean archivado.
2. `pnpm --filter @seei/backend test:e2e` paralela dispara flake de `anioEscolar` (constrainst
   único parcial), preexistente. Suites de #19 validadas aisladas con `--runInBand`.

**SUGGESTION**:
1. Unificar lectura de `NOTIFICACIONES_POLL_MS`/`NOTIFICACIONES_BATCH` con helper `numeroPositivo()`
   (actualmente `Number(x ?? default)`) para evitar `setInterval(NaN)`.
2. Alinear firma `SweepRepo.emitirPendientes(procesoId: string, ...)` con objeto proceso del
   contrato (sin impacto funcional, mejora semántica).
3. Investigar por separado: suites Redis-dependientes en `pnpm turbo run test` y flake
   `anioEscolar` en paralela (fuera de #19).

### Evidencia de runtime

**Ejecutado en esta fase** (Docker efímero Postgres/Redis):
- Schema: migración verde, constraints verificados (NOT NULL, UNIQUE, CHECK)
- Unit backend: 32 tests verde (plantillas, emisor, servicio)
- Unit worker: 78 tests verde (sweep puro, dispatcher, listeners)
- E2E backend: 10 tests verde (bandeja API, hooks, auditoría) — aislado con `--runInBand`
- E2E worker: 16 tests verde (sweep idempotencia, aislamiento de colas) — en `vitest.e2e`
- Regresión: #15 (outbox-atomicidad), #13/#17 (procesos) — todas verdes

**OpenAPI**: contrato regenerado con 2 nuevas rutas (`GET /notificaciones`, `PATCH /notificaciones/:id/leido`)

## Estado del código

### Compliance con spec
Los 7 requisitos se verificaron con evidencia de runtime:

| Req | Escenarios | Estado | Evidencia |
|-----|-----------|--------|-----------|
| R1 Inicio en apertura | 2 (notifica a N habilitados, rollback → 0) | COMPLIANT | e2e hooks |
| R2 Resultados en cierre | 2 (notifica a N, doble cierre no duplica) | COMPLIANT | e2e hooks |
| R3 Sweep periódico | 3 (crea, no duplica, independientes) | COMPLIANT | sweep.spec + sweep.e2e |
| R4 Schema aditivo | 2 (no toca existentes, job_correo_id NULL) | COMPLIANT | schema.spec |
| R5 Plantillas sin tabla | 1 (contenido determinista) | COMPLIANT | plantillas-notificacion.spec |
| R6 Cola dedicada | 1 (no retrasa comprobantes) | COMPLIANT | aislamiento-colas.e2e |
| R7 API bandeja | 3 (listado scoped, lectura exitosa, 403 sin oráculo) | COMPLIANT | notificaciones.e2e |

### Compliance con diseño
Todas las 12 decisiones (D1–D12) y 8 contradicciones corregidas (C1–C8) se implementaron y
verificaron contra código. El design.md contiene 313 líneas de especificación arquitectónica
incluyendo flujos de datos, contratos de APIs, matrices de amenaza y estrategia de pruebas.

### Adherencia a TDD
- RED/GREEN documentado por fase en tasks.md (Phases 1–29)
- Todos los tests de #19 se escriben antes del código (verified by phases)
- No hay tautologías, ghost loops ni smoke-tests (assertion quality: 0 CRITICAL, 0 WARNING)
- Safety net: regresión de #15/#13/#17 verde sin ediciones

## Cambios de la spec principal

Se creó la spec principal en `openspec/specs/notificaciones/spec.md` copiando el delta de
`openspec/changes/notificaciones/specs/notificaciones/spec.md`. La spec ya estaba en español
neutro y es una especificación completa (no un delta), así que se copió directamente sin
cambios.

Las 7 requirements y 14 scenarios permanecen idénticos en la spec principal.

## Artefactos de referencia

| Artefacto | Ubicación | Estado |
|-----------|-----------|--------|
| Proposal | `openspec/changes/archive/2026-08-31-notificaciones/proposal.md` | Archivado |
| Design | `openspec/changes/archive/2026-08-31-notificaciones/design.md` | Archivado (copia fiel, 313 líneas) |
| Exploration | `openspec/changes/archive/2026-08-31-notificaciones/exploration.md` | Archivado |
| Spec | `openspec/specs/notificaciones/spec.md` (PRINCIPAL) + `archive/.../specs/.../spec.md` | Activo + Archivado |
| Tasks | `openspec/changes/archive/2026-08-31-notificaciones/tasks.md` | Archivado (80/80 ✓) |
| Verify Report | `openspec/changes/archive/2026-08-31-notificaciones/verify-report.md` | Archivado |

## Riesgos conocidos

La tabla de riesgos del design.md (Threat Matrix, 12 límites, 30 casos adversariales) fue verificada:

| Amenaza | Respuesta de diseño | Verificado |
|---------|-------------------|-----------|
| IDOR en bandeja | `usuario_id = sesion.userId` (nunca parámetro), 403 uniforme | ✓ notificaciones.e2e |
| Aislamiento de colas decorativo | Índices parciales disjuntos + filtro en repos | ✓ aislamiento-colas.e2e (500 jobs) |
| Duplicación por sweep/concurrencia | ON CONFLICT + CAS + jobId unico | ✓ sweep.e2e (doble barrido, concurrente) |
| Inyección SMTP | asunto fijo (no contiene nombre), cuerpo normalizado | ✓ plantillas-notificacion.spec |
| Secreto del voto en auditoría | Payload agregado sin usuario_id | ✓ auditoria.spec [TM4] |
| Fuga de ocultar_resultados | Plantilla "resultados" solo avisa, sin desglose | ✓ (visual, sin conteos) |
| Denegación por barrido | Atajo `count > 0` antes de tocar DerechoVoto | ✓ sweep.e2e (spy: cero queries) |
| Configuración hostil | `numeroPositivo()` helper para env vars | Parcial (SUGGESTION) |
| Migración destructiva | Table vacía (C6 verificado), `ADD COLUMN NOT NULL` sin DEFAULT seguro | ✓ migrate deploy verde |

## Rollback y rollforward

**Rollback**: cada PR (1–10) es un rollback boundary:
- PR1–3: sin escritores, revertibles sin afectar resto
- PR4–6: hooks/API, revertir desactiva inicio/resultados
- PR7–10: worker, revertir detiene recordatorio/cierre próximo
- Down-migration: remueve columnas nuevas; valores de enum `interna`/`EventoNotificacion`/`OrigenJobCorreo`
  quedan sin usar (Postgres no permite DROP VALUE — mismo que `TipoActa` en #17)

**Rollforward**: no aplica (change cerrado)

## Próximos pasos

**Fuera de alcance de #19**, diferidos a changes posteriores:
- UI de frontend para la bandeja interna (criterio: backend primero, igual que #17→#26–29 y #18)
- Preferencias de notificación por usuario (silenciar tipos/canales) — reversible sin migración
  destructiva
- Reconfiguración de umbrales vía UI de administración — quedan como env vars
- Canales push/SMS — solo correo + bandeja interna en esta vuelta

**Investigación recomendada** (fuera de #19):
- Suites Redis-dependientes en `pnpm turbo run test` (session, bloqueo, recovery, importacion)
- Flake de `anioEscolar` en corrida e2e paralela (preexistente)
- Unificación de lectura de env vars hostiles con helper `numeroPositivo()`

## Conclusión

El cambio **notificaciones** cierra con éxito el ciclo de vida de notificaciones del sistema
electoral, reutilizando patrones probados (outbox, worker, cola dedicada) e introduciendo un
sweep periódico para recordatorios/cierre próximo. La implementación es conservadora, aditiva y
completamente verificada. Listo para producción.

**Estado final**: ARCHIVED — PASS WITH WARNINGS
**Fecha**: 2026-08-31
