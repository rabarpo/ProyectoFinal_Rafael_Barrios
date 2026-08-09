# Exploración: importacion-excel (Backlog #9 — Importación de Excel)

## Estado actual

**`UsersService.crearIdempotente` (#7) es un gancho ya listo.** En
`apps/backend/src/users/users.service.ts`:
- `DatosUsuario { nombres, dni, codigo, correo, rol }` (línea 12) — forma mínima de fila.
- `clasificarColision(tx, datos, excluirId?)` (línea 114) — función pura que clasifica
  `sin_colision` / `coincidencia_exacta` (dni Y codigo apuntan a la misma fila, correo si coincide
  es esa misma fila — nunca reasigna identidad) / `conflicto` (colisión cruzada).
- `crearIdempotente(datos, actorId, txExterno?)` (línea 270) — su docstring lo nombra
  explícitamente como el gancho de `#9`, aún no invocado. `coincidencia_exacta` → no-op
  (`creado:false`); `conflicto` → `409 CAMPO_DUPLICADO`; `tx` externo opcional (nunca abre su
  propia transacción si se le pasa una, según R13); `catch P2002` residual como red de seguridad
  ante carrera; audita con `origen:'idempotente'`. Sirve tal cual para importar filas de `Usuario`
  desde Excel.

**No existe equivalente para `Matrícula` (#8).** `apps/backend/src/academico/matriculas.service.ts`
solo tiene `crear()` (línea 113), que siempre lanza `409 RESTRICCION_UNICA` ante un
`(usuario_id, aula_id, anio_escolar_id)` ya existente — nunca un no-op. Hay que agregar una
variante idempotente desde cero, más un paso de resolución de referencias, ya que las filas de
Excel probablemente referencian `Usuario`/`Aula`/`AnioEscolar` por códigos legibles, no por UUID.

**No hay ninguna librería de parseo de Excel/CSV instalada.** Ni `apps/backend/package.json` ni
`pnpm-lock.yaml` muestran `xlsx`/`exceljs`/`csv-parse`/`papaparse`.
`adrs/0002-stack-typescript-full-stack.md` ya anticipaba "ExcelJS/SheetJS" pero nunca se instaló —
esto es trabajo de diseño/tareas, no solo de aplicación.

**No existe ningún endpoint de subida/descarga de archivos en el backend.** No se encontró
`multer`/`FileInterceptor`/`StreamableFile`/`Content-Disposition` en ningún lado. Esta sería la
primera ruta HTTP de manejo de archivos del proyecto (subida + descarga de CSV) — sin precedente
interno que copiar.

**El worker (`apps/worker`) existe pero está vacío** (solo dependencias `bullmq`+`ioredis`, sin
archivos `.ts` todavía). ADR-0001 le asigna al worker "generación de documentos (actas PDF,
exportaciones Excel/CSV)" — salida/exportación — pero no dice nada sobre procesamiento de
importación. El "Flujo 6" de TECH-DESIGN.md describe el comportamiento esperado sin especificar
síncrono vs. worker. Esta es una decisión de diseño abierta.

## Áreas afectadas

- `apps/backend/src/users/users.service.ts` — reutilizar `crearIdempotente` tal cual
- `apps/backend/src/academico/matriculas.service.ts` — agregar `crearIdempotente` (falta)
- `apps/backend/src/` (nuevo) — `ImportacionModule` (controller de subida, descarga de CSV de
  errores, servicio de parseo/orquestación)
- `apps/backend/src/auditoria/audit-event-types.ts` — clave(s) de auditoría aditiva(s)
- `apps/backend/package.json` — agregar dependencia de parseo de Excel (y de generación de CSV si
  no se arma a mano)
- `apps/worker/` — sin impacto si se elige síncrono; primer código real si se elige asíncrono

## Enfoques posibles

1. **Síncrono en el backend** — Pros: consistente con el `crearIdempotente` síncrono ya existente,
   sin infraestructura nueva, reporte fila a fila inmediato. Contras: archivos grandes podrían
   bloquear el event loop; no hay límite de tamaño documentado en ningún lado. Esfuerzo: Medio.
2. **Asíncrono vía worker (BullMQ)** — Pros: no bloquea el backend, alinea con la intención general
   de ADR-0001. Contras: el worker no tiene infraestructura hoy, necesita un mecanismo de entrega
   del reporte (polling/notificación), y ningún ADR le asigna explícitamente la importación (solo
   la exportación) — requeriría una decisión documentada. Esfuerzo: Alto.
3. **Híbrido** (parseo+validación síncronos con tope de filas, escrituras en lote dentro de un
   mismo request) — término medio dado el volumen de 500–1,000 estudiantes del PRD. Esfuerzo: Medio.

## Recomendación

Proceder a `sdd-propose` con la pregunta síncrono-vs-worker declarada como decisión abierta
explícita (no bloquea la exploración, pero sí el diseño). Recomendación tentativa: síncrono en el
backend (enfoque 1/3) — el volumen esperado es manejable en un solo request HTTP, evita construir
infraestructura de worker nueva, y coincide con el precedente síncrono ya existente de
`crearIdempotente`.

## Riesgos

- Ninguna librería de parseo instalada — afecta el dimensionamiento de la primera tarea de
  implementación.
- `MatriculasService` necesita un método idempotente nuevo diseñado desde cero, incluida la
  resolución de referencias desde códigos legibles a UUID.
- Primer endpoint de subida/descarga de archivos del proyecto — superficie de diseño más grande
  (límites de multipart, content-type, streaming) sin patrón interno que reutilizar.
- Alcance ambiguo: BACKLOG.md agrupa "usuarios/matrícula" sin aclarar si es un solo
  archivo/endpoint o dos flujos separados.
- La ubicación de procesamiento (síncrono vs. worker) no la fija ningún ADR existente — si se
  elige worker, probablemente necesite un ADR nuevo o una nota de enmienda a ADR-0001.
- Formato de columnas, límites de tamaño de archivo y plantilla están indefinidos en
  PRD.md/TECH-DESIGN.md — deben declararse en `sdd-design` como reglas de negocio nuevas (mismo
  patrón "sin reglamento previo" usado en otras partes de BACKLOG.md).

## Listo para propuesta

Sí — con las ambigüedades de arriba explícitas para que `sdd-propose` las resuelva o las deje
como preguntas abiertas documentadas.
