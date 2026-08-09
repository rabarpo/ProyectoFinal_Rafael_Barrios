# Proposal: Importación de padrón desde Excel

## Intent

Backlog `#9`. Hoy el alta de `Usuario`/`Matricula` sólo existe fila a fila vía HTTP
(`POST /usuarios`, `POST /matriculas`), lo que hace inviable cargar el padrón inicial de
500–1000 estudiantes por institución (PRD, Flujo 6 de TECH-DESIGN.md). Esta propuesta agrega
un endpoint de importación masiva desde un archivo Excel/CSV que crea `Usuario` y `Matricula`
por fila, sin abortar el archivo completo ante filas inválidas, y deja un reporte descargable
de errores más un registro de auditoría con conteos.

## Scope

### In Scope
- `POST /importaciones/padron` (multipart, un solo archivo): parsea, valida y persiste fila a
  fila en un único request síncrono; responde con conteos y detalle de errores.
- Reutilizar `UsersService.crearIdempotente()` (#7) tal cual para la parte `Usuario` de cada fila.
- Agregar `MatriculasService.crearIdempotente()` (nuevo): idempotente por
  `(usuario_id, aula_id, anio_escolar_id)`, con resolución de `Usuario`/`Aula`/`AnioEscolar` desde
  códigos legibles (no UUID) presentes en la fila.
- `GET /importaciones/:id/errores.csv` (o respuesta CSV inline): descarga de errores fila a fila
  (número de fila, campo, motivo, valor recibido).
- Evento de auditoría aditivo con conteos de válidas/erróneas por importación.
- Instalar una librería de parseo Excel/CSV (no hay ninguna hoy en el proyecto).

### Out of Scope
- Procesamiento asíncrono vía worker/BullMQ (decisión ya confirmada: síncrono en el backend).
- Plantilla descargable de Excel vacía para el usuario final (mejora de UX futura).
- Importación de `Apoderado` (el backlog #9 sólo menciona usuarios/matrícula).
- Reintentos parciales o reanudar una importación fallida a mitad de archivo.
- Exportaciones generales (`#18`, ya cubiertas por otro ítem del backlog, vía worker).

## Capabilities

### New Capabilities
- `importacion-excel`: alta masiva de `Usuario`+`Matricula` desde un archivo Excel/CSV, con
  reporte fila a fila, CSV de errores descargable e idempotencia por DNI/código.

### Modified Capabilities
- `administracion-usuarios-apoderados`: ninguna regla existente cambia; `crearIdempotente()` de
  `UsersService` pasa de "gancho sin invocar" a invocado por este módulo (sin cambio de contrato).
- `administracion-academica`: `MatriculasService` gana un método nuevo (`crearIdempotente`); el
  `crear()` existente no cambia.

## Approach

Procesamiento **síncrono** en un único request HTTP (decisión ya confirmada por el usuario):
sin infraestructura de worker nueva, consistente con el precedente síncrono de `crearIdempotente`.

1. `ImportacionModule` nuevo: `ImportacionController` (`multer`/`FileInterceptor`, primer uso de
   subida de archivos en el proyecto) + `ImportacionService` (orquestación).
2. Parseo con **`xlsx` (SheetJS, community edition)**: liviana, sin dependencias nativas, soporta
   `.xlsx` y `.csv` con la misma API — cubre ambos formatos que un usuario podría subir sin
   duplicar lógica de parseo. Alternativa a `exceljs` que ADR-0002 mencionaba pero nunca instaló.
3. Por cada fila: valida formato mínimo (fila vacía, columnas requeridas), resuelve
   `Aula`/`AnioEscolar` por código legible → UUID, invoca `UsersService.crearIdempotente()` y
   `MatriculasService.crearIdempotente()` (nuevo) dentro de la misma transacción por fila — un
   error de fila no aborta las demás.
4. Acumula errores tipados (fila, campo, motivo, valor recibido) en memoria; al final arma el
   reporte de respuesta y, si se pide, el CSV descargable.
5. Un evento de auditoría por importación completa (no uno por fila) con conteos.

### Decisiones de scope tomadas por ambigüedad (a confirmar)
1. **Un solo endpoint, un solo archivo**: cada fila trae tanto los datos de `Usuario` como de
   `Matricula` (columnas combinadas). El backlog agrupa "usuarios/matrícula" en una sola fila del
   ítem #9 y no describe dos flujos separados — se asume un único archivo por simplicidad de UX
   (una sola carga cubre el alta completa de un estudiante).
2. **Librería: `xlsx` (SheetJS)** — ver Approach. Puede revisarse en `sdd-design` si aparecen
   limitaciones de licencia o tamaño.
3. **Formato de columnas** (regla de negocio nueva, sin reglamento previo): se propone
   `nombres, dni, codigo, correo, aula_codigo, anio_escolar_codigo` como cabecera mínima. Se
   declara en `sdd-design`, no fijada por PRD/TECH-DESIGN.
4. **Límite de archivo**: se propone un tope de **2000 filas** por archivo (margen sobre el rango
   esperado de 500–1000 estudiantes del PRD) para acotar el bloqueo del event loop en el enfoque
   síncrono. Sin precedente documentado — asunción a confirmar.
5. **CSV de errores**: columnas `fila, campo, motivo, valor_recibido`, mismo vocabulario de
   `motivo` que ya usan `USERS_ERROR_CODES`/`ACADEMICO_ERROR_CODES` (p. ej. `formato`,
   `campo_duplicado`, `referencia_inexistente`).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/importacion/` (nuevo) | New | `ImportacionModule`, controller, service, DTOs |
| `apps/backend/src/users/users.service.ts` | Modified (caller) | invocar `crearIdempotente` existente, sin cambiar su firma |
| `apps/backend/src/academico/matriculas.service.ts` | New method | agregar `crearIdempotente()` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modified | clave(s) aditiva(s) de importación |
| `apps/backend/package.json` | Modified | agregar `xlsx` (y `multer`, si no viene con `@nestjs/platform-express`) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Archivo grande bloquea el event loop (síncrono) | Med | tope de 2000 filas + medir tiempo en `sdd-design`; revisar a worker si no alcanza |
| Formato de columnas mal comunicado al usuario final | Med | documentarlo explícitamente en `sdd-design` y en la respuesta de error de cabecera inválida |
| `MatriculasService.crearIdempotente` nuevo sin cobertura previa | Low | TDD estricto (config del proyecto), mismos criterios D5/D6 que `crear()` |
| Primer endpoint de subida/descarga de archivos, sin patrón interno | Low | seguir convención estándar de NestJS (`FileInterceptor`, `StreamableFile`) |

## Rollback Plan

Cambio aditivo puro: nuevo módulo, nuevo método en `MatriculasService`, claves de auditoría
aditivas y una dependencia nueva. Revertir es eliminar `ImportacionModule`, la entrada del
módulo en `app.module.ts` y la dependencia `xlsx`; no toca datos existentes ni endpoints previos.

## Dependencies

- `#7` `UsersService.crearIdempotente()` — ya implementado y archivado.
- `#8` `administracion-academica` (`MatriculasService`) — ya implementado y archivado.
- Instalar `xlsx` (nueva dependencia de `apps/backend`).

## Success Criteria

- [ ] Un archivo con filas válidas e inválidas mezcladas importa todas las válidas y reporta
      cada inválida con fila y motivo (Flujo 6 de TECH-DESIGN.md).
- [ ] Reimportar el mismo archivo no duplica `Usuario` ni `Matricula`.
- [ ] El reporte de errores es descargable en CSV.
- [ ] La importación queda en auditoría con conteos de válidas/erróneas.
