# Exploration: reportes-y-exportaciones (Backlog #18 — Reportes y exportaciones)

## Qué dice el TDD/PRD

- `PRD.md` (línea 52): "Reportes — participación, votantes, abstenciones, resultados, candidatos y
  consultas; exportación a Excel, PDF y CSV" — texto idéntico al backlog.
- `TECH-DESIGN.md` (nota post-código, línea ~56): confirma que el módulo `reportes` **no existe
  todavía** como módulo de backend; es exactamente el hueco que cierra #18. `Acta` y `Notificacion`
  son los únicos placeholders del schema para #17/#19; no hay ninguna entidad `Reporte` en el
  schema.

## El precedente arquitectónico a reutilizar: `cierre-escrutinio-actas` (#17)

`openspec/changes/archive/2026-08-19-cierre-escrutinio-actas/design.md` (D10-D14) es el patrón
"worker genera archivo + registra en auditoría" que #18 debe copiar:

- Cola BullMQ **propia** (`actas`) — no comparte cola con `correo`, por aislamiento de fallos
  (D10). Recomendado: cola `reportes` propia para #18 por el mismo argumento.
- Dispatcher hace polling de filas con `estado='borrador'`
  (`apps/worker/src/actas/actas-dispatcher.ts`), copia estructural de `outbox-dispatcher.ts`.
- Processor **puro**, con puertos (`ActasRepo`, `RendererActa`), sin Prisma ni BullMQ dentro
  (`apps/worker/src/processors/actas.processor.ts`).
- Render con `pdfkit` (`apps/worker/src/actas/pdfkit-renderer.ts`) — ya es dependencia del worker
  (`^0.15.0`).
- Transacción terminal en el worker: CAS (`updateMany WHERE estado='borrador'`), escribe el
  archivo, transiciona estado (`emitida`/`fallido`), y escribe el evento de auditoría
  **directamente** (`tx.eventoAuditoria.create()`, actor `null` porque el worker no tiene sesión) —
  primer y único precedente de auditoría escrita por el worker (`ACTA_GENERADA`).
- Prisma `Acta` (`proceso_id`, `tipo`, `estado`, `contenido Json`, `pdf Bytes?`, `pdf_mime`,
  `@@unique([proceso_id,tipo])`) es el modelo de referencia para una tabla de "artefacto generado";
  #18 necesitará algo análogo (p. ej. `Reporte`) — no reutilizar `Acta`, que tiene
  `CHECK tipo <> 'resultados'` y semántica propia de acta oficial.

## El precedente que NO aplica directamente: CSV de `#9` (importación)

`apps/backend/src/importacion/importacion.controller.ts`
(`GET /importaciones/:id/errores.csv`) genera el CSV **síncronamente en el backend**, cacheado en
Redis con TTL de 24h — el mecanismo de generación es distinto al que pide #18 ("generada por el
worker"). Sí sirve como precedente de forma HTTP: `StreamableFile`,
`Content-Disposition: attachment`, CSV con BOM UTF-8/RFC 4180.

## Dependencias/librerías ya instaladas

- `exceljs@^4.4.0` ya está en `apps/backend/package.json`, pero usada hoy **solo para leer** el
  .xlsx de importación, nunca para escribir/exportar.
- `pdfkit@^0.15.0` ya está en `apps/worker/package.json` (actas).
- No hay librería de export CSV declarada; se escribiría a mano (patrón de importación) o con
  `exceljs`.

## Datos/endpoints ya disponibles sin nueva lógica de negocio

- `GET /procesos/:id/resultados` (#16, resultados-en-vivo) — participación + desglose con gate
  `ocultar_resultados`.
- `GET /procesos/:id/actas` + descarga PDF (#17).
- `procesos/escrutinio.ts` — módulo de cálculo compartido (participación, desglose, cuadre, empate)
  ya extraído y reutilizado por resultados y actas; candidato natural para que #18 también cuelgue
  de él en vez de reimplementar agregaciones.
- `GET /panel-jornada/institucion|procesos/:id/resumen|votos-por-hora|avance-aulas|proyeccion` —
  módulo del backlog #20 (`dashboard-panel-jornada`), ya archivado en este repo. No es una
  dependencia formal de #18 (que solo depende de #17), pero comparte agregaciones de
  participación/avance por aula.
- `GET /candidatos`, `GET /listas`, `GET /opciones` — catálogos completos ya expuestos.
- `auditoria.service.ts` solo escribe eventos, sin controller (#21 pendiente, no bloquea #18).

## Frontend

Confirmado: **no existe ninguna UI de reportes** en `apps/frontend/src` (137 archivos `.tsx`
revisados, ninguno bajo `reportes/` ni equivalente). Sería 100% nuevo si se incluye en este ítem.

## Ambigüedades para resolver antes de `sdd-propose`

1. **¿Alcance incluye frontend?** Backend+worker parece el patrón correcto (mismo criterio que
   #17, que declaró frontend fuera de alcance explícitamente y lo dejó para un ítem posterior tipo
   #26-#29). Recomendado: backend+worker en #18, anotar una futura spec de frontend de reportes en
   el backlog.
2. **Granularidad de exportación**: ¿un reporte compuesto por proceso, o reportes independientes
   por dimensión (participación/votantes/abstenciones/resultados/candidatos/consultas)?
   ¿Combinación completa de 3 formatos × 6 dimensiones o selección por el usuario?
3. **¿Los 3 formatos van todos por worker?** El backlog dice explícitamente "generada por el
   worker" para Excel/PDF/CSV — a diferencia del patrón síncrono que usó #9 para CSV. Vale
   confirmar que no se quiere un atajo síncrono para CSV.
4. **Cola nueva vs reutilizar `actas`**: recomendado cola `reportes` propia, mismo argumento D10 de
   #17 (perfiles de fallo distintos no deben compartir cola).

## Resultado

- **next_recommended**: sdd-propose
- **risks**: (a) alcance ambiguo de "reportes" (compuesto vs por dimensión); (b) frontend
  fuera/dentro de alcance sin decidir
