# Diseño: frontend-administracion-academica (Backlog #26)

## Enfoque técnico

Frontend puro, sin backend nuevo. Se **extiende** el enrutador hand-rolled (D10/D11 de `#12`) con una
única variante `academica` y el mapa `MENU_POR_ROL` de `#25` cambiando el placeholder homónimo de
`proximamente` a `navegable`; ninguna de esas decisiones se reabre. `academico-api.ts` pasa de 4
lecturas a CRUD completo de las 6 entidades, siguiendo el **precedente literal de
`candidatos-api.ts`** (DTOs de entrada espejados a mano + `as never`, porque los controladores del
módulo `academico` tampoco usan `@ApiBody`/`@ApiParam`/`@ApiQuery` y el contrato generado declara
`requestBody?: never` y `parameters.path?: never` para las 24 operaciones — verificado en
`packages/contracts/src/generated/api.d.ts`). Tres piezas nuevas en `apps/frontend/src/comun/piezas/`
(`TablaGenerica`, `FormularioGenerico`, `DialogoConfirmacion`) se estrenan con seis instancias reales
en este change y quedan disponibles para `#27`/`#28`/`#29`. El patrón container/presentational de
`#12` D13 se mantiene: `AcademicaPage` + un panel contenedor por entidad con los efectos; las piezas
genéricas no hacen fetch, no conocen roles y no tienen estado de dominio.

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Ruta y navegación interna | Una sola variante `{ nombre: 'academica' }` ⇒ `/academica`; `parsearRuta` la reconoce sólo con `partes.length === 1 && partes[0] === 'academica'`, todo `/academica/...` cae en `no-encontrada`. La pestaña activa es `useState<PestanaAcademica>('anios')` **local a `AcademicaPage`**, nunca URL ni contexto | 6 rutas (una por entidad); `{ nombre: 'academica'; pestana?: … }` con deep-link; guardar la pestaña en `sessionStorage` | Confirmado por el usuario en la ronda de preguntas: sin deep-link, se acepta perder la pestaña al recargar. Una variante sin parámetros round-trips exacto en la invariante de `rutas.spec.ts` (`parsearRuta(rutaAPath(r))`), y 6 rutas costarían 18 ediciones mecánicas de enrutamiento (exploración, enfoque 2). Meter `pestana` en la `Ruta` obligaría a que `rutaAPath` y el parser conozcan los 6 literales y a mantener el estado sincronizado en dos lugares — sin beneficio, porque el deep-link está fuera de alcance |
| D2 | Composición de la página | `AcademicaPage` (`academico/AcademicaPage.tsx`) resuelve rol + pestaña y renderiza **sólo** el panel activo; un panel contenedor por entidad en `academico/paneles/Panel{AniosEscolares,Niveles,Grados,Secciones,Aulas,Matriculas}.tsx`, cada uno con sus propios efectos, filtros y `soloLectura: boolean` por props. Lista de pestañas como dato: `const PESTANAS: readonly { id: PestanaAcademica; etiqueta: string }[]` en `academico/pestanas.ts`, fuente única de la barra y del `switch` | Un solo componente con los 6 listados; paneles montados siempre y ocultos con CSS; un contexto de dominio compartido | Montar sólo el panel activo hace que su estado de filtros muera al cambiar de pestaña: no hay filtro fantasma que limpiar a mano ni fetch de las otras 5 entidades al abrir la página. Un panel por archivo mantiene cada contenedor del tamaño de `GestionCandidatosPage` en vez de producir un archivo de 600 líneas (riesgo "página grande" de la propuesta). `PESTANAS` como dato replica el criterio de `MENU_POR_ROL` (D2 de `#25`): se prueba como dato, no como render |
| D3 | `TablaGenerica<T>` | Props: `filas`, `columnas: ColumnaTabla<T>[]` (`{ clave, encabezado, celda: (fila) => ReactNode }`), `claveFila: (fila) => string`, `acciones?: AccionFila<T>[]` (`{ id, etiqueta, onEjecutar, tono?, visible? }`), `mensajeVacio`. `<table>` real con `<thead>`. Sin ordenamiento, sin paginación, sin selección, sin fetch, sin roles | Columnas como `keyof T` con formateo interno; render-prop única `renderFila`; heredar el `<ul>/<li>` de `TablaCandidatos`; agregar `orden`/`paginacion`/`seleccion` desde ya | `celda` como función es lo mínimo que resuelve los tres casos reales que existen: campo plano (`nombre`), enum (`turno`) y FK que hay que resolver contra otra lista ya cargada (`nivel_id` ⇒ nombre del nivel). `keyof T` no puede resolver FKs y obligaría a un mapa de formateadores paralelo. Una `renderFila` única devuelve la tabla a "seis tablas a mano". `<table>` (desvío explícito del `<ul>` de `TablaCandidatos`, que **no** se refactoriza: fuera de alcance) porque estas seis vistas sí tienen encabezados de columna y el elemento los da con semántica gratis. Ordenamiento/paginación/selección no tienen ningún consumidor hoy: agregarlos es exactamente el riesgo "sobre-generalizar sin ver #27/#28/#29" que declara la propuesta |
| D4 | `FormularioGenerico` | Campos declarativos como unión discriminada `CampoFormulario = { clase: 'texto' \| 'seleccion'; nombre; etiqueta; requerido?; opciones? }`; **todos los valores son `string`**: `onEnviar(valores: Record<string, string>)`. Props `modo: 'creacion' \| 'edicion'`, `valoresIniciales?`, `etiquetaEnvio`, `onCancelar?`, `enviando`, `mensajeError?`. Única validación de cliente: `requerido` no vacío tras `trim()` deshabilita el submit | Genéricos por tipo (`FormularioGenerico<T>` con inferencia de campos); soporte de `number`/`boolean`/`File`/fecha; validación por esquema (zod) | Los 6 DTO de escritura del dominio (`CrearAnioEscolarDto`, `CrearNivelDto`, `CrearGradoDto`, `CrearSeccionDto`, `CrearAulaDto`, `CrearMatriculaDto` y sus `Actualizar*`) tienen **exclusivamente** campos `string`: nombres, UUIDs de FK y el enum `turno` — verificado uno por uno. Un formulario tipado por `T` obligaría a mapear/parsear en cada instancia sin ningún campo no-string que lo justifique. `modo` y el contrato "estado local + `onEnviar` con los valores finales" replican `FormularioCandidato`/`FormularioCredenciales`. La validación de negocio ya vive en los servicios del backend (sin `class-validator`), duplicarla en el cliente crearía dos fuentes de verdad |
| D5 | Diálogo de confirmación | Pieza nueva `comun/piezas/DialogoConfirmacion.tsx`: `role="dialog"` + `aria-label`, inline (sin portal ni overlay), props `titulo`, `descripcion`, `etiquetaConfirmar`, `onConfirmar`, `onCancelar`, `procesando` | Reutilizar `auth/DialogoVinculacion`; `window.confirm`; `<dialog>` nativo con backdrop | `DialogoVinculacion` es específico de auth (pide una contraseña y la devuelve): se reutiliza su **forma** —`role="dialog"` inline con dos botones, sin portal— no el componente. Tiene tres consumidores reales en este change (activar año, eliminar cualquier entidad, trasladar matrícula), así que no es una pieza especulativa. `window.confirm` no es testeable con RTL ni estilable con los tokens de `#24`; `<dialog>` + backdrop introduce foco modal y `::backdrop`, superficie que ninguna pantalla vigente tiene |
| D6 | Expansión de `academico-api.ts` | Las 4 lecturas vigentes **no se tocan** (siguen devolviendo `{ data, response }` crudo con `signal`); `listarSecciones`/`listarMatriculas` se suman con esa misma forma. Las 15 escrituras nuevas devuelven `ResultadoApi<T> = { ok, data?, status?, codigo?, relacion? }` vía `resolver`/`resolverVacio` copiados de `candidatos-api.ts`. Inputs espejados a mano (`CrearGradoInput`, …) y `as never` en `body`/`params` | Migrar todo a `ResultadoApi`; devolver el resultado crudo también en las escrituras; agregar `@ApiBody`/`@ApiParam` en el backend y regenerar el contrato | Migrar las 4 lecturas obliga a reescribir `procesos/useOpcionesSegmentacion.ts` (3 consumidores en la ruta crítica del asistente), que está fuera de alcance. El envelope existe sólo para discriminar `codigo` en 4xx, y ningún `GET` de este módulo produce un código de negocio: los paneles tratan cualquier fallo de lectura igual ("no se pudo cargar"). Tocar los controladores es cambio de backend, explícitamente fuera de alcance en la propuesta |
| D7 | Errores del backend en la UI | Mapa código→texto en `academico/mensajes-error.ts`: `Record<CodigoAcademico, string>` **total** sobre los 7 códigos de `academico.errors.ts`, más `mensajeDeError({ codigo, relacion, status })` con fallback genérico por status. `ENTIDAD_CON_DEPENDIENTES` interpola `relacion` cuando el backend la manda: "No se puede eliminar: todavía tiene Grado asociados"; sin `relacion`, "…tiene elementos relacionados" | Un único mensaje genérico para todo 409; mostrar el `codigo` crudo; traducir en cada panel | El backend ya devuelve `{ codigo, entidad, relacion }` en el 409 (`niveles.service.ts` y sus cinco pares), así que el mensaje preciso está disponible sin trabajo extra. `Record` total hace que agregar un código en `academico.errors.ts` rompa la compilación en vez de degradar a texto genérico (misma disciplina que `MENU_POR_ROL`). Es un dato puro ⇒ se prueba sin render (D12) |
| D8 | UX defensiva de `comite` | `AcademicaPage` calcula `const soloLectura = rol !== 'administrador' && rol !== 'director'` (allowlist, no `rol === 'comite'`) y lo pasa a los 6 paneles; cada panel construye `const acciones = soloLectura ? [] : [...]` y omite el botón "Nuevo". `TablaGenerica` no renderiza la columna de acciones con `acciones` vacío | `rol === 'comite'` como condición; que `TablaGenerica`/`FormularioGenerico` lean `useSesion()`; `disabled` en vez de ocultar | Allowlist = fail-closed: un rol futuro, o `estado !== 'autenticado'`, cae en sólo lectura igual que en el backend, donde la escritura es `@Roles('administrador','director')` a nivel de clase (denylist `=== 'comite'` fallaría abierto). Que las piezas genéricas lean la sesión las volvería no reutilizables por `#27`/`#28` y no testeables sin provider; el rol es una decisión de dominio del contenedor. Botones deshabilitados anunciarían acciones que `comite` nunca podrá ejecutar (`disabled` se reserva a los placeholders de menú, D5 de `#25`) |
| D9 | Filtros por pestaña | Cinco pestañas listan **todo** por defecto con filtros **opcionales** server-side (Años y Niveles: sin filtros; Grados: `nivel_id`; Secciones: `grado_id`, `anio_escolar_id`; Aulas: `grado_id`, `seccion_id`, `anio_escolar_id`, `turno`). **Matrículas exige elegir un Aula** antes de listar: sin `aula_id`, estado vacío instructivo y cero llamadas | Drill-down obligatorio en toda la jerarquía (elegir Nivel para ver Grados); filtrado en cliente; listar matrículas sin filtro | Drill-down obligatorio impide la tarea más común ("ver todos los grados") y no lo exige ningún endpoint: los seis `listar` aceptan filtros opcionales. Filtrar en cliente descartaría filtros que el backend ya implementa. `Matricula` es la única tabla proporcional al padrón completo (una fila por estudiante por año) y `MatriculasService.listar()` hace `findMany` **sin `take`** (verificado): sin filtro, la primera pintura descarga miles de filas. Los otros cinco son catálogos de decenas de filas |
| D10 | Traslado de matrícula | Acción "Trasladar" por fila ⇒ `DialogoConfirmacion` que explica los dos pasos ⇒ `FormularioGenerico` con el estudiante fijo y nuevo `aula_id`/`anio_escolar_id`. El contenedor ejecuta **`crearMatricula` primero y `eliminarMatricula(idAnterior)` después**; si el alta falla, no borra nada y muestra el error; si el borrado falla, `role="alert"` persistente indicando que quedaron dos matrículas y cuál eliminar | `DELETE` y después `POST`; llamar a las dos y confiar; ocultar el traslado y obligar a eliminar + crear a mano | El orden importa por `@@unique([usuario_id, aula_id, anio_escolar_id])` (`schema.prisma:159`): la clave incluye `aula_id`, así que crear antes de borrar **no** colisiona, y el peor caso es una matrícula duplicada visible y borrable, no un estudiante sin matrícula. Sin endpoint transaccional (agregarlo es backend, fuera de alcance) esta es la única secuencia cuyo fallo intermedio no pierde datos. Obligar a eliminar+crear a mano expone al operador a ese mismo riesgo sin la advertencia |
| D11 | Nombres de estudiante en Matrículas | `apps/frontend/src/usuarios/usuarios-api.ts` nuevo con **una** función de lectura, `listarUsuarios(filtros?: { rol?; estado? })` sobre `GET /usuarios` ⇒ `UsuarioRespuestaDto[]`; el panel la usa para el mapa `usuario_id → nombres` y para el selector del alta | Mostrar el UUID crudo; pedir un endpoint `GET /matriculas` enriquecido; poner la función en `academico-api.ts` | `MatriculaRespuestaDto` sólo trae UUIDs: una tabla de UUIDs es inutilizable y el alta necesita elegir un estudiante por nombre. `GET /usuarios` ya existe con `@Roles('administrador','director')`, exactamente los roles que pueden ver esta pestaña. El módulo propio (en vez de `academico-api.ts`) evita que `#27` herede su API de usuarios desde el dominio académico — misma semilla que dejó `#12` al crear `academico-api.ts` sólo con lecturas |
| D12 | Qué se prueba y cómo | Dato puro (Vitest sin render): `PESTANAS`, `MENSAJE_POR_CODIGO`/`mensajeDeError`, round-trip de `academica` en `rutas.spec.ts`, `academica` navegable en `menu-por-rol.spec.ts`. Render (Vitest + RTL + jsdom): las 3 piezas genéricas y los 6 paneles con `academico-api` mockeado (`vi.mock`) | Snapshots de los paneles; e2e con navegador; probar sólo las piezas genéricas | Extiende D8 de `#25`: contenido que es dato se prueba como dato (exhaustivo, sin jsdom, inmune a mover un `className`). Los paneles sí necesitan render porque su valor está en el cableado rol⇒acciones y filtro⇒llamada. Sin e2e nuevos: `#26` no agrega superficie de backend |

## Flujo de datos

```
NavegacionPrincipal ── MENU_POR_ROL[rol] ── item 'academica' (navegable, D12 de este change)
                                                   │ navegar({ nombre: 'academica' })
Enrutador ── case 'academica' ──────────────────────┴─→ AcademicaPage
   │  useSesion() ⇒ rol ⇒ soloLectura = rol ∉ {administrador, director}      (D8)
   │  useState<PestanaAcademica>('anios')                                     (D1)
   ├─ barra de pestañas ← PESTANAS (dato)                                     (D2)
   └─ switch(pestana) → SÓLO el panel activo (los otros 5 desmontados)
         │
         PanelX (contenedor: efectos + filtros + estado de diálogo)
           ├─ academico-api.listarX(filtros)  ──→ filas
           ├─ TablaGenerica  columnas={…} acciones={soloLectura ? [] : […]}   (D3/D8)
           ├─ FormularioGenerico  campos={…} onEnviar(valores)                (D4)
           └─ DialogoConfirmacion (eliminar · activar año · trasladar)        (D5)

Escritura y error:
  onEnviar → academico-api.crearX(input)  → ResultadoApi
     ok    → recargar lista + cerrar formulario
     !ok   → mensajeDeError({ codigo, relacion, status }) → <p role="alert">   (D7)
             p. ej. 409 ENTIDAD_CON_DEPENDIENTES + relacion 'Grado'
                    ⇒ "No se puede eliminar: todavía tiene Grado asociados."

Traslado de matrícula (D10):
  DialogoConfirmacion → crearMatricula(nueva) ──✗→ error, no se borra nada
                              └──✓→ eliminarMatricula(anterior) ──✗→ alerta "quedaron dos"
                                                                 └──✓→ recargar
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/frontend/src/app/rutas.ts` | Modify | D1: variante `academica`; `/academica` en `parsearRuta` y `rutaAPath` |
| `apps/frontend/src/app/rutas.spec.ts` | Modify | D1: round-trip de `academica`; `/academica/niveles` ⇒ `no-encontrada` |
| `apps/frontend/src/app/Enrutador.tsx` | Modify | D1: `case 'academica'` ⇒ `AcademicaPage` |
| `apps/frontend/src/app/Enrutador.spec.tsx` | Modify | D1: `/academica` monta `AcademicaPage` |
| `apps/frontend/src/app/menu-por-rol.ts` | Modify | D12: `ACADEMICA` pasa a `{ clase: 'navegable', ruta: { nombre: 'academica' } }` |
| `apps/frontend/src/app/menu-por-rol.spec.ts` | Modify | D12: `academica` navegable en los 3 roles que lo ven; invariantes vigentes intactas |
| `apps/frontend/src/comun/piezas/TablaGenerica.tsx` (+ `.spec.tsx`) | Create | D3: tabla configurable, columna de acciones condicional |
| `apps/frontend/src/comun/piezas/FormularioGenerico.tsx` (+ `.spec.tsx`) | Create | D4: campos declarativos, valores `string`, `modo` creación/edición |
| `apps/frontend/src/comun/piezas/DialogoConfirmacion.tsx` (+ `.spec.tsx`) | Create | D5: `role="dialog"` inline, confirmar/cancelar |
| `apps/frontend/src/academico/academico-api.ts` | Modify | D6: `listarSecciones`/`listarMatriculas` + 15 escrituras + `ResultadoApi`/`resolver` |
| `apps/frontend/src/academico/mensajes-error.ts` (+ `.spec.ts`) | Create | D7: `Record` total código→texto + `mensajeDeError` |
| `apps/frontend/src/academico/pestanas.ts` (+ `.spec.ts`) | Create | D2: `PestanaAcademica` y `PESTANAS` |
| `apps/frontend/src/academico/AcademicaPage.tsx` (+ `.spec.tsx`) | Create | D1/D2/D8: pestañas, rol ⇒ `soloLectura` |
| `apps/frontend/src/academico/paneles/PanelAniosEscolares.tsx` (+ `.spec.tsx`) | Create | CRUD + acción "Activar" con `DialogoConfirmacion` |
| `apps/frontend/src/academico/paneles/PanelNiveles.tsx` (+ `.spec.tsx`) | Create | CRUD sin filtros |
| `apps/frontend/src/academico/paneles/PanelGrados.tsx` (+ `.spec.tsx`) | Create | CRUD + filtro opcional `nivel_id` |
| `apps/frontend/src/academico/paneles/PanelSecciones.tsx` (+ `.spec.tsx`) | Create | CRUD + filtros `grado_id`/`anio_escolar_id` |
| `apps/frontend/src/academico/paneles/PanelAulas.tsx` (+ `.spec.tsx`) | Create | CRUD + filtros `grado_id`/`seccion_id`/`anio_escolar_id`/`turno` |
| `apps/frontend/src/academico/paneles/PanelMatriculas.tsx` (+ `.spec.tsx`) | Create | D9/D10: aula obligatoria, alta, retiro y traslado |
| `apps/frontend/src/usuarios/usuarios-api.ts` | Create | D11: sólo `listarUsuarios`, semilla de `#27` |
| `openspec/.../specs/{academic-tree-management,school-year-management,student-enrollment,minimal-frontend-router}/spec.md` | Modify | Deltas de UI de la propuesta |
| Backend, `packages/contracts` | None | Sin endpoints, DTOs ni regeneración de contrato |

## Interfaces / Contratos

```ts
// apps/frontend/src/comun/piezas/TablaGenerica.tsx — D3
export interface ColumnaTabla<T> { clave: string; encabezado: string; celda: (fila: T) => ReactNode }
export interface AccionFila<T> {
  id: string; etiqueta: string; onEjecutar: (fila: T) => void;
  tono?: 'normal' | 'peligro';          // 'peligro' ⇒ text-error (eliminar)
  visible?: (fila: T) => boolean;       // p. ej. "Activar" sólo si !fila.activo
}
export function TablaGenerica<T>(props: {
  filas: readonly T[]; columnas: readonly ColumnaTabla<T>[]; claveFila: (fila: T) => string;
  acciones?: readonly AccionFila<T>[]; mensajeVacio: string;
}): ReactElement;
```

```ts
// apps/frontend/src/comun/piezas/FormularioGenerico.tsx — D4
export type CampoFormulario =
  | { clase: 'texto'; nombre: string; etiqueta: string; requerido?: boolean }
  | { clase: 'seleccion'; nombre: string; etiqueta: string;
      opciones: readonly { valor: string; etiqueta: string }[]; requerido?: boolean };
// onEnviar recibe Record<string, string>: los 6 DTO de escritura son 100 % string (D4)
```

```ts
// apps/frontend/src/academico/academico-api.ts — D6. Funciones nuevas (las 4 lecturas vigentes
// quedan intactas). Tipos de entrada espejados de apps/backend/src/academico/dto/*.dto.ts porque
// el contrato genera `requestBody?: never` / `path?: never` (mismo motivo que candidatos-api.ts).
export type SeccionRespuestaDto  = components['schemas']['SeccionRespuestaDto'];
export type MatriculaRespuestaDto = components['schemas']['MatriculaRespuestaDto'];
// `PATCH /anios-escolares/:id/activar` no declara `type` en su @ApiResponse ⇒ el contrato dice
// `content?: never`; el tipo se espeja a mano (a runtime openapi-fetch sí devuelve el JSON).
export interface ResultadoActivacion { id: string; activo: true; cambio: boolean }

listarSecciones(filtros?: { grado_id?: string; anio_escolar_id?: string }, signal?)   // crudo
listarMatriculas(filtros?: { usuario_id?: string; aula_id?: string; anio_escolar_id?: string }, signal?)

crearAnioEscolar({ nombre })            actualizarAnioEscolar(id, { nombre? })   eliminarAnioEscolar(id)
activarAnioEscolar(id)                                        // ⇒ ResultadoApi<ResultadoActivacion>
crearNivel({ nombre })                  actualizarNivel(id, { nombre? })         eliminarNivel(id)
crearGrado({ nombre, nivel_id })        actualizarGrado(id, { nombre? })         eliminarGrado(id)
crearSeccion({ nombre, grado_id, anio_escolar_id })
                                        actualizarSeccion(id, { nombre? })       eliminarSeccion(id)
crearAula({ turno, grado_id, seccion_id, anio_escolar_id })
                                        actualizarAula(id, { turno? })           eliminarAula(id)
crearMatricula({ usuario_id, aula_id, anio_escolar_id })                         eliminarMatricula(id)
// Matricula NO tiene PATCH (backend #8): el traslado es crear + eliminar, en ese orden (D10).
```

```ts
// apps/frontend/src/academico/mensajes-error.ts — D7 (Record total sobre academico.errors.ts)
export type CodigoAcademico =
  | 'RESTRICCION_UNICA' | 'REFERENCIA_INEXISTENTE' | 'ENTIDAD_CON_DEPENDIENTES'
  | 'ACTIVACION_CONCURRENTE' | 'CAMPO_INVALIDO' | 'COHERENCIA_JERARQUICA'
  | 'USUARIO_NO_ES_ESTUDIANTE';
export function mensajeDeError(e: { codigo?: CodigoAcademico; relacion?: string; status?: number }): string;
```

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit — datos (Vitest, sin render) | Round-trip de `academica` y `/academica/x` ⇒ `no-encontrada`; `academica` navegable para `administrador`/`director`/`comite` e invariantes de `#25` intactas; `PESTANAS` con los 6 ids exactos; `mensajeDeError` para los 7 códigos, con y sin `relacion`, y fallback por status | `rutas.spec.ts`, `menu-por-rol.spec.ts`, `pestanas.spec.ts`, `mensajes-error.spec.ts` |
| Componente — piezas genéricas (Vitest + RTL + jsdom) | `TablaGenerica`: encabezados, `mensajeVacio` con 0 filas, `acciones: []` no renderiza columna de acciones, `visible` filtra por fila, `onEjecutar` recibe la fila. `FormularioGenerico`: `requerido` vacío deshabilita el submit, `onEnviar` devuelve todos los valores, `valoresIniciales` en modo edición. `DialogoConfirmacion`: `role="dialog"`, confirmar/cancelar | Render directo, sin providers (las piezas no leen contexto — D8) |
| Componente — paneles y página (Vitest + RTL + jsdom) | `AcademicaPage`: la pestaña inicial es Años; cambiar de pestaña monta otro panel; con `comite` ningún panel muestra "Nuevo"/"Editar"/"Eliminar"/"Activar"; con rol no autenticado, ídem (fail-closed). Paneles: filtro ⇒ llamada con el query correcto; Matrículas sin aula no llama a la API; 409 con `relacion` ⇒ texto de D7 en `role="alert"`; traslado llama a crear **antes** que a eliminar | `vi.mock('../academico/academico-api')` + patrón `proveer()` con `SesionContext` ya vigente en `Enrutador.spec.tsx` |
| E2E | — | Ninguno nuevo: `#26` no agrega superficie de backend |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Enrutamiento (cliente) | `/academica` sin sesión; `/academica/niveles`; `/academica/../../etc/passwd`; `pushState` a `/academica` con rol `estudiante`; `comite` forzando una escritura desde la consola | **Applicable** — el change agrega una variante de `Ruta` y una pantalla de escritura | `AcademicaPage` se monta dentro de `AuthGuard` > `AppShell` (D11 de `#12`, sin cambios): la sesión, nunca la URL, decide entre `LoginPage` y la app. `parsearRuta` sigue siendo total y exige `length === 1`, así que todo `/academica/...` cae en `no-encontrada`. `soloLectura` es allowlist fail-closed (D8): cualquier rol distinto de `administrador`/`director` ve sólo lectura. La autorización real sigue siendo `@Roles('administrador','director')` a nivel de clase en los 6 controladores, que responde `403` aunque el botón se fuerce | Sin sesión, `/academica` ⇒ `LoginPage`; `/academica/niveles` y `/academica/..` ⇒ `no-encontrada` sin excepción; `comite` y rol ausente ⇒ cero botones de escritura en los 6 paneles |
| Clasificación de archivo activo | — | N/A: el change no sube ni sirve archivos | — | — |
| Selección de repositorio Git | — | N/A: el change no ejecuta Git | — | — |
| Estado de commit / de push | — | N/A: sin automatización de commits ni push | — | — |
| Comandos de PR | — | N/A: sin automatización de PR | — | — |

Sin shell, subprocesos ni integración de procesos.

## Migración / Rollout

Sin migración de datos, sin feature flags y sin regenerar el contrato OpenAPI (no se toca el backend).
Único efecto observable en despliegue: el item "Académica" del menú deja de estar deshabilitado para
`administrador`, `director` y `comite`. Rollback = revertir los commits del change; devolver
`ACADEMICA` a `{ clase: 'proximamente' }` alcanza para desactivar la sección sin tocar nada más.

**Corte de PR sugerido para `sdd-tasks`** (6 entidades × tabla+formulario exceden con holgura el
presupuesto de 400 líneas): PR1 cimientos (`rutas`/`Enrutador`/`menu-por-rol` + las 3 piezas
genéricas + `mensajes-error` + `pestanas` + `AcademicaPage` con paneles vacíos); PR2 `academico-api`
completo + `usuarios-api`; PR3 Años escolares (incluye activación) + Niveles; PR4 Grados +
Secciones; PR5 Aulas + Matrículas (incluye traslado). Cada corte deja la pantalla usable: las
pestañas aún no implementadas muestran su estado vacío.

## Preguntas abiertas

- [ ] `AulaRespuestaDto.turno` es `"manana" | "tarde"` en el contrato pero `CrearAulaDto.turno` es
      `string` con `enum` sólo documental: el select de D4 ofrece los dos valores y el backend
      valida; confirmar en `apply` que un `turno` desconocido devuelve `400 CAMPO_INVALIDO` y no un
      `500`.
- [ ] `PATCH /anios-escolares/:id/activar` no declara `type` en su `@ApiResponse`, así que
      `ResultadoActivacion` queda espejado a mano (D6). Si `#28` regenera el contrato con `@ApiBody`/
      `type`, este tipo local debe eliminarse en favor del generado.
- [ ] El traslado de matrícula no es atómico (D10). Queda registrado como candidato a ítem de
      backlog para `#8`: un endpoint transaccional `PATCH /matriculas/:id` o
      `POST /matriculas/traslado` eliminaría la ventana de inconsistencia.
- [ ] Ordenamiento y paginación quedan deliberadamente fuera de `TablaGenerica` (D3). Si `#27`
      (usuarios: cientos de filas) los necesita, se agregan ahí con su caso real a la vista, no acá.
