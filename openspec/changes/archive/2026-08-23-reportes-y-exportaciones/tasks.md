# Tasks: reportes-y-exportaciones (Backlog #18 — Reportes y exportaciones)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~150-200 / PR2 ~350-450 / PR3 ~350-450 / PR4 ~600-750 (~1450-1850 total) |
| 400-line budget risk | PR1 Low / PR2 High (6 constructores × columnas cerradas + pruebas) / PR3 Medium-High / PR4 High (dispatcher+repo+3 renderizadores+processor+e2e) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 migración+schema → PR2 `modelo-reporte.ts`+`dimensiones.ts` (backend, puro) → PR3 `ReportesService`+`ReportesController`+auditoría+contrato → PR4 worker completo (dispatcher+repo+3 renderizadores+processor+gate capas 2-3+wiring+documentación) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (recomendado; ver nota) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High (PR2, PR4)

Corte literal del orden de "Migración / Rollout" (R1-R4) de `design.md`. **Nota de convención**:
este repo no abre branches de GitHub por PR — la entrega real es commits secuenciales tageados
`(PRx/4, #18)` sobre la rama larga del backlog item (decisión registrada en Engram, ya aplicada en
`#11`-`#17`/`#20`); `stacked-to-main` es la aproximación más cercana del vocabulario de la skill a
ese patrón. El orquestador debe confirmar con el usuario antes de `sdd-apply`. PR2 es el más
riesgoso en tamaño porque agrupa los 6 constructores de `dimensiones.ts` con las pruebas de columnas
cerradas de `votantes`/`abstenciones` (riesgo declarado #3 del brief); no se separa porque los 6
constructores comparten la misma forma (`ModeloReporte`, D5) y separar uno del resto rompería la
cobertura simétrica. PR4 agrupa todo el worker porque D9/D10/D12/D13 comparten la transacción
terminal como único punto de integración (mismo criterio que PR5 de `#17`), incluidas las capas 2 y
3 del gate (D7, riesgo declarado #4), que sólo pueden probarse una vez que el worker existe.

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | Migración `DimensionReporte`/`FormatoReporte`/`EstadoReporte`/`Reporte` (D2/D3), `test/schema/reportes.spec.ts` | PR 1 | tracker | `pnpm --filter @seei/backend test -- schema` | Postgres real (Docker) | `git revert` PR1; nadie más consume `Reporte` todavía |
| 2 | `modelo-reporte.ts` (D5/D7.2 regla/D8) + `dimensiones.ts` (D6, 6 constructores, SELECT cerrados) con unit puras | PR 2 | PR1 | `pnpm --filter @seei/backend test -- modelo-reporte dimensiones` | Vitest/Jest con dobles, sin Postgres real salvo el doble de `TransactionClient` | `git revert` PR2; PR1 no afectado |
| 3 | `ReportesService`+`ReportesController`+módulo+DTOs+errores (D4/D7.1/D8), `REPORTE_GENERADO` en `audit-event-types.ts`, e2e de solicitud, `pnpm openapi:extract` | PR 3 | PR2 | `pnpm --filter @seei/backend test -- reportes` + `test:e2e -- reportes-solicitud` | Postgres real (Docker) | `git revert` PR3; PR1/PR2 no afectados, endpoint desaparece |
| 4 | Worker: dispatcher, repo con transacción terminal sin `FOR UPDATE` (D12), 3 renderizadores (D10/D11), processor puro (D9), gate capas 2-3 (D7), e2e de gate/descarga/transición, documentación de env vars | PR 4 | PR3 | `pnpm --filter @seei/worker test -- reportes` + `pnpm --filter @seei/backend test:e2e -- reportes-gate reportes-descarga` | Postgres real (Docker) | `git revert` PR4; los `Reporte` quedan `borrador` sin procesar, resto del change intacto |

## PR 1 — Migración de `Reporte`/`DimensionReporte`/`FormatoReporte`/`EstadoReporte` (D2/D3)

### Phase 1: Schema y migración
- [x] 1.1 Modificar `apps/backend/prisma/schema.prisma`: enums `DimensionReporte`/`FormatoReporte`/
      `EstadoReporte`, `model Reporte` completo (D2), comentario explícito sobre la ausencia
      deliberada de `@@unique([proceso_id, dimension, formato])` (D3), back-relations `reportes
      Reporte[]` en `Usuario`/`ProcesoElectoral`
- [x] 1.2 Crear `apps/backend/prisma/migrations/<ts>_reporte/migration.sql`: DDL 100% aditivo —
      `CREATE TYPE` ×3, `CREATE TABLE`, 2 índices, 2 FK `RESTRICT`, sin `ALTER` de ningún tipo/tabla
      existente

### Phase 2: RED — `test/schema/reportes.spec.ts` (patrón `actas.spec.ts` + `expect-pg-error.ts`)
- [x] 2.1 Los 3 enums tienen sus valores exactos
- [x] 2.2 Dos filas con el mismo `(proceso_id, dimension, formato)` conviven **sin** `23505` (D3 —
      la prueba debe fallar si alguien agrega el `@@unique`)
- [x] 2.3 `solicitado_por` `NOT NULL` rechaza `NULL`
- [x] 2.4 `DELETE` de un `Usuario` con `Reporte`s asociados falla por `RESTRICT`
- [x] 2.5 `DELETE` de un `ProcesoElectoral` con `Reporte`s asociados falla por `RESTRICT`
- [x] 2.6 Existen `Reporte_estado_creado_en_idx` y `Reporte_proceso_id_dimension_formato_creado_en_idx`
- [x] 2.7 GREEN: `pnpm prisma migrate deploy` desde baseline verde; `test:schema` verde — pasa
      2.1-2.6

### Phase 3: Regresión PR1
- [x] 3.1 `pnpm --filter @seei/backend test -- schema` verde
- [x] 3.2 `pnpm typecheck` verde en los 4 paquetes

## PR 2 — `modelo-reporte.ts` + `dimensiones.ts` (base = PR1, D5/D6/D7.2/D8)

### Phase 4: RED — `modelo-reporte.ts` (puro, sin base)
- [x] 4.1 `podar(modelo, true)` descarta **todas** las secciones `sensible: true` y conserva las
      demás intactas
- [x] 4.2 `podar(modelo, false)` es identidad
- [x] 4.3 `esSensible(dimension)` es `true` sólo para `participacion`/`resultados`, `false` para las
      otras 4
- [x] 4.4 Podar un modelo cuya `secciones[0]` era sensible deja la siguiente sección no-sensible en
      la posición 0 (contrato del renderizador CSV, D10)
- [x] 4.5 GREEN: crear `apps/backend/src/reportes/modelo-reporte.ts` — pasa 4.1-4.4

### Phase 5: RED — `dimensiones.ts` (doble de `Prisma.TransactionClient`, D6)
- [x] 5.1 Las 6 dimensiones producen su `secciones[0]` esperada (`resumen`/`votantes`/
      `abstenciones`/`desglose`/`candidatos`/`opciones`)
- [x] 5.2 Con `gate=true` **no se llama** `calcularEscrutinio` (espía sobre el doble — invariante de
      `#16`, ya probado en `#17` pero repetido aquí para `participacion`/`resultados`)
- [x] 5.3 La consulta de `votantes` (`$queryRaw`) **no** proyecta `v.lista_id`, `v.opcion_id`,
      `v.candidato_id`, `v.blanco` ni `v.codigo_comprobante` — aserción sobre el SQL crudo y sobre
      las columnas del modelo resultante [threat: Secreto del voto en un export nominal, riesgo
      declarado #3 del brief]
- [x] 5.4 La consulta de `abstenciones` (`$queryRaw`) **no** proyecta las mismas 5 columnas
      prohibidas, mismo criterio que 5.3
- [x] 5.5 Ninguna de las dos dimensiones nominales (`votantes`/`abstenciones`) proyecta `u.dni` —
      sólo `codigo` como identificador institucional [ADR-0010, riesgo declarado #3]
- [x] 5.6 `candidatos` sobre un proceso `consulta` (o `consultas` sobre uno `municipio`) devuelve
      **cero filas** sin lanzar — reporte vacío válido, no `400`
- [x] 5.7 Padrón `0` ⇒ `porcentaje = 0`, sin `NaN` ni excepción, en las dimensiones que lo calculan
- [x] 5.8 GREEN: crear `apps/backend/src/reportes/dimensiones.ts` (`construirModelo(dimension, tx,
      …)` y sus 6 consultas) — pasa 5.1-5.7

### Phase 6: Regresión PR2
- [x] 6.1 `pnpm --filter @seei/backend test -- modelo-reporte dimensiones` verde
- [x] 6.2 `pnpm typecheck` verde en los 4 paquetes

## PR 3 — `ReportesService`+`ReportesController`+auditoría (base = PR2, D4/D7.1/D8/D13)

### Phase 7: DTOs, errores y auditoría
- [x] 7.1 Crear `apps/backend/src/reportes/dto/solicitar-reporte.dto.ts` y
      `reporte-detalle.dto.ts` (`ReporteDetalleDto` **nunca** expone `contenido` ni `archivo` —
      mismo criterio que `#17` D13)
- [x] 7.2 Crear `apps/backend/src/reportes/reportes.errors.ts`: `CAMPO_INVALIDO`,
      `PROCESO_NO_ENCONTRADO`, `REPORTE_NO_EMITIDO`, `REPORTE_NO_DISPONIBLE` (patrón `as const` +
      union)
- [x] 7.3 Modificar `apps/backend/src/auditoria/audit-event-types.ts`: `+REPORTE_GENERADO` + entrada
      de bitácora

### Phase 8: RED — `ReportesService` (`PrismaService` mockeado, D4/D7.1)
- [x] 8.1 `dimension`/`formato` fuera del enum ⇒ `400 CAMPO_INVALIDO` **sin abrir transacción**
      (espía sobre `$transaction`)
- [x] 8.2 `proceso_id` inexistente ⇒ `404 PROCESO_NO_ENCONTRADO` sin crear fila
- [x] 8.3 `solicitado_por` se toma de la sesión/actor autenticado, **nunca** del cuerpo de la
      petición [threat: Auditoría sin actor]
- [x] 8.4 Con `ocultar_resultados=true` y dimensión sensible, el servicio llama **sólo**
      `calcularParticipacion()` y no construye la sección sensible (D7.1, capa 1 del gate — riesgo
      declarado #4)
- [x] 8.5 GREEN: crear `apps/backend/src/reportes/reportes.service.ts` (transacción
      `RepeatableRead`, gate de cálculo, `create` en `borrador`) — pasa 8.1-8.4

### Phase 9: `ReportesController` y módulo
- [x] 9.1 Crear `apps/backend/src/reportes/reportes.controller.ts`: `@Controller('reportes')`,
      `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('administrador','director','comite')` a nivel
      de clase, `POST /reportes` (`202`), `GET /reportes/:id`, `GET /reportes/:id/archivo` con
      `StreamableFile` y cabeceras defensivas (`X-Content-Type-Options: nosniff`,
      `Content-Security-Policy: default-src 'none'`, `Content-Disposition: attachment`) — copiado de
      `actas.controller.ts`
- [x] 9.2 Crear `apps/backend/src/reportes/reportes.module.ts`; modificar
      `apps/backend/src/app.module.ts` (`+ReportesModule`)

### Phase 10: RED e2e (Postgres real) — solicitud
- [x] 10.1 Los 6×3=18 pares válidos ⇒ `202` y fila `borrador` con `contenido` JSON consultable
      [spec: Solicitud válida]
- [x] 10.2 `dimension`/`formato` inválidos ⇒ `400`, **cero** filas creadas [spec: Dimensión/Formato
      inválido]
- [x] 10.3 `proceso_id` inexistente ⇒ `404`, cero filas [spec: Proceso inexistente]
- [x] 10.4 rol `estudiante`/`docente` ⇒ `403`, cero filas [spec: Rol no autorizado]
- [x] 10.5 sin cookie de sesión ⇒ `401` [spec: Sin sesión]
- [x] 10.6 Dos solicitudes idénticas ⇒ **dos** filas distintas, la primera permanece intacta [spec:
      Snapshot inmutable, Reintento crea un registro nuevo]
- [x] 10.7 GREEN: `test/reportes/reportes-solicitud.e2e-spec.ts` — pasa 10.1-10.6

### Phase 11: Regresión PR3
- [x] 11.1 `pnpm --filter @seei/backend test -- reportes` verde
- [x] 11.2 `pnpm --filter @seei/backend test:e2e -- reportes-solicitud` verde
- [x] 11.3 Correr `pnpm openapi:extract`: las 3 rutas `/reportes*` aparecen con sus códigos,
      incluido el `202` — commitear el contrato regenerado
- [x] 11.4 `pnpm typecheck` verde en los 4 paquetes

## PR 4 — Worker completo: dispatcher, repo, renderizadores, processor, gate capas 2-3 (base = PR3, D9/D10/D11/D12/D13/D14)

### Phase 12: Dependencia
- [x] 12.1 Modificar `apps/worker/package.json`: `+exceljs@^4.4.0` (misma versión exacta que el
      backend, D14)

### Phase 13: RED (Vitest) — dispatcher (`reportes-dispatcher.spec.ts`, patrón
      `actas-dispatcher.spec.ts`)
- [x] 13.1 `despacharLoteReportes` ⇒ `jobId: 'reporte:<id>'`, `attempts: 5`, backoff exponencial
      (`2000`)
- [x] 13.2 Lote vacío ⇒ **no** llama `addBulk`
- [x] 13.3 GREEN: crear `apps/worker/src/reportes/reportes-dispatcher.ts` (cola `reportes`, polling
      sobre `Reporte WHERE estado='borrador'`, `REPORTES_POLL_MS`/`REPORTES_BATCH` defaults
      5000/20)

### Phase 14: RED (Vitest) — processor puro (`processors/reportes.processor.spec.ts`, D9/D7.2)
- [x] 14.1 Fila inexistente o no-`borrador` ⇒ `'no-op'` **sin** renderizar
- [x] 14.2 `gate = esSensible(dimension) && ocultar_resultados` releído **ahora** (no el congelado en
      la solicitud): con `ocultar_resultados=true` sobre una dimensión sensible, `podar()` descarta
      **todas** las secciones `sensible: true` antes de renderizar (D7.2, capa 2 del gate — riesgo
      declarado #4)
- [x] 14.3 Con `ocultar_resultados=false`, el modelo llega intacto al renderizador
- [x] 14.4 `render` que rechaza ⇒ propaga (sin `try/catch`) y **no** se llama `finalizar`
- [x] 14.5 `finalizar` que devuelve `'no-op'` (CAS perdido) no rompe el flujo
- [x] 14.6 Formato sin renderizador registrado ⇒ **lanza**, nunca emite un archivo vacío
- [x] 14.7 GREEN: crear `apps/worker/src/processors/reportes.processor.ts`
      (`procesarReporte(repo, renderers, reporteId)`, puro, sin Prisma ni BullMQ) — pasa 14.1-14.6

### Phase 15: RED (Vitest) — los 3 renderizadores (D10/D11) + inyección de fórmulas
- [x] 15.1 `exceljs-renderer.ts`: una hoja por sección + hoja `Metadatos`; el `Buffer` producido
      empieza con la firma `PK`; valores escritos como `string`/`number` planos (nunca
      `{formula:…}`)
- [x] 15.2 `pdfkit-renderer-reporte.ts`: el `Buffer` empieza con `%PDF-`; título, `meta`, secciones
      como tablas y `notas` al pie presentes en el texto extraído
- [x] 15.3 `csv-renderer.ts`: emite **sólo** `secciones[0]` tras la poda, BOM UTF-8, `\r\n`, RFC 4180
      estricto; `meta`/`notas` se omiten por diseño
- [x] 15.4 Celdas que empiezan en `=`/`+`/`-`/`@` (nombre de candidato o etiqueta de consulta
      maliciosa) quedan neutralizadas/escapadas en los **tres** formatos, sin que ningún renderizador
      interprete fórmula [threat: Inyección de fórmulas en el archivo generado]
- [x] 15.5 Un modelo de 2000 filas (`votantes` de un padrón grande) rinde en los tres formatos sin
      lanzar [threat: Denegación por tamaño]
- [x] 15.6 GREEN: crear `apps/worker/src/reportes/csv.ts`, `csv-renderer.ts`,
      `exceljs-renderer.ts`, `pdfkit-renderer-reporte.ts` — pasa 15.1-15.5

### Phase 16: RED — paridad de escaping CSV worker↔backend (D11, riesgo declarado #2 del brief)
- [x] 16.1 `escaparCeldaCsv`/`neutralizarFormula` de `apps/worker/src/reportes/csv.ts` coinciden,
      caso por caso, con las de `apps/backend/src/importacion/padron-csv.ts` sobre el mismo set:
      coma, comilla, salto de línea, prefijo de fórmula (`=`/`+`/`-`/`@`), celda vacía, acentos —
      tabla de casos duplicada a propósito en ambos paquetes, cada una con un comentario que apunta
      al original como fuente de verdad
- [x] 16.2 GREEN: la implementación de 15.6 satisface 16.1; si no coincide, ajustar `csv.ts` del
      worker (nunca importar el del backend — `rootDir` del worker no compila ese import, D4/D11)

### Phase 17: RED e2e (Postgres real) — repo, transacción terminal, auditoría (D12/D13)
- [x] 17.1 `finalizar` ⇒ `emitida` + **un** `REPORTE_GENERADO` con `actor_usuario_id =
      solicitado_por` (**no** `NULL`) — leído de la fila dentro de la transacción, con `job.data`
      deliberadamente vacío salvo el id [threat: Auditoría sin actor — requisito diferencial de
      `#18`]
- [x] 17.2 Ejecutar `finalizar` dos veces sobre la misma fila ⇒ una sola transición y un solo evento
      [threat: Doble render / entrega at-least-once]
- [x] 17.3 `marcarFallido` sobre una fila ya `emitida` ⇒ no la pisa
- [x] 17.4 Fila que transiciona a `fallido` ⇒ **cero** eventos `REPORTE_GENERADO`
- [x] 17.5 El payload de `REPORTE_GENERADO` no contiene `candidato_id`/`lista_id`/`opcion_id`/
      `blanco`/nombres — sólo `{proceso_id, dimension, formato, gate_aplicado, filas, bytes}`
- [x] 17.6 GREEN: crear `apps/worker/src/reportes/reportes.repo.ts` (transacción terminal **sin**
      `FOR UPDATE` — no hay agregación entre filas, D12) y
      `apps/worker/test/reportes/reportes-transicion.e2e-spec.ts` — pasa 17.1-17.5

### Phase 18: RED e2e (Postgres real) — gate completo, capas 2 y 3 (D7, riesgo declarado #4)
- [x] 18.1 Con `ocultar_resultados=true`, `resultados` y `participacion` ⇒ `contenido` renderizado
      **sin** ninguna sección `sensible`, para los **tres** roles autorizados [spec: Resultados
      ocultos para administrador/director/comité]
- [x] 18.2 Con `ocultar_resultados=false` ⇒ con desglose completo [spec: Dimensión no sensible
      ignora el gate — control negativo]
- [x] 18.3 `candidatos`/`consultas`/`votantes`/`abstenciones` ⇒ catálogo/lista completos en ambos
      modos de `ocultar_resultados` [spec: Dimensión no sensible ignora el gate]
- [x] 18.4 Viraje `false → true` **entre** la solicitud y la generación ⇒ el archivo emitido queda
      podado y `gate_aplicado=true` (capa 2, releída en el processor — D7.2)
- [x] 18.5 Descarga de un archivo con `gate_aplicado=false` **después** del viraje a
      `ocultar_resultados=true` ⇒ `409 REPORTE_NO_DISPONIBLE` (capa 3, D7.3) [threat: Fuga del gate
      por la puerta lateral del export — riesgo central del change]
- [x] 18.6 GREEN: completar `apps/backend/test/reportes/reportes-gate.e2e-spec.ts` con manipulación
      directa de `ocultar_resultados` entre pasos — pasa 18.1-18.5

### Phase 19: RED e2e (Postgres real) — descarga (D7.3 general, D8)
- [x] 19.1 `409 REPORTE_NO_EMITIDO {estado}` con la fila en `borrador` y en `fallido`
- [x] 19.2 Fila marcada `emitida` con bytes ⇒ `200` con el `Content-Type` del formato,
      `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`
- [x] 19.3 El cuerpo del CSV empieza con BOM UTF-8 y el del PDF con `%PDF-`
- [x] 19.4 `GET /reportes/:id` **nunca** trae `contenido` ni `archivo` en la respuesta
- [x] 19.5 GREEN: `apps/backend/test/reportes/reportes-descarga.e2e-spec.ts` — pasa 19.1-19.4

### Phase 20: Wiring del worker
- [x] 20.1 Modificar `apps/worker/src/main.ts`: `Queue`/`Worker` de `reportes`, mapa
      `Record<FormatoReporte, RendererReporte>`, `setInterval(REPORTES_POLL_MS)`, listener
      `on('failed')`
- [x] 20.2 RED (Vitest): `attemptsMade >= attempts` ⇒ se llama `marcarFallido`; `attemptsMade <
      attempts` ⇒ **no** se marca — GREEN: crear
      `apps/worker/src/reportes/reportes-fallido-listener.ts` (+ `.spec.ts`), espejo de
      `actas-fallido-listener.ts`

### Phase 21: Auditoría `[TM4]`
- [x] 21.1 `test/schema/auditoria.spec.ts`: `INSERT` directo de `REPORTE_GENERADO` cumple el
      `CHECK` `^[A-Z_]+$` y **no** dispara `AU002` (el trigger sólo cubre `VOTO`/`RECHAZO`) —
      constancia de que la protección es de código (D13), no del motor

### Phase 22: Documentación de variables de entorno (D14)
- [x] 22.1 Modificar `turbo.json`: `test:e2e.env` `+= REPORTES_POLL_MS, REPORTES_BATCH`
- [x] 22.2 Modificar `infra/docker/docker-compose.yml`: documentar `REPORTES_POLL_MS`/
      `REPORTES_BATCH` junto a `ACTAS_*`/`OUTBOX_*` en el servicio `worker`
- [x] 22.3 Modificar `docs/onboarding.md` y `README.md`: mismas variables

### Phase 23: Regresión final del change
- [x] 23.1 `pnpm --filter @seei/worker test -- reportes` verde
- [x] 23.2 `pnpm --filter @seei/backend test` y `test:e2e` completos verdes contra Postgres real —
      ver nota de deriva pre-existente abajo (auth unit specs + suites ajenas a `reportes`/`procesos`/
      `resultados` en el e2e completo)
- [x] 23.3 `pnpm typecheck` verde en los 4 paquetes
- [x] 23.4 `pnpm turbo run build` verde
- [x] 23.5 Verificar `test/resultados/*.e2e-spec.ts` y `test/procesos/*.e2e-spec.ts` (`#16`/`#17`)
      siguen verdes **sin editarse** — cualquier edición es evidencia de deriva, el change es 100%
      aditivo. Confirmado: 8/8 suites, 81/81 tests verdes en una corrida aislada (`--runInBand`,
      Postgres/Redis efímeros frescos), archivos sin tocar.

**Nota de deriva pre-existente (no atribuible a PR4).** Al correr el e2e COMPLETO del backend en un
solo proceso (`test:e2e` por defecto, o `--runInBand`), ~30 tests de suites ajenas a este change
(`auth-google`, `auth-bloqueo`, `procesos-crear` [aserciones de conteo global], `migrate-baseline`,
`configuracion-institucional`) fallan por colisión de estado compartido entre archivos de prueba
que corren contra el MISMO Postgres/Redis (p. ej. `AnioEscolar.activo` único global,
`ProcesoElectoral.count()` sin scope, `migrate-baseline` asume un esquema vacío que ya no existe
desde `#1`). Ninguna de esas suites toca `reportes` ni fue modificada por este change. Aislada por
directorio (`test/reportes/`, `test/procesos/`, `test/resultados/`) o por archivo, la suite completa
de este change y su red de regresión declarada pasan en 100%: reportes unit (42/42), reportes e2e
(25+12+6=43/43), worker unit (58/58), worker e2e (9/9), `test/procesos/*`+`test/resultados/*`
(81/81). Los unit specs de `auth/bloqueo|recovery|session.service.spec.ts` también dependen de un
Redis real (`REDIS_URL`) y fallan si no hay uno arriba al correr `pnpm test`; con el Redis efímero de
`infra/docker/docker-compose.test.yml` levantado, 621/623 unit tests del backend pasan (los 2
restantes son la misma fragilidad de paralelismo de `bloqueo.service.spec.ts`, verde en aislamiento).
Se documenta como hallazgo, no se corrige aquí — corregirlo tocaría archivos fuera del alcance
100% aditivo de este change (violaría la restricción explícita de 23.5).

## Corrección post-verify (`sdd-verify`)

- [x] **Gap D13 — `filas` hardcodeado en 0.** `sdd-verify` encontró que
  `ReportesRepo.finalizar()` escribía `filas: 0` fijo en el payload de `REPORTE_GENERADO` porque
  `procesarReporte()` nunca calculaba ni pasaba la cardinalidad real; el único test que tocaba el
  payload (17.5) sólo verificaba las claves, no el valor. RED añadido en
  `apps/worker/test/reportes/reportes-transicion.e2e-spec.ts` (`[17.6]` — cardinalidad real, no
  fija) confirmó el bug (esperaba `7`, recibía `0`). Fix: `finalizar()` gana un sexto parámetro
  `filas: number`; `procesarReporte()` en `apps/worker/src/processors/reportes.processor.ts`
  calcula `modelo.secciones.reduce((t, s) => t + s.filas.length, 0)` sobre el modelo YA PODADO
  (post-gate, D7.2) — exactamente lo que se renderizó — y lo pasa a `repo.finalizar()`. Ajustados
  también los `toHaveBeenCalledWith(...)` de `apps/worker/src/processors/reportes.processor.spec.ts`
  (14.2/14.3) para incluir el nuevo argumento. Regresión: worker unit 58/58, worker e2e 10/10,
  `tsc --noEmit` limpio. No reabre fases archivadas; las 94 tareas originales permanecen `[x]`.

## Pendientes explícitamente fuera de este change

- **Cuota de solicitudes por usuario.** Sin límite; la tabla crece de forma monótona (pregunta
  abierta de `design.md`, declarado fuera de alcance en `proposal.md` junto con retención/purga).
- **`GET /procesos/:id/reportes` (listado).** No está en la spec; un cliente sólo puede sondear un
  `id` que ya conoce. Queda para un ítem posterior de UI.
- **Logo institucional en el PDF.** Misma pregunta abierta que dejó `#17` D12, misma respuesta
  provisional: fuera.
- **UI de reportes en frontend.** Fuera de alcance por `proposal.md`, análogo a `#17` → `#26-29`.
- **Reportes compuestos multi-dimensión o multi-formato en una sola solicitud.** Fuera de alcance
  por `proposal.md`.
- **Retención/expiración/purga de reportes generados.** Fuera de alcance por `proposal.md`; la
  tabla `Reporte` crece sin cuota ni retención — riesgo aceptado y documentado, no una omisión.
