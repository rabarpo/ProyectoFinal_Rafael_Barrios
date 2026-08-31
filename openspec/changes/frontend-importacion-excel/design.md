# Diseño: frontend-importacion-excel (Backlog #29)

## Enfoque técnico

Frontend puro, sin backend nuevo ni regeneración de contrato: `#9` está archivado y su superficie
HTTP queda intacta. Se **extiende** el enrutador hand-rolled (D10/D11 de `#12`) con una variante
plana `importacion-excel` y el mapa `MENU_POR_ROL` de `#25` con el placeholder homónimo pasando a
`navegable`; ninguna de esas decisiones se reabre. La pantalla es un contenedor único con tres
zonas verticales (selector, resumen, errores), sin pestañas ni sub-rutas, porque la respuesta del
backend es síncrona: no hay job, ni polling, ni estado de larga duración que modelar. Se reutilizan
sin tocarlas `candidatos/piezas/CampoArchivo.tsx` (`#12`) y `comun/piezas/TablaGenerica.tsx` (`#26`),
y se replica el precedente de doble barrera de `#28` D8 (`validar-logo.ts` + `PanelLogo`).

Verificado contra el código real antes de fijar contratos, con **cuatro hallazgos**:

1. **`importacion_id` SÍ está expuesto** — `ResultadoImportacionDto` declara `importacion_id!: string`
   (`apps/backend/src/importacion/dto/resultado-importacion.dto.ts:10`) y el contrato generado lo
   refleja (`packages/contracts/src/generated/api.d.ts:1336`). El campo **no** se llama `id`. La
   descarga del CSV es viable sin ningún cambio de backend: **el hallazgo bloqueante hipotético del
   briefing queda descartado.**
2. `ImportacionController_importarPadron` declara `requestBody?: never` (`api.d.ts:3604`), mismo caso
   que candidatos, listas y configuración ⇒ `body: FormData as never` (D3).
3. `ImportacionController_descargarErroresCsv` declara `path: { id: unknown }` (`api.d.ts:3644`) y
   **`content?: never` en las cuatro respuestas** (200/401/403/404, `api.d.ts:3649-3677`): el cliente
   tipado no aporta ningún tipo de cuerpo para esta ruta (D4).
4. `openapi-fetch@0.17` devuelve el `FormData` tal cual en `defaultBodySerializer` y omite
   `Content-Type` cuando el cuerpo serializado es `FormData` (`src/index.js:96-97, 620-622`) —
   verificado leyendo el paquete instalado, igual que hizo `#12`. En el camino de error hace
   `response.text()` + `JSON.parse` (`src/index.js:268-270`), así que el `{ codigo }` de los
   `4xx` llega a `extraerCodigo` sin trabajo extra.

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Estructura de ruta | **Variante plana sin parámetros**: `{ nombre: 'importacion-excel' }` ⇒ `/importacion-excel`, reconocida sólo con `partes.length === 1`; todo `/importacion-excel/...` cae en `no-encontrada`. Un `case` en `Enrutador.tsx` | `/importacion-excel/:importacionId` para deep-link al resultado; sub-ruta `/importacion-excel/errores`; pestañas con estado en la URL | El delta `minimal-frontend-router` lo exige (`MUST NOT persistir en la URL … el resultado de la importación entre recargas`). Un `importacionId` en la URL prometería un resultado recuperable que **no existe**: el `ResultadoImportacionDto` sólo viaja en la respuesta del `POST` y en Redis sólo queda el CSV (TTL 24 h), nunca los contadores. Round-trip exacto `parsearRuta(rutaAPath(r)) === r`, precedente literal de `academica` (`#26` D1), `usuarios` (`#27` D1) y `configuracion` (`#28` D1) |
| D2 | Menú por rol | `IMPORTACION_EXCEL` pasa de `{ clase: 'proximamente' }` a `{ clase: 'navegable', ruta: { nombre: 'importacion-excel' } }`. **Cero cambios en las filas** de `MENU_POR_ROL`: ya figura sólo en `administrador`/`director` | Agregarlo a `comite`; item separado "Descargar plantilla" | `MENU_POR_ROL` espeja los `@Roles` reales (`#25` D3): `ImportacionController` es `@Roles('administrador','director')` **a nivel de clase**, así que `comite` recibiría `403` en ambas rutas — un item visible que garantiza `403` al primer click es peor que ningún item (`#27` D2) |
| D3 | Subida multipart | `importacion-api.ts` **reusa el cliente tipado**: `client().POST('/importaciones/padron', { body: aFormData({ archivo }) as never })`, con `aFormData` replicado local (una sola clave, `#28` D3) y `ResultadoApi<T>`/`resolver` copiados de `candidatos-api.ts`. **Sin `Content-Type` manual, sin `bodySerializer` custom, sin `credentials`** | `fetch` crudo para la subida; `bodySerializer` propio; `credentials: 'include'`; `XMLHttpRequest` para barra de progreso real | El precedente exacto ya existe y está verificado dos veces (`subirPlanTrabajo` de `#12`, `subirLogo` de `#28`): `openapi-fetch` deja pasar el `FormData` y el navegador fija `multipart/form-data; boundary=…`. `credentials` **no** se setea: `createSeeiClient` usa el default `same-origin` de `fetch` y `apps/frontend/vite.config.ts` mantiene mono-origen vía `server.proxy['/api']` porque la cookie `seei_session` es `httpOnly, sameSite:'lax'` y el backend **no** habilita CORS a propósito — `credentials:'include'` obligaría a abrirlo y debilitaría la única defensa CSRF. `XMLHttpRequest` daría porcentaje de subida, pero el spec sólo pide "indicador de progreso" y el archivo tope es 5 MB |
| D4 | **Descarga del CSV** | `fetch` **crudo** en `descargarCsvErrores(importacionId)` ⇒ `Response`; si `ok`, `await res.blob()`, `URL.createObjectURL(blob)`, `<a download>` sintético (`document.createElement('a')` + `click()` + `remove()`) y `URL.revokeObjectURL` en un `finally`. El nombre se **construye en el cliente**: `importacion-${importacionId}-errores.csv`. Devuelve `ResultadoApi<void>` para que el `404` sea un dato, no una excepción | (a) `client().GET(..., { parseAs: 'blob' })`; (b) `window.location.href = url` / `<a href>` directo; (c) leer `filename` del header `Content-Disposition` | (a) el contrato declara `content?: never` en las **cuatro** respuestas y `path: { id: unknown }` (hallazgo 3): el cliente tipado exigiría `as never` en `params` **y** en el parseo, aportando cero seguridad de tipos a cambio de ruido — `urlFoto`/`urlLogo` ya sentaron el precedente de salir del cliente tipado cuando el contrato no describe el binario. (b) una navegación de nivel superior **no permite leer el status**: un `404` por TTL vencido se vería como una pestaña con JSON de error o una descarga rota, y el spec exige "mensaje de reporte vencido conservando el resultado visible". (c) `Content-Disposition` es texto controlado por el servidor y el parseo de `filename*`/comillas es una superficie de inyección innecesaria: el `importacionId` es un `randomUUID()` del backend y el nombre que produce el cliente es **idéntico** al que arma el controller |
| D5 | Estado de la pantalla | **Unión discriminada** `EstadoImportacion = { fase:'inactivo' } \| { fase:'enviando' } \| { fase:'resultado'; datos: ResultadoImportacionDto } \| { fase:'error'; mensaje: string }`, en `useState` de `ImportacionExcelPage`. El archivo seleccionado vive en un `useState<File\|null>` aparte y **sobrevive** a la transición a `resultado` (reintento sin recargar). Sin `localStorage`, sin `sessionStorage`, sin URL | Cuatro booleanos (`cargando`/`error`/`exito`/`vacio`); `useReducer`; persistir el último resultado en `sessionStorage` | Misma disciplina que `Ruta` e `ItemMenu`: el compilador impide los estados incoherentes ("enviando con resultado", "error con datos"). Cuatro booleanos permiten 16 combinaciones de las que 12 son inválidas. `useReducer` es más ceremonia que valor para cuatro transiciones lineales. Persistir viola el `MUST NOT persistir el resultado entre recargas` de ambos deltas |
| D6 | Validación de cliente | Helper **puro** `validar-archivo-padron.ts`: `validarArchivoPadron(archivo): string \| null`. Espeja `filtroArchivoPadron` del backend con la **extensión real** (`/\.(xlsx\|csv)$/i` — `padron.xlsx.xlsm` se evalúa por `.xlsm` y se rechaza), `size > 0` y `size <= 5*1024*1024`. Si devuelve mensaje ⇒ `<p role="alert">` y **cero requests** | Validar dentro de `CampoArchivo`; confiar sólo en `accept`; parear MIME como `#28` D6; validar filas/cabecera en el cliente | El spec exige el rechazo "sin realizar el `POST`" para `.xlsm` y para >5 MB; `accept` es sólo un hint del selector (un drag & drop o un rename lo saltea). Función pura ⇒ testeable sin jsdom, exhaustiva. **Desvío consciente de `#28` D6**: NO se parea el MIME, porque el MIME de `.xlsx` que reporta el navegador varía por plataforma (`application/vnd.openxmlformats-…`, `application/octet-stream`, vacío) y el backend **tampoco** lo usa para la allowlist (`filtroArchivoPadron` mira sólo `originalname`) — parearlo produciría falsos rechazos de archivos que el backend acepta. Cabecera y tope de 2000 filas **no** se validan en cliente: exigiría parsear el `.xlsx` en el navegador, duplicando `exceljs` y su lógica, para adelantar un `400` que D7 ya muestra legible |
| D7 | Errores del backend en la UI | `importacion/mensajes-error.ts`: `Record<CodigoImportacion, string>` **total** sobre los **cinco** códigos de `apps/backend/src/importacion/importacion.errors.ts`, más `mensajeDeError({ codigo, status })` con fallback por `status` (`403`/`404`/genérico). `LIMITE_FILAS_EXCEDIDO` menciona el tope de 2000 filas | Reutilizar `configuracion/mensajes-error.ts`; un mensaje genérico para todo `4xx` | Los catálogos de código son locales a su módulo backend (decisión de `#7`); `Record` total ⇒ agregar un código rompe la compilación en vez de degradar en silencio (misma disciplina que `#26` D7, `#27` D7, `#28` D7). El fallback por `status` es obligatorio: `filtroArchivoPadron` corre en Multer y su `BadRequestException` puede llegar antes de cualquier `codigo` propio, y el `413`/error de red no tiene `codigo` |
| D8 | Contenedor / presentacional | `ImportacionExcelPage` es el **único** componente con estado, efectos y llamadas API. Dos piezas presentacionales puras nuevas: `piezas/ResumenImportacion.tsx` (`{ resultado }` ⇒ los cuatro contadores) y `piezas/TablaErroresImportacion.tsx` (`{ errores }` ⇒ `TablaGenerica`). `CampoArchivo` y el botón de descarga se montan **en la página**, sin envoltorio | Un `PanelSubidaPadron` con estado propio (estilo `PanelLogo` de `#28`); una sola pieza que reciba todo el `ResultadoImportacionDto` | `PanelLogo` tiene estado propio porque `ConfiguracionPage` orquesta **tres** secciones independientes; acá hay **un solo** flujo y partirlo obligaría a subir el resultado por callback igual. Contadores y tabla se separan porque el spec los condiciona distinto: los contadores se muestran **siempre**, la tabla y la descarga sólo con `filas_invalidas > 0`. Ninguna pieza llama `useSesion()` ni hace fetch (`#26` D8, `#28` D10) |
| D9 | Gate de rol | **Un único gate binario allowlist** en `ImportacionExcelPage`: `const puedeImportar = rol === 'administrador' \|\| rol === 'director'`. Si es falso: aviso `role="status"`, **cero llamadas** y cero piezas montadas | `soloLectura` graduado; denylist `rol !== 'comite'`; botones `disabled` | Idéntico a `#28` D10 y por la misma razón: `ImportacionController` gatea **a nivel de clase**, así que ninguna de sus dos rutas es alcanzable por otro rol. Allowlist ⇒ un rol futuro o `estado !== 'autenticado'` cae del lado cerrado. La autorización real sigue siendo `@Roles()` server-side; este gate es presentación |
| D10 | Lista de errores | `TablaGenerica` **sin pasar `acciones`** (se omite la prop; su default `[]` evita renderizar la columna). Cuatro columnas: `fila`, `campo`, `motivo`, `valor_recibido`. `claveFila = (e) => `${e.fila}-${e.campo}`` ; `mensajeVacio` inalcanzable pero obligatorio por la firma. **Sin paginación ni virtualización**; `motivo` se muestra traducido desde `MOTIVOS_FILA` | Pieza de tabla propia; paginación cliente; virtualización (`react-window`) | El delta lo prohíbe explícitamente (`MUST NOT paginar ni virtualizar`) y el volumen real de un padrón escolar es bajo. Reusar `TablaGenerica` sin tocarla es cero riesgo para sus cinco consumidores vigentes. `valor_recibido` se renderiza como texto en una celda (React escapa por defecto): nunca `dangerouslySetInnerHTML`, porque su contenido viene del archivo que subió el usuario |
| D11 | Qué se prueba y cómo | Dato puro (Vitest sin render): round-trip de `importacion-excel` en `rutas.spec.ts`, item navegable en `menu-por-rol.spec.ts`, `mensajeDeError` sobre los cinco códigos, `validarArchivoPadron` sobre la matriz extensión × tamaño. Render (Vitest + RTL + jsdom): página y piezas con `vi.mock('./importacion-api')` y el patrón `proveer()` con `SesionContext` de `Enrutador.spec.tsx`. **`URL.createObjectURL`/`revokeObjectURL` se stubean con `vi.stubGlobal`** (jsdom no los implementa). Sin e2e nuevos | Snapshots; e2e con navegador; probar `TablaGenerica`/`CampoArchivo` (ya cubiertas) | Extiende `#25` D8 / `#26` D12 / `#28` D11: lo que es dato se prueba como dato. El stub de `createObjectURL` no es un detalle: sin él, el test de descarga falla con `TypeError` y no por la lógica bajo prueba |

## Flujo de datos

```
MENU_POR_ROL[administrador|director] ── item 'importacion-excel' (navegable, D2)
                    │ navegar({ nombre: 'importacion-excel' })
Enrutador ──────────┴─ case 'importacion-excel' ─────────→ ImportacionExcelPage

ImportacionExcelPage (contenedor único, D8)
  useSesion() ⇒ rol ⇒ puedeImportar = rol ∈ {administrador, director}        (D9)
    ├─ !puedeImportar → <p role="status"> y CERO fetch
    └─  puedeImportar
          ├─ CampoArchivo (reusado sin tocar)  → setArchivo(File|null)
          │     └─ validarArchivoPadron(File)  → mensaje | null             (D6)
          ├─ estado: inactivo → enviando → resultado | error                (D5)
          │     importarPadron(File) ⇒ ResultadoApi<ResultadoImportacionDto>(D3)
          ├─ fase 'resultado' → ResumenImportacion { resultado }            (D8)
          │     └─ filas_invalidas > 0 ⇒ botón "Descargar CSV de errores"
          │                            + TablaErroresImportacion { errores } (D10)
          └─ fase 'error'     → <p role="alert">{mensajeDeError(...)}       (D7)
```

Secuencia 1 — subida y resultado (doble barrera, D3/D6):

```
admin   ImportacionExcelPage  validarArchivoPadron  importacion-api   ImportacionController
  │            │                      │                    │                    │
  │ elige padron.xlsm ───────────────>│                    │                    │
  │            │───── validar(File) ─>│                    │                    │
  │            │<── "Formato no permitido (.xlsx o .csv)" ─┤                    │
  │            │  <p role="alert">   ✗ NINGÚN request      │                    │
  │            │                                           │                    │
  │ elige padron.xlsx · click "Importar"                   │                    │
  │            │───── validar(File) ⇒ null ───────────────>│                    │
  │            │  fase='enviando' ⇒ <p role="status"> + botón disabled          │
  │            │──── importarPadron(File) ────────────────>│                    │
  │            │            aFormData({ archivo: File })   │─ POST /importaciones/padron ─>│
  │            │            (sin Content-Type manual)      │   filtroArchivoPadron +       │
  │            │                                           │   limits.fileSize (AUTORIDAD) │
  │            │<─ ResultadoApi<ResultadoImportacionDto> ──│<── 201 { importacion_id,      │
  │            │                                           │      filas_totales, creadas,  │
  │            │                                           │      existentes, invalidas,   │
  │            │                                           │      errores[] } ─────────────│
  │            │  fase='resultado' ⇒ ResumenImportacion + (si invalidas>0) tabla + descarga│
  │            │  el File seleccionado NO se limpia ⇒ reintento sin recargar (D5)          │
  │            │<─ 400 { codigo: CABECERA_INVALIDA } ⇒ fase='error' + mensajeDeError (D7)  │
```

Secuencia 2 — descarga del CSV y reporte vencido (D4):

```
admin   ImportacionExcelPage   importacion-api            ImportacionController
  │            │                     │                              │
  │ click "Descargar CSV" ──────────>│                              │
  │            │  descargarCsvErrores(importacion_id)               │
  │            │                     │─ GET /importaciones/{id}/errores.csv ─>│
  │            │                     │   (fetch crudo, cookie same-origin)    │
  │            │                     │<── 200 text/csv (StreamableFile) ──────│
  │            │                     │  blob = await res.blob()
  │            │                     │  url  = URL.createObjectURL(blob)
  │            │                     │  <a download="importacion-{id}-errores.csv"> .click()
  │            │                     │  finally ⇒ URL.revokeObjectURL(url)
  │            │<── { ok: true } ────│   (nombre construido en cliente: NUNCA se parsea
  │            │                     │    Content-Disposition — threat matrix)
  │            │                     │
  │            │                     │<── 404 { codigo: REPORTE_NO_ENCONTRADO } (TTL 24 h)
  │            │<── { ok:false, status:404, codigo } ─┤
  │            │  <p role="alert"> "El reporte de errores expiró…"
  │            │  ✗ el ResumenImportacion y la tabla SIGUEN visibles (fase no cambia, D5)
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/frontend/src/app/rutas.ts` (+ `.spec.ts`) | Modify | D1: variante `importacion-excel` en la unión, `parsearRuta` y `rutaAPath` |
| `apps/frontend/src/app/Enrutador.tsx` (+ `.spec.tsx`) | Modify | D1: `case 'importacion-excel'` ⇒ `ImportacionExcelPage` |
| `apps/frontend/src/app/menu-por-rol.ts` (+ `.spec.ts`) | Modify | D2: `IMPORTACION_EXCEL` ⇒ `navegable`; invariantes de `#25`/`#26`/`#27`/`#28`/`#30` intactas |
| `apps/frontend/src/importacion/importacion-api.ts` (+ `.spec.ts`) | Create | D3/D4: `importarPadron` (cliente tipado + `FormData`) y `descargarCsvErrores` (`fetch` crudo + blob) |
| `apps/frontend/src/importacion/mensajes-error.ts` (+ `.spec.ts`) | Create | D7: `Record` total sobre los 5 `IMPORTACION_ERROR_CODES` + fallback por `status` |
| `apps/frontend/src/importacion/validar-archivo-padron.ts` (+ `.spec.ts`) | Create | D6: helper puro de extensión real y tamaño |
| `apps/frontend/src/importacion/ImportacionExcelPage.tsx` (+ `.spec.tsx`) | Create | D5/D8/D9: gate, máquina de estados, `CampoArchivo`, botón de descarga |
| `apps/frontend/src/importacion/piezas/ResumenImportacion.tsx` (+ `.spec.tsx`) | Create | D8: los cuatro contadores, presentacional puro |
| `apps/frontend/src/importacion/piezas/TablaErroresImportacion.tsx` (+ `.spec.tsx`) | Create | D10: `TablaGenerica` sin acciones, 4 columnas, `motivo` traducido |
| `apps/frontend/src/candidatos/piezas/CampoArchivo.tsx`, `comun/piezas/TablaGenerica.tsx` | None | Reutilizadas sin cambios (D6/D8/D10) |
| Backend, `packages/contracts` | None | Sin endpoints, DTOs ni regeneración de contrato — `#9` está archivado |

## Interfaces / Contratos

```ts
// apps/frontend/src/importacion/importacion-api.ts — D3/D4.
// `ResultadoApi<T>`/`resolver` copiados de candidatos-api.ts; `aFormData` replicado local (#28 D3).
export type ResultadoImportacionDto = components['schemas']['ResultadoImportacionDto'];
export type ErrorFilaDto            = components['schemas']['ErrorFilaDto'];
// VERIFICADO: el identificador es `importacion_id`, NO `id` (dto + api.d.ts:1336).
// `ErrorFilaDto.motivo` es una unión cerrada: 'fila_vacia'|'formato'|'campo_duplicado'|'referencia_inexistente'.

// `importacion.errors.ts`, copiado literal (los 5 códigos).
export type CodigoImportacion =
  | 'CABECERA_INVALIDA' | 'LIMITE_FILAS_EXCEDIDO' | 'EXTENSION_NO_PERMITIDA'
  | 'ARCHIVO_REQUERIDO' | 'REPORTE_NO_ENCONTRADO';

// Contrato: `requestBody?: never` (api.d.ts:3604) ⇒ `as never`, igual que subirLogo/subirPlanTrabajo.
export async function importarPadron(archivo: File): Promise<ResultadoApi<ResultadoImportacionDto>> {
  const body = aFormData({ archivo });                    // clave EXACTA: FileInterceptor('archivo')
  return resolver(client().POST('/importaciones/padron', { body: body as never }));
}

// D4: `fetch` crudo — el contrato declara `content?: never` en las 4 respuestas (api.d.ts:3649-3677).
// Sin `credentials`: default `same-origin`, mono-origen por `server.proxy['/api']` (vite.config.ts).
export async function descargarCsvErrores(importacionId: string): Promise<ResultadoApi<void>> {
  let url: string | undefined;
  try {
    const res = await fetch(`${baseUrl()}/importaciones/${encodeURIComponent(importacionId)}/errores.csv`);
    if (!res.ok) return { ok: false, status: res.status, codigo: await extraerCodigoDeRespuesta(res) };
    url = URL.createObjectURL(await res.blob());
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `importacion-${importacionId}-errores.csv`;  // nombre del CLIENTE, nunca del header
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    return { ok: true };
  } catch {
    return { ok: false };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
```

```ts
// apps/frontend/src/importacion/validar-archivo-padron.ts — D6. Espeja `filtroArchivoPadron`.
// Extensión REAL (no primer match): `padron.xlsx.xlsm` se evalúa por `.xlsm`. Sin pareo de MIME.
export function validarArchivoPadron(archivo: File): string | null;   // null ⇒ válido

// apps/frontend/src/importacion/ImportacionExcelPage.tsx — D5.
type EstadoImportacion =
  | { fase: 'inactivo' }
  | { fase: 'enviando' }
  | { fase: 'resultado'; datos: ResultadoImportacionDto }
  | { fase: 'error'; mensaje: string };
// El `File` seleccionado vive APARTE y sobrevive a `resultado` (reintento sin recargar).
// El error de descarga vive APARTE también: no pisa la fase `resultado` (Secuencia 2).

// Piezas presentacionales puras (D8/D10): sin fetch, sin useSesion(), sin estado propio.
interface ResumenImportacionProps       { resultado: ResultadoImportacionDto }
interface TablaErroresImportacionProps  { errores: ErrorFilaDto[] }
```

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit — datos (Vitest, sin render) | Round-trip de `importacion-excel`; `/importacion-excel/x`, `/importacion-excel/algo/mas` y `/importacion-excel/..` ⇒ `no-encontrada`. Item navegable para `administrador`/`director` y ausente para `comite`/`docente`/`estudiante`; invariantes de `#25`–`#30` intactas. `mensajeDeError`: los cinco códigos + fallbacks `403`/`404`/genérico. `validarArchivoPadron`: `.xlsx`/`.csv` válidos; `.xlsm`, `.xls`, `.pdf`, sin extensión ⇒ rechazo; `padron.xlsx.xlsm` ⇒ rechazo; 0 bytes; 5 MB exactos vs. 5 MB + 1 byte | `rutas.spec.ts`, `menu-por-rol.spec.ts`, `mensajes-error.spec.ts`, `validar-archivo-padron.spec.ts` |
| Unit — cliente API (Vitest, `fetch` mockeado) | `importarPadron`: path correcto, cuerpo `FormData` con la clave **`archivo`**, **sin** `Content-Type` manual, `ok:true` con `201`, `ok:false` con `status`/`codigo` en `400`. `descargarCsvErrores`: URL con el `importacion_id` codificado; `200` ⇒ `createObjectURL` invocado, `<a download>` con el nombre construido en cliente, `revokeObjectURL` invocado; `404` ⇒ `{ ok:false, status:404, codigo:'REPORTE_NO_ENCONTRADO' }` y **sin** `createObjectURL`; error de red ⇒ `{ ok:false }` sin excepción | `importacion-api.spec.ts` con `vi.stubGlobal('fetch', …)` y `vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })` |
| Componente — página y piezas (Vitest + RTL + jsdom) | `ImportacionExcelPage`: con `comite`/`estudiante`/`docente`/sin sesión ⇒ aviso, **cero llamadas**, cero piezas (D9). `.xlsm` y 6 MB ⇒ alerta y `importarPadron` **no invocada** (D6). Envío ⇒ `role="status"` visible y botón `disabled` mientras está en vuelo. `201` con `filas_invalidas > 0` ⇒ cuatro contadores + una fila por `ErrorFilaDto` + botón de descarga; `filas_invalidas === 0` ⇒ contadores **sin** tabla y **sin** botón. Segundo envío reemplaza el resultado sin recarga ni navegación. `404` de descarga ⇒ alerta de reporte vencido **con el resumen y la tabla aún montados**. `400` del backend ⇒ mensaje legible sin desmontar la pantalla. `TablaErroresImportacion`: cero botones de acción; `valor_recibido` con `<script>` se renderiza como texto | `vi.mock('./importacion-api')` + patrón `proveer()` con `SesionContext` (`Enrutador.spec.tsx`) |
| E2E | — | Ninguno nuevo: `#29` no agrega superficie de backend |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Enrutamiento (cliente) | `/importacion-excel` sin sesión; `/importacion-excel/algo`; `/importacion-excel/../../etc/passwd`; `pushState` con rol `comite`/`estudiante`; forzar el `POST` desde consola | **Applicable** — el change agrega una variante de `Ruta` y una pantalla de escritura | La página se monta dentro de `AuthGuard` > `AppShell` (`#12` D11, sin cambios): la sesión, nunca la URL, decide entre `LoginPage` y la app. `parsearRuta` sigue siendo total y exige `length === 1`. El gate de D9 es allowlist fail-closed y **no emite ninguna llamada** cuando falla. La autorización real es `@Roles('administrador','director')` a nivel de clase, que responde `403` aunque se fuerce el request | Sin sesión ⇒ `LoginPage`; las tres variantes de path ⇒ `no-encontrada`; `comite`, `docente`, `estudiante` y rol ausente ⇒ aviso, cero piezas y cero llamadas |
| Clasificación de archivo activo (subida) | `padron.xlsm` (macros); `payload.xlsm` renombrado a `.xlsx`; `padron.xlsx.xlsm`; archivo de 0 bytes; archivo de 6 MB; archivo de 3000 filas; envío sin archivo; `.csv` con fórmula `=cmd\|…` (CSV injection) | **Applicable** — el change sube un archivo ejecutable-adyacente y descarga un CSV | Doble barrera con el backend como **AUTORIDAD**: el cliente valida extensión real + `0 < size <= 5 MB` en `validarArchivoPadron` (D6) sólo para feedback; `filtroArchivoPadron` (allowlist `/\.(xlsx\|csv)$/i`, **nunca `.xlsm`**), `limits.fileSize` y el tope de 2000 filas de `ImportacionService` rechazan igual del lado servidor. Un `.xlsm` renombrado a `.xlsx` **pasa ambas barreras y es correcto**: `exceljs` lee la hoja como datos, nunca ejecuta macros, y el navegador jamás abre el archivo. La CSV injection es un riesgo del CSV **descargado**, mitigado por el backend (`serializarErroresCsv`, RFC 4180) — el frontend no compone CSV y no re-emite el contenido en el DOM | `validar-archivo-padron.spec.ts` sobre la matriz completa; `ImportacionExcelPage` ⇒ `importarPadron` **no invocada** para `.xlsm`, 0 bytes y 6 MB; `EXTENSION_NO_PERMITIDA`/`LIMITE_FILAS_EXCEDIDO`/`CABECERA_INVALIDA` del backend traducidos por D7 sin romper la pantalla |
| Descarga de archivo y `Content-Disposition` | `filename` malicioso en el header (`../../etc/passwd`, `a";filename="b.exe`, `filename*=UTF-8''…`); blob URL filtrada (leak de memoria/objeto); `404` por TTL vencido tratado como éxito; navegación de nivel superior que descarta el status | **Applicable** — el change introduce la **primera** descarga iniciada por script del frontend (no existe ningún `createObjectURL` previo en `apps/frontend/src`) | El nombre de archivo se **construye en el cliente** a partir del `importacion_id` (D4): el header `Content-Disposition` **nunca se parsea**, así que ningún `filename` del servidor alcanza el disco del usuario. `encodeURIComponent(importacionId)` impide que un id manipulado escape del path. `URL.revokeObjectURL` en `finally` cierra la referencia siempre, incluso en el camino de error. `fetch` + blob (no `window.location`) es lo único que permite leer el `404` y mostrarlo como texto conservando el resultado en pantalla. **Nota de entorno**: `<a download>` + `createObjectURL` es el mecanismo estándar de navegador; sólo fallaría dentro de un embebido/sandbox que bloquee descargas iniciadas por script (`allow-downloads` ausente en un `<iframe sandbox>`), escenario que no aplica a este despliegue (app de página completa detrás de Caddy, ADR-0007) | `importacion-api.spec.ts`: `404` ⇒ sin `createObjectURL` y con `codigo` propagado; `200` ⇒ `download` igual a `importacion-{id}-errores.csv` **ignorando** un `Content-Disposition` con `filename` hostil en el mock; `revokeObjectURL` invocado en éxito y en fallo; `ImportacionExcelPage` ⇒ tras el `404` el resumen y la tabla siguen en el DOM |
| Selección de repositorio Git | — | N/A: el change no ejecuta Git | — | — |
| Estado de commit / de push | — | N/A: sin automatización de commits ni push | — | — |
| Comandos de PR | — | N/A: sin automatización de PR | — | — |

Sin shell, subprocesos ni integración de procesos. No se contradice ningún ADR vigente
(0001-0018): `#29` es cliente de la API REST con contrato OpenAPI (ADR-0004), sin tiempo real
(ADR-0005) y sin tocar la cola de correo (ADR-0012). **No se propone ningún ADR nuevo.**

## Migración / Rollout

Sin migración de datos, sin feature flags y sin regenerar el contrato OpenAPI (no se toca el
backend). Efecto observable en despliegue: el item "Importación Excel" deja de estar deshabilitado
para `administrador`/`director`. Rollback = revertir los commits del change; devolver
`IMPORTACION_EXCEL` a `{ clase: 'proximamente' }` alcanza para desactivar la pantalla sin tocar nada
más.

**Presupuesto de revisión (400 líneas) — el diseño lo excede: se recomiendan PRs encadenados.**
Estimación total ~800-850 líneas autoradas (9 archivos nuevos con su spec + 3 modificados). Corte
sugerido para `sdd-tasks`; cada uno deja la app usable y verificable:

1. **PR1 — Cimientos, ruta y menú** (~180 líneas): `rutas.ts`, `Enrutador.tsx`, `menu-por-rol.ts`
   (+ specs) y `ImportacionExcelPage` con el gate de D9 y estado vacío, **sin fetch**.
2. **PR2 — Barreras puras: validador y mensajes** (~230 líneas): `validar-archivo-padron.ts` (D6) y
   `mensajes-error.ts` (D7) con sus specs. Ambos son funciones puras testeadas sin jsdom.
3. **PR3 — Cliente API y subida** (~260 líneas): `importacion-api.ts` completo (D3/D4) + cableado de
   la máquina de estados y `ResumenImportacion` en la página. Deja la importación funcionando de
   punta a punta sin la tabla de errores.
4. **PR4 — Errores y descarga** (~180 líneas): `TablaErroresImportacion` (D10) y el botón de descarga
   con el manejo del `404` (D4). Cierra el spec.

Son cuatro cortes pese a ser un dominio de dos endpoints: el peso no está en la superficie HTTP sino
en las pruebas de las tres barreras (validación de archivo, mapa total de códigos y descarga por
blob), que son la mayor parte de las líneas.

## Preguntas abiertas

- [ ] **Delta de `menu-navegacion-post-login` ausente**: `proposal.md` declara esa capability como
      modificada, pero `openspec/changes/frontend-importacion-excel/specs/` sólo contiene
      `importacion-excel/` y `minimal-frontend-router/`. D2 es un cambio real sobre `MENU_POR_ROL`
      con escenario propio ("ningún rol distinto de `administrador`/`director` ve el item"). Si el
      delta no se agrega antes de archivar, ese requisito no queda registrado en el spec principal.
      **No bloquea el diseño ni `sdd-tasks`.**
- [ ] Confirmar en `apply` que `openapi-fetch` envía el `FormData` con la clave `archivo` (la que
      espera `FileInterceptor('archivo')`) y sin `Content-Type` manual — verificado por lectura del
      paquete instalado y por los dos precedentes (`subirPlanTrabajo`, `subirLogo`), falta la
      verificación en ejecución.
- [ ] Candidato a backlog para `#9` (fuera de scope): el `POST` devuelve `errores` **inline** y el
      mismo detalle queda en Redis; con 2000 filas casi todas inválidas la respuesta JSON puede
      crecer bastante. El delta prohíbe paginar en el cliente, así que el tope real lo pone el
      backend, no esta pantalla.
- [ ] Candidato a backlog: no existe descarga de una plantilla vacía del padrón (`Out of Scope` del
      proposal). El usuario debe conocer la cabecera exacta que valida `validarCabecera`; hoy sólo
      la descubre por el `400 CABECERA_INVALIDA`.
