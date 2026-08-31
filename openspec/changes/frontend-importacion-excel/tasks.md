# Tasks: frontend-importacion-excel (Backlog #29)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~800-850 autoradas (6 nuevos + spec, 3 modificados) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 -> PR2 -> PR3 -> PR4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (decision del usuario) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Ruta plana + menu navegable + pagina con gate D9 y estado vacio, sin fetch | PR1 | `pnpm --filter frontend test -- rutas menu-por-rol Enrutador` | N/A - solo datos de ruta/menu y render de gate; sin servidor | `rutas.ts`/`Enrutador.tsx`/`menu-por-rol.ts` (revertir linea `IMPORTACION_EXCEL`) + `ImportacionExcelPage.tsx` |
| 2 | Barreras puras: `validar-archivo-padron.ts` (D6) y `mensajes-error.ts` (D7) | PR2 | `pnpm --filter frontend test -- validar-archivo-padron mensajes-error` | N/A - funciones puras sin jsdom | `apps/frontend/src/importacion/validar-archivo-padron.ts` y `mensajes-error.ts` (+ specs) |
| 3 | `importacion-api.importarPadron` + maquina de estados D5 + `ResumenImportacion` | PR3 | `pnpm --filter frontend test -- importacion-api ImportacionExcelPage ResumenImportacion` | Manual: `pnpm --filter frontend dev`, navegar `/importacion-excel`, subir `.xlsx` valido | `importacion-api.ts` (solo `importarPadron`), `ResumenImportacion.tsx`, wiring de estado en la pagina |
| 4 | `descargarCsvErrores` (D4) + `TablaErroresImportacion` (D10) + manejo `404` | PR4 | `pnpm --filter frontend test -- importacion-api TablaErroresImportacion ImportacionExcelPage` | Manual: dev server, importar padron con filas invalidas y descargar CSV | `descargarCsvErrores` en `importacion-api.ts`, `TablaErroresImportacion.tsx`, boton de descarga en la pagina |

Estrategia TDD estricta: cada tarea GREEN va precedida por su tarea RED. Runner: `pnpm turbo run test`.

## Phase 1: Cimientos, ruta y menu (PR1)

- [x] 1.1 RED `apps/frontend/src/app/rutas.spec.ts`: round-trip `parsearRuta(rutaAPath(r))` de `importacion-excel`; `/importacion-excel/x`, `/importacion-excel/algo/mas`, `/importacion-excel/..` => `no-encontrada` (satisface minimal-frontend-router: Variante Ruta plana)
- [x] 1.2 GREEN `apps/frontend/src/app/rutas.ts`: variante `{ nombre: 'importacion-excel' }` en la union; `parsearRuta` exige `partes.length === 1`; `rutaAPath` => `/importacion-excel`
- [x] 1.3 RED `apps/frontend/src/app/menu-por-rol.spec.ts`: item `importacion-excel` navegable para `administrador`/`director`, ausente para `comite`/`docente`/`estudiante`; invariantes de #25-#30 intactas (satisface menu-navegacion-post-login: Item real / Placeholders MODIFIED)
- [x] 1.4 GREEN `apps/frontend/src/app/menu-por-rol.ts`: `IMPORTACION_EXCEL` pasa de `{ clase: 'proximamente' }` a `{ clase: 'navegable', ruta: { nombre: 'importacion-excel' } }`; cero cambios en las filas de `MENU_POR_ROL`
- [x] 1.5 RED `apps/frontend/src/app/Enrutador.spec.tsx`: sin sesion => `LoginPage`; `case 'importacion-excel'` monta `ImportacionExcelPage`; con `comite`/`docente`/`estudiante`/rol ausente => aviso `role="status"`, cero piezas, cero llamadas (threat matrix Enrutamiento)
- [x] 1.6 GREEN `apps/frontend/src/app/Enrutador.tsx`: `case 'importacion-excel'` => `ImportacionExcelPage`. Crear `apps/frontend/src/importacion/ImportacionExcelPage.tsx` esqueleto: gate D9 `puedeImportar = rol === 'administrador' || rol === 'director'`, estado vacio, sin fetch ni piezas (satisface importacion-excel: Pantalla unica - rol no autorizado)

## Phase 2: Barreras puras - validador y mensajes (PR2)

- [ ] 2.1 RED `apps/frontend/src/importacion/validar-archivo-padron.spec.ts`: matriz extension x tamano - `.xlsx`/`.csv` validos; `.xlsm`, `.xls`, `.pdf`, sin extension, `padron.xlsx.xlsm` => rechazo; 0 bytes; 5 MB exactos vs 5 MB + 1 byte (threat matrix Clasificacion de archivo)
- [ ] 2.2 GREEN `apps/frontend/src/importacion/validar-archivo-padron.ts`: `validarArchivoPadron(archivo): string | null` por extension real `/\.(xlsx|csv)$/i` y `0 < size <= 5*1024*1024`; sin pareo de MIME (satisface importacion-excel: Validacion de tipo y tamano)
- [ ] 2.3 RED `apps/frontend/src/importacion/mensajes-error.spec.ts`: `mensajeDeError` sobre los 5 `CodigoImportacion` + fallback por `status` `403`/`404`/generico; `LIMITE_FILAS_EXCEDIDO` menciona el tope de 2000 filas
- [ ] 2.4 GREEN `apps/frontend/src/importacion/mensajes-error.ts`: `Record<CodigoImportacion, string>` total + `mensajeDeError({ codigo, status })` (satisface importacion-excel: Validacion - rechazo del backend legible)

## Phase 3: Cliente API y subida (PR3)

- [ ] 3.1 RED `apps/frontend/src/importacion/importacion-api.spec.ts` (importarPadron): `vi.stubGlobal('fetch', ...)`; path `/importaciones/padron`, cuerpo `FormData` con clave `archivo`, sin `Content-Type` manual, `ok:true` en `201`, `ok:false` con `status`/`codigo` en `400`
- [ ] 3.2 GREEN `apps/frontend/src/importacion/importacion-api.ts`: `importarPadron(archivo)` con `client().POST('/importaciones/padron', { body: aFormData({ archivo }) as never })`; `ResultadoApi<T>`/`resolver` copiados de `candidatos-api.ts`; `aFormData` local; tipos `ResultadoImportacionDto`/`ErrorFilaDto` desde `components['schemas']`
- [ ] 3.3 RED `apps/frontend/src/importacion/piezas/ResumenImportacion.spec.tsx`: los cuatro contadores `filas_totales`/`filas_creadas`/`filas_existentes`/`filas_invalidas` desde `ResultadoImportacionDto`
- [ ] 3.4 GREEN `apps/frontend/src/importacion/piezas/ResumenImportacion.tsx`: presentacional puro, sin fetch ni `useSesion`
- [ ] 3.5 RED `apps/frontend/src/importacion/ImportacionExcelPage.spec.tsx` (`vi.mock('./importacion-api')` + `proveer()`): `.xlsm`/6 MB => alerta y `importarPadron` no invocada; envio => `role="status"` y boton `disabled`; `201` => `ResumenImportacion` con 4 contadores; `400` => `mensajeDeError` sin desmontar; segundo envio reemplaza el resultado sin recarga ni navegacion
- [ ] 3.6 GREEN `ImportacionExcelPage.tsx`: union discriminada `EstadoImportacion` (D5), `CampoArchivo` reusado, `validarArchivoPadron` como barrera previa, `importarPadron`, `ResumenImportacion`; el `File` vive en `useState` aparte y sobrevive a `fase='resultado'` (satisface importacion-excel: Envio sincrono, Presentacion del resultado, Reintento sin recargar)

## Phase 4: Errores y descarga (PR4)

- [ ] 4.1 RED `apps/frontend/src/importacion/importacion-api.spec.ts` (descargarCsvErrores): `vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })` + `vi.stubGlobal('fetch', ...)`; URL con `encodeURIComponent(importacionId)`; `200` => `createObjectURL` invocado, `<a download>` con nombre `importacion-${id}-errores.csv` ignorando un `Content-Disposition` hostil; `revokeObjectURL` invocado en exito y en fallo; `404` => `{ ok:false, status:404, codigo:'REPORTE_NO_ENCONTRADO' }` y sin `createObjectURL`; error de red => `{ ok:false }` sin excepcion (threat matrix Descarga / Content-Disposition)
- [ ] 4.2 GREEN `descargarCsvErrores(importacionId)` en `importacion-api.ts`: `fetch` crudo => `res.blob()` => `<a download>` sintetico; `URL.revokeObjectURL` en `finally`; devuelve `ResultadoApi<void>`
- [ ] 4.3 RED `apps/frontend/src/importacion/piezas/TablaErroresImportacion.spec.tsx`: 4 columnas `fila`/`campo`/`motivo`/`valor_recibido`, cero botones de accion, `motivo` traducido desde `MOTIVOS_FILA`, `valor_recibido` con `<script>` renderizado como texto (threat matrix, D10)
- [ ] 4.4 GREEN `apps/frontend/src/importacion/piezas/TablaErroresImportacion.tsx`: `TablaGenerica` sin prop `acciones`, `claveFila = (e) => `${e.fila}-${e.campo}``
- [ ] 4.5 RED `ImportacionExcelPage.spec.tsx`: `filas_invalidas > 0` => `TablaErroresImportacion` + boton "Descargar CSV de errores"; `filas_invalidas === 0` => sin tabla y sin boton; `404` de descarga => alerta de reporte vencido con el resumen y la tabla aun montados
- [ ] 4.6 GREEN `ImportacionExcelPage.tsx`: boton de descarga condicional a `filas_invalidas > 0`, `TablaErroresImportacion`, error de descarga en estado aparte que no pisa `fase='resultado'` (satisface importacion-excel: Descarga del CSV con manejo de reporte vencido)

## Phase 5: Verificacion de cierre

- [ ] 5.1 `pnpm turbo run test` completo en verde
- [ ] 5.2 Confirmar que `apps/frontend/package.json` no incorpora `react-router-dom` ni libreria de routing (minimal-frontend-router: sin dependencia nueva)
- [ ] 5.3 Typecheck y lint del frontend sin regresiones; `CampoArchivo.tsx` y `TablaGenerica.tsx` sin modificaciones

## Ejecucion paralela vs secuencial

- Phase 1 y Phase 2 son independientes entre si (datos/rutas vs helpers puros) y pueden correr en paralelo.
- Phase 3 depende de Phase 1 (pagina + ruta) y Phase 2 (validador + mensajes).
- Phase 4 depende de Phase 3 (`importacion-api.ts`, maquina de estados, `ResumenImportacion`).
- Dentro de cada fase: RED antes de su GREEN (secuencial). Specs de archivos distintos pueden escribirse en paralelo.
- Phase 5 corre al final.
