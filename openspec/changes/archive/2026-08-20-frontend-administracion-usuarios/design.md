# Diseño: frontend-administracion-usuarios (Backlog #27)

## Enfoque técnico

Frontend puro, sin backend nuevo. Se **extiende** el enrutador hand-rolled (D10/D11 de `#12`) con dos
variantes planas —`usuarios` y `cuentas-bloqueadas`— y el mapa `MENU_POR_ROL` de `#25` con el
placeholder `usuarios` pasando a `navegable` (administrador/director) más un item nuevo
"Cuentas bloqueadas" exclusivo de `comite`; ninguna de esas decisiones se reabre.
`apps/frontend/src/usuarios/usuarios-api.ts` **ya existe** (semilla de `#26` D11, hoy sólo
`listarUsuarios`): este change lo **expande**, no lo recrea. Las tres piezas de
`apps/frontend/src/comun/piezas/` (`TablaGenerica`, `FormularioGenerico`, `DialogoConfirmacion`,
estrenadas en `#26`) se reutilizan tal cual, sin tocarlas. El patrón container/presentational de
`#12` D13 se mantiene: contenedores con los efectos, piezas genéricas sin fetch, sin roles y sin
estado de dominio. El criterio D8 de `#26` (allowlist fail-closed derivada una sola vez y pasada por
props) se mantiene, con una diferencia sustantiva justificada en D4: acá el rol no gradúa entre
lectura y escritura, **corta el acceso completo**, porque los endpoints de `UsersModule` y los de
bloqueo tienen conjuntos de roles disjuntos y sin intersección de lectura.

Verificado contra el código real antes de fijar contratos: `CrearUsuarioDto` es **uniforme para los
cinco roles** (`nombres`, `dni`, `codigo`, `correo`, `rol` — cinco `string` obligatorios, sin ningún
campo condicional por rol y sin `password_hash`), `ActualizarUsuarioDto` repite esos cinco campos
como opcionales **incluido `rol`**, `CambiarEstadoUsuarioDto` sólo admite `activo|inactivo`,
`CrearApoderadoDto` es `{ nombres, dni, correo? }`, y las siete rutas de este dominio declaran
`requestBody?: never` / `parameters.path?: never` / `parameters.query?: never` en
`packages/contracts/src/generated/api.d.ts` (ningún controlador usa `@ApiBody`/`@ApiParam`/`@ApiQuery`).

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Estructura de rutas | **Dos variantes planas y sin parámetros**: `{ nombre: 'usuarios' }` ⇒ `/usuarios` y `{ nombre: 'cuentas-bloqueadas' }` ⇒ `/cuentas-bloqueadas`. `parsearRuta` las reconoce sólo con `partes.length === 1`; todo `/usuarios/...` y `/cuentas-bloqueadas/...` cae en `no-encontrada`. El `Usuario` abierto vive en `useState<UsuarioRespuestaDto \| null>` **local a `UsuariosPage`** | `{ nombre: 'usuarios'; usuarioId?: string }` con id embebido; dos variantes `usuarios` + `usuario-ficha`; anidar el desbloqueo bajo `/usuarios/bloqueadas` | El delta `minimal-frontend-router` lo exige literalmente ("Abrir la ficha de un usuario no cambia la URL", "Sin deep-link a un usuario específico"). Un `usuarioId?` opcional rompe la invariante `parsearRuta(rutaAPath(r)) === r` de `rutas.spec.ts` salvo con casos especiales a mano, sin ningún consumidor que lo pida. `/cuentas-bloqueadas` cuelga de la raíz, no de `/usuarios`, porque su rol (`comite`) **no puede** ni siquiera leer `/usuarios`: anidarla sugeriría una jerarquía de navegación que ningún rol puede recorrer. Round-trip exacto y precedente literal de `academica` (`#26` D1) |
| D2 | Menú por rol | `USUARIOS` pasa de `{ clase: 'proximamente' }` a `{ clase: 'navegable', ruta: { nombre: 'usuarios' } }` — ya sólo figura en `administrador`/`director`, no hay que quitarlo de ningún lado. Se agrega `CUENTAS_BLOQUEADAS: { clase: 'navegable', id: 'cuentas-bloqueadas', etiqueta: 'Cuentas bloqueadas', ruta: { nombre: 'cuentas-bloqueadas' } }` **sólo** en la fila `comite` | Item único "Usuarios" para los tres roles con contenido distinto; agregar "Cuentas bloqueadas" también a administrador/director en modo lectura | `MENU_POR_ROL` espeja los `@Roles` reales (D3 de `#25`): `UsersController` es `@Roles('administrador','director')` y `AuthController.listarBloqueados`/`desbloquear` es `@Roles('comite')`. Un item visible que garantiza `403` al primer click es peor que ningún item. `comite` sigue sin ver `usuarios` sin cambiar una línea del mapa vigente |
| D3 | Composición de las páginas | `usuarios/UsuariosPage.tsx` (contenedor de `/usuarios`): resuelve rol, carga el listado, mantiene filtros y `usuarioSeleccionado`; renderiza **o** el listado **o** `usuarios/FichaUsuarioPage.tsx`, nunca los dos. `FichaUsuarioPage` recibe `{ usuario, soloLectura, onVolver, onCambio }` y monta `usuarios/paneles/PanelApoderados.tsx` sólo si `usuario.rol === 'estudiante'`. `usuarios/CuentasBloqueadasPage.tsx` es un contenedor independiente que no importa nada de los anteriores | Ficha en ruta propia; ficha como modal sobre el listado; un único archivo con listado + ficha + apoderados; pestañas al estilo `AcademicaPage` | Nombres confirmados en la ronda de preguntas de la propuesta (punto 2). Montar sólo una de las dos vistas hace que el estado del formulario muera al volver al listado, sin limpieza manual (mismo argumento que `#26` D2 para las pestañas). Un modal exigiría foco modal y `::backdrop`, superficie que ninguna pantalla vigente tiene (`#26` D5). Sin pestañas: `/usuarios` tiene **una** entidad, no seis; el panel de apoderados es contextual a una fila, no una sección hermana |
| D4 | Gate de rol (allowlist fail-closed) | **Dos gates binarios distintos, cada uno derivado una sola vez en su contenedor**: `UsuariosPage` calcula `const puedeGestionar = rol === 'administrador' \|\| rol === 'director'`; `CuentasBloqueadasPage` calcula `const puedeDesbloquear = rol === 'comite'`. Si el gate es falso: aviso `role="status"` "Esta sección no está disponible para tu rol", **cero llamadas a la API** y cero botones. Si es verdadero, igual se propaga `soloLectura={!puedeGestionar}` a `FichaUsuarioPage`/`PanelApoderados`, que construyen `acciones = soloLectura ? [] : [...]` | `soloLectura` graduado como en `#26` D8 (renderizar el listado en modo lectura para `comite`); `rol === 'comite'` como denylist; `disabled` en vez de ocultar; leer `useSesion()` dentro de las piezas genéricas | Desvío **explícito y fundamentado** de `#26` D8: en académica `comite` sí tiene lectura server-side, así que "sólo lectura" era un estado alcanzable; acá `GET /usuarios` es `@Roles('administrador','director')` y `GET /auth/usuarios/bloqueados` es `@Roles('comite')` — renderizar el listado en modo lectura garantizaría un `403` y un estado de error permanente. Se conserva lo que importa de D8: allowlist (un rol futuro o `estado !== 'autenticado'` cae del lado cerrado), derivada una vez, pasada por props, con las piezas genéricas ciegas al rol y por lo tanto reutilizables y testeables sin provider |
| D5 | Expansión de `usuarios-api.ts` | El archivo **existente** se conserva: `listarUsuarios` queda **intacta** (crudo `{ data, response }`, `filtros?: { rol?: string; estado?: string }`) porque `PanelMatriculas` de `#26` la consume y tiene su propio `usuarios-api.spec.ts`. Las **nueve** funciones nuevas devuelven `ResultadoApi<T>` vía `resolver`/`resolverVacio` copiados de `academico-api.ts`, incluidas las dos lecturas nuevas (`listarApoderados`, `listarCuentasBloqueadas`) | Crear un módulo nuevo (`usuarios/api.ts`, `bloqueo/bloqueo-api.ts`); migrar `listarUsuarios` a `ResultadoApi`; lecturas crudas y escrituras envueltas, como `#26` D6 | Recrear el módulo dejaría dos clientes para `GET /usuarios` y rompería `PanelMatriculas`; la semilla de `#26` D11 se creó exactamente para que `#27` la expandiera. Desvío puntual de `#26` D6 en las **lecturas nuevas**: `GET /usuarios/:id/apoderados` devuelve `409 USUARIO_NO_ES_ESTUDIANTE` (código de negocio discriminable, a diferencia de todo `GET` de académica) y `GET /auth/usuarios/bloqueados` devuelve `403` para cualquier rol que fuerce la URL — ambas necesitan distinguir "falló" de "lista vacía", que es justamente lo que el envelope aporta. `POST /auth/usuarios/:id/desbloquear` vive en `usuarios-api.ts` y no en `auth/auth-api.ts`: es una acción de administración de cuentas ajenas, no del ciclo de sesión propio |
| D6 | Tipos y `as never` | Respuestas desde el contrato generado (`components['schemas']['UsuarioRespuestaDto' \| 'ApoderadoRespuestaDto' \| 'UsuarioBloqueadoDto']`). Entradas espejadas a mano (`CrearUsuarioInput`, `ActualizarUsuarioInput`, `CrearApoderadoInput`, `ActualizarApoderadoInput`) y `as never` en `body`/`params.path`/`params.query`. Dos respuestas más espejadas a mano porque su `@ApiResponse` no declara `type` ⇒ el contrato dice `content?: never`: `CambioEstadoUsuario = { id: string; estado: string }` y `ResultadoDesbloqueo = { desbloqueado: boolean }` | Usar los tipos generados también para entrada; agregar `@ApiBody`/`@ApiParam`/`@ApiQuery` en el backend y regenerar el contrato | Verificado en `packages/contracts/src/generated/api.d.ts`: las siete rutas (`/usuarios`, `/usuarios/{id}`, `/usuarios/{id}/estado`, `/usuarios/{usuarioId}/apoderados`, `/usuarios/{usuarioId}/apoderados/{apoderadoId}`, `/auth/usuarios/bloqueados`, `/auth/usuarios/{id}/desbloquear`) declaran `requestBody?: never` y `parameters.{path,query}?: never`. Tocar los controladores es cambio de backend, explícitamente fuera de alcance. Precedente idéntico: `candidatos-api.ts` y `academico-api.ts` D6, incluido `activarAnioEscolar` con su tipo espejado |
| D7 | Errores del backend en la UI | `usuarios/mensajes-error.ts`: `Record<CodigoUsuarios, string>` **total** sobre los cinco códigos de `apps/backend/src/users/users.errors.ts`, más `mensajeDeError({ codigo, campo, status })`. `CAMPO_DUPLICADO` y `CAMPO_INVALIDO` interpolan `campo` cuando el backend lo manda ("Ya existe otro usuario con ese dni"); sin `codigo`, fallback por `status` (`403` ⇒ "Tu rol no permite esta acción", `404` ⇒ "El registro ya no existe", resto ⇒ genérico) | Reutilizar `academico/mensajes-error.ts`; un mensaje genérico para todo 4xx; mostrar el `codigo` crudo | Verificado en `users.service.ts`/`apoderados.service.ts`: los 4xx de negocio son `{ codigo, campo }` (duplicado/inválido), `{ codigo, valor_recibido }`, `{ codigo, estado_actual }` y `{ codigo, rol_actual }`, mientras que los `NotFoundException` son texto plano sin `codigo` — el fallback por status es obligatorio, no decorativo. `Record` total ⇒ agregar un código en `users.errors.ts` rompe la compilación en vez de degradar en silencio (misma disciplina que `MENU_POR_ROL` y que `#26` D7). Mapa propio y no compartido con académica porque los catálogos de código son locales a su módulo backend por decisión de `#7` |
| D8 | Formulario de `Usuario` | **Un único conjunto de campos para los cinco roles**, sin ramas condicionales: `nombres`, `dni`, `codigo`, `correo` (`tipo: 'texto'`, `requerido: true`) y `rol` (`tipo: 'seleccion'`, `requerido: true`, con **opción inicial vacía** `{ valor: '', etiqueta: 'Seleccioná un rol' }` seguida de los cinco roles). En **edición el campo `rol` se omite**: la ficha muestra el rol como dato, no como control | Campos por rol (p. ej. `codigo` sólo para estudiantes); ofrecer `rol` también en edición; agregar un campo de contraseña | `CrearUsuarioDto` verificado campo por campo: cinco `string` obligatorios, ningún campo condicional, ningún `password_hash` (el login real es Google OAuth) — la suposición del spec se confirma. La opción vacía es necesaria porque `FormularioGenerico` inicializa todo valor en `''` y su `<select>` no emite placeholder: sin ella el usuario vería "Estudiante" seleccionado con el valor real en `''` y el submit deshabilitado sin explicación. `rol` fuera de la edición **aunque `ActualizarUsuarioDto` lo acepte**: `ApoderadosController` responde `409` para cualquier `rol !== 'estudiante'` y el backend no borra ni bloquea nada al degradar un estudiante, así que editar el rol dejaría filas `Apoderado` vivas e inalcanzables desde toda la UI. Se registra como pregunta abierta para `#7` |
| D9 | Cambio de estado, sin eliminar | Acción de fila y de ficha "Activar"/"Desactivar" según `estado`, con `DialogoConfirmacion` previo ⇒ `cambiarEstadoUsuario(id, destino)`. **Ninguna acción etiquetada "Eliminar" sobre `Usuario`** en ninguna vista. Para `estado === 'bloqueado'` la acción no se ofrece (ni activar ni desactivar) y se muestra el estado como texto | Un toggle sin confirmación; "Eliminar" mapeado a `estado: 'inactivo'`; ofrecer `bloqueado` como destino | `UsersController` no expone `DELETE` en ninguna forma y `CambiarEstadoUsuarioDto` sólo admite `activo\|inactivo`; `UsersService.cambiarEstado` responde `409 TRANSICION_DESDE_BLOQUEADO` si el actual es `bloqueado`. Ocultar la acción en ese caso evita ofrecer un botón cuyo único desenlace posible es un `409`, y refuerza la separación de dominios: salir de `bloqueado` es competencia exclusiva de `comite` en `/cuentas-bloqueadas` |
| D10 | Panel de `Apoderado` | `PanelApoderados` recibe `{ usuarioId, soloLectura }` y se monta **sólo** si `usuario.rol === 'estudiante'` (condición en `FichaUsuarioPage`, no dentro del panel). Campos `nombres`/`dni` requeridos y `correo` opcional; el contenedor **omite las claves vacías** antes de enviar (`correo: valores.correo.trim() \|\| undefined`). "Eliminar" es borrado físico con `DialogoConfirmacion` que lo dice explícitamente | Montar siempre el panel y ocultarlo por CSS; enviar `correo: ''`; baja lógica del apoderado | El panel montado dispararía `GET /usuarios/:id/apoderados` ⇒ `409` para los otros cuatro roles. `Apoderado.correo` es nulable en el esquema y `apoderados.service.ts` no valida ni normaliza: mandar `''` persistiría una cadena vacía indistinguible de "sin correo" — `FormularioGenerico` siempre entrega todas las claves como `string`, así que la normalización es responsabilidad del contenedor. `DELETE` acá sí es físico (`@HttpCode(204)`, a diferencia de `Usuario`), y el texto del diálogo debe decirlo |
| D11 | Cuentas bloqueadas | Pantalla propia `CuentasBloqueadasPage` en `/cuentas-bloqueadas`, gate `puedeDesbloquear` (D4). `TablaGenerica` con `id`, `nombres`, `dni`, `codigo`, `bloqueado_hasta` (formateado; `null` ⇒ "Indefinido") y una única acción "Desbloquear" ⇒ `DialogoConfirmacion` cuyo texto menciona **explícitamente que la acción queda registrada en auditoría** ⇒ `desbloquearCuenta(id)` ⇒ recarga del listado | Panel dentro de la ficha de `Usuario` (borrador original); optimistic update quitando la fila sin recargar; `window.confirm` | Punto 4 de la ronda de preguntas de la propuesta, ya resuelto: `AuthController` gatea ambos endpoints con `@Roles('comite')` y `UsersController` con `@Roles('administrador','director')` — roles **disjuntos**, la ficha es inalcanzable para quien puede desbloquear. La recarga (en vez de quitar la fila localmente) es la única forma de reflejar el `desbloqueado: false` idempotente que devuelve el backend cuando la cuenta ya se había recuperado por expiración perezosa. El texto de auditoría satisface ADR-0008 y el requisito del spec de que no sea un botón silencioso |
| D12 | Volumen del listado | `TablaGenerica` **no se toca** (sigue sin orden, paginación ni selección). `UsuariosPage` pagina **en cliente**: `const PAGINA = 25`, `slice` sobre las filas ya filtradas más un pie "Mostrando N–M de T" con anterior/siguiente. Los filtros `rol`/`estado` son server-side y opcionales (`GET /usuarios` los acepta y valida) | Agregar paginación a `TablaGenerica`; exigir un filtro antes de listar (como Matrículas en `#26` D9); renderizar el padrón completo sin cortar | `UsersService.listar()` hace `findMany` **sin `take`**, ordenado por `codigo asc`: sin filtro, `/usuarios` trae el padrón entero (una fila por estudiante). Los filtros reducen pero no acotan el caso peor (`rol = 'estudiante'` sigue siendo el padrón completo), así que exigir un filtro no resolvería nada y sí rompería la tarea más común. La paginación en cliente acota el DOM sin cambiar la pieza genérica, respetando la pregunta abierta que `#26` dejó explícitamente ("si `#27` los necesita, se agregan ahí, con su caso real a la vista") — pero **no** acota la descarga: la paginación server-side queda como ítem de backlog de `#7` |
| D13 | Qué se prueba y cómo | Dato puro (Vitest sin render): round-trip de `usuarios` y `cuentas-bloqueadas` en `rutas.spec.ts`, `usuarios` navegable y `cuentas-bloqueadas` sólo en `comite` en `menu-por-rol.spec.ts`, `mensajeDeError` sobre los cinco códigos con y sin `campo` más los fallbacks por status. Render (Vitest + RTL + jsdom): las cuatro vistas nuevas con `vi.mock('./usuarios-api')` y el patrón `proveer()` con `SesionContext` ya vigente en `Enrutador.spec.tsx`. `usuarios-api.spec.ts` **se extiende**, no se reescribe | Snapshots; e2e con navegador; probar sólo las piezas genéricas (ya cubiertas por `#26`) | Extiende D8 de `#25` y D12 de `#26`: lo que es dato se prueba como dato (exhaustivo, sin jsdom, inmune a mover un `className`); las páginas necesitan render porque su valor está en el cableado rol⇒acceso, filtro⇒query y confirmación⇒llamada. Sin e2e nuevos: `#27` no agrega superficie de backend |

## Flujo de datos

```
MENU_POR_ROL[administrador|director] ── item 'usuarios' (navegable, D2)
MENU_POR_ROL[comite]                 ── item 'cuentas-bloqueadas' (navegable, D2)
                    │ navegar({ nombre })
Enrutador ──────────┼─ case 'usuarios' ──────────────→ UsuariosPage
                    └─ case 'cuentas-bloqueadas' ────→ CuentasBloqueadasPage

UsuariosPage (contenedor)
  useSesion() ⇒ rol ⇒ puedeGestionar = rol ∈ {administrador, director}          (D4)
    ├─ !puedeGestionar → <p role="status"> y CERO fetch
    └─  puedeGestionar → listarUsuarios({ rol?, estado? })  [crudo, D5]
          ├─ usuarioSeleccionado === null
          │     └─ filtros (2 <select> nativos) + TablaGenerica + paginación cliente (D12)
          │           acción "Abrir" ⇒ setUsuarioSeleccionado(fila)   (sin tocar la URL, D1)
          └─ usuarioSeleccionado !== null
                └─ FichaUsuarioPage { usuario, soloLectura, onVolver, onCambio }
                      ├─ FormularioGenerico (edición, sin campo `rol`)          (D8)
                      ├─ DialogoConfirmacion "Activar/Desactivar"               (D9)
                      └─ rol === 'estudiante' ? PanelApoderados : null          (D10)
                            listar/crear/actualizar/eliminar apoderado

Escritura y error (las 9 funciones nuevas ⇒ ResultadoApi):
  onEnviar → crearUsuario(input) → { ok }
     ok  → recargar listado + cerrar formulario
    !ok  → mensajeDeError({ codigo, campo, status }) → <p role="alert">          (D7)
           p. ej. 409 CAMPO_DUPLICADO + campo 'dni'
                  ⇒ "Ya existe otro usuario con ese dni."
```

Secuencia del desbloqueo manual (flujo auditado, D11):

```
comite      CuentasBloqueadasPage   DialogoConfirmacion   usuarios-api      AuthController
  │                  │                      │                  │                  │
  │ abre /cuentas-bloqueadas                │                  │                  │
  │─────────────────>│ puedeDesbloquear ✓   │                  │                  │
  │                  │──── listarCuentasBloqueadas() ─────────>│─ GET /auth/usuarios/bloqueados ─>│
  │                  │<─────────── ResultadoApi<UsuarioBloqueadoDto[]> ───────────────────────────│
  │ click "Desbloquear"                     │                  │                  │
  │─────────────────>│─── abrir(fila) ─────>│                  │                  │
  │                  │   texto: "queda registrada en auditoría"                   │
  │  cancelar ───────┼──────────────────────X  (ninguna llamada)                  │
  │  confirmar ──────┼──────────────────────>│                  │                  │
  │                  │──── desbloquearCuenta(id) ─────────────>│─ POST /auth/usuarios/:id/desbloquear ─>│
  │                  │<─────────── ResultadoApi<{ desbloqueado }> ────────────────│
  │                  │──── listarCuentasBloqueadas() (recarga, D11) ─────────────>│
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/frontend/src/app/rutas.ts` | Modify | D1: variantes `usuarios` y `cuentas-bloqueadas` en la unión, `parsearRuta` y `rutaAPath` |
| `apps/frontend/src/app/rutas.spec.ts` | Modify | D1: round-trip de ambas; `/usuarios/x` y `/cuentas-bloqueadas/..` ⇒ `no-encontrada` |
| `apps/frontend/src/app/Enrutador.tsx` | Modify | D1: `case 'usuarios'` y `case 'cuentas-bloqueadas'` |
| `apps/frontend/src/app/Enrutador.spec.tsx` | Modify | D1: cada path monta su página |
| `apps/frontend/src/app/menu-por-rol.ts` | Modify | D2: `USUARIOS` ⇒ navegable; `CUENTAS_BLOQUEADAS` nuevo sólo en `comite` |
| `apps/frontend/src/app/menu-por-rol.spec.ts` | Modify | D2: `usuarios` navegable en admin/director; `cuentas-bloqueadas` presente sólo en `comite`; invariantes de `#25`/`#26` intactas |
| `apps/frontend/src/usuarios/usuarios-api.ts` | Modify | D5/D6: `ResultadoApi`/`resolver`/`resolverVacio` + 9 funciones nuevas; `listarUsuarios` intacta |
| `apps/frontend/src/usuarios/usuarios-api.spec.ts` | Modify | D5: se extiende con las 9 funciones nuevas |
| `apps/frontend/src/usuarios/mensajes-error.ts` (+ `.spec.ts`) | Create | D7: `Record` total sobre `USERS_ERROR_CODES` + `mensajeDeError` |
| `apps/frontend/src/usuarios/UsuariosPage.tsx` (+ `.spec.tsx`) | Create | D3/D4/D12: gate, filtros, listado paginado, selección de ficha |
| `apps/frontend/src/usuarios/FichaUsuarioPage.tsx` (+ `.spec.tsx`) | Create | D8/D9: alta/edición y cambio de estado |
| `apps/frontend/src/usuarios/paneles/PanelApoderados.tsx` (+ `.spec.tsx`) | Create | D10: CRUD de apoderados, sólo para estudiantes |
| `apps/frontend/src/usuarios/CuentasBloqueadasPage.tsx` (+ `.spec.tsx`) | Create | D4/D11: listado y desbloqueo auditado, sólo `comite` |
| `apps/frontend/src/comun/piezas/*` | None | Reutilizadas sin cambios (`#26`) |
| Backend, `packages/contracts` | None | Sin endpoints, DTOs ni regeneración de contrato |

## Interfaces / Contratos

```ts
// apps/frontend/src/usuarios/usuarios-api.ts — D5/D6.
// `listarUsuarios` (semilla de #26 D11) NO se toca: sigue devolviendo { data, response } crudo.
export type UsuarioRespuestaDto   = components['schemas']['UsuarioRespuestaDto'];   // ya existe
export type ApoderadoRespuestaDto = components['schemas']['ApoderadoRespuestaDto'];
export type UsuarioBloqueadoDto   = components['schemas']['UsuarioBloqueadoDto'];

export interface ResultadoApi<T> { ok: boolean; data?: T; status?: number; codigo?: CodigoUsuarios; campo?: string }

// Espejados a mano: `@ApiResponse` sin `type` ⇒ el contrato genera `content?: never` (mismo caso
// que `activarAnioEscolar` en #26 D6).
export interface CambioEstadoUsuario  { id: string; estado: string }
export interface ResultadoDesbloqueo  { desbloqueado: boolean }

// Entradas espejadas de apps/backend/src/users/dto/*.dto.ts (contrato: `requestBody?: never`).
export interface CrearUsuarioInput      { nombres: string; dni: string; codigo: string; correo: string; rol: string }
export interface ActualizarUsuarioInput { nombres?: string; dni?: string; codigo?: string; correo?: string }  // `rol` omitido a propósito (D8)
export interface CrearApoderadoInput      { nombres: string; dni: string; correo?: string }
export interface ActualizarApoderadoInput { nombres?: string; dni?: string; correo?: string }

crearUsuario(input)                       // ⇒ ResultadoApi<UsuarioRespuestaDto>
actualizarUsuario(id, input)              // ⇒ ResultadoApi<UsuarioRespuestaDto>
cambiarEstadoUsuario(id, 'activo'|'inactivo')  // ⇒ ResultadoApi<CambioEstadoUsuario>
listarApoderados(usuarioId, signal?)      // ⇒ ResultadoApi<ApoderadoRespuestaDto[]>   (D5)
crearApoderado(usuarioId, input)          // ⇒ ResultadoApi<ApoderadoRespuestaDto>
actualizarApoderado(usuarioId, apoderadoId, input)  // ⇒ ResultadoApi<ApoderadoRespuestaDto>
eliminarApoderado(usuarioId, apoderadoId) // ⇒ ResultadoApi<void>  (204, resolverVacio)
listarCuentasBloqueadas(signal?)          // ⇒ ResultadoApi<UsuarioBloqueadoDto[]>
desbloquearCuenta(id)                     // ⇒ ResultadoApi<ResultadoDesbloqueo>
// Sin `obtenerUsuario(id)`: la fila viene del listado y toda escritura recarga el listado (D3).
```

```ts
// apps/frontend/src/usuarios/mensajes-error.ts — D7 (Record total sobre users.errors.ts)
export type CodigoUsuarios =
  | 'CAMPO_DUPLICADO' | 'ESTADO_DESTINO_NO_PERMITIDO' | 'TRANSICION_DESDE_BLOQUEADO'
  | 'CAMPO_INVALIDO'  | 'USUARIO_NO_ES_ESTUDIANTE';
export function mensajeDeError(e: { codigo?: CodigoUsuarios; campo?: string; status?: number }): string;
```

```ts
// Campos del formulario de Usuario — D8. `CampoFormulario` real de #26 usa `tipo`/`clave`
// (no `clase`/`nombre`, como decía el texto de su design.md).
const ROLES = ['estudiante', 'docente', 'comite', 'administrador', 'director'] as const;
const camposCrear: CampoFormulario[] = [
  { tipo: 'texto', clave: 'nombres', etiqueta: 'Nombres', requerido: true },
  { tipo: 'texto', clave: 'dni',     etiqueta: 'DNI',     requerido: true },
  { tipo: 'texto', clave: 'codigo',  etiqueta: 'Código',  requerido: true },
  { tipo: 'texto', clave: 'correo',  etiqueta: 'Correo',  requerido: true },
  { tipo: 'seleccion', clave: 'rol', etiqueta: 'Rol', requerido: true,
    opciones: [{ valor: '', etiqueta: 'Seleccioná un rol' }, ...] },  // opción vacía obligatoria (D8)
];
const camposEditar: CampoFormulario[] = camposCrear.slice(0, 4);      // sin `rol` (D8)
```

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit — datos (Vitest, sin render) | Round-trip de `usuarios` y `cuentas-bloqueadas`; `/usuarios/abc`, `/usuarios/..` y `/cuentas-bloqueadas/x` ⇒ `no-encontrada`. `usuarios` navegable para `administrador`/`director` y ausente para los otros tres; `cuentas-bloqueadas` presente **sólo** en `comite`; invariantes de `#25`/`#26` intactas. `mensajeDeError`: los cinco códigos, `CAMPO_DUPLICADO`/`CAMPO_INVALIDO` con y sin `campo`, fallbacks `403`/`404`/genérico | `rutas.spec.ts`, `menu-por-rol.spec.ts`, `mensajes-error.spec.ts` |
| Unit — cliente API (Vitest) | Las 9 funciones nuevas: path y body correctos, `ok: true` con 2xx, `ok: false` con `status`/`codigo`/`campo` en 4xx, `resolverVacio` con el `204` de `eliminarApoderado`. `listarUsuarios` sigue devolviendo el crudo (regresión de `#26`) | `usuarios-api.spec.ts` extendido, `fetch` mockeado |
| Componente — páginas (Vitest + RTL + jsdom) | `UsuariosPage`: con `comite`/`estudiante`/sin sesión ⇒ aviso, **cero llamadas** y cero botones (D4); filtro ⇒ query correcta; click en fila ⇒ ficha sin cambiar `window.location.pathname` (D1); paginación acota las filas renderizadas (D12). `FichaUsuarioPage`: edición no ofrece `rol`; no existe ningún botón "Eliminar"; cambio de estado exige confirmación; `estado === 'bloqueado'` ⇒ sin acción de estado (D9). `PanelApoderados`: montado con `rol='estudiante'`, ausente con `rol='docente'`; `correo` vacío no viaja en el body (D10); eliminar exige confirmación. `CuentasBloqueadasPage`: con `administrador` ⇒ aviso y cero llamadas; cancelar el diálogo no llama a `desbloquearCuenta`; confirmar llama y recarga; `bloqueado_hasta: null` ⇒ "Indefinido" | `vi.mock('./usuarios-api')` + patrón `proveer()` con `SesionContext` (`Enrutador.spec.tsx`) |
| E2E | — | Ninguno nuevo: `#27` no agrega superficie de backend |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Enrutamiento (cliente) | `/usuarios` y `/cuentas-bloqueadas` sin sesión; `/usuarios/<uuid>`; `/usuarios/../../etc/passwd`; `pushState` a `/usuarios` con rol `comite`/`estudiante`; `pushState` a `/cuentas-bloqueadas` con rol `administrador`; forzar una escritura desde la consola | **Applicable** — el change agrega dos variantes de `Ruta` y tres pantallas de escritura | Ambas páginas se montan dentro de `AuthGuard` > `AppShell` (D11 de `#12`, sin cambios): la sesión, nunca la URL, decide entre `LoginPage` y la app. `parsearRuta` sigue siendo total y exige `length === 1`, así que todo `/usuarios/...` y `/cuentas-bloqueadas/...` cae en `no-encontrada`. Los dos gates de D4 son allowlists fail-closed y **no emiten ninguna llamada** cuando fallan, así que un rol equivocado no genera ni siquiera el `403`. La autorización real sigue siendo `@Roles('administrador','director')` a nivel de clase en `UsersController`/`ApoderadosController` y `@Roles('comite')` por ruta en `AuthController`, que responden `403` aunque se fuerce el botón | Sin sesión, ambos paths ⇒ `LoginPage`; `/usuarios/x`, `/usuarios/..`, `/cuentas-bloqueadas/x` ⇒ `no-encontrada` sin excepción; `comite`, `docente`, `estudiante` y rol ausente en `/usuarios` ⇒ aviso, cero botones y cero llamadas; `administrador`/`director` en `/cuentas-bloqueadas` ⇒ ídem |
| Clasificación de archivo activo | — | N/A: el change no sube ni sirve archivos | — | — |
| Selección de repositorio Git | — | N/A: el change no ejecuta Git | — | — |
| Estado de commit / de push | — | N/A: sin automatización de commits ni push | — | — |
| Comandos de PR | — | N/A: sin automatización de PR | — | — |

Sin shell, subprocesos ni integración de procesos.

## Migración / Rollout

Sin migración de datos, sin feature flags y sin regenerar el contrato OpenAPI (no se toca el
backend). Efectos observables en despliegue: el item "Usuarios" deja de estar deshabilitado para
`administrador`/`director`, y `comite` gana un item "Cuentas bloqueadas". Rollback = revertir los
commits del change; devolver `USUARIOS` a `{ clase: 'proximamente' }` y quitar `CUENTAS_BLOQUEADAS`
de la fila `comite` alcanza para desactivar ambas secciones sin tocar nada más.

**Corte de PR sugerido para `sdd-tasks`** (afina el orden de la propuesta separando ficha y
apoderados, y adelantando los cimientos, mismo criterio que `#26`; cada corte deja la app usable):

1. **PR1 — Cimientos**: `rutas`/`Enrutador`/`menu-por-rol` (+ specs) y `usuarios/mensajes-error.ts`;
   `UsuariosPage` y `CuentasBloqueadasPage` con el gate de rol de D4 y estado vacío, sin fetch.
2. **PR2 — Cliente API**: `usuarios-api.ts` expandido con `ResultadoApi` y las 9 funciones nuevas
   (+ `usuarios-api.spec.ts` extendido). `listarUsuarios` intacta.
3. **PR3 — Listado**: filtros `rol`/`estado`, `TablaGenerica`, paginación en cliente (D12) y
   selección de ficha.
4. **PR4 — Ficha**: `FichaUsuarioPage` con alta/edición (D8) y cambio de estado con confirmación (D9).
5. **PR5 — Apoderados**: `PanelApoderados` (D10), montado sólo para estudiantes.
6. **PR6 — Cuentas bloqueadas**: `CuentasBloqueadasPage` con listado y desbloqueo auditado (D11).

## Preguntas abiertas

- [ ] **Discrepancia de spec**: el delta `minimal-frontend-router` sólo declara la variante
      `Ruta 'usuarios'` y su texto todavía dice "sus paneles contextuales (apoderados, **desbloqueo**)",
      redacción anterior a la corrección post-spec del 2026-08-20. D1 agrega la variante
      `cuentas-bloqueadas`, que ese delta no cubre: corresponde ampliar el delta antes de archivar.
- [ ] **`ActualizarUsuarioDto` acepta `rol`, la UI no lo expone (D8)**. Degradar un `estudiante` con
      `Apoderado` vinculados deja esas filas vivas e inalcanzables (`ApoderadosController` responde
      `409` para cualquier otro rol) y el backend no cascadea ni bloquea. Candidato a ítem de backlog
      para `#7`: rechazar el cambio de rol con apoderados existentes, o borrarlos en cascada.
- [ ] **`GET /usuarios` no tiene paginación server-side** (`findMany` sin `take`). D12 acota el DOM
      pero no la descarga. Candidato a ítem de backlog para `#7`: `limit`/`offset` o cursor.
- [ ] `POST /auth/usuarios/:id/desbloquear` y `PATCH /usuarios/:id/estado` no declaran `type` en su
      `@ApiResponse`, así que `ResultadoDesbloqueo` y `CambioEstadoUsuario` quedan espejados a mano
      (D6). Si un change futuro regenera el contrato con esos tipos, estos locales se eliminan.
- [ ] Confirmar en `apply` que `crearUsuario` con `correo` sin `@` devuelve `400 CAMPO_INVALIDO` con
      `campo: 'correo'` (`validarCorreo`) y que el texto de D7 lo interpola correctamente.
