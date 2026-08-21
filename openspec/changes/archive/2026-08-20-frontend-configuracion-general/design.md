# Diseño: frontend-configuracion-general (Backlog #28)

## Enfoque técnico

Frontend puro, sin backend nuevo. Se **extiende** el enrutador hand-rolled (D10/D11 de `#12`) con una
única variante plana `configuracion` y el mapa `MENU_POR_ROL` de `#25` con el placeholder
`configuracion` pasando a `navegable`; ninguna de esas decisiones se reabre. La página es un
contenedor único con tres secciones hermanas (datos institucionales, logo, comité), sin pestañas ni
sub-rutas, porque el recurso es un singleton. Se reutilizan sin tocarlas las piezas de `#26`
(`FormularioGenerico`, `TablaGenerica` de `apps/frontend/src/comun/piezas/`) y el precedente de
subida de `#12` (`candidatos/piezas/CampoArchivo.tsx`, `aFormData` de `candidatos-api.ts`). Se agrega
**una** pieza nueva, `configuracion/piezas/CampoDominios.tsx`, porque ninguna pieza vigente maneja un
campo de tipo arreglo (D4).

Verificado contra el código real antes de fijar contratos, con **tres hallazgos que el spec no
anticipaba**: (1) `ConfiguracionRespuestaDto` **no devuelve `smtp_host`/`smtp_puerto`/
`smtp_remitente`** — son escritura pura (D5); (2) `smtp_puerto` es `Int?` en `schema.prisma` y **el
proyecto no tiene `ValidationPipe`**, así que un `"8025"` string llega crudo a Prisma y revienta en
`500` — la coerción es responsabilidad del cliente (D5); (3) las cuatro operaciones declaran
`requestBody?: never` en `packages/contracts/src/generated/api.d.ts`, mismo caso que candidatos y
académica (D3).

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Estructura de ruta | **Una variante plana sin parámetros**: `{ nombre: 'configuracion' }` ⇒ `/configuracion`, reconocida sólo con `partes.length === 1`; todo `/configuracion/...` cae en `no-encontrada`. Un `case 'configuracion'` en `Enrutador.tsx` | `/configuracion/logo` y `/configuracion/comite` como sub-rutas; pestañas con estado en la URL; deep-link por sección | El delta `minimal-frontend-router` lo exige literalmente ("MUST NOT requerir sub-rutas ni estado de navegación interna por pestañas"). Tres endpoints sobre **una sola fila** (`clave='institucional'`): no hay entidad seleccionable que justifique un segmento. Round-trip exacto `parsearRuta(rutaAPath(r)) === r`, precedente literal de `academica` (`#26` D1) y `usuarios` (`#27` D1) |
| D2 | Menú por rol | `CONFIGURACION` pasa de `{ clase: 'proximamente' }` a `{ clase: 'navegable', ruta: { nombre: 'configuracion' } }`. **Cero cambios en las filas** de `MENU_POR_ROL`: ya figura sólo en `administrador`/`director` | Agregarlo a `comite` en modo lectura; item por sección (logo/comité) | `MENU_POR_ROL` espeja los `@Roles` reales (D3 de `#25`): `ConfiguracionController` es `@Roles('administrador','director')` **a nivel de clase**, así que `comite` recibe `403` en las cuatro rutas — no existe ningún estado de lectura alcanzable para ese rol |
| D3 | Cliente `configuracion-api.ts` | Módulo nuevo con `ResultadoApi<T>`/`resolver` copiados de `candidatos-api.ts`, **incluidas las dos lecturas**. Cuatro funciones + un helper de URL (ver "Interfaces"). Respuestas desde el contrato generado (`ConfiguracionRespuestaDto`, `LogoRespuestaDto`, `UsuarioRespuestaDto`); entrada `ActualizarConfiguracionInput` espejada a mano + `as never` en `body` | Lecturas crudas `{ data, response }` como `#26` D6; colgar el comité de `usuarios-api.ts`; usar el DTO generado como tipo de entrada | Desvío explícito de `#26` D6 en las lecturas, mismo criterio que `#27` D5: `GET /configuracion/comite` **vacío** y `GET /configuracion` **fallido** deben distinguirse (el spec pide "estado vacío legible, sin error" para lo primero y el formulario no puede montarse con valores basura en lo segundo). El comité vive acá y no en `usuarios-api.ts` porque el endpoint es `/configuracion/comite` y su gate de rol es el de configuración, no el de `UsersController`. `requestBody?: never` verificado en las cuatro operaciones ⇒ `as never` obligatorio, igual que en `candidatos-api.ts` |
| D4 | **`dominios_google` (campo de arreglo)** | **Pieza nueva `configuracion/piezas/CampoDominios.tsx`, controlada y hermana del `FormularioGenerico`, no dentro de él.** `FormularioGenerico` se usa **sin modificar** para los 8 campos string; `CampoDominios` recibe `{ valor: string[]; onCambiar; deshabilitado }` y su estado vive en `PanelDatosInstitucionales`. Sus botones "Agregar"/"Quitar" sólo mutan estado local (`type="button"`, fuera del `<form>`): **el único disparador del `PUT` sigue siendo "Guardar cambios" del formulario**, que compone `{ ...camposModificados, ...(dominiosCambiaron ? { dominios_google } : {}) }` | (a) extender `FormularioGenerico` con `tipo: 'lista'`; (b) campo de texto con dominios separados por comas y `split()` en el contenedor; (c) un `<form>` propio con su propio botón "Guardar dominios" | (a) obligaría a cambiar el state y la firma `onEnviar(valores: Record<string,string>)` a `Record<string, string \| string[]>`, rompiendo los **cinco** consumidores vigentes de `#26`/`#27` para servir a un único campo de un único dominio: máximo riesgo de regresión ajena, mínimo beneficio. (b) no distingue `""` (no tocado) de `[]` (fail-closed explícito, requisito duro del spec) ni de `[""]`, y el spec pide **alta y baja de elementos**, no un blob de texto. (c) partiría en dos un `PUT` que el backend resuelve en una sola transacción auditada, y dejaría al usuario con dos botones "Guardar" en la misma sección. La pieza vive en `configuracion/piezas/` y no en `comun/piezas/` porque tiene **un** consumidor — mismo criterio que `CampoArchivo` en `candidatos/piezas/` |
| D5 | Merge parcial, SMTP y `smtp_puerto` | El contenedor **diffea contra los valores iniciales**: sólo entran al body las claves cuyo `valores[k] !== iniciales[k]`. Los tres campos SMTP se renderizan **vacíos** (el backend no los devuelve) con nota explicativa "dejar en blanco no modifica el valor guardado"; al ser `'' === ''` nunca viajan si no se tocan. `smtp_puerto` se convierte con `Number()` y se descarta si no es entero positivo, mostrando error de campo **sin llamar al backend** | Enviar siempre las 9 claves; usar `PUT` como reemplazo total; mandar `smtp_puerto` como string tal cual sale de `FormularioGenerico` | El spec exige "enviar únicamente los campos modificados". `FormularioGenerico` siempre entrega **todas** las claves como `string`, así que el diff es responsabilidad del contenedor (mismo criterio que `#27` D10 con `correo: '' \|\| undefined`). SMTP: `ConfiguracionRespuestaDto` (backend y contrato generado) **no expone** `smtp_*` — verificado campo por campo; el diff contra `''` convierte esa carencia en la semántica correcta (no tocar) en vez de en un borrado accidental. `smtp_puerto` es `Int?` en Prisma y **no hay `ValidationPipe`** en el proyecto: un string llegaría a `tx.configuracion.update` y saldría como `500`, no como `4xx` legible — la coerción cliente no es cosmética |
| D6 | Precarga asíncrona y refresco | `ConfiguracionPage` **no monta los paneles hasta que `GET /configuracion` resuelve** (`cargando` ⇒ `<p role="status">`), porque `FormularioGenerico` inicializa su estado **una sola vez** con `useState(() => …)` y nunca re-lee `valoresIniciales`. Tras un `PUT` **exitoso** se incrementa `version` y se pasa `key={version}` al formulario para forzar remount con los valores devueltos por el backend. Tras un `PUT` **fallido** `version` no cambia | `useEffect` que sincronice `valoresIniciales` dentro de `FormularioGenerico`; montar el formulario vacío y rellenarlo después; recargar la página | Verificado en `FormularioGenerico.tsx`: el inicializador de `useState` corre sólo en el mount. Tocar la pieza para agregar sincronización afectaría a los cinco consumidores de `#26`/`#27` (D4, mismo argumento). `key` en el consumidor resuelve el caso sin tocar nada compartido y satisface los dos escenarios opuestos del spec: "el formulario refleja los valores devueltos por el backend" (éxito ⇒ remount) y "los valores ingresados permanecen, sin recargar" (error 4xx ⇒ sin remount) |
| D7 | Errores del backend en la UI | `configuracion/mensajes-error.ts`: `Record<CodigoConfiguracion, string>` **total** sobre los seis códigos de `apps/backend/src/configuracion/configuracion.errors.ts`, más `mensajeDeError({ codigo, campo, status })`. `CAMPO_INVALIDO` interpola `campo` (`color_primario`, `zona_horaria`, `dominios_google`) | Reutilizar `usuarios/mensajes-error.ts`; un mensaje genérico para todo 4xx | Verificado: los `BadRequestException` de este módulo son `{ codigo, campo, motivo }` (los tres validadores) o `{ codigo }` pelado (los cuatro del logo). Mapa propio y no compartido porque los catálogos de código son locales a su módulo backend (decisión de `#7`); `Record` total ⇒ agregar un código rompe la compilación en vez de degradar en silencio (misma disciplina que `#26` D7 y `#27` D7) |
| D8 | Panel de logo | `PanelLogo` usa `CampoArchivo` (**sin tocarlo**) con `aceptar="image/png,image/jpeg,image/svg+xml"` + un botón "Subir logo" propio. Validación cliente en un **helper puro** `validarArchivoLogo(archivo): string \| null` que espeja `filtroArchivoLogo` del backend (extensión `.png/.jpg/.jpeg/.svg`, MIME pareado con la extensión, `size <= 2*1024*1024`); si devuelve mensaje, `<p role="alert">` y **cero requests**. Vista previa `<img src={urlLogo(version)}>` **sólo si `logo_presente`**; tras `200`, `version = logo_actualizado_en` (cache-bust) | Validar dentro de `CampoArchivo`; confiar sólo en `accept`; renderizar el `<img>` siempre; subir en el mismo `PUT` que los datos | El spec exige rechazo cliente "sin invocar `POST /configuracion/logo`" para >2 MB y para `.pdf`; `accept` es sólo un hint del selector de archivos, no una validación (un drag & drop o un rename lo saltea). El helper es **puro y testeable sin jsdom**. `CampoArchivo` es presentacional puro y lo usan `FormularioCandidato`/`FormularioLista`: meterle política de tamaño/MIME de un dominio ajeno lo volvería no reutilizable. `GET /configuracion/logo` responde `404` sin logo ⇒ un `<img>` incondicional mostraría el ícono roto; `logo_presente` ya viene en el `GET` del singleton. El logo es multipart y los datos son JSON: son dos requests por definición del backend |
| D9 | Lista de comité | `TablaGenerica` **sin pasar `acciones`** (no `acciones={[]}`: se omite la prop, y su default `[]` hace que la columna "Acciones" ni se renderice). Columnas `nombres`, `dni`, `codigo`, `correo`, `estado`. `mensajeVacio="No hay integrantes del comité registrados."` | `acciones={[]}` explícito; botones `disabled`; un enlace "Editar en Usuarios"; pieza propia | El spec exige "sin controles de escritura" y "estado vacío legible, sin error": `TablaGenerica` ya cubre ambos (`filas.length === 0` ⇒ `<p>{mensajeVacio}</p>`) sin una línea nueva. Omitir la prop hace el intent verificable por lectura: no hay ninguna `AccionFila` declarada en todo el módulo. Un enlace a `/usuarios` sería un destino `403` para nadie, pero acopla dos dominios que `#27` separó a propósito |
| D10 | Gate de rol | **Un único gate binario allowlist**, derivado una sola vez en `ConfiguracionPage`: `const puedeGestionar = rol === 'administrador' \|\| rol === 'director'`. Si es falso: aviso `role="status"`, **cero llamadas a la API** y cero paneles montados. Los tres paneles son ciegos al rol | `soloLectura` graduado (`#26` D8); denylist `rol !== 'comite'`; `disabled` en vez de ocultar; leer `useSesion()` dentro de los paneles | Mismo criterio que `#27` D4 y por la misma razón, acá aún más nítida: `ConfiguracionController` gatea **a nivel de clase**, así que no existe ninguna de sus cuatro rutas accesible a `comite` — montar la página en modo lectura garantizaría cuatro `403` y un error permanente. Un solo gate (y no dos como `#27`) porque las tres secciones comparten exactamente el mismo conjunto de roles. Allowlist: un rol futuro o `estado !== 'autenticado'` cae del lado cerrado |
| D11 | Qué se prueba y cómo | Dato puro (Vitest sin render): round-trip de `configuracion` en `rutas.spec.ts`, item navegable en `menu-por-rol.spec.ts`, `mensajeDeError` sobre los seis códigos, `validarArchivoLogo` sobre la matriz tipo × tamaño. Render (Vitest + RTL + jsdom): `ConfiguracionPage` y los tres paneles con `vi.mock('./configuracion-api')` y el patrón `proveer()` con `SesionContext` de `Enrutador.spec.tsx`. Sin e2e nuevos | Snapshots; e2e con navegador; probar las piezas de `comun/` (ya cubiertas por `#26`) | Extiende `#25` D8 / `#26` D12 / `#27` D13: lo que es dato se prueba como dato (exhaustivo, sin jsdom, inmune a mover un `className`). `validarArchivoLogo` como función pura es lo que hace verificable el requisito "sin invocar el backend" sin depender del render. `#28` no agrega superficie de backend ⇒ sin e2e |

## Flujo de datos

```
MENU_POR_ROL[administrador|director] ── item 'configuracion' (navegable, D2)
                    │ navegar({ nombre: 'configuracion' })
Enrutador ──────────┴─ case 'configuracion' ──────────→ ConfiguracionPage

ConfiguracionPage (contenedor único)
  useSesion() ⇒ rol ⇒ puedeGestionar = rol ∈ {administrador, director}         (D10)
    ├─ !puedeGestionar → <p role="status"> y CERO fetch
    └─  puedeGestionar → obtenerConfiguracion() ‖ listarComite()               (D3)
          │  (paneles NO montados hasta que resuelve el singleton, D6)
          ├─ PanelDatosInstitucionales  { config, onGuardado }
          │     ├─ CampoDominios  { valor: string[], onCambiar }              (D4, pieza nueva)
          │     └─ FormularioGenerico key={version} (8 campos string, D6)
          │           onEnviar(valores) ⇒ diff vs. iniciales + dominios       (D5)
          │                             ⇒ actualizarConfiguracion(body)
          ├─ PanelLogo { logoPresente, logoMime, onSubido }                   (D8)
          └─ PanelComite { integrantes }  → TablaGenerica sin acciones        (D9)

Escritura y error (las 4 funciones ⇒ ResultadoApi):
  ok  → version++ ⇒ remount del formulario con los valores del backend        (D6)
 !ok  → mensajeDeError({ codigo, campo, status }) → <p role="alert">          (D7)
        p. ej. 400 CAMPO_INVALIDO + campo 'color_primario'
               ⇒ "El campo color_primario no es válido."   (sin remount, D6)
```

Secuencia de la subida de logo (flujo con doble barrera, D8):

```
admin      PanelLogo      CampoArchivo   validarArchivoLogo   configuracion-api   ConfiguracionController
  │            │               │                 │                    │                     │
  │ elige archivo ────────────>│─ onCambiar(File) ─────────────────────>│ (estado local)     │
  │ click "Subir logo"         │                 │                    │                     │
  │───────────>│──────────────────────────────> validar(File)         │                     │
  │            │<── "El archivo supera los 2 MB" ─┤                    │                     │
  │            │  <p role="alert">  ✗ NINGÚN request                   │                     │
  │            │                                                       │                     │
  │            │─────────── válido ⇒ subirLogo(File) ─────────────────>│                     │
  │            │                       aFormData({ logo: File })       │── POST /configuracion/logo (multipart) ──>│
  │            │                                                       │   filtroArchivoLogo + limits (autoridad)  │
  │            │<─────── ResultadoApi<LogoRespuestaDto> ───────────────│<────────── 200 { logo_mime, ... } ────────│
  │            │  version = logo_actualizado_en ⇒ <img src={urlLogo(version)}>  (cache-bust, D8)
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/frontend/src/app/rutas.ts` (+ `.spec.ts`) | Modify | D1: variante `configuracion` en la unión, `parsearRuta` y `rutaAPath` |
| `apps/frontend/src/app/Enrutador.tsx` (+ `.spec.tsx`) | Modify | D1: `case 'configuracion'` ⇒ `ConfiguracionPage` |
| `apps/frontend/src/app/menu-por-rol.ts` (+ `.spec.ts`) | Modify | D2: `CONFIGURACION` ⇒ `navegable`; invariantes de `#25`/`#26`/`#27` intactas |
| `apps/frontend/src/configuracion/configuracion-api.ts` (+ `.spec.ts`) | Create | D3: 4 funciones con `ResultadoApi` + `urlLogo` |
| `apps/frontend/src/configuracion/mensajes-error.ts` (+ `.spec.ts`) | Create | D7: `Record` total sobre `CONFIGURACION_ERROR_CODES` |
| `apps/frontend/src/configuracion/ConfiguracionPage.tsx` (+ `.spec.tsx`) | Create | D6/D10: gate, carga del singleton y del comité, montaje de los tres paneles |
| `apps/frontend/src/configuracion/piezas/CampoDominios.tsx` (+ `.spec.tsx`) | Create | D4: alta/baja de dominios, arreglo vacío explícito |
| `apps/frontend/src/configuracion/paneles/PanelDatosInstitucionales.tsx` (+ `.spec.tsx`) | Create | D4/D5/D6: `FormularioGenerico` + diff de merge parcial + `smtp_puerto` numérico |
| `apps/frontend/src/configuracion/validar-logo.ts` (+ `.spec.ts`) | Create | D8: helper puro de MIME/extensión/tamaño |
| `apps/frontend/src/configuracion/paneles/PanelLogo.tsx` (+ `.spec.tsx`) | Create | D8: `CampoArchivo` + subida + vista previa con cache-bust |
| `apps/frontend/src/configuracion/paneles/PanelComite.tsx` (+ `.spec.tsx`) | Create | D9: `TablaGenerica` sin acciones |
| `apps/frontend/src/comun/piezas/*`, `candidatos/piezas/CampoArchivo.tsx` | None | Reutilizadas sin cambios (D4/D6/D8/D9) |
| Backend, `packages/contracts` | None | Sin endpoints, DTOs ni regeneración de contrato |

## Interfaces / Contratos

```ts
// apps/frontend/src/configuracion/configuracion-api.ts — D3.
// `resolver`/`ResultadoApi` copiados de candidatos-api.ts; `aFormData` replicado local (D8).
export type ConfiguracionRespuestaDto = components['schemas']['ConfiguracionRespuestaDto'];
export type LogoRespuestaDto          = components['schemas']['LogoRespuestaDto'];
export type UsuarioRespuestaDto       = components['schemas']['UsuarioRespuestaDto'];

// Espejado a mano de `actualizar-configuracion.dto.ts` (contrato: `requestBody?: never`).
// `smtp_puerto` es `number`, NO `string` (Prisma `Int?` + sin ValidationPipe — D5).
export interface ActualizarConfiguracionInput {
  nombre?: string; director?: string;
  color_primario?: string; color_secundario?: string; zona_horaria?: string;
  dominios_google?: string[];                       // `[]` es un valor válido, no "ausente"
  smtp_host?: string; smtp_puerto?: number; smtp_remitente?: string;
}
// `configuracion.errors.ts`, copiado literal (los 6 códigos).
export type CodigoConfiguracion =
  | 'CAMPO_INVALIDO' | 'LOGO_FORMATO_NO_PERMITIDO' | 'LOGO_TAMANIO_EXCEDIDO'
  | 'LOGO_VACIO'     | 'LOGO_REQUERIDO'            | 'LOGO_NO_ENCONTRADO';

obtenerConfiguracion(signal?)              // ⇒ ResultadoApi<ConfiguracionRespuestaDto>
actualizarConfiguracion(input)             // ⇒ ResultadoApi<ConfiguracionRespuestaDto>   (body as never)
listarComite(signal?)                      // ⇒ ResultadoApi<UsuarioRespuestaDto[]>
subirLogo(archivo: File)                   // ⇒ ResultadoApi<LogoRespuestaDto>  (FormData 'logo')
urlLogo(version?: string): string          // `<img src>`, cache-bust; espeja `urlFoto` de #12
```

```ts
// apps/frontend/src/configuracion/piezas/CampoDominios.tsx — D4. Presentacional puro y controlado:
// sin fetch, sin `useSesion()`, sin submit propio. El arreglo vive en PanelDatosInstitucionales.
interface CampoDominiosProps {
  valor: string[];
  onCambiar: (dominios: string[]) => void;
  deshabilitado?: boolean;
}
// Guarda mínima local: ignora vacío tras `trim()` y duplicados (`toLowerCase()`, igual que
// `normalizarYValidarDominiosGoogle`). El formato lo valida el backend (D7 traduce el 400).

// apps/frontend/src/configuracion/validar-logo.ts — D8. Espeja `filtroArchivoLogo` del backend.
export function validarArchivoLogo(archivo: File): string | null;  // null ⇒ válido
```

```ts
// PanelDatosInstitucionales — D5. Diff de merge parcial; `FormularioGenerico` entrega TODAS las
// claves como string, así que descartar lo no modificado es responsabilidad del contenedor.
const body: ActualizarConfiguracionInput = {};
for (const clave of CLAVES_TEXTO) {                    // nombre, director, colores, zona, smtp_*
  if (valores[clave] !== iniciales[clave]) body[clave] = valores[clave];
}
if (!arraysIguales(dominios, config.dominios_google)) body.dominios_google = dominios;  // [] incluido
```

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit — datos (Vitest, sin render) | Round-trip de `configuracion`; `/configuracion/logo`, `/configuracion/x` y `/configuracion/..` ⇒ `no-encontrada`. Item navegable para `administrador`/`director` y ausente para los otros tres; invariantes de `#25`/`#26`/`#27` intactas. `mensajeDeError`: los seis códigos, `CAMPO_INVALIDO` con y sin `campo`, fallbacks `403`/`404`/genérico. `validarArchivoLogo`: PNG/JPG/SVG válidos, `.pdf`, `.png` con MIME `application/pdf`, 2 MB exactos vs. 2 MB + 1 byte, 0 bytes | `rutas.spec.ts`, `menu-por-rol.spec.ts`, `mensajes-error.spec.ts`, `validar-logo.spec.ts` |
| Unit — cliente API (Vitest) | Las 4 funciones: path y body correctos, `ok: true` con 2xx, `ok: false` con `status`/`codigo` en 4xx. `subirLogo` manda `FormData` con la clave `logo` y **sin** `Content-Type` manual. `urlLogo` incluye el parámetro de versión | `configuracion-api.spec.ts`, `fetch` mockeado |
| Componente — página y paneles (Vitest + RTL + jsdom) | `ConfiguracionPage`: con `comite`/`estudiante`/sin sesión ⇒ aviso, **cero llamadas** y cero paneles (D10); no monta paneles hasta que resuelve el `GET` (D6). `PanelDatosInstitucionales`: editar sólo `nombre` ⇒ body con **una** clave (D5); SMTP no tocado no viaja; `smtp_puerto` no numérico ⇒ error sin request; **ningún campo de contraseña SMTP** en el DOM; éxito ⇒ el formulario refleja lo devuelto; 4xx ⇒ el error se muestra y los valores ingresados sobreviven. `CampoDominios`: agregar, quitar el último ⇒ `dominios_google: []` explícito en el `PUT`; duplicado ignorado. `PanelLogo`: `.pdf` y 3 MB ⇒ alerta y `subirLogo` **no invocada**; éxito ⇒ `src` del `<img>` cambia; `logo_presente: false` ⇒ sin `<img>`. `PanelComite`: cero botones de acción; lista vacía ⇒ mensaje, sin error | `vi.mock('./configuracion-api')` + patrón `proveer()` con `SesionContext` (`Enrutador.spec.tsx`) |
| E2E | — | Ninguno nuevo: `#28` no agrega superficie de backend |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Enrutamiento (cliente) | `/configuracion` sin sesión; `/configuracion/logo`; `/configuracion/../../etc/passwd`; `pushState` a `/configuracion` con rol `comite`/`estudiante`; forzar el `PUT` desde consola | **Applicable** — el change agrega una variante de `Ruta` y una pantalla de escritura | La página se monta dentro de `AuthGuard` > `AppShell` (D11 de `#12`, sin cambios): la sesión, nunca la URL, decide entre `LoginPage` y la app. `parsearRuta` sigue siendo total y exige `length === 1`. El gate de D10 es allowlist fail-closed y **no emite ninguna llamada** cuando falla. La autorización real sigue siendo `@Roles('administrador','director')` a nivel de clase, que responde `403` aunque se fuerce el botón | Sin sesión ⇒ `LoginPage`; `/configuracion/logo`, `/configuracion/x`, `/configuracion/..` ⇒ `no-encontrada`; `comite`, `docente`, `estudiante` y rol ausente ⇒ aviso, cero paneles y cero llamadas |
| Clasificación de archivo activo | `logo.svg` con `<script>`/`onload`; `payload.pdf` renombrado a `.png`; `logo.png.svg`; archivo de 0 bytes; archivo de 3 MB; submit sin archivo | **Applicable** — el change sube y muestra un archivo servido por el mismo origen | Doble barrera, con el backend como **autoridad**: el cliente valida extensión + MIME pareado + `<= 2 MB` en `validarArchivoLogo` (D8) sólo para feedback inmediato; `filtroArchivoLogo`, `limits.fileSize` y el chequeo de 0 bytes de `ConfiguracionService` ya rechazan todo antes de tocar la DB, y `GET /configuracion/logo` sirve con `X-Content-Type-Options: nosniff` + `Content-Security-Policy: default-src 'none'` — un SVG activo que pasara la allowlist **no ejecuta** en el origen de la app. La UI nunca inyecta el SVG inline: siempre `<img src>` | `validar-logo.spec.ts` sobre la matriz completa; `PanelLogo` ⇒ `subirLogo` no invocada para `.pdf`, 3 MB y 0 bytes; `LOGO_FORMATO_NO_PERMITIDO`/`LOGO_TAMANIO_EXCEDIDO` del backend traducidos por D7; ningún `dangerouslySetInnerHTML` en el módulo |
| Selección de repositorio Git | — | N/A: el change no ejecuta Git | — | — |
| Estado de commit / de push | — | N/A: sin automatización de commits ni push | — | — |
| Comandos de PR | — | N/A: sin automatización de PR | — | — |

Sin shell, subprocesos ni integración de procesos.

## Migración / Rollout

Sin migración de datos, sin feature flags y sin regenerar el contrato OpenAPI (no se toca el backend).
Efecto observable en despliegue: el item "Configuración" deja de estar deshabilitado para
`administrador`/`director`. Rollback = revertir los commits del change; devolver `CONFIGURACION` a
`{ clase: 'proximamente' }` alcanza para desactivar la sección sin tocar nada más.

**Corte de PR sugerido para `sdd-tasks`** (cada corte deja la app usable; mismo criterio que
`#26`/`#27`, adelantando los cimientos):

1. **PR1 — Cimientos y ruta** (~150 líneas): `rutas`/`Enrutador`/`menu-por-rol` (+ specs) y
   `ConfiguracionPage` con el gate de D10 y estado vacío, sin fetch.
2. **PR2 — Cliente API y mapa de errores** (~355 líneas): `configuracion-api.ts` (D3) y
   `mensajes-error.ts` (D7), con sus specs.
3. **PR3 — Datos institucionales** (~430 líneas, **el corte riesgoso**): `CampoDominios` (D4),
   `PanelDatosInstitucionales` con el diff de merge parcial y `smtp_puerto` (D5), cableado en la
   página (D6). Si el forecast supera el presupuesto de 400 líneas, dividir en **3a** (`CampoDominios`
   aislado, ~160) y **3b** (`PanelDatosInstitucionales`, ~270) — la pieza es autónoma y testeable sola.
4. **PR4 — Logo y comité** (~360 líneas): `validar-logo.ts` + `PanelLogo` (D8) y `PanelComite` (D9).

Son **cuatro** cortes y no dos o tres pese a ser el dominio más chico: el peso no está en la cantidad
de endpoints (cuatro) sino en las pruebas de las tres barreras nuevas (diff de merge parcial, arreglo
editable y validación de archivo), que son la mayor parte de las líneas.

## Preguntas abiertas

- [ ] **Discrepancia de spec (nueva, bloqueante para el texto del delta)**: el requisito "Formulario
      de edición del singleton institucional" dice que el formulario consume `GET /configuracion`
      para **precargar** valores "cubriendo … los campos SMTP", pero `ConfiguracionRespuestaDto` **no
      devuelve** `smtp_host`/`smtp_puerto`/`smtp_remitente` (verificado en el DTO, el service y
      `api.d.ts`). D5 resuelve la UI (campos vacíos + diff que nunca los pisa), pero el delta debería
      aclarar que los campos SMTP son de escritura sin precarga antes de archivar.
- [ ] **Consecuencia de lo anterior**: con el diff contra `''`, un usuario **no puede borrar** un
      valor SMTP ya guardado desde la UI (dejarlo en blanco = no tocar). Candidato a ítem de backlog
      para `#7`: exponer `smtp_*` en `ConfiguracionRespuestaDto` y ofrecer un "Limpiar" explícito.
- [ ] **`smtp_puerto` sin validación server-side**: `ActualizarConfiguracionDto` no usa
      `class-validator` y el proyecto no tiene `ValidationPipe`, así que un string llega a Prisma
      (`Int?`) y sale como `500`, no como `4xx`. D5 lo cubre del lado cliente, pero la robustez real
      es backend. Candidato a ítem de backlog para `#7`.
- [ ] Confirmar en `apply` que `openapi-fetch` envía el `FormData` de `subirLogo` con la clave `logo`
      (la que espera `FileInterceptor('logo')`) y sin `Content-Type` manual, tal como ya ocurre con
      `subirPlanTrabajo` en `candidatos-api.ts`.
- [ ] Confirmar en `apply` que `GET /configuracion/logo` como `<img src>` adjunta la cookie de sesión
      same-origin (mismo supuesto ya validado por `urlFoto` en `#12`, pero acá la ruta exige rol
      `administrador`/`director`, no sólo sesión).
