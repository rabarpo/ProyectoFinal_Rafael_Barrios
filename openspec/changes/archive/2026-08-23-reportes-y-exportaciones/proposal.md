# Proposal: Reportes y exportaciones (Backlog #18)

## Intent

Hoy no existe ningún módulo de reportes: quien necesita participación, votantes, abstenciones,
resultados, candidatos o consultas de un proceso electoral no tiene forma de exportar esos datos en
Excel/PDF/CSV — solo puede consumirlos vía `GET /procesos/:id/resultados` (JSON, en vivo). #18
cierra ese hueco reutilizando el patrón worker-genera-archivo-y-audita ya validado por #17
(cierre-escrutinio-actas), sin reimplementar las agregaciones de `escrutinio.ts`.

## Scope

### In Scope
- Endpoint(s) de backend para solicitar la generación de un reporte: 1 dimensión + 1 formato = 1
  registro `Reporte` + 1 job en cola `reportes`.
- Worker: dispatcher (polling `estado='borrador'`) + processor puro con puertos, análogo a
  `actas-dispatcher.ts` / `actas.processor.ts`.
- 6 dimensiones: participación, votantes, abstenciones, resultados, candidatos, consultas.
- 3 formatos por dimensión: Excel (`exceljs`), PDF (`pdfkit`), CSV (a mano, BOM UTF-8 + RFC 4180,
  patrón `importacion.controller.ts`).
- Modelo Prisma nuevo `Reporte` (no reutilizar `Acta`).
- Gate `ocultar_resultados` aplicado a los reportes de participación/resultados, igual que #16.
- Restricción de roles: administrador, director, comité (mismos 3 de panel-jornada/resultados en
  vivo).
- Snapshot inmutable: un reporte emitido no se regenera; una nueva solicitud crea un registro
  nuevo.
- Auditoría con `actor_usuario_id` poblado (a diferencia de `ACTA_GENERADA`, que usa `actor: null`)
  — el `usuario_id` viaja desde el endpoint que encola el job hasta el evento que escribe el
  worker.

### Out of Scope
- UI de reportes en frontend (queda para una spec posterior, mismo criterio que #17 → #26-29).
- Reportes compuestos multi-dimensión o multi-formato en una sola solicitud.
- Retención/expiración/purga de reportes generados (no pedida por el backlog).
- Lectura/consulta de auditoría (#21, no bloquea a #18).
- Cambios al motor de auditoría (`append-only-audit-engine` ya es aditivo por diseño: un nuevo
  `event_type` no requiere modificar su spec).

## Capabilities

### New Capabilities
- `reportes-y-exportaciones`: generación asíncrona (worker) de reportes por dimensión y formato,
  con estado, gate de visibilidad, control de roles y auditoría con actor.

### Modified Capabilities
- None

## Approach

Copiar el patrón de #17 (D10-D14):
- Cola BullMQ propia `reportes` (aislamiento de fallos, no comparte cola con `actas`/`correo`).
- Dispatcher hace polling de `Reporte` en `estado='borrador'`.
- Processor puro con puertos (`ReportesRepo`, `RendererExcel`, `RendererPdf`, `RendererCsv`), sin
  Prisma/BullMQ dentro — testeable en aislamiento.
- Fuente de datos: `escrutinio.ts` para participación/desglose/cuadre; catálogos existentes
  (`candidatos`, `listas`, `opciones`) para candidatos/consultas.
- Transacción terminal en el worker: CAS (`updateMany WHERE estado='borrador'`), escribe el
  archivo, transiciona `emitida`/`fallido`, y escribe el evento `REPORTE_GENERADO` con
  `actor_usuario_id` (pasado end-to-end desde el endpoint) dentro de la misma transacción.
- Prisma `Reporte`: `proceso_id`, `dimension`, `formato`, `estado`, `solicitado_por` (FK Usuario),
  `contenido Json?`, `archivo Bytes?`, `archivo_mime`, sin el `CHECK tipo <> 'resultados'` de
  `Acta` (resultados sí es una dimensión válida aquí).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/reportes/` | New | Módulo Nest: controller (solicitar/consultar/descargar reporte), servicio de encolado |
| `apps/backend/prisma/schema.prisma` | Modified | Modelo `Reporte` + migración |
| `apps/worker/src/reportes/` | New | `reportes-dispatcher.ts`, renderers (excel/pdf/csv) |
| `apps/worker/src/processors/reportes.processor.ts` | New | Processor puro con puertos |
| `apps/backend/src/procesos/escrutinio.ts` | Reused (no modificado) | Fuente de agregaciones de participación/desglose/cuadre |
| Cola BullMQ `reportes` | New | Cola propia, aislada de `actas`/`correo` |
| `EventoAuditoría` | Additive | Nuevo `event_type = 'REPORTE_GENERADO'` con `actor_usuario_id` poblado |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Confundir semántica con `Acta` (reuso indebido del modelo) | Low | Modelo `Reporte` separado, ya decidido en exploración |
| Gate `ocultar_resultados` mal aplicado deja fugar datos antes de tiempo | Med | Reusar la misma condición de `escrutinio.ts`/#16, cubrir con escenario dedicado en specs |
| `usuario_id` se pierde entre endpoint → cola → worker (auditoría sin actor) | Med | Modelar `solicitado_por` como columna persistida en `Reporte`, no solo payload de cola, para que el worker lo lea de la fila |
| CSV escrito a mano introduce inconsistencias de encoding/formato vs Excel/PDF | Low | Reusar exactamente el patrón BOM UTF-8 + RFC 4180 de `importacion.controller.ts` |

## Rollback Plan

Feature aislada en un módulo nuevo (`reportes/`) y una cola nueva (`reportes`); revertir es quitar
el módulo backend, el processor/dispatcher del worker y la migración de `Reporte` (down migration
elimina la tabla). No hay endpoints ni tablas existentes modificados en su comportamiento — solo
adición, por lo que el rollback no afecta a #16/#17 ni a ningún otro módulo en producción.

## Dependencies

- #17 (cierre-escrutinio-actas), ya archivado — patrón worker-genera-archivo-y-audita.
- #16 (resultados-en-vivo) — gate `ocultar_resultados` y `escrutinio.ts`.

## Success Criteria

- [ ] Un usuario con rol administrador/director/comité puede solicitar un reporte de cualquiera de
      las 6 dimensiones en Excel, PDF o CSV, y descargarlo una vez `emitida`.
- [ ] El gate `ocultar_resultados` oculta el desglose de participación/resultados en los reportes,
      igual que en `GET /procesos/:id/resultados`.
- [ ] Cada reporte emitido tiene exactamente un evento `REPORTE_GENERADO` en `EventoAuditoría` con
      `actor_usuario_id` poblado (no `null`).
- [ ] Una segunda solicitud de la misma dimensión+formato crea un registro `Reporte` nuevo, sin
      sobrescribir el anterior.
