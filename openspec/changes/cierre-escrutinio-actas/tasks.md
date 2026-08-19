# Tasks: cierre-escrutinio-actas (Backlog #17 — Cierre, escrutinio y actas)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1100-1400 (pronóstico de `design.md`, "Corte de PR sugerido") |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 migración → PR2 extracción de `escrutinio.ts` → PR3 `cerrar()`+DTO+actas-contenido+auditoría (indivisible) → PR4 endpoints de lectura/descarga+contrato → PR5 worker completo+documentación |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (recomendado; ver nota) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Corte literal de la sección "Corte de PR sugerido para `sdd-tasks`" de `design.md`. PR3 es
indivisible: la transacción de `cerrar()`, el DTO, `actas-contenido.ts` y la auditoría comparten un
único camino de código (mismo criterio que `#14` PR2). **Nota de convención**: este repo no abre
branches de GitHub por PR — la entrega real es commits secuenciales tageados `(PRx/5, #17)` sobre
una única rama larga del backlog item (decisión registrada en Engram #125, ya aplicada en `#11`-
`#16`); `stacked-to-main` es la aproximación más cercana del vocabulario de la skill a ese patrón.
El orquestador debe confirmar con el usuario antes de `sdd-apply`.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----|-----------------|-------------------|
| 1 | Migración `TipoActa`/`EstadoActa`/`Acta` (D2/D3), `test/schema/actas.spec.ts`, fix de `support-tables.spec.ts` [R7] | PR 1 | `pnpm --filter @seei/backend test -- schema` | Postgres real (Docker) | `git revert` PR1; nadie más consume `Acta` todavía |
| 2 | `procesos/escrutinio.ts` extraído (D5); `ResultadosService` reescrito encima sin cambio de contrato | PR 2 | `pnpm --filter @seei/backend test -- resultados escrutinio` | Postgres real | `git revert` PR2; PR1 no afectado, `#16` sigue verde |
| 3 | `cerrar()` (D4), `CerrarProcesoDto` (D9), `actas-contenido.ts` (D6/D7/D8), errores nuevos, auditoría (D14), unit+e2e+concurrencia | PR 3 | `pnpm --filter @seei/backend test -- procesos-cerrar` + `test:e2e -- procesos-cerrar` | Postgres real (incl. arnés `pg` crudo para la carrera) | `git revert` PR3; endpoint nuevo desaparece, PR1/PR2 intactos |
| 4 | `ActasController`/`ActasService` (D13), contrato regenerado | PR 4 | `pnpm --filter @seei/backend test:e2e -- actas-descarga` | Postgres real + `pnpm openapi:extract` sin Redis | `git revert` PR4; PR3 sigue creando actas sin endpoint de lectura |
| 5 | Worker: `pdfkit`, dispatcher, processor, repo con transacción terminal `FOR UPDATE` (D10/D11/D12), documentación de env vars | PR 5 | `pnpm --filter @seei/worker test -- actas` | Postgres real; `test/procesos/actas-transicion.e2e-spec.ts` con dos conexiones `pg` paralelas | `git revert` PR5; actas quedan `borrador` sin procesar, resto del change intacto |

## PR 1 — Migración de `Acta`/`TipoActa`/`EstadoActa` (D2/D3)

### Phase 1: Schema y migración
- [x] 1.1 Modificar `apps/backend/prisma/schema.prisma`: `TipoActa` +`escrutinio`/`oficial`,
      `EstadoActa` +`fallido`, `contenido Json @db.JsonB`, +`pdf Bytes?`/+`pdf_mime String?`,
      `@@unique([proceso_id, tipo])`, `@@index([estado, creado_en])`
- [x] 1.2 Crear `apps/backend/prisma/migrations/<ts>_acta_escrutinio_pdf/migration.sql`: DDL puro en
      el orden exacto de D2 (2×`ADD VALUE` TipoActa, `ADD VALUE` EstadoActa, `ALTER COLUMN
      contenido TYPE JSONB USING contenido::jsonb`, +`pdf`/+`pdf_mime`, índice único, índice
      compuesto, `CHECK acta_tipo_no_deprecado_chk`), con el comentario del gotcha de `ADD VALUE`
      en el mismo archivo

### Phase 2: RED — `test/schema/actas.spec.ts` (patrón `outbox.spec.ts`+`expect-pg-error.ts`)
- [x] 2.1 `TipoActa` tiene los 5 valores; `EstadoActa` tiene los 3
- [x] 2.2 `INSERT` con `tipo='resultados'` ⇒ error del `CHECK`
- [x] 2.3 Segunda `Acta` con el mismo `(proceso_id, tipo)` ⇒ `23505` sobre `Acta_proceso_id_tipo_key`
- [x] 2.4 `contenido` acepta un objeto y se consulta con `contenido->'cuadre'->>'padron_total'`
- [x] 2.5 `contenido` inválido como JSON ⇒ error del motor
- [x] 2.6 Índice `Acta_estado_creado_en_idx` existe
- [x] 2.7 GREEN: `pnpm prisma migrate deploy` desde baseline verde; `test:schema` verde (pasa 2.1-2.6)

### Phase 3: Fix de regresión conocida [R7]
- [x] 3.1 Modificar `apps/backend/test/schema/support-tables.spec.ts`: reemplazar el literal
      `'contenido de prueba'` (no-JSON) por un objeto JSON válido — **en este mismo PR**, la
      migración rompe el test si no se corrige aquí

### Phase 4: Regresión PR1
- [x] 4.1 `pnpm --filter @seei/backend test -- schema` verde
- [x] 4.2 `pnpm typecheck` verde en los 4 paquetes

## PR 2 — Extracción de `escrutinio.ts` sin deriva (D5)

### Phase 5: RED — `procesos/escrutinio.spec.ts` (doble de `Prisma.TransactionClient`, sin Postgres)
- [x] 5.1 `catalogoDe(tipo)` correcto para las 4 dimensiones (`municipio`⇒`lista`,
      `representante_aula`/`padres`⇒`candidato`, `consulta`⇒`opcion`)
- [x] 5.2 Opciones/candidatos/listas con 0 votos están presentes en el desglose
- [x] 5.3 Candidato/lista en `estado='baja'` presente con `estado` **y** `baja_en`
- [x] 5.4 Orden `votos` desc, `etiqueta` asc como desempate
- [x] 5.5 `Σ desglose.votos + blancos === votos_emitidos`
- [x] 5.6 `calcularParticipacion` **no** ejecuta `groupBy` ni el `findMany` del catálogo (spy sobre
      el doble) [design.md D5 — el modo oculto de `#16` no debe calcular el desglose]
- [x] 5.7 GREEN: crear `apps/backend/src/procesos/escrutinio.ts` (`catalogoDe`,
      `calcularParticipacion`, `calcularEscrutinio`) — pasa 5.1-5.6

### Phase 6: Reescritura de `ResultadosService` sin cambio de contrato
- [x] 6.1 Modificar `apps/backend/src/procesos/resultados.service.ts`: delega en `escrutinio.ts`,
      mapeo explícito campo por campo al DTO (**sin** `spread`, `baja_en` nunca llega al DTO
      público)
- [x] 6.2 Verificar: `test/resultados/resultados.e2e-spec.ts`,
      `test/resultados/resultados-cache.e2e-spec.ts` y `resultados.service.spec.ts` (suite de `#16`)
      pasan **sin editar una línea** — cualquier edición es evidencia de deriva, no de refactor

### Phase 7: Regresión PR2
- [x] 7.1 `pnpm --filter @seei/backend test -- resultados escrutinio` verde
- [x] 7.2 `pnpm --filter @seei/backend test:e2e -- resultados` verde (sin editar los archivos)
- [x] 7.3 `pnpm typecheck` verde

## PR 3 — `cerrar()`, DTO, `actas-contenido.ts`, auditoría (base indivisible, D4/D6/D7/D8/D9/D14)

### Phase 8: DTOs y errores
- [ ] 8.1 Crear `apps/backend/src/procesos/dto/cerrar-proceso.dto.ts`
      (`{ confirmar: boolean; firmantes: {nombre, cargo}[] }`) y `cierre-respuesta.dto.ts`
- [ ] 8.2 Modificar `apps/backend/src/procesos/procesos.errors.ts`: `PROCESO_NO_CERRABLE`,
      `ACTA_NO_EMITIDA` (aditivo)

### Phase 9: RED — validación de `CerrarProcesoDto` (D9, antes de la transacción)
- [ ] 9.1 `confirmar !== true` ⇒ `400 CAMPO_INVALIDO {campo:'confirmar'}` **sin abrir transacción**
      (spy sobre `$transaction`)
- [ ] 9.2 `firmantes` vacío, >10 elementos, o algún `nombre`/`cargo` vacío tras `trim()` o >120
      caracteres ⇒ `400 CAMPO_INVALIDO {campo:'firmantes'}` [spec: Firmantes vacío]
- [ ] 9.3 GREEN: validación a mano en `ProcesosService.cerrar()` (sin `class-validator`, idioma de
      `AbrirProcesoDto`) — pasa 9.1-9.2

### Phase 10: RED — `actas-contenido.ts` puro (D6/D7/D8, sin base)
- [ ] 10.1 Empate con 2 y con 3 máximos ⇒ `empate:true` con los ids exactos [spec: Empate real]
- [ ] 10.2 `max === 0` ⇒ `empate:false`, `sin_votos:true` [spec: Sin votos no es empate]
- [ ] 10.3 `cuadra` verdadero en el caso feliz, falso con un desglose manipulado
- [ ] 10.4 `padron_total === 0` ⇒ `porcentaje_participacion 0`, sin `NaN` ni excepción
- [ ] 10.5 `nulos === 0` siempre, con la nota fija de ADR-0008
- [ ] 10.6 Las 4 actas comparten la raíz común (D6); `oficial` embebe las tres secciones sin
      recalcular nada
- [ ] 10.7 Los firmantes llegan `trim()`eados al snapshot
- [ ] 10.8 GREEN: crear `apps/backend/src/procesos/actas-contenido.ts` (`armarActas()`) — pasa
      10.1-10.7

### Phase 11: RED — `ProcesosService.cerrar()` (D4, `PrismaService`+`AuditoriaService` mockeados)
- [ ] 11.1 `P2034`/`40001` ⇒ relectura en transacción limpia ⇒ `200` no-op, sin propagar
- [ ] 11.2 Payload de `PROCESO_CERRADO` **sin** `candidato_id`/`lista_id`/`opcion_id`/`blanco`/
      `eleccion`/`empatados` [threat: Secreto del voto en auditoría]
- [ ] 11.3 GREEN: implementar `cerrar()` en `apps/backend/src/procesos/procesos.service.ts` —
      `prisma.$transaction(cb, {isolationLevel:'RepeatableRead'})`, `UPDATE … WHERE estado='abierto'
      RETURNING`, relectura (404/200 no-op/409), `calcularEscrutinio()`, `armarActas()`,
      `tx.acta.createMany(...)`, `auditoria.log('PROCESO_CERRADO', ...)`,
      `esConflictoDeSerializacion()` capturado fuera del callback — pasa 11.1-11.2
- [ ] 11.4 Modificar `apps/backend/src/procesos/procesos.controller.ts`: `POST /:id/cerrar`
      (`@HttpCode(200)`), idioma de `abrir()`
- [ ] 11.5 Modificar `apps/backend/src/auditoria/audit-event-types.ts`: `PROCESO_CERRADO`,
      `ACTA_GENERADA` + entrada de bitácora

### Phase 12: RED e2e — cierre (Postgres real, `test/procesos/procesos-cerrar.e2e-spec.ts`)
- [ ] 12.1 `abierto` ⇒ `200`, `estado='cerrado'`, `cierre_real` no nulo, **4** `Acta` en `borrador`
      con `contenido` JSON [spec: Cierre exitoso; Creación atómica de las 4 actas]
- [ ] 12.2 Segunda llamada ⇒ `200` idéntico, siguen 4 actas [spec: Doble cierre es idempotente]
- [ ] 12.3 `borrador` ⇒ `409 PROCESO_NO_CERRABLE`; UUID inexistente ⇒ `404`; rol `estudiante` ⇒ `403`
      [spec: Cierre de un proceso en borrador]
- [ ] 12.4 Proceso con 0 votos ⇒ `200`, abstención total, `0%`, sin error [spec: Proceso con cero
      votos emitidos]
- [ ] 12.5 Candidato/lista dado de baja aparece con `estado:'baja'` y `baja_en` en el acta de
      escrutinio [spec: Candidato/lista dado de baja]
- [ ] 12.6 Proceso con `ocultar_resultados=true` ⇒ acta de escrutinio con desglose completo, sin
      ocultarlo [spec: Escrutinio con resultados ocultos]
- [ ] 12.7 Reproducibilidad: `SELECT count(*) FROM "Voto"` coincide con `contenido->'cuadre'`
- [ ] 12.8 GREEN: completar `procesos-cerrar.e2e-spec.ts` — pasa 12.1-12.7

### Phase 13: RED e2e — concurrencia del cierre (`test/schema/helpers/pg-client.ts`+`fetch`)
- [ ] 13.1 `Promise.all` de dos `POST /cerrar` ⇒ exactamente **4** `Acta`, un solo
      `PROCESO_CERRADO`, ningún `5xx`
- [ ] 13.2 Arnés determinista con `pg` crudo: `BEGIN`+`UPDATE … estado='cerrado'` sin commit,
      disparar el endpoint, commitear el crudo ⇒ el endpoint responde `200` no-op (ejercita el
      `catch` de D4)
- [ ] 13.3 GREEN: añadir ambos casos a `procesos-cerrar.e2e-spec.ts`

### Phase 14: RED schema — auditoría `[TM4]`
- [ ] 14.1 `test/schema/auditoria.spec.ts`: `INSERT` directo de `PROCESO_CERRADO`/`ACTA_GENERADA`
      con `{"detalle":{"candidato_id":…}}` **no** dispara `AU002` (el trigger sólo cubre
      `VOTO`/`RECHAZO`); ambas claves cumplen el `CHECK` `^[A-Z_]+$`

### Phase 15: Regresión PR3
- [ ] 15.1 `pnpm --filter @seei/backend test -- procesos-cerrar actas-contenido` verde
- [ ] 15.2 `pnpm --filter @seei/backend test:e2e -- procesos-cerrar` verde (Postgres real)
- [ ] 15.3 `pnpm --filter @seei/backend test -- resultados` (regresión `#16`) verde sin editar
- [ ] 15.4 `pnpm typecheck` verde

## PR 4 — Endpoints de lectura/descarga y contrato (D13)

### Phase 16: `ActasController`/`ActasService`
- [ ] 16.1 Crear `apps/backend/src/procesos/dto/acta-resumen.dto.ts`
      (`{id, tipo, estado, creado_en, pdf_disponible}`, nunca bytes ni `contenido`)
- [ ] 16.2 RED e2e (`test/procesos/actas-descarga.e2e-spec.ts`): `403` con rol `estudiante` en
      listado y descarga, **incluso con `DerechoVoto`** en ese proceso [threat: Fuga del gate
      `ocultar_resultados` por la puerta lateral del acta]
- [ ] 16.3 RED e2e: `409 ACTA_NO_EMITIDA` con la acta en `borrador`
- [ ] 16.4 RED e2e: acta marcada `emitida` con `pdf` ⇒ `200`, `content-type: application/pdf`,
      `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, cuerpo que empieza en
      `%PDF-`
- [ ] 16.5 RED e2e: `:tipo` fuera del enum ⇒ `400`; proceso inexistente ⇒ `404`
- [ ] 16.6 GREEN: crear `apps/backend/src/procesos/actas.service.ts` y `actas.controller.ts`
      (`@Controller('procesos')`, `AuthGuard`+`RolesGuard`,
      `@Roles('administrador','director','comite')`, `GET /:id/actas`,
      `GET /:id/actas/:tipo/pdf` con `StreamableFile` y las cabeceras defensivas de
      `listas.controller.ts`) — pasa 16.2-16.5
- [ ] 16.7 Modificar `apps/backend/src/procesos/procesos.module.ts`: `+ActasController` (antes de
      `ProcesosController`), `+ActasService`, `cookie-parser` en `forRoutes`

### Phase 17: Contrato y regresión PR4
- [ ] 17.1 Correr `pnpm openapi:extract`: `packages/contracts/openapi.json` y
      `src/generated/api.d.ts` exponen las tres rutas nuevas con sus códigos; commitear el
      contrato regenerado
- [ ] 17.2 `pnpm --filter @seei/backend test:e2e -- actas-descarga` verde
- [ ] 17.3 `pnpm typecheck` verde

## PR 5 — Worker: dispatcher, processor, render, transición terminal (D10/D11/D12/D15)

### Phase 18: Dependencia
- [ ] 18.1 Modificar `apps/worker/package.json`: `+pdfkit@^0.15`, `+@types/pdfkit` (dev) — verificar
      al instalar que la línea `0.15.x` y `@types/pdfkit` son compatibles

### Phase 19: RED (Vitest) — dispatcher (`actas-dispatcher.spec.ts`, patrón `outbox-dispatcher.spec.ts`)
- [ ] 19.1 `despacharLoteActas` ⇒ `jobId:'acta:<id>'`, `attempts:5`, `backoff` exponencial
- [ ] 19.2 Lote vacío ⇒ **no** llama `addBulk`
- [ ] 19.3 GREEN: crear `apps/worker/src/actas/actas-dispatcher.ts` (cola `actas`, polling sobre
      `Acta WHERE estado='borrador'`, `ACTAS_POLL_MS`/`ACTAS_BATCH` defaults 5000/20)

### Phase 20: RED (Vitest) — processor puro (`processors/actas.processor.spec.ts`)
- [ ] 20.1 Acta inexistente / no-`borrador` ⇒ `'no-op'` **sin** renderizar
- [ ] 20.2 `render` que rechaza ⇒ propaga (sin `try/catch`) y **no** se llama `finalizar`
- [ ] 20.3 `finalizar` que devuelve `'no-op'` (CAS perdido) no rompe el flujo
- [ ] 20.4 GREEN: crear `apps/worker/src/processors/actas.processor.ts` (`procesarActa()` sobre los
      puertos `ActasRepo`/`RendererActa`, sin Prisma ni BullMQ)

### Phase 21: RED (Vitest) — `pdfkit-renderer.ts` (D12)
- [ ] 21.1 Render de un snapshot produce un `Buffer` que empieza en `%PDF-` y cuyo texto extraído
      contiene los conteos del snapshot
- [ ] 21.2 Render de un snapshot con 0 votos y con 10 firmantes (D9 al límite) no lanza
- [ ] 21.3 GREEN: crear `apps/worker/src/actas/pdfkit-renderer.ts` (fuentes estándar, sin recursos
      externos, `CreationDate` fijado desde `contenido.generado_en`)

### Phase 22: RED e2e (Postgres real) — repo y transición terminal (D11)
- [ ] 22.1 Marcar 3 actas `emitida` ⇒ el proceso sigue `cerrado`
- [ ] 22.2 La 4ª ⇒ pasa a `acta_emitida` y hay **4** eventos `ACTA_GENERADA` con
      `actor_usuario_id IS NULL`
- [ ] 22.3 Ejecutar `finalizar` dos veces sobre la misma acta ⇒ una sola transición y un solo
      evento
- [ ] 22.4 **Carrera real**: dos conexiones `pg` finalizando la 3ª y la 4ª en paralelo ⇒ el
      proceso **sí** llega a `acta_emitida` — esta prueba debe fallar si se quita el `FOR UPDATE`
      [threat: Proceso atascado entre `cerrado` y `acta_emitida` — modo de falla permanente y
      silencioso]
- [ ] 22.5 GREEN: crear `apps/worker/src/actas/actas.repo.ts` (adaptador Prisma: transacción
      terminal `SELECT … FOR UPDATE` sobre `ProcesoElectoral`, `updateMany` CAS
      `WHERE estado='borrador'`, `eventoAuditoria.create`, `acta.count`, transición condicional) y
      `test/procesos/actas-transicion.e2e-spec.ts` — pasa 22.1-22.4

### Phase 23: Wiring del worker
- [ ] 23.1 Modificar `apps/worker/src/main.ts`: `Queue`/`Worker` de `actas`, `setInterval` del
      dispatcher, listener `on('failed')` ⇒ `attemptsMade >= attempts` ⇒ `marcarFallido(id)`
      [spec: Render de actas por el worker y estado `fallido`]
- [ ] 23.2 RED (Vitest): `attemptsMade >= attempts` ⇒ se llama `marcarFallido`;
      `attemptsMade < attempts` ⇒ **no** se marca — GREEN en el mismo listener

### Phase 24: Documentación de variables de entorno (D15)
- [ ] 24.1 Modificar `turbo.json`: `test:e2e.env` `+= ACTAS_POLL_MS, ACTAS_BATCH`
- [ ] 24.2 Modificar `infra/docker/docker-compose.yml`: documentar `ACTAS_POLL_MS`/`ACTAS_BATCH`
      junto a `OUTBOX_*` en el servicio `worker`
- [ ] 24.3 Modificar `docs/onboarding.md` y `README.md`: mismas variables

### Phase 25: Regresión final del change
- [ ] 25.1 `pnpm --filter @seei/worker test -- actas` verde
- [ ] 25.2 `pnpm --filter @seei/backend test` y `test:e2e` completos verdes (Postgres real)
- [ ] 25.3 `pnpm turbo run test` verde en los 4 paquetes
- [ ] 25.4 `pnpm typecheck` verde
- [ ] 25.5 Verificar `test/resultados/*.e2e-spec.ts` y `resultados.service.spec.ts` (`#16`) siguen
      verdes sin editarse desde PR2

## Pendientes explícitamente fuera de este change (constancia, no se inventan aquí)

Documentados como "Preguntas abiertas" en `design.md`, ninguno bloquea `sdd-apply`:
- `representante_aula` con varias aulas produce un solo ganador global (sin modelo de contienda por
  aula) — replica el comportamiento vigente de `#16` a propósito.
- `Acta.contenido` no se expone por HTTP (sólo el PDF) — fuera del alcance de la propuesta.
- El logo institucional no se dibuja en el acta (D12).
- La pantalla de cierre del comité no existe (D15) — brecha operativa real para un backlog futuro.
- `Configuracion.nombre`/`director` `String?` — si el singleton no se completó, el acta imprime la
  institución vacía; no se agrega una validación de cierre nueva por eso.
