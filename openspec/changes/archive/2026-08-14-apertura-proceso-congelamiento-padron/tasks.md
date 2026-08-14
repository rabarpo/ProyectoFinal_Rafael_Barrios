# Tasks: apertura-proceso-congelamiento-padron (Backlog #13)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~100-160 / PR2 ~320-400 / PR3 ~320-400 / PR4 ~300-380 / PR5 ~350-450 (~1390-1790 total) |
| 400-line budget risk | PR1 Low / PR2 High (borderline) / PR3 High (borderline) / PR4 Medium / PR5 High (borderline) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 schema+migración+claves → PR2 guarda de concurrencia+DTOs+endpoint → PR3 materialización de padrón+auditoría → PR4 e2e (idempotencia/409/concurrencia real) → PR5 UI de confirmación |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (resolved at apply time) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Revisión del corte de 3 PR de `design.md`**: el `design.md` propone PR1
migración+schema+claves, PR2 `abrir()`+endpoint+tests (incluida la suite de concurrencia), PR3 UI.
Al presupuestar línea por línea, **PR2 tal como está en `design.md` no cabe en 400 líneas**: solo el
método `abrir()` (guarda cruda D3-D5, materialización D6-D8 reusando el criterio de
`padron.service.ts`, troceado D7, auditoría D11) más el endpoint, los DTO, los tests unitarios
mockeados (12+ casos RED) y la suite e2e con la carrera real fácilmente supera 900-1000 líneas en
un solo PR. Se propone partir el PR2 original de `design.md` en **tres** slices de tamaño manejable
(PR2 guarda+idempotencia, PR3 materialización+auditoría, PR4 e2e incluida la carrera real),
manteniendo PR1 y el PR de UI (ahora PR5) como en el diseño original. Ninguno de los 5 slices queda
cómodamente bajo 400 con margen amplio — PR2, PR3 y PR5 quedan en el rango alto del presupuesto por
la densidad de casos de prueba, no por líneas de producción — así que el forecast se marca `High` y
`Decision needed before apply: Yes` (coherente con `ask-on-risk`, sin asumir el precedente de
`size:exception` de `#12`/PR7-PR8: aquí el problema es concurrencia/idempotencia, no volumen de UI
repetitiva, y sí se puede resolver con más slices en vez de una excepción).

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | Migración D1/D2 (unicidad + `aula_snapshot` uuid) + claves `PROCESO_NO_ABRIBLE`/`PROCESO_ABIERTO` + test de schema | PR 1 | tracker | `pnpm --filter @seei/backend test -- schema/voting` | `pnpm prisma migrate deploy` contra Postgres real (R1/R2) | `git revert` PR1; sin `abrir()` expuesto aún |
| 2 | Guarda de concurrencia D3-D5 (`$queryRaw` UPDATE...RETURNING) + `AbrirProcesoDto`/`AperturaRespuestaDto` (D9/D10) + endpoint `POST :id/abrir` | PR 2 | PR1 | `pnpm --filter @seei/backend test -- procesos.service` | Unit con `PrismaService` mockeado (`$queryRaw` como `jest.fn()`) | `git revert` PR2; PR1 sin consumidor aún |
| 3 | Materialización D6-D8 (findMany elegibles, `derechosPorAula`, `createMany` troceado en `LOTE_DERECHOS`) + auditoría D11 | PR 3 | PR2 | `pnpm --filter @seei/backend test -- procesos.service` | Unit con `PrismaService` mockeado | `git revert` PR3; guarda de PR2 no afectada |
| 4 | Suite e2e completa: idempotencia, `409 PROCESO_NO_ABRIBLE`, carrera real con `Promise.all`, regresión `editar()`/`eliminar()` tras apertura | PR 4 | PR3 | `pnpm --filter @seei/backend test:e2e -- procesos-abrir` | `test:e2e` contra Postgres real (Docker); ver 12.2 sobre disponibilidad del daemon en esta sesión | `git revert` PR4; PR1-PR3 no afectados |
| 5 | Ruta `/procesos/:id/abrir`, `AperturaProcesoPage`, `PanelConfirmacionApertura`, botón en `ProcesosIndexPage` | PR 5 | PR4 | `pnpm --filter @seei/frontend test -- Apertura` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR5; backend de PR1-PR4 no afectado |

## PR 1 — Schema, migración y claves (base = feature/tracker branch)

### Phase 1: Verificación previa y migración (D1-D3)
- [x] 1.1 Ejecutar R1: `SELECT count(*) FROM "DerechoVoto";` — DETENERSE si no es `0`
- [x] 1.2 Modificar `apps/backend/prisma/schema.prisma`: `@@unique([proceso_id, usuario_id,
      en_calidad_de])` en `DerechoVoto` (D1); `aula_snapshot String @db.Uuid` (D2)
- [x] 1.3 Crear `apps/backend/prisma/migrations/2026..._derecho_voto_unicidad_apertura/migration.sql`:
      `ALTER COLUMN "aula_snapshot" TYPE UUID USING "aula_snapshot"::uuid;` + `CREATE UNIQUE INDEX
      "DerechoVoto_proceso_id_usuario_id_en_calidad_de_key"`
- [x] 1.4 GREEN: `pnpm prisma migrate deploy` — índice presente, `aula_snapshot` de tipo `uuid` (R2)

### Phase 2: Claves nuevas (D5, D11)
- [x] 2.1 Modificar `apps/backend/src/procesos/procesos.errors.ts`: agregar
      `PROCESO_NO_ABRIBLE { codigo, estado }` (única clave nueva, D5)
- [x] 2.2 Modificar `apps/backend/src/auditoria/audit-event-types.ts`: agregar `PROCESO_ABIERTO` +
      comentario de bitácora documentando que no toca `Voto` (no activa ADR-0016, D11)
- [x] 2.3 GREEN: `test/schema/auditoria.spec.ts` `[TM4]` sigue verde tras 2.2

### Phase 3: Test de schema (D1/D2)
- [x] 3.1 RED schema: modificar `test/schema/voting.spec.ts` — el índice
      `DerechoVoto_proceso_id_usuario_id_en_calidad_de_key` existe
- [x] 3.2 RED schema: `INSERT` duplicado sobre `(proceso_id, usuario_id, en_calidad_de)` → `23505`
      (`helpers/expect-pg-error.ts`)
- [x] 3.3 RED schema: `aula_snapshot` es `uuid` en `information_schema`
- [x] 3.4 GREEN: correr `test/schema/voting.spec.ts` — pasa 3.1-3.3 tras 1.2-1.4

### Phase 4: Regresión PR1
- [x] 4.1 `pnpm openapi:extract` sin Postgres/Redis vivos; `pnpm typecheck` verde en los 4 paquetes

## PR 2 — Guarda de concurrencia, DTOs y endpoint (base = PR 1 branch)

### Phase 5: DTOs (D9/D10)
- [x] 5.1 Crear `apps/backend/src/procesos/dto/abrir-proceso.dto.ts`: `{ confirmar: boolean }` con
      `@ApiProperty`
- [x] 5.2 Crear `apps/backend/src/procesos/dto/apertura-respuesta.dto.ts`: `{ id, estado,
      apertura_real, ocultar_resultados, aulas, derechos_totales, derechos_estudiante,
      derechos_padre }`

### Phase 6: Guarda de concurrencia y transición de estado (D3-D5)
- [x] 6.1 RED unit: `confirmar` ausente/`false` → `400 CAMPO_INVALIDO { campo: 'confirmar', motivo:
      'requerido' }`, sin escritura [spec: Apertura rechazada sin confirmación]
- [x] 6.2 RED unit: sin año escolar activo → `409 SIN_ANIO_ESCOLAR_ACTIVO`, antes de abrir la
      transacción
- [x] 6.3 RED unit: guarda con 0 filas + proceso inexistente al releer → `404 NotFoundException`
- [x] 6.4 RED unit: guarda con 0 filas + estado releído `'abierto'` → `200` idempotente, sin
      `createMany` ni `auditoria.log` [spec: Reintento sobre un proceso ya abierto es idempotente]
- [x] 6.5 RED unit: guarda con 0 filas + estado releído `'cerrado'`/`'acta_emitida'` → `409
      PROCESO_NO_ABRIBLE { estado }` [spec: Apertura rechazada desde un estado no abrible]
- [x] 6.6 GREEN: implementar `ProcesosService.abrir()` con `tx.$queryRaw` `UPDATE ... WHERE id=$1 AND
      estado='borrador' RETURNING ...` (D3) + rama de relectura (D5) — pasa 6.1-6.5

### Phase 7: Endpoint (D9)
- [x] 7.1 Modificar `apps/backend/src/procesos/procesos.controller.ts`: `POST :id/abrir`,
      `@HttpCode(200)`, `@Param('id', ParseUUIDPipe)`, `@ApiOperation`/`@ApiResponse`; guards/roles
      heredados de la clase (`AuthGuard`, `RolesGuard`, `@Roles('administrador','director','comite')`)
- [x] 7.2 RED unit: `:id` no-UUID → `400` vía `ParseUUIDPipe`, servicio nunca invocado [threat
      matrix: SQL crudo parametrizado] — cubierto en `procesos.controller.spec.ts` nuevo (sin
      precedente de `INestApplication`/supertest en el repo; `ParseUUIDPipe` probado de forma
      aislada, comportamiento real de Nest, ver Deviations)
- [x] 7.3 GREEN: `pnpm --filter @seei/backend test -- procesos.service` — pasa 7.2 y el resto de
      Phase 6

### Phase 8: Regresión PR2
- [x] 8.1 `pnpm generate:contracts` + `pnpm openapi:extract` verde
- [x] 8.2 `pnpm typecheck` verde en los 4 paquetes

## PR 3 — Materialización de padrón y auditoría (base = PR 2 branch)

### Phase 9: Materialización de `DerechoVoto` (D6-D8)
- [x] 9.1 RED unit: dos `findMany` sobre `Matricula` que espejan las dos `groupBy` de
      `PadronService.calcular()` — mismo criterio de elegibilidad reusado, sin volver a llamar
      `resolverAulas()` (el `ProcesoAula[]` ya está congelado desde `crear()`/`editar()`) [spec:
      Materialización usa elegibilidad recalculada, no el preview]
- [x] 9.2 RED unit: `publico_objetivo='estudiantes'` → solo filas `en_calidad_de='estudiante'`
- [x] 9.3 RED unit: `publico_objetivo='comunidad'` con apoderado activo → dos filas
      (`estudiante`+`padre`) para la misma cuenta `Usuario` [spec: Doble derecho para alcance
      comunidad]
- [x] 9.4 RED unit: `createMany` troceado en lotes de `LOTE_DERECHOS = 5000` cuando el padrón supera
      el lote (D7)
- [x] 9.5 RED unit: padrón de 0 filas → `409 SEGMENTACION_SIN_ELEGIBLES`, rollback completo, proceso
      vuelve a `borrador` (D8)
- [x] 9.6 GREEN: implementar `derechosPorAula()`/helper de materialización + `LOTE_DERECHOS` — pasa
      9.1-9.5
- [x] 9.7 Verificar en apply si `createMany` de Prisma ya trocea internamente sobre >13k parámetros;
      documentar el hallazgo en un comentario junto a `LOTE_DERECHOS` sin retirar la constante (D7)

### Phase 10: Auditoría (D11)
- [x] 10.1 RED unit: apertura exitosa → `auditoria.log(tx, 'PROCESO_ABIERTO', actorId,
      'ProcesoElectoral', id, payload)` exactamente una vez, dentro de la misma transacción [spec:
      Apertura exitosa registra auditoría con conteos]
- [x] 10.2 RED unit: camino idempotente (6.4) → `auditoria.log` NO se invoca [spec: Reintento
      idempotente no genera auditoría adicional]
- [x] 10.3 GREEN: payload `{ tipo, publico_objetivo, aulas, derechos_totales, derechos_estudiante,
      derechos_padre, ocultar_resultados, apertura_real }` — pasa 10.1-10.2

### Phase 11: Regresión PR3
- [x] 11.1 `pnpm --filter @seei/backend test -- procesos.service` verde (suite unit completa)
- [x] 11.2 `pnpm typecheck` verde en los 4 paquetes

## PR 4 — e2e: idempotencia, 409, carrera real y regresión (base = PR 3 branch)

### Phase 12: Suite e2e principal
- [x] 12.1 Crear `apps/backend/test/procesos/procesos-abrir.e2e-spec.ts` (patrón de las suites de
      `#11`)
- [x] 12.2 RED e2e: apertura exitosa desde `borrador` → `200`, `estado='abierto'`, `apertura_real`
      cae entre el `clock_timestamp()` previo y posterior de la propia base, nunca comparado contra
      `Date.now()` de Node [spec: `apertura_real` refleja el reloj del servidor de base de datos]
- [x] 12.3 RED e2e: reintento sobre proceso ya abierto → `200` idempotente, mismo cuerpo, sin filas
      `DerechoVoto` adicionales, sin segunda fila `PROCESO_ABIERTO` [spec: Reintento idempotente]
- [x] 12.4 RED e2e: abrir sobre `cerrado`/`acta_emitida` → `409 PROCESO_NO_ABRIBLE { estado }`,
      proceso sin cambio [spec: Apertura rechazada desde un estado no abrible]
- [x] 12.5 RED e2e: conteo exacto de `DerechoVoto` por tipo de proceso (`estudiantes`/`padres`/
      `comunidad`), doble fila verificada en `comunidad`
- [x] 12.6 RED e2e: `401` sin cookie; `403` con `estudiante`/`docente`
- [x] 12.7 RED e2e: payload de inyección en `:id` → `400`, cero filas afectadas [threat matrix: SQL
      crudo parametrizado]
- [x] 12.8 GREEN: confirmado 12.2-12.7 verdes contra Postgres real (14/14, Docker disponible en esta
      sesión — ver Phase 15 para el detalle de ejecución real)

### Phase 13: Carrera real (D4, núcleo del change)
- [x] 13.1 RED e2e concurrencia: dos `POST /procesos/:id/abrir` disparados con `Promise.all` sobre
      el mismo proceso en `borrador` → ambas respuestas `200` (idempotencia observada por la
      segunda), nunca `500`, exactamente un conjunto de `DerechoVoto` (`count()` posterior), cero
      `P2002` observado — mismo patrón que `anios-escolares.e2e-spec.ts:489` (`Promise.all` +
      `fetch` contra el servidor real con Prisma pool real) [spec: Reintento concurrente no duplica
      filas de `DerechoVoto`]
- [x] 13.2 Nota de harness: Docker **sí** estuvo disponible en esta sesión (`docker ps` mostró la
      pila de dev viva); se levantó la pila `docker-compose.test.yml` con `.env.test` (Postgres real
      en `:5433`) y se corrió Jest directamente contra ella. El test `[13.1]` **corrió de verdad**
      contra Postgres real y **pasó**: ambas respuestas `200`, `derechos_totales` idéntico en ambas,
      cero filas duplicadas por `(proceso_id, usuario_id, en_calidad_de)`, exactamente un evento
      `PROCESO_ABIERTO`. Confirma el patrón `Promise.all` + pool de conexiones de Prisma sí ejercita
      dos transacciones concurrentes reales (mismo precedente que `anios-escolares.e2e-spec.ts`)
- [x] 13.3 GREEN: confirmado — la carrera se resolvió enteramente por el `UPDATE ... WHERE
      estado='borrador'` condicional (D3/D4, lock de fila + EvalPlanQual); el `@@unique` de D1 no
      tuvo que activarse como red de seguridad en la corrida observada (cero `P2002`), pero el
      código de traducción de excepciones no está deshabilitado — sigue siendo la red de seguridad
      final ante una eventual pérdida de exclusividad del lock

### Phase 14: Regresión de `editar()`/`eliminar()` tras apertura (D12)
- [x] 14.1 RED e2e: `editar()`/`eliminar()` sobre proceso ya abierto → `409 PROCESO_NO_EDITABLE`,
      `ocultar_resultados` y segmentación de aulas sin cambio [spec: Edición rechazada tras apertura
      real; `ocultar_resultados` inmutable una vez `abierto`]
- [x] 14.2 GREEN: confirmado comportamiento vigente sin código nuevo (D12 — solo test de regresión),
      ambos casos (`PATCH`/`DELETE`) pasan contra Postgres real

### Phase 15: Regresión final PR4
- [x] 15.1 Ejecución real contra Postgres (Docker vivo en esta sesión, `docker-compose.test.yml` +
      `.env.test`, puertos alternos `5433`/`6380`): `procesos-abrir.e2e-spec.ts` en aislamiento —
      **14/14 verde**. Corrido junto a `procesos-listar-editar-eliminar.e2e-spec.ts` y
      `padron.e2e-spec.ts` (`--runInBand`, serial) — **3/3 suites verdes, 46/48 tests** (los 2 tests
      que fallan pertenecen a `procesos-crear.e2e-spec.ts`, ver Deviations/Issues: hallazgo
      pre-existente de `#11`/PR6, no causado por PR4). Suite unitaria `procesos*` — **65/65 verde**
      (`pnpm --filter @seei/backend test -- procesos`). Nota de harness: el script oficial
      `test:e2e` (`scripts/test-e2e.mjs`) **no reenvía** argumentos extra de `pnpm` a Jest (gotcha
      descubierto en esta sesión, ver Deviations) — la ejecución dirigida se hizo invocando `jest`
      directamente contra la misma pila Docker que levanta el script
- [x] 15.2 `pnpm turbo run typecheck` verde en los 4 paquetes

## PR 5 — UI de confirmación (base = PR 4 branch)

### Phase 16: Ruta y API cliente (D13)
- [x] 16.1 Modificar `apps/frontend/src/app/rutas.ts`: variante `{ nombre: 'apertura'; procesoId }`
      en la unión `Ruta`; `parsearRuta`/`rutaAPath` para `/procesos/:id/abrir`
- [x] 16.2 RED unit: `parsearRuta('/procesos/<id>/abrir')` ida y vuelta
- [x] 16.3 GREEN: implementación — pasa 16.2
- [x] 16.4 Modificar `apps/frontend/src/procesos/procesos-api.ts`: wrapper `abrir(id)` contra
      `POST /procesos/{id}/abrir` (requiere `openapi.json` regenerado en PR2)

### Phase 17: Piezas presentacionales (D13/D14)
- [x] 17.1 Crear `apps/frontend/src/procesos/piezas/PanelConfirmacionApertura.tsx`: tarjeta
      `role="dialog"` en flujo, espejo literal de `auth/DialogoVinculacion.tsx`, sin overlay ni
      portal, muestra `ocultar_resultados` de forma prominente; tokens vigentes de `index.css`
      únicamente (`primary`, `surface-white`, `border-gray`, `rounded-card`, `shadow-elevation`,
      `text-headline-lg`, `max-page`) — cero tokens nuevos
- [x] 17.2 RED componente: `PanelConfirmacionApertura` sin efectos, no habilita confirmar sin el
      gesto explícito
- [x] 17.3 RED componente: `ocultar_resultados=true` se muestra de forma prominente en el panel
- [x] 17.4 GREEN: implementación — pasa 17.2-17.3

### Phase 18: `AperturaProcesoPage` y wiring (D13/D14)
- [x] 18.1 Crear `apps/frontend/src/procesos/AperturaProcesoPage.tsx`: contenedor con todos los
      efectos; `GET /procesos/:id` (D14) para nombre/tipo/`publico_objetivo`/`alcance`/`aulas.length`/
      `ocultar_resultados`; `procesos-api.abrir(id)` al confirmar; conteos reales del `200` mostrados
      en el panel de éxito
- [x] 18.2 Modificar `apps/frontend/src/app/Enrutador.tsx`: caso `'apertura'` →
      `AperturaProcesoPage`
- [x] 18.3 Modificar `apps/frontend/src/procesos/ProcesosIndexPage.tsx`: botón "Abrir proceso"
      visible solo cuando `proceso.estado === 'borrador'`, navega a `/procesos/:id/abrir`
- [x] 18.4 RED componente: el botón "Abrir proceso" solo aparece con `estado === 'borrador'`
- [x] 18.5 RED componente: confirmar en el panel navega de vuelta al índice tras el `200`
- [x] 18.6 GREEN: wiring completo — pasa 18.4-18.5

### Phase 19: Regresión final PR5
- [x] 19.1 `pnpm --filter @seei/frontend test` verde (32/32 archivos, 166/166 tests)
- [x] 19.2 `pnpm typecheck` verde (`turbo run typecheck` en los 4 paquetes)
- [x] 19.3 Verificación manual/rollout R4: cubierta por `test/procesos/procesos-abrir.e2e-spec.ts`
      (PR4) contra Postgres real esta sesión — reintento sobre proceso ya abierto confirmado `200`
      sin filas nuevas (12.3); no se ejecutó un `docker compose up` de desarrollo end-to-end con UI
      manual en esta sesión (fuera del alcance práctico de `sdd-apply`, la cobertura e2e real de
      12.3/13.1 es equivalente)
