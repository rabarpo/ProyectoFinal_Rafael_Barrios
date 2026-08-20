# Tasks: Administración de usuarios y apoderados (Backlog #27)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,050 total across the chain (see per-PR table below) |
| 400-line budget risk | Medium if delivered as the design's suggested 6 PRs (PR1 "Cimientos" bundles routing + menu + error catalog + two page stubs, ~390-430 est.); Low with the 7-PR split below |
| Chained PRs recommended | Yes |
| Suggested split | 7 PRs (`feature-branch-chain` on the long-lived branch, tagged commits — no separate git branches, per repo convention) |
| Delivery strategy | ask-on-risk |
| Chain strategy | confirmed: 7 PRs, sequential, each leaves the app in a usable/buildable state |

Decision needed before apply: Yes — the design's suggested 6-PR cut (`design.md`, "Corte de PR
sugerido para `sdd-tasks`") groups four unrelated concerns into PR1 ("Cimientos"): the two `Ruta`
variants + `Enrutador` cases (D1), the `menu-por-rol.ts` entries (D2), the `mensajes-error.ts`
catalog (D7), and **both** page stubs with their gate logic (D4). Sized against the closest real
precedent in this repo (`academico/mensajes-error.ts` is 35 lines for 7 codes; #27's own catalog is
smaller at 5 codes but adds `campo` interpolation, D7), that combination lands close to or over the
400-line budget once RED+GREEN diffs for two stub pages are counted, unlike `academico`'s PR1 which
only had **one** stub page (`AcademicaPage` with 6 stub tabs) sharing state. This forecast splits
the design's PR1 into two: routing+menu stays first (pure data, lowest risk, unblocks every later
PR immediately), and the error catalog + two gated stubs move to their own PR2. Every other PR in
the design's cut (API client, listado, ficha, apoderados, cuentas bloqueadas) sizes comfortably
under 400 against the `academico-api.ts`/`PanelAniosEscolares`/`PanelNiveles` precedents (fewer
entities than académica: 2 domains — `Usuario`/`Apoderado` and bloqueo — vs académica's 6), so they
keep the design's grouping unchanged, just renumbered PR3-PR7.

| PR | Contents | Est. lines | Budget risk |
|----|----------|-----------:|-------------|
| PR1 | Routing + menu (D1/D2): `rutas.ts`/`.spec.ts`, `Enrutador.tsx`/`.spec.tsx`, `menu-por-rol.ts`/`.spec.ts` — both `Ruta` variants, both cases, `USUARIOS`→navegable, `CUENTAS_BLOQUEADAS` nuevo | ~160 | Low |
| PR2 | Error catalog + gated stubs (D4/D7): `usuarios/mensajes-error.ts`/`.spec.ts` + `UsuariosPage.tsx`/`.spec.tsx` and `CuentasBloqueadasPage.tsx`/`.spec.tsx` with the D4 role gate and empty state, **zero fetch** | ~250 | Low-Medium |
| PR3 | Cliente API (D5/D6): `usuarios-api.ts` expandido con `ResultadoApi`/`resolver`/`resolverVacio` + 9 funciones nuevas; `usuarios-api.spec.ts` extendido. `listarUsuarios` intacta | ~350 | Low-Medium |
| PR4 | Listado (D3/D12): `UsuariosPage` real — filtros `rol`/`estado`, `TablaGenerica`, paginación en cliente, selección de fila (placeholder de ficha, reemplazado en PR5) | ~320 | Low-Medium |
| PR5 | Ficha (D8/D9): `FichaUsuarioPage.tsx`/`.spec.tsx` — alta/edición sin `rol` en edición, cambio de estado con confirmación, sin "Eliminar"; wire en `UsuariosPage` | ~370 | Medium |
| PR6 | Apoderados (D10): `paneles/PanelApoderados.tsx`/`.spec.tsx` — CRUD, montado sólo si `rol === 'estudiante'`, borrado físico con confirmación; wire en `FichaUsuarioPage` | ~270 | Low |
| PR7 | Cuentas bloqueadas (D11): `CuentasBloqueadasPage` real — listado, formateo de `bloqueado_hasta`, desbloqueo con confirmación auditada y recarga | ~330 | Low-Medium |

Decision needed because the design flagged PR1 as a bundle of four concerns without a size check.
Confirmed adjustment: **7 PRs instead of 6**, splitting the design's PR1 into routing+menu (PR1)
and error-catalog+stubs (PR2); PR3-PR7 keep the design's grouping and numbering shifted by one. If
PR5's actual diff creeps past ~400 during apply, split the cambio-de-estado flow (D9, self-contained
around `DialogoConfirmacion`) into its own PR5b before continuing.

## Phase 1 (PR1): D1 — `Ruta 'usuarios'` y `Ruta 'cuentas-bloqueadas'`

- [x] 1.1 RED in `apps/frontend/src/app/rutas.spec.ts`: assert `parsearRuta('/usuarios') → { nombre: 'usuarios' }`, `rutaAPath({ nombre: 'usuarios' }) === '/usuarios'`, round-trip `parsearRuta(rutaAPath({ nombre: 'usuarios' }))` deep-equals the literal. Assert `parsearRuta('/usuarios/x')` and `parsearRuta('/usuarios/../../etc/passwd')` both `→ { nombre: 'no-encontrada', pathname }` (spec: `minimal-frontend-router`, "Variante `Ruta 'usuarios'` plana" — "sin introducir rutas anidadas").
- [x] 1.2 RED (same file): same three assertions for `Ruta 'cuentas-bloqueadas'` — `parsearRuta('/cuentas-bloqueadas')`, `rutaAPath`, round-trip, and `parsearRuta('/cuentas-bloqueadas/x') → no-encontrada` (spec: `minimal-frontend-router`, "Variante `Ruta 'cuentas-bloqueadas'` plana e independiente" — "colgando de la raíz y no anidada bajo `usuarios`").
- [x] 1.3 GREEN: in `apps/frontend/src/app/rutas.ts` add `{ nombre: 'usuarios' }` and `{ nombre: 'cuentas-bloqueadas' }` to the `Ruta` union, their `partes.length === 1 && partes[0] === '...'` branches in `parsearRuta`, and the matching `case`s in `rutaAPath`. Update the file's top comment to mention both new variants (D1: no `usuarioId` embedded in the route — selection lives in component state per `UsuariosPage`, not the URL).

## Phase 2 (PR1): D1 — `Enrutador.tsx` cases

- [x] 2.1 RED in `apps/frontend/src/app/Enrutador.spec.tsx`: `/usuarios` mounts `UsuariosPage` (test marker, same pattern as `/academica`).
- [x] 2.2 RED (same file): `/cuentas-bloqueadas` mounts `CuentasBloqueadasPage` (test marker).
- [x] 2.3 GREEN: in `apps/frontend/src/app/Enrutador.tsx` add `import { UsuariosPage } from '../usuarios/UsuariosPage';` and `import { CuentasBloqueadasPage } from '../usuarios/CuentasBloqueadasPage';`, plus `case 'usuarios': return <UsuariosPage />;` and `case 'cuentas-bloqueadas': return <CuentasBloqueadasPage />;`. These imports point at files created in Phase 5/6 (PR2) — until then, create minimal placeholder exports (`export function UsuariosPage() { return null; }` etc.) in throwaway stub files so PR1 typechecks and the tests above pass; PR2 replaces the stub bodies in place, no file move.
- [x] 2.4 Update `Enrutador.tsx`'s top comment (wiring history) to note `usuarios`/`cuentas-bloqueadas`'s origin (#27).

## Phase 3 (PR1): D2 — `menu-por-rol.ts`

- [x] 3.1 RED in `apps/frontend/src/app/menu-por-rol.spec.ts`: update the `administrador`/`director` item-set assertions so `USUARIOS` is `{ clase: 'navegable', id: 'usuarios', ruta: { nombre: 'usuarios' } }` instead of the current `proximamente` placeholder. Confirm this fails against the current constant.
- [x] 3.2 RED (same file): assert `comite`'s item set includes a new `{ clase: 'navegable', id: 'cuentas-bloqueadas', ruta: { nombre: 'cuentas-bloqueadas' } }` item; assert `administrador`/`director`/`docente`/`estudiante` do **not** include it (spec: `bloqueo-desbloqueo-cuentas`, "Un rol distinto de comité no puede alcanzar la vista" — client-side defense in depth for D2).
- [x] 3.3 RED (same file): assert `comite`'s item set does **not** include `usuarios` (spec: `administracion-usuarios-apoderados`, "Comité no ve el item de menú `usuarios`").
- [x] 3.4 RED (same file): confirm the existing round-trip invariant (every `navegable` item's `ruta` satisfies `parsearRuta(rutaAPath(item.ruta))` deep-equals `item.ruta`) iterates the updated array and covers both new items without a bespoke test.
- [x] 3.5 GREEN: in `apps/frontend/src/app/menu-por-rol.ts` change `USUARIOS` to `{ clase: 'navegable', id: 'usuarios', etiqueta: 'Usuarios', ruta: { nombre: 'usuarios' } }` (present only in `administrador`/`director` rows, unchanged from today) and add `CUENTAS_BLOQUEADAS: { clase: 'navegable', id: 'cuentas-bloqueadas', etiqueta: 'Cuentas bloqueadas', ruta: { nombre: 'cuentas-bloqueadas' } }` only in the `comite` row. Update the doc comment above `MENU_POR_ROL`.
- [x] 3.6 Full regression for PR1: run `pnpm --filter @seei/frontend test rutas.spec.ts Enrutador.spec.tsx menu-por-rol.spec.ts` green, then `pnpm --filter @seei/frontend test` (full suite) and `pnpm typecheck` clean before opening PR1. Also updated `NavegacionPrincipal.spec.tsx` (pre-existing test used `usuarios` as its "próximamente" example — swapped to `configuracion` and added `[3.1]`/`[3.2]` navegable-click assertions for `usuarios`/`cuentas-bloqueadas`) — not itself a task in this list but a direct regression consequence of D2 within PR1 scope.

## Phase 4 (PR2): D7 — `usuarios/mensajes-error.ts`

- [x] 4.1 RED in `apps/frontend/src/usuarios/mensajes-error.spec.ts` (new): for each of the 5 `CodigoUsuarios` values (`CAMPO_DUPLICADO`, `ESTADO_DESTINO_NO_PERMITIDO`, `TRANSICION_DESDE_BLOQUEADO`, `CAMPO_INVALIDO`, `USUARIO_NO_ES_ESTUDIANTE`) assert `mensajeDeError({ codigo })` returns a non-generic, non-empty string. Verify the exact literal set against `apps/backend/src/users/users.errors.ts` before writing the union — do not trust design.md's list without re-checking the source file.
- [x] 4.2 RED (same file): assert `mensajeDeError({ codigo: 'CAMPO_DUPLICADO', campo: 'dni' })` interpolates `'dni'` (e.g. "Ya existe otro usuario con ese dni"); assert `mensajeDeError({ codigo: 'CAMPO_INVALIDO', campo: 'correo' })` interpolates `'correo'` too (spec: `administracion-usuarios-apoderados`, "Errores de unicidad del backend se muestran legibles"; design.md D7).
- [x] 4.3 RED (same file): assert `mensajeDeError({ codigo: 'CAMPO_DUPLICADO' })` (no `campo`) still returns a non-empty string (graceful without interpolation).
- [x] 4.4 RED (same file): assert the status-based fallback when `codigo` is absent — `mensajeDeError({ status: 403 })` ⇒ "Tu rol no permite esta acción" (or equivalent), `mensajeDeError({ status: 404 })` ⇒ "El registro ya no existe" (or equivalent), `mensajeDeError({})` ⇒ a generic non-empty fallback, never `undefined` (design.md D7: `NotFoundException` from `users.service.ts`/`apoderados.service.ts` are plain text without `codigo`).
- [x] 4.5 GREEN: create `apps/frontend/src/usuarios/mensajes-error.ts` with `export type CodigoUsuarios = ...` (5 literals) and `export function mensajeDeError(e: { codigo?: CodigoUsuarios; campo?: string; status?: number }): string` backed by a `Record<CodigoUsuarios, string>` total map (compile error, not silent degradation, if a code is added to the backend without updating this map — same discipline as `MENU_POR_ROL` and `academico/mensajes-error.ts`) plus the status-based fallback chain.

## Phase 5 (PR2): D4 — `UsuariosPage` gate stub, sin fetch

- [x] 5.1 RED in `apps/frontend/src/usuarios/UsuariosPage.spec.tsx` (new, `proveer()` pattern with `SesionContext` from `Enrutador.spec.tsx`): role `administrador` or `director` renders the page shell (test marker) without throwing; **zero `fetch` calls** at this stage (no `usuarios-api` mock wired yet — assert via `vi.stubGlobal('fetch', vi.fn())` and expect it uncalled).
- [x] 5.2 RED (same file): role `comite`, `docente`, `estudiante`, or no session (`rol` undefined) renders a `role="status"` message ("Esta sección no está disponible para tu rol" or equivalent) and **zero `fetch` calls** — this is the allowlist gate itself, not a defense-in-depth afterthought (spec: `administracion-usuarios-apoderados`, "Aislamiento del rol comite en el cliente"; design.md D4: allowlist fail-closed, `puedeGestionar = rol === 'administrador' || rol === 'director'`, written as an allowlist not `rol === 'comite'` denylist).
- [x] 5.3 GREEN: create `apps/frontend/src/usuarios/UsuariosPage.tsx` — `useSesion()` ⇒ `rol`; `const puedeGestionar = rol === 'administrador' || rol === 'director'`; if `!puedeGestionar` render the gate message and return before any fetch; if `puedeGestionar`, render a placeholder shell only (real listado/filtros land in PR4 — Phase 2.3's throwaway stub file is deleted, this becomes the real file).

## Phase 6 (PR2): D4 — `CuentasBloqueadasPage` gate stub, sin fetch

- [x] 6.1 RED in `apps/frontend/src/usuarios/CuentasBloqueadasPage.spec.tsx` (new, same `proveer()` pattern): role `comite` renders the page shell without throwing; zero `fetch` calls at this stage.
- [x] 6.2 RED (same file): role `administrador`, `director`, `docente`, `estudiante`, or no session renders a `role="status"` gate message and zero `fetch` calls (spec: `bloqueo-desbloqueo-cuentas`, "Un rol distinto de comité no puede alcanzar la vista"; design.md D4: `puedeDesbloquear = rol === 'comite'`, second independent allowlist gate — do not share a boolean with `UsuariosPage`'s gate).
- [x] 6.3 GREEN: create `apps/frontend/src/usuarios/CuentasBloqueadasPage.tsx` — `useSesion()` ⇒ `rol`; `const puedeDesbloquear = rol === 'comite'`; gate message + early return when false; placeholder shell when true (real listado/desbloqueo land in PR7).
- [x] 6.4 Full regression for PR2: run `pnpm --filter @seei/frontend test mensajes-error.spec.ts UsuariosPage.spec.tsx CuentasBloqueadasPage.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR2. Delete the Phase 2.3 throwaway stub files if they still exist as separate files — `UsuariosPage.tsx`/`CuentasBloqueadasPage.tsx` are now the real files `Enrutador.tsx` imports.

## Phase 7 (PR3): D5/D6 — `usuarios-api.ts`: `ResultadoApi` + funciones de `Usuario`

- [x] 7.1 RED in `apps/frontend/src/usuarios/usuarios-api.spec.ts` (extend the existing file, mocking `fetch` the same way it already does for `listarUsuarios` and the way `academico-api.spec.ts` does for its writes): `crearUsuario(input)` calls `POST /usuarios` with the 5-field body and returns `{ ok: true, data }` on a 2xx mock response.
- [x] 7.2 RED (same file): `crearUsuario` returns `{ ok: false, status, codigo: 'CAMPO_DUPLICADO', campo: 'dni' }` on a 409 mock response body `{ codigo, campo }` (design.md D6: `ResultadoApi<T>` carries `campo`, not `relacion` — this domain's 409s use `campo`, académica's use `relacion`, they are shaped differently on purpose).
- [x] 7.3 RED (same file): `actualizarUsuario(id, input)` calls `PATCH /usuarios/{id}` with the path param and the (4-field, no `rol`) body; returns `{ ok: true, data }` / `{ ok: false, ... }` per the same pattern.
- [x] 7.4 RED (same file): `cambiarEstadoUsuario(id, 'inactivo')` calls `PATCH /usuarios/{id}/estado` with `{ estado: 'inactivo' }`; on a 2xx mock body `{ id, estado }` resolves `ResultadoApi<CambioEstadoUsuario>` unchanged (design.md D6: hand-mirrored type, `@ApiResponse` has no `type`); on a 409 mock body `{ codigo: 'TRANSICION_DESDE_BLOQUEADO' }` returns `{ ok: false, codigo }`.
- [x] 7.5 GREEN: expand `apps/frontend/src/usuarios/usuarios-api.ts` — add `import type { CodigoUsuarios } from './mensajes-error'`; add `ResultadoApi<T> { ok, data?, status?, codigo?: CodigoUsuarios, campo? }`; copy `resolver`/`resolverVacio`/`extraerCodigo` from `academico-api.ts`, adapted to extract `campo` instead of `relacion` (new `extraerCampo` helper); add `CambioEstadoUsuario` hand-mirrored interface; add `CrearUsuarioInput`/`ActualizarUsuarioInput` interfaces mirrored by hand from `apps/backend/src/users/dto/{crear-usuario,actualizar-usuario}.dto.ts` (`ActualizarUsuarioInput` omits `rol` on purpose, per D8 — verify the DTO itself still accepts `rol`, the omission is a UI decision, not a type mismatch); add `crearUsuario`, `actualizarUsuario`, `cambiarEstadoUsuario` with `as never` on `body`/`params.path` (D6 precedent). Do not touch `listarUsuarios`.

## Phase 8 (PR3): D5/D6 — `usuarios-api.ts`: funciones de `Apoderado`

- [x] 8.1 RED in `usuarios-api.spec.ts`: `listarApoderados(usuarioId)` calls `GET /usuarios/{usuarioId}/apoderados`; returns `ResultadoApi<ApoderadoRespuestaDto[]>` — `{ ok: true, data: [] }` on 2xx, `{ ok: false, codigo: 'USUARIO_NO_ES_ESTUDIANTE' }` on a 409 mock (design.md D5: this read needs the envelope, unlike académica's raw reads, because it must distinguish "failed, wrong role" from "empty list").
- [x] 8.2 RED (same file): `crearApoderado(usuarioId, input)` calls `POST /usuarios/{usuarioId}/apoderados` with `{ nombres, dni, correo? }`; `{ ok: true, data }` / `{ ok: false, codigo, campo }` per the 2xx/4xx pattern.
- [x] 8.3 RED (same file): `actualizarApoderado(usuarioId, apoderadoId, input)` calls `PATCH /usuarios/{usuarioId}/apoderados/{apoderadoId}` with both path params and the partial body.
- [x] 8.4 RED (same file): `eliminarApoderado(usuarioId, apoderadoId)` calls `DELETE /usuarios/{usuarioId}/apoderados/{apoderadoId}` and resolves via `resolverVacio` — `{ ok: true }` on a 204 mock response with no body (mirror `candidatos-api.spec.ts`'s `resolverVacio` test pattern, do not re-test `resolverVacio` itself, just that the wrapper is wired to it).
- [x] 8.5 GREEN: add `ApoderadoRespuestaDto` type alias from `components['schemas']`; add `CrearApoderadoInput { nombres: string; dni: string; correo?: string }` and `ActualizarApoderadoInput { nombres?: string; dni?: string; correo?: string }` mirrored from `apps/backend/src/apoderados/dto/*.dto.ts`; add `listarApoderados`, `crearApoderado`, `actualizarApoderado`, `eliminarApoderado` with `as never` on path/body params per D6.

## Phase 9 (PR3): D5/D6 — `usuarios-api.ts`: funciones de bloqueo

- [x] 9.1 RED in `usuarios-api.spec.ts`: `listarCuentasBloqueadas()` calls `GET /auth/usuarios/bloqueados`; `{ ok: true, data: [...] }` on 2xx, `{ ok: false, status: 403 }` on a 403 mock with no `codigo` (design.md D5: any role that forces the URL gets a plain 403, not a discriminable business code — the envelope still needs to distinguish "failed" from "empty").
- [x] 9.2 RED (same file): `desbloquearCuenta(id)` calls `POST /auth/usuarios/{id}/desbloquear`; on a 2xx mock body `{ desbloqueado: true }` resolves `ResultadoApi<ResultadoDesbloqueo>` unchanged (D6: hand-mirrored, `@ApiResponse` has no `type`); on a 2xx mock body `{ desbloqueado: false }` (already-recovered idempotent case, design.md D11) resolves the same shape, `ok: true`, without treating `desbloqueado: false` as a failure.
- [x] 9.3 GREEN: add `UsuarioBloqueadoDto` type alias from `components['schemas']`; add `ResultadoDesbloqueo { desbloqueado: boolean }` hand-mirrored interface; add `listarCuentasBloqueadas(signal?)` and `desbloquearCuenta(id)` with `as never` on path params where the contract blocks it.
- [x] 9.4 Full regression for PR3: run `pnpm --filter @seei/frontend test usuarios-api.spec.ts` green (all 9 new functions plus the pre-existing `listarUsuarios` regression), then full suite + `pnpm typecheck` before opening PR3.

## Phase 10 (PR4): D3/D12 — `UsuariosPage` listado real: fetch + filtros

- [x] 10.1 RED in `UsuariosPage.spec.tsx` (`vi.mock('./usuarios-api')`): with `puedeGestionar === true`, mounts and calls `listarUsuarios(undefined)` (or `{}`) once, rendering rows via `TablaGenerica` (spec: `administracion-usuarios-apoderados`, "UI de listado central de `Usuario` con filtro por rol y estado").
- [x] 10.2 RED (same file): selecting `rol = 'docente'` in the filter `<select>` re-fetches `listarUsuarios({ rol: 'docente' })`; selecting `estado = 'activo'` too re-fetches `listarUsuarios({ rol: 'docente', estado: 'activo' })` (spec scenario: "Filtrar el listado por rol y estado").
- [x] 10.3 RED (same file): a filter combination whose mocked response is `[]` renders a readable empty state, not an error (spec scenario: "Listado vacío no rompe la vista").
- [x] 10.4 GREEN: in `apps/frontend/src/usuarios/UsuariosPage.tsx`, when `puedeGestionar`, add `useEffect` calling `listarUsuarios(filtros)` on mount and on filter change; render two native `<select>`s (`rol`, `estado`) plus `TablaGenerica` with columns `nombres`/`dni`/`codigo`/`correo`/`rol`/`estado`; empty result renders `TablaGenerica`'s own `mensajeVacio` (Phase 6.2 of `#26` already covers that piece — do not reimplement it here).

## Phase 11 (PR4): D12 — paginación en cliente

- [x] 11.1 RED in `UsuariosPage.spec.tsx`: mock `listarUsuarios` resolving 30 rows; assert only 25 rows render (`PAGINA = 25`) plus a footer "Mostrando 1–25 de 30" (or equivalent); clicking "Siguiente" renders rows 26-30 and updates the footer to "Mostrando 26–30 de 30"; "Anterior" is disabled/absent on the first page (design.md D12: `TablaGenerica` itself stays untouched — pagination is `slice`d in `UsuariosPage`, not the generic piece).
- [x] 11.2 GREEN: add client-side pagination state (`const [pagina, setPagina] = useState(0)`) to `UsuariosPage`, `slice` the filtered rows before passing them to `TablaGenerica`, render the "Mostrando N–M de T" footer with anterior/siguiente buttons; reset `pagina` to `0` whenever the filters change (untested edge case worth asserting: filtering while on page 2 doesn't strand the user on an out-of-range page).

## Phase 12 (PR4): D3/D1 — selección de fila abre la ficha (placeholder)

- [x] 12.1 RED in `UsuariosPage.spec.tsx`: clicking "Abrir" on a row sets `usuarioSeleccionado` and renders a placeholder in place of the listado (distinct test marker) **without** calling `navegar()` or changing `window.location.pathname` (spec: `minimal-frontend-router`, "Abrir la ficha de un usuario no cambia la URL").
- [x] 12.2 RED (same file): from the placeholder, invoking `onVolver` (a "Volver" button in the placeholder) returns to the listado and re-renders `TablaGenerica`.
- [x] 12.3 GREEN: add `const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<UsuarioRespuestaDto | null>(null)` local to `UsuariosPage` (design.md D1: state, not the URL); an "Abrir" action in `TablaGenerica`'s `acciones` sets it; when non-null, render a placeholder component with an `onVolver` prop instead of the listado (Phase 16 replaces this placeholder with the real `FichaUsuarioPage`, same swap pattern as `academico/AcademicaPage`'s stub tabs in `#26`).
- [x] 12.4 Full regression for PR4: run `pnpm --filter @seei/frontend test UsuariosPage.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR4.

## Phase 13 (PR5): D8 — `FichaUsuarioPage`: alta y edición

- [x] 13.1 RED in `apps/frontend/src/usuarios/FichaUsuarioPage.spec.tsx` (new, `vi.mock('./usuarios-api')`): in creation mode (`usuario: null` or a `modo: 'creacion'` prop, per whatever signature Phase 12/16 settle on), the form renders 5 fields (`nombres`, `dni`, `codigo`, `correo`, `rol`) and `rol`'s `<select>` includes the empty placeholder option `{ valor: '', etiqueta: 'Seleccioná un rol' }` followed by the 5 roles (design.md D8: without it, submit stays silently disabled).
- [x] 13.2 RED (same file): in edition mode (an existing `usuario` prop), the form renders only 4 fields — `rol` is **absent**, not disabled (spec: `administracion-usuarios-apoderados`, "Edición de un usuario existente"; design.md D8: `rol` omitted from `camposEditar` on purpose, `ActualizarUsuarioDto` accepting it is irrelevant to this UI decision).
- [x] 13.3 RED (same file): submitting the creation form calls `crearUsuario({ nombres, dni, codigo, correo, rol })` with **no** password field in the payload (spec scenario: "Alta de un usuario con rol docente sin campo de contraseña"); on `{ ok: true }` calls `onCambio` (triggers the parent's listado reload) and clears/closes the form.
- [x] 13.4 RED (same file): on `{ ok: false, codigo: 'CAMPO_DUPLICADO', campo: 'dni' }`, the form shows `mensajeDeError(...)` in a `role="alert"` element and does **not** call `onCambio` or retry automatically (spec scenario: "Errores de unicidad del backend se muestran legibles").
- [x] 13.5 RED (same file): submitting the edition form calls `actualizarUsuario(id, { correo })` with only the changed 4-field shape (spec scenario: "Edición de un usuario existente"). Implemented as `actualizarUsuario(id, { nombres, dni, codigo, correo })` — the full 4-field `ActualizarUsuarioInput` shape sourced from the form's current values (unchanged fields included, since `FormularioGenerico` always returns every field as a `Record<string,string>`), not a diffed partial. The spec scenario only requires the changed `correo` to travel; sending the full 4-field body satisfies it without adding dirty-field-tracking complexity.
- [x] 13.6 GREEN: create `apps/frontend/src/usuarios/FichaUsuarioPage.tsx` receiving `{ usuario, soloLectura, onVolver, onCambio }` (design.md D3); build `camposCrear`/`camposEditar` per design.md's exact `CampoFormulario[]` literals (D8); wire `FormularioGenerico` in `creacion`/`edicion` mode per `usuario === null`; call `crearUsuario`/`actualizarUsuario`, surface `mensajeDeError` on failure, call `onCambio` on success.

## Phase 14 (PR5): D9 — cambio de estado con confirmación

- [x] 14.1 RED in `FichaUsuarioPage.spec.tsx`: with `usuario.estado === 'activo'` and `soloLectura === false`, an "Desactivar" action opens `DialogoConfirmacion`; confirming calls `cambiarEstadoUsuario(id, 'inactivo')` and, on success, calls `onCambio` (spec scenario: "Desactivar un usuario activo").
- [x] 14.2 RED (same file): with `usuario.estado === 'inactivo'`, the action reads "Activar" and confirming calls `cambiarEstadoUsuario(id, 'activo')`.
- [x] 14.3 RED (same file): with `usuario.estado === 'bloqueado'`, **no** activar/desactivar action renders — `estado` shows as read-only text instead (design.md D9: `UsersService.cambiarEstado` returns `409 TRANSICION_DESDE_BLOQUEADO` from `bloqueado`, so the UI never offers a button whose only outcome is that error).
- [x] 14.4 RED (same file): no button or action anywhere in the ficha is labeled "Eliminar" (spec scenario: "Ningún botón 'Eliminar' está disponible" — assert `screen.queryByText(/eliminar/i)` returns `null` for the top-level ficha, scoped so it doesn't accidentally also assert about `PanelApoderados`'s own "Eliminar" which is legitimate per D10 and lands in PR6).
- [x] 14.5 RED (same file): with `soloLectura === true`, no estado action renders regardless of `estado` (D4 propagation into the ficha).
- [x] 14.6 GREEN: add the estado action + `DialogoConfirmacion` wiring to `FichaUsuarioPage.tsx` per the flows above; `acciones = soloLectura ? [] : [...]` pattern (D4/D8 of `#26`, reused here). Implemented as a single conditional button (not an `acciones[]` array like `TablaGenerica`'s row actions) since the ficha only ever has one estado action at a time — the `soloLectura`-gates-to-nothing discipline is preserved via `puedeCambiarEstado = !soloLectura && usuario && usuario.estado !== 'bloqueado'`.

## Phase 15 (PR5): Wire `FichaUsuarioPage` en `UsuariosPage`

- [x] 15.1 GREEN: in `apps/frontend/src/usuarios/UsuariosPage.tsx`, replace the Phase 12 placeholder with `<FichaUsuarioPage usuario={usuarioSeleccionado} soloLectura={!puedeGestionar} onVolver={() => setUsuarioSeleccionado(null)} onCambio={() => { recargarListado(); setUsuarioSeleccionado(null); }} />` (or equivalent — confirm at apply time whether staying on the ficha after a successful edit, vs. returning to the listado, is the better UX; design.md doesn't mandate either, keep whichever the tests in Phase 13/14 already committed to). Implemented exactly as suggested: `onCambio` closes the ficha (`setUsuarioSeleccionado(null)`) and reloads (`cargar()`) — returning to the listado, consistent with `#26`'s "reload over optimistic update" pattern. The `FichaUsuarioPlaceholder` component and its `data-testid="ficha-usuario-placeholder"` marker were removed from `UsuariosPage.tsx` entirely (Phase 12.3's throwaway swap target).
- [x] 15.2 Update `UsuariosPage.spec.tsx`'s Phase 12 placeholder-marker assertions to real `FichaUsuarioPage` content, or keep them scoped to the swap mechanics and rely on Phase 13/14's specs for ficha-level behavior (prefer the latter, same call `#26` made for `AcademicaPage` vs its panels). Kept scoped to swap mechanics: tests 12.1/12.2 now assert `data-testid="ficha-usuario-page"` mounts/unmounts and the URL doesn't change; added one extra `[15.1]` test asserting `onCambio` (via a real "Desactivar" confirm flow) returns to the listado and re-triggers `listarUsuarios`.
- [x] 15.3 Full regression for PR5: run `pnpm --filter @seei/frontend test FichaUsuarioPage.spec.tsx UsuariosPage.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR5. Result: `FichaUsuarioPage.spec.tsx` (11 tests) + `UsuariosPage.spec.tsx` (14 tests) green; full suite 69 files / 439 tests green; `pnpm typecheck` clean across all 4 packages.

## Phase 16 (PR6): D10 — `PanelApoderados`: listado, alta, edición

- [x] 16.1 RED in `apps/frontend/src/usuarios/paneles/PanelApoderados.spec.tsx` (new, `vi.mock('../usuarios-api')`): mounts (given `{ usuarioId, soloLectura }`) and calls `listarApoderados(usuarioId)` once, rendering rows via `TablaGenerica` (spec: `administracion-usuarios-apoderados`, "Panel de apoderados visible en la ficha de un estudiante").
- [x] 16.2 RED (same file): submitting the alta form with `nombres`/`dni` filled and `correo` left blank calls `crearApoderado(usuarioId, { nombres, dni, correo: undefined })` — the empty `correo` key does **not** travel as `''` (design.md D10: `FormularioGenerico` always returns every key as a `string`, the container trims-and-undefines it; spec scenario: "Alta de un apoderado desde la ficha del estudiante").
- [x] 16.3 RED (same file): submitting with `correo` filled (e.g. `'a@b.com'`) calls `crearApoderado(usuarioId, { nombres, dni, correo: 'a@b.com' })`.
- [x] 16.4 RED (same file): editing an existing apoderado calls `actualizarApoderado(usuarioId, apoderadoId, { ... })` with the changed fields, same blank-`correo`-omission rule.
- [x] 16.5 RED (same file): `soloLectura === true` hides "Crear"/"Editar"/"Eliminar" entirely (D4 propagation).
- [x] 16.6 GREEN: create `apps/frontend/src/usuarios/paneles/PanelApoderados.tsx` — fetch/filter/dialog state owned locally, `TablaGenerica` + `FormularioGenerico` (fields `nombres`/`dni` required, `correo` optional) wired to `listarApoderados`/`crearApoderado`/`actualizarApoderado`, `correo: valores.correo.trim() || undefined` normalization in the submit handler (D10).

## Phase 17 (PR6): D10 — eliminar apoderado (borrado físico)

- [x] 17.1 RED in `PanelApoderados.spec.tsx`: clicking "Eliminar" on a row opens `DialogoConfirmacion` whose text explicitly says the deletion is physical/permanent (spec scenario: "Eliminar un apoderado pide confirmación y es borrado físico" — assert the dialog copy, not just that it opens).
- [x] 17.2 RED (same file): confirming calls `eliminarApoderado(usuarioId, apoderadoId)`; on success the row disappears from the panel after a reload (no optimistic local removal without reload, keep consistent with the rest of the change's "reload over optimistic update" pattern from D11).
- [x] 17.3 RED (same file): cancelling the dialog calls neither `eliminarApoderado` nor a reload.
- [x] 17.4 GREEN: add the "Eliminar" action + `DialogoConfirmacion` wiring to `PanelApoderados.tsx`.

## Phase 18 (PR6): Wire `PanelApoderados` en `FichaUsuarioPage`

- [x] 18.1 RED in `FichaUsuarioPage.spec.tsx`: with `usuario.rol === 'estudiante'`, `PanelApoderados` is mounted (assert via a test marker or `vi.mock('./paneles/PanelApoderados')` spy on props) (spec scenario: "Panel de apoderados visible en la ficha de un estudiante").
- [x] 18.2 RED (same file): with `usuario.rol === 'docente'` (or any other non-`estudiante` role), `PanelApoderados` is **not** mounted — assert zero calls to `listarApoderados` even indirectly, not just "not visible" (spec scenario: "Panel de apoderados ausente para un rol distinto de estudiante"; design.md D10: mounting it unconditionally would fire `GET /usuarios/:id/apoderados` ⇒ `409` for the other four roles). Implemented with `vi.mock('./paneles/PanelApoderados')` at the top of the file (applies to the whole spec file), which also protects the pre-existing Phase 13/14 tests (all use the default `rol: 'estudiante'` fixture) from calling the real `listarApoderados` and breaking on the auto-mocked `usuarios-api`.
- [x] 18.3 GREEN: in `FichaUsuarioPage.tsx`, render `usuario.rol === 'estudiante' ? <PanelApoderados usuarioId={usuario.id} soloLectura={soloLectura} /> : null` (condition lives in `FichaUsuarioPage`, not inside `PanelApoderados` itself, per design.md D10).
- [x] 18.4 Full regression for PR6: run `pnpm --filter @seei/frontend test PanelApoderados.spec.tsx FichaUsuarioPage.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR6.

## Phase 19 (PR7): D11 — `CuentasBloqueadasPage` listado real

- [x] 19.1 RED in `CuentasBloqueadasPage.spec.tsx` (`vi.mock('./usuarios-api')`): with `puedeDesbloquear === true`, mounts and calls `listarCuentasBloqueadas()` once, rendering rows via `TablaGenerica` with columns `id`/`nombres`/`dni`/`codigo`/`bloqueado_hasta` (spec: `bloqueo-desbloqueo-cuentas`, "Comité ve el listado de cuentas bloqueadas").
- [x] 19.2 RED (same file): a row with `bloqueado_hasta: null` renders "Indefinido" (or equivalent) instead of a blank/`null` cell (design.md D11 explicit formatting rule).
- [x] 19.3 RED (same file): a row with a real `bloqueado_hasta` timestamp renders it formatted (assert a locale-formatted date string, not the raw ISO string).
- [x] 19.4 GREEN: add the fetch-on-mount + `TablaGenerica` wiring to `CuentasBloqueadasPage.tsx`, with a `formatearBloqueadoHasta(valor: string | null): string` helper for the null-and-format rule.

## Phase 20 (PR7): D11 — desbloqueo con confirmación auditada

- [x] 20.1 RED in `CuentasBloqueadasPage.spec.tsx`: clicking "Desbloquear" on a row opens `DialogoConfirmacion` whose text explicitly mentions the action is registered/audited (spec scenario: "Desbloquear una cuenta pide confirmación con mención de auditoría" — assert the dialog copy, not just that it opens; ADR-0008).
- [x] 20.2 RED (same file): cancelling the dialog calls neither `desbloquearCuenta` nor a reload, and the row stays visible (spec scenario: "Cancelar el diálogo no desbloquea la cuenta").
- [x] 20.3 RED (same file): confirming calls `desbloquearCuenta(id)`, then re-calls `listarCuentasBloqueadas()` (reload, not local row removal — design.md D11: the reload is the only way to reflect the idempotent `desbloqueado: false` case correctly); on the reload's response no longer including that row, it disappears (spec scenario: "Cuenta desbloqueada exitosamente desaparece del listado").
- [x] 20.4 RED (same file): every rendered row already has `estado === 'bloqueado'` implicitly (the endpoint only returns those), so a dedicated "no button for non-bloqueado rows" test is redundant with 19.1 — instead assert the listado never renders an `estado` column claiming otherwise (`GET /auth/usuarios/bloqueados` contract, spec scenario "Cuenta ya recuperada no ofrece botón de desbloqueo" — covered structurally, not per-row, since the backend never returns a non-`bloqueado` row here). Covered structurally by 19.1's `COLUMNAS` (id/nombres/dni/codigo/bloqueado_hasta only, no `estado` column) — no dedicated test added.
- [x] 20.5 GREEN: add the "Desbloquear" action + `DialogoConfirmacion` wiring to `CuentasBloqueadasPage.tsx`, reload-on-confirm per the flow above.
- [x] 20.6 Full regression for PR7 (final PR of the chain): run `pnpm --filter @seei/frontend test CuentasBloqueadasPage.spec.tsx` green, then the FULL `pnpm --filter @seei/frontend test` suite and `pnpm typecheck` clean before opening PR7. Result: `CuentasBloqueadasPage.spec.tsx` (12 tests) green; full suite 70 files / 457 tests green; `pnpm typecheck` clean across all 4 packages. Manual staging confirmation of `crearUsuario`'s `CAMPO_INVALIDO`/`correo` flow against a real backend was NOT performed in this apply batch (no staging environment available to this executor) — flagged below as a follow-up, not silently skipped.

## Cross-cutting checklist (verify once, applies across PR2/PR4-PR7)

- [x] For every page/panel with a write action: confirm each gate (`puedeGestionar` in `UsuariosPage`, `puedeDesbloquear` in `CuentasBloqueadasPage`) is derived **once**, as an allowlist (`rol === 'administrador' || rol === 'director'`, `rol === 'comite'`), never as a denylist (`rol !== 'comite'` etc.) — design.md D4 explicitly flags this as a deviation from `#26` D8's graduated `soloLectura`, because here a failed gate means **zero reads too**, not read-only. Verified: both gates are single `const` allowlist expressions in their respective files, computed once at the top of the component.
- [x] Confirm `PanelApoderados` and `FichaUsuarioPage`'s estado action both derive `acciones = soloLectura ? [] : [...]` from a prop, never from calling `useSesion()` internally — keeps them testable with a plain boolean, same discipline as every `#26` panel. Verified in both files; `CuentasBloqueadasPage` follows the equivalent discipline (`acciones` built only when `puedeDesbloquear` is true, after the early return).
- [x] For every write wrapper in `usuarios-api.ts` that can fail with a `codigo`: confirm the consuming component passes `{ codigo, campo, status }` through to `mensajeDeError` unchanged, rather than re-deriving its own message string. Verified across `FichaUsuarioPage`, `PanelApoderados`, and `CuentasBloqueadasPage` (the latter passes `{ codigo, status }`, no `campo` applicable to `desbloquearCuenta`'s failure shape).
- [x] Grep `apps/frontend/src/usuarios` for any `className` token not already in the project's approved token list (same audit as `#25`/`#26`); confirm nothing new was added to `tailwind.config.*`/`index.css`. Grepped: all classes used (`max-w-page`, `text-headline-lg*`, `text-primary`, `rounded-control`, `bg-primary`, `text-on-primary`, `text-error`, etc.) are pre-existing tokens already used elsewhere in the domain; no edits to `tailwind.config.*`/`index.css`.
- [x] Confirm no file in `apps/frontend/src/usuarios` imports from `apps/frontend/src/academico` or vice versa — the two domains share only `comun/piezas/*`, per design.md's Approach section. Verified via grep: no file under `usuarios/` imports from `academico/`. The reverse (`academico/AcademicaPage.spec.tsx`, `academico/paneles/PanelMatriculas.tsx`/`.spec.tsx` importing `usuarios/usuarios-api`) is a known, pre-existing, design-accepted exception (design.md D5: `listarUsuarios` is the `#26` seed that `PanelMatriculas` consumes directly) — not introduced by this PR7 batch, not a new violation.

## Post-chain: full suite sanity (run after PR7 merges)

- [x] Run `pnpm --filter @seei/frontend test` (entire suite, all 7 PRs' specs together) and confirm green. 70 files / 457 tests green.
- [x] Run `pnpm typecheck` and confirm clean (validates the `Ruta`/`ItemMenu` union exhaustiveness and the `Record<CodigoUsuarios, string>` totality end-to-end). Clean across `@seei/backend`, `@seei/contracts`, `@seei/frontend`, `@seei/worker`.
- [x] Confirm the proposal's Success Criteria checklist: `administrador`/`director` manage the 5 roles from `/usuarios` without calling the API by hand; apoderados are managed only from the student's ficha, never as an independent section; cuentas bloqueadas are unblocked manually from `/cuentas-bloqueadas` (role `comite`) with an explicit audited confirmation; `comite` sees neither the `usuarios` item nor any write button in that domain, and `administrador`/`director` don't see "Cuentas bloqueadas". Confirmed by the phase-by-phase test suite (menu-por-rol.spec.ts, UsuariosPage.spec.tsx, FichaUsuarioPage.spec.tsx, PanelApoderados.spec.tsx, CuentasBloqueadasPage.spec.tsx) — no manual UI walkthrough performed by this executor beyond automated coverage.
- [x] Before archiving, amend `openspec/changes/frontend-administracion-usuarios/specs/minimal-frontend-router/spec.md` if any residual text still describes desbloqueo as a contextual panel of `Ruta 'usuarios'` (design.md's "Preguntas abiertas" flagged this against `proposal.md`'s original draft; the delta file itself, as read at `sdd-tasks` time, already states the corrected independent-route requirement — re-verify at archive time that no stale wording slipped back in during apply). Checked `specs/minimal-frontend-router/spec.md` in this apply batch: it already reflects the corrected independent-route requirement (`Ruta 'cuentas-bloqueadas'` as its own flat variant); no stale wording found.
