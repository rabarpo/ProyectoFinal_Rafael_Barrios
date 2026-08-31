# Proposal: frontend-importacion-excel (Backlog #29)

## Intent

El dominio de importación de padrón backend (#9) está completo y archivado, pero
`administrador`/`director` no tienen forma de subir el archivo Excel/CSV del padrón salvo
llamando `POST /importaciones/padron` a mano. El menú ya reserva un placeholder
`importacion-excel` (visible a `administrador`/`director`) hoy "Próximamente". Este change lo
activa con una única pantalla.

## Scope

### In Scope
- Cliente API nuevo `apps/frontend/src/importacion/importacion-api.ts`: `POST /importaciones/padron`
  (multipart, campo `archivo`) y descarga de `GET /importaciones/:id/errores.csv`.
- Una sola pantalla: selector de archivo, envío síncrono con spinner, resultado inline con
  contadores (`filas_totales/creadas/existentes/invalidas`), lista/tabla de errores por fila
  (`fila/campo/motivo/valor_recibido`) y botón de descarga del CSV cuando hay errores.
- Validación de tipo (`.xlsx`/`.csv`, nunca `.xlsm`) y tamaño (5 MB) en cliente **solo** como
  feedback inmediato; el allowlist del backend sigue siendo la fuente de verdad.
- Comportamiento post-import: contadores + errores + botón CSV permanecen visibles y el selector
  queda disponible para reintentar con un archivo corregido. Sin navegación automática.
- Una `Ruta` nueva `importacion-excel` en `rutas.ts`/`Enrutador.tsx`.
- Placeholder `importacion-excel` en `menu-por-rol.ts` pasa a `navegable` para
  `administrador`/`director`.

### Out of Scope
- Cualquier cambio de backend — #9 está completo y archivado.
- Endpoint o pantalla de importación de `Usuario` por separado — no existe; `/importaciones/padron`
  crea `Usuario`+`Matrícula` juntos.
- Paginación o virtualización de la lista de errores (volumen real de un padrón escolar es bajo).
- Estados asíncronos/polling — la respuesta del backend es síncrona.
- Plantilla descargable vacía, importación de `Apoderado`, reintentos parciales.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `importacion-excel`: agrega requisitos de UI para subir el archivo, mostrar el
  `ResultadoImportacionDto`, listar errores por fila y descargar el CSV de errores.
- `minimal-frontend-router`: agrega la variante `Ruta` `importacion-excel`.
- `menu-navegacion-post-login`: el item `importacion-excel` pasa de placeholder a navegable para
  `administrador`/`director`.

## Approach

Enfoque de exploration.md confirmado: una sola página contenedora/presentacional, sin manejo de
estado asíncrono complejo. Cliente API nuevo desde cero, tipado contra el contrato (mismo estilo
`openapi-fetch` que `candidatos-api.ts`), con `POST` de `FormData` y descarga de archivo por
`GET`. Reutilizar piezas comunes de `comun/piezas/` donde apliquen. Precedentes de patrón:
frontend #26/#27/#28 y #30.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/frontend/src/importacion/importacion-api.ts` | New | Cliente API: subida multipart + descarga CSV |
| `apps/frontend/src/importacion/ImportacionExcelPage.tsx` | New | Pantalla única: selector + resultado + errores + descarga |
| `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` | Modified | Variante `Ruta` `importacion-excel` |
| `apps/frontend/src/app/menu-por-rol.ts` | Modified | Placeholder `importacion-excel` → `navegable` (admin/director) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sin cliente API previo de importación — superficie nueva | Low | `sdd-design` fija el contrato completo antes de codear |
| Manejo de `multipart/form-data` y descarga de blob difiere del resto de clientes JSON | Med | `sdd-design` documenta el patrón exacto de `FormData` y de descarga de archivo |
| Lista de errores larga renderizada sin paginación | Low | Volumen típico de padrón escolar bajo; lista simple con scroll, decisión fija |
| CSV `404` tras TTL 24h | Low | UI maneja el `404` mostrando mensaje de reporte vencido, sin romper la pantalla |

## Rollback Plan

Revertir los commits del change. Sin migraciones ni datos persistidos nuevos. El placeholder
`importacion-excel` en `menu-por-rol.ts` vuelve a `proximamente` si se revierte esa línea. La ruta
nueva desaparece al revertir `rutas.ts`/`Enrutador.tsx`.

## Dependencies

- #9 (`importacion-excel` backend) y #25 (menú/enrutamiento) — archivados, prerequisitos cumplidos.
- Frontend #26 — provee piezas comunes reutilizables en `comun/piezas/`.

## Success Criteria

- [ ] `administrador`/`director` suben el padrón desde `/importacion-excel` sin llamar la API a mano.
- [ ] El resultado muestra los cuatro contadores y una fila por cada error con `fila/campo/motivo/valor_recibido`.
- [ ] El CSV de errores se descarga cuando hay filas inválidas; un `404` por TTL vencido se muestra como mensaje legible.
- [ ] Tras importar, el usuario puede seleccionar un archivo corregido y reintentar sin recargar ni navegar.
- [ ] Ningún rol distinto de `administrador`/`director` ve el item de menú `importacion-excel`.

## Proposal question round

Las decisiones de producto ya fueron acordadas con el usuario y están incorporadas como alcance
fijo (una sola pantalla; lista de errores simple sin paginación; post-import muestra resultado y
permite reintento; validación cliente solo como feedback). Supuestos abiertos menores para
confirmar o corregir, sin bloquear:

1. Nombre de archivo de la pantalla: `ImportacionExcelPage.tsx` (análogo a los otros `*Page.tsx`).
2. La descarga del CSV se dispara desde el `id` de importación devuelto en el `ResultadoImportacionDto`;
   si el DTO no expone `id`, `sdd-design` lo verifica contra el contrato.
3. No se persiste el resultado entre recargas de página (sin almacenamiento local); recargar
   reinicia la pantalla.
