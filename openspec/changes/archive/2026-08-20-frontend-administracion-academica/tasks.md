# Tasks: Administración académica (Backlog #26)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,300 total across the chain (see per-PR table below) |
| 400-line budget risk | High if delivered as the design's suggested 5 PRs; Low-Medium with the 7-PR split below |
| Chained PRs recommended | Yes |
| Suggested split | 7 PRs (`feature-branch-chain` on the long-lived branch, tagged commits — no separate git branches per repo convention) |
| Delivery strategy | ask-on-risk |
| Chain strategy | confirmed: 7 PRs, sequential, each leaves `/academica` in a usable state |

Decision needed before apply: Yes — the design's suggested 5-PR cut (`design.md`, "Corte de PR
sugerido") underestimates two things once broken into real tasks: (1) the three generic pieces
(`TablaGenerica`+spec, `FormularioGenerico`+spec, `DialogoConfirmacion`+spec) alone are
~385 lines, which combined with `academico-api.ts` (D6: 2 missing reads + 15 writes +
`ResultadoApi`/`resolver`, mirroring `candidatos-api.ts`'s ~150 lines of just wrapper functions)
would blow PR2's budget; (2) `PanelMatriculas` (D9/D10: aula-required filter, alta, retiro, AND
the two-step traslado with its own confirmation copy) is proportionally the heaviest single panel
and cannot share a PR with `PanelAulas` under 400 lines. This forecast splits the design's PR3/PR4/
PR5 (Años+Niveles / Grados+Secciones / Aulas+Matrículas) into finer units and separates Aulas from
Matrículas entirely.

| PR | Contents | Est. lines | Budget risk |
|----|----------|-----------:|-------------|
| PR1 | Cimientos: `rutas.ts`/`Enrutador.tsx`/`menu-por-rol.ts` (D1/D12) + `pestanas.ts` (D2) + `mensajes-error.ts` (D7) + `AcademicaPage.tsx` with 6 stub tabs | ~300 | Low |
| PR2 | 3 piezas genéricas: `TablaGenerica`, `FormularioGenerico`, `DialogoConfirmacion` (D3/D4/D5) | ~385 | Medium (close to 400; pure component work, no domain coupling — low correction cost if it slips) |
| PR3 | `academico-api.ts` CRUD completo (D6) + `usuarios/usuarios-api.ts` (D11) | ~335 | Low |
| PR4 | `PanelAniosEscolares` (+ Activar, D del school-year spec) + `PanelNiveles` + wire both into `AcademicaPage` | ~380 | Medium |
| PR5 | `PanelGrados` (filtro `nivel_id`) + `PanelSecciones` (filtros `grado_id`/`anio_escolar_id`) + wire | ~375 | Medium |
| PR6 | `PanelAulas` (filtros `grado_id`/`seccion_id`/`anio_escolar_id`/`turno`) + wire | ~205 | Low |
| PR7 | `PanelMatriculas` (D9/D10: aula obligatoria, alta, retiro, traslado crear→eliminar) + wire | ~295 | Low-Medium |

Decision needed because the design flagged a High risk of exceeding 400 lines per PR and left the
cut to this phase (`design.md` Rollout section). Confirmed adjustment: **7 PRs instead of 5**,
same entity groupings as the design except Aulas and Matrículas are split into their own PRs (PR6/
PR7) instead of sharing PR5. If PR2's actual diff creeps past ~400 during apply, split
`DialogoConfirmacion` (~105 lines self-contained) into its own PR2b before continuing to
`TablaGenerica`/`FormularioGenerico`.

## Phase 1 (PR1): D1 — Routing foundation, `Ruta 'academica'`

- [x] 1.1 RED in `apps/frontend/src/app/rutas.spec.ts`: assert `parsearRuta('/academica') → { nombre: 'academica' }`, `rutaAPath({ nombre: 'academica' }) === '/academica'`, round-trip `parsearRuta(rutaAPath({ nombre: 'academica' }))` deep-equals the literal. Assert `parsearRuta('/academica/niveles') → { nombre: 'no-encontrada', pathname: '/academica/niveles' }` (spec: minimal-frontend-router, "Variante `Ruta 'academica'`… sin rutas anidadas").
- [x] 1.2 GREEN: in `apps/frontend/src/app/rutas.ts` add `{ nombre: 'academica' }` to the `Ruta` union, a `partes.length === 1 && partes[0] === 'academica'` branch in `parsearRuta`, and `case 'academica': return '/academica';` in `rutaAPath`. Update the file's top comment to mention the new variant.
- [x] 1.3 RED in `apps/frontend/src/app/Enrutador.spec.tsx`: `/academica` mounts `AcademicaPage` (assert via a test marker, same pattern as existing cases).
- [x] 1.4 GREEN: in `apps/frontend/src/app/Enrutador.tsx` add `import { AcademicaPage } from '../academico/AcademicaPage';` and `case 'academica': return <AcademicaPage />;`. Update the file's top comment (currently lists PR-by-PR wiring history) to note académica's origin (#26).

## Phase 2 (PR1): D12 — `menu-por-rol.ts` académica goes from placeholder to navegable

- [x] 2.1 RED in `apps/frontend/src/app/menu-por-rol.spec.ts`: update the per-role item-set assertions so `administrador`/`director`/`comite` include a `{ clase: 'navegable', id: 'academica', ruta: { nombre: 'academica' } }` item instead of the current `proximamente` académica item; `docente`/`estudiante` stay `[]`. Confirm this fails against the current `ACADEMICA` placeholder constant.
- [x] 2.2 RED (same file): keep/extend the existing round-trip invariant (every `navegable` item's `ruta` satisfies `parsearRuta(rutaAPath(item.ruta))` deep-equals `item.ruta`) so it covers the new académica item automatically — no new test needed if the invariant is written generically, but confirm it actually iterates the updated array.
- [x] 2.3 GREEN: in `apps/frontend/src/app/menu-por-rol.ts` change `ACADEMICA` to `{ clase: 'navegable', id: 'academica', etiqueta: 'Académica', ruta: { nombre: 'academica' } }` and update the doc comment above `MENU_POR_ROL` (currently documents académica as a placeholder route it isn't yet).
- [x] 2.4 Cross-check `openspec/changes/frontend-administracion-academica/specs/menu-navegacion-post-login/spec.md` scenarios ("Administrador navega a académica…", "Comité navega a académica en modo lectura…", "Comité ya no ve placeholder de académica") are satisfied by 2.1-2.3; no additional spec file changes needed at this phase (the render-level "sin botón de escritura" scenario is covered later by Phase 5/AcademicaPage + per-panel `soloLectura`).

## Phase 3 (PR1): D2 — `pestanas.ts` pure data

- [x] 3.1 RED in `apps/frontend/src/academico/pestanas.spec.ts` (new): assert `PESTANAS` has exactly 6 entries with ids `anios`, `niveles`, `grados`, `secciones`, `aulas`, `matriculas` in that order, each with a non-empty `etiqueta`.
- [x] 3.2 GREEN: create `apps/frontend/src/academico/pestanas.ts` exporting `type PestanaAcademica = 'anios' | 'niveles' | 'grados' | 'secciones' | 'aulas' | 'matriculas'` and `const PESTANAS: readonly { id: PestanaAcademica; etiqueta: string }[]`.

## Phase 4 (PR1): D7 — `mensajes-error.ts` pure data

- [x] 4.1 RED in `apps/frontend/src/academico/mensajes-error.spec.ts` (new): for each of the 7 `CodigoAcademico` values (`RESTRICCION_UNICA`, `REFERENCIA_INEXISTENTE`, `ENTIDAD_CON_DEPENDIENTES`, `ACTIVACION_CONCURRENTE`, `CAMPO_INVALIDO`, `COHERENCIA_JERARQUICA`, `USUARIO_NO_ES_ESTUDIANTE`) assert `mensajeDeError({ codigo })` returns a non-generic, non-empty string. Assert `mensajeDeError({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Grado' })` interpolates `'Grado'` into the message (spec: academic-tree-management, "Eliminar Nivel con Grado dependiente…"; school-year-management, "Eliminar AñoEscolar con Sección dependiente…"). Assert `mensajeDeError({ status: 500 })` (no `codigo`) returns a generic fallback, not `undefined`.
- [x] 4.2 GREEN: create `apps/frontend/src/academico/mensajes-error.ts` with `export type CodigoAcademico = ...` (7 literals, copied from `apps/backend/src/academico/academico.errors.ts` — verify the exact literal set against that file before writing the union) and `export function mensajeDeError(e: { codigo?: CodigoAcademico; relacion?: string; status?: number }): string` backed by a `Record<CodigoAcademico, string>` total map plus the status-based fallback.

## Phase 5 (PR1): D1/D2/D8 — `AcademicaPage` shell with stub tabs

- [x] 5.1 RED in `apps/frontend/src/academico/AcademicaPage.spec.tsx` (new): with a mocked `SesionContext` (same `proveer()` pattern as `Enrutador.spec.tsx`) providing role `administrador`, assert the "Año escolar" tab renders active by default and all 6 tab labels from `PESTANAS` are visible.
- [x] 5.2 RED (same file): clicking the "Nivel" tab renders the Nivel panel's content and un-mounts the Años content (assert via distinct test markers per stub panel) — covers minimal-frontend-router "Cambiar de pestaña no cambia la URL" indirectly (no `navegar()` call asserted via a `useRuta`/`pushState` spy staying untouched).
- [x] 5.3 RED (same file): role `comite` renders `AcademicaPage` without throwing (defense-in-depth scaffolding — concrete "no botones de escritura" assertions land per-panel in PR4-PR7 once real panels exist).
- [x] 5.4 GREEN: create `apps/frontend/src/academico/AcademicaPage.tsx` — `useSesion()` ⇒ `rol`; `const soloLectura = rol !== 'administrador' && rol !== 'director'` (D8, allowlist, fail-closed — do NOT write `rol === 'comite'`); `useState<PestanaAcademica>('anios')`; tab bar from `PESTANAS`; `switch (pestana)` rendering one stub `<p>` per tab for now (e.g. `"Aún no implementado"`) — real panels replace each `case` in PR4-PR7.
- [x] 5.5 Full regression for PR1: run `pnpm --filter @seei/frontend test rutas.spec.ts Enrutador.spec.tsx menu-por-rol.spec.ts pestanas.spec.ts mensajes-error.spec.ts AcademicaPage.spec.tsx` green, then `pnpm --filter @seei/frontend test` (full suite) and `pnpm typecheck` clean before opening PR1.

## Phase 6 (PR2): D3 — `TablaGenerica`

- [x] 6.1 RED in `apps/frontend/src/comun/piezas/TablaGenerica.spec.tsx` (new): renders `<thead>` with one `<th>` per `ColumnaTabla.encabezado`, in order.
- [x] 6.2 RED (same file): 0 filas renders `mensajeVacio` text and no `<tbody>` rows.
- [x] 6.3 RED (same file): each row calls `columna.celda(fila)` for its cell content (assert with a `celda` that formats a field, e.g. resolves a FK id to a name from a closure — the exact scenario D3 was designed for).
- [x] 6.4 RED (same file): with `acciones: []` (or omitted), no actions column/header renders at all — this is the mechanism Phase 5/D8 relies on for `comite` (empty array ⇒ zero write buttons, not `disabled` buttons).
- [x] 6.5 RED (same file): with `acciones` populated, `visible: (fila) => boolean` filters per-row whether an action button renders (e.g. "Activar" only when `!fila.activo` — the school-year-management scenario); `onEjecutar` receives the clicked row's `fila` object (assert via a spy).
- [x] 6.6 RED (same file): `tono: 'peligro'` action renders with the `text-error` token, `tono: 'normal'`/omitted does not.
- [x] 6.7 GREEN: create `apps/frontend/src/comun/piezas/TablaGenerica.tsx` implementing `ColumnaTabla<T>`, `AccionFila<T>`, and `TablaGenerica<T>` exactly per `design.md`'s D3 interface — real `<table>`/`<thead>`/`<tbody>`, no fetch, no `useSesion()` (piece stays reusable/testable without providers, per D8's explicit constraint).

## Phase 7 (PR2): D4 — `FormularioGenerico`

- [x] 7.1 RED in `apps/frontend/src/comun/piezas/FormularioGenerico.spec.tsx` (new): a `texto` field with `requerido: true` and an empty value disables the submit button; typing a non-whitespace value enables it (mirrors `FormularioCandidato`'s `camposCompletos` pattern, but generic).
- [x] 7.2 RED (same file): a `seleccion` field renders a `<select>` with the given `opciones` as `<option>`s.
- [x] 7.3 RED (same file): submitting calls `onEnviar` with a `Record<string, string>` containing every field's current value (including non-required, non-empty ones).
- [x] 7.4 RED (same file): `modo: 'edicion'` with `valoresIniciales` pre-fills the corresponding inputs; `modo: 'creacion'` starts blank.
- [x] 7.5 RED (same file): `enviando: true` disables the submit button regardless of field validity; `mensajeError` renders in a `role="alert"` element.
- [x] 7.6 GREEN: create `apps/frontend/src/comun/piezas/FormularioGenerico.tsx` implementing `CampoFormulario` (discriminated union `texto`/`seleccion`) and the component exactly per `design.md`'s D4 interface — local `useState<Record<string,string>>`, `requerido` + non-empty-after-`trim()` as the only client validation, `onCancelar?`, no `useSesion()`.

## Phase 8 (PR2): D5 — `DialogoConfirmacion`

- [x] 8.1 RED in `apps/frontend/src/comun/piezas/DialogoConfirmacion.spec.tsx` (new): renders `role="dialog"` with `aria-label`/`titulo`/`descripcion` text visible.
- [x] 8.2 RED (same file): clicking the confirm button calls `onConfirmar`; clicking cancel calls `onCancelar` and not `onConfirmar`.
- [x] 8.3 RED (same file): `procesando: true` disables both buttons (prevents double-submit during the async call — relevant for the activación/eliminación/traslado consumers).
- [x] 8.4 GREEN: create `apps/frontend/src/comun/piezas/DialogoConfirmacion.tsx` — same inline `role="dialog"` shape as `auth/DialogoVinculacion.tsx` (no portal/overlay per D5), props `titulo`, `descripcion`, `etiquetaConfirmar`, `onConfirmar`, `onCancelar`, `procesando`.
- [x] 8.5 Full regression for PR2: run `pnpm --filter @seei/frontend test TablaGenerica.spec.tsx FormularioGenerico.spec.tsx DialogoConfirmacion.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR2.

## Phase 9 (PR3): D6 — `academico-api.ts` CRUD completo

- [x] 9.1 RED in `apps/frontend/src/academico/academico-api.spec.ts` (new — the file currently has no spec, only 4 untested reads; add coverage for all new exports, mocking `createSeeiClient`/`fetch` the same way `candidatos-api.spec.ts` does): `listarSecciones(filtros)` and `listarMatriculas(filtros)` call `GET /secciones`/`GET /matriculas` with the query params passed through, returning the raw `{ data, response }` shape (matching the 4 existing reads — D6 explicitly does not migrate them to `ResultadoApi`).
- [x] 9.2 RED (same file): each of `crearAnioEscolar`, `actualizarAnioEscolar`, `eliminarAnioEscolar`, `activarAnioEscolar`, `crearNivel`, `actualizarNivel`, `eliminarNivel`, `crearGrado`, `actualizarGrado`, `eliminarGrado`, `crearSeccion`, `actualizarSeccion`, `eliminarSeccion`, `crearAula`, `actualizarAula`, `eliminarAula`, `crearMatricula`, `eliminarMatricula` returns `{ ok: true, data }` on a 2xx mock response and `{ ok: false, status, codigo }` on a 4xx mock response carrying `{ codigo }` in the error body (mirror `candidatos-api.spec.ts`'s `resolver`/`resolverVacio` test pattern — do not re-test `resolver` itself, just that each wrapper is wired to it).
- [x] 9.3 RED (same file): `activarAnioEscolar` resolves `ResultadoApi<ResultadoActivacion>` — assert the mocked 2xx JSON body `{ id, activo: true, cambio }` passes through unchanged (D6: `content?: never` in the generated contract, type is hand-mirrored, not contract-derived).
- [x] 9.4 GREEN: expand `apps/frontend/src/academico/academico-api.ts` — add `SeccionRespuestaDto`, `MatriculaRespuestaDto` type aliases from `components['schemas']`; add `ResultadoActivacion` interface (hand-mirrored, per D6); copy `ResultadoApi<T>`, `resolver`, `resolverVacio`, `extraerCodigo` from `candidatos-api.ts` (adjust `CodigoErrorNegocio` to the 7 académico codes — reuse `CodigoAcademico` from `mensajes-error.ts` rather than redeclaring the union, to keep one source of truth); add the two missing reads (`listarSecciones`, `listarMatriculas`) in the existing raw-return style; add the 6 input interfaces (`CrearAnioEscolarInput`, `ActualizarAnioEscolarInput`, `CrearNivelInput`, …, `CrearMatriculaInput` — no `ActualizarMatriculaInput`, matrícula has no PATCH per D10) mirrored by hand from `apps/backend/src/academico/dto/*.dto.ts`; add all 15 write functions with `as never` on `body`/`params` (D6 precedent from `candidatos-api.ts`).
- [x] 9.5 Verify against `apps/backend/src/academico/dto/*.dto.ts` field-by-field that every input interface matches the real DTO shape (design.md flagged this as hand-verified, not contract-generated — re-verify at apply time, not just trust the design doc).

## Phase 10 (PR3): D11 — `usuarios/usuarios-api.ts` seed

- [x] 10.1 RED in `apps/frontend/src/usuarios/usuarios-api.spec.ts` (new): `listarUsuarios(filtros?)` calls `GET /usuarios` with `{ rol?, estado? }` query params passed through, returns the raw `{ data, response }` shape (same style as `academico-api.ts`'s pre-existing reads, not `ResultadoApi` — it's a read).
- [x] 10.2 GREEN: create `apps/frontend/src/usuarios/usuarios-api.ts` with exactly one exported function, `listarUsuarios`, over `GET /usuarios` — do not add write functions, this is explicitly a seed for #27 (proposal Out of Scope).
- [x] 10.3 Full regression for PR3: run `pnpm --filter @seei/frontend test academico-api.spec.ts usuarios-api.spec.ts` green, then full suite + `pnpm typecheck` before opening PR3.

## Phase 11 (PR4): `PanelAniosEscolares` — CRUD + Activar

- [x] 11.1 RED in `apps/frontend/src/academico/paneles/PanelAniosEscolares.spec.tsx` (new, `vi.mock('../academico-api')`): mounts and calls `listarAniosEscolares()` once on mount, rendering rows via `TablaGenerica`.
- [x] 11.2 RED (same file): with role `administrador`/`director` (`soloLectura={false}` prop), each row shows "Editar"/"Eliminar" and non-activo rows show "Activar"; activo rows do not show "Activar" (spec: school-year-management, "Activación de AñoEscolar…" — `visible` filter from Phase 6.5).
- [x] 11.3 RED (same file): with `soloLectura={true}`, no row shows "Crear"/"Editar"/"Eliminar"/"Activar" (spec: school-year-management, "Defensa en profundidad del rol comité sobre AñoEscolar").
- [x] 11.4 RED (same file): clicking "Crear" opens `FormularioGenerico`; submitting calls `crearAnioEscolar({ nombre })`; on `{ ok: true }` the list reloads and the form closes; on `{ ok: false, codigo: 'RESTRICCION_UNICA' }` the form shows `mensajeDeError(...)` in `role="alert"` without closing.
- [x] 11.5 RED (same file): clicking "Eliminar" opens `DialogoConfirmacion`; confirming calls `eliminarAnioEscolar(id)`; on `{ ok: false, codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Sección' }` the dialog (or an inline alert) shows the interpolated message from `mensajeDeError` (spec: school-year-management, "Eliminar AñoEscolar con Sección dependiente…").
- [x] 11.6 RED (same file): clicking "Activar" opens `DialogoConfirmacion` WITHOUT any text naming the currently-active year (spec: school-year-management, "Activación de AñoEscolar con confirmación simple" — explicitly no summary); confirming calls `activarAnioEscolar(id)` and reloads on success; cancelling calls neither `activarAnioEscolar` nor reloads (spec: "Cancelar el diálogo no activa ningún año").
- [x] 11.7 GREEN: create `apps/frontend/src/academico/paneles/PanelAniosEscolares.tsx` — contained component owning fetch/filter/dialog state, `acciones = soloLectura ? [] : [...]` (D8), wiring `TablaGenerica`/`FormularioGenerico`/`DialogoConfirmacion` per the flows above.

## Phase 12 (PR4): `PanelNiveles` — simple CRUD, no filters

- [x] 12.1 RED in `apps/frontend/src/academico/paneles/PanelNiveles.spec.tsx` (new, `vi.mock`): mounts and calls `listarNiveles()` once, no filter params.
- [x] 12.2 RED (same file): `soloLectura={false}` shows Crear/Editar/Eliminar; `soloLectura={true}` shows none (spec: academic-tree-management, "Defensa en profundidad del rol comité en el árbol académico").
- [x] 12.3 RED (same file): Crear/Editar wired to `crearNivel`/`actualizarNivel`; Eliminar wired to `eliminarNivel` with `409 ENTIDAD_CON_DEPENDIENTES` showing the legible message (spec: "Eliminar Nivel con Grado dependiente…").
- [x] 12.4 GREEN: create `apps/frontend/src/academico/paneles/PanelNiveles.tsx`, same shape as `PanelAniosEscolares` minus the Activar action and filters.

## Phase 13 (PR4): Wire Años/Niveles into `AcademicaPage`

- [x] 13.1 GREEN: in `apps/frontend/src/academico/AcademicaPage.tsx`, replace the `anios` and `niveles` stub cases with `<PanelAniosEscolares soloLectura={soloLectura} />` / `<PanelNiveles soloLectura={soloLectura} />`.
- [x] 13.2 Update `AcademicaPage.spec.tsx` assertions for the `anios`/`niveles` tabs from the stub marker text to real panel content (mock `academico-api` in this spec too, or keep the assertions role/tab-only and rely on Phase 11/12 specs for panel behavior — prefer the latter to avoid duplicating panel-level coverage).
- [x] 13.3 Full regression for PR4: run `pnpm --filter @seei/frontend test PanelAniosEscolares.spec.tsx PanelNiveles.spec.tsx AcademicaPage.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR4.

## Phase 14 (PR5): `PanelGrados` — filtro `nivel_id`

- [x] 14.1 RED in `apps/frontend/src/academico/paneles/PanelGrados.spec.tsx` (new, `vi.mock`): with no `Nivel` selected, lists all Grados (`listarGrados(undefined)` or `listarGrados({})`); selecting a `Nivel` in the filter re-fetches with `listarGrados({ nivel_id: '<id>' })` (spec: academic-tree-management, "Listado de Grado filtrado por Nivel seleccionado").
- [x] 14.2 RED (same file): `soloLectura` toggling shows/hides Crear/Editar/Eliminar, same pattern as Phase 12.2.
- [x] 14.3 RED (same file): Crear/Editar/Eliminar wired to `crearGrado`/`actualizarGrado`/`eliminarGrado`; `409` shows legible message.
- [x] 14.4 GREEN: create `apps/frontend/src/academico/paneles/PanelGrados.tsx` — filter `<select>` for `nivel_id` sourced from `listarNiveles()`, table + form + dialog wiring per above.

## Phase 15 (PR5): `PanelSecciones` — filtros `grado_id`/`anio_escolar_id`

- [x] 15.1 RED in `apps/frontend/src/academico/paneles/PanelSecciones.spec.tsx` (new, `vi.mock`): filter selections re-fetch `listarSecciones({ grado_id, anio_escolar_id })` (spec: implied by academic-tree-management's cascading-filter requirement, mirrored from the Grado/Aula scenarios for Sección's own two filters).
- [x] 15.2 RED (same file): `soloLectura` toggling, same pattern as 12.2/14.2.
- [x] 15.3 RED (same file): Crear/Editar/Eliminar wired to `crearSeccion`/`actualizarSeccion`/`eliminarSeccion`; `409` legible message.
- [x] 15.4 GREEN: create `apps/frontend/src/academico/paneles/PanelSecciones.tsx` — two filter `<select>`s (`grado_id` from `listarGrados()`, `anio_escolar_id` from `listarAniosEscolares()`), table + form + dialog wiring.

## Phase 16 (PR5): Wire Grados/Secciones into `AcademicaPage`

- [x] 16.1 GREEN: replace the `grados`/`secciones` stub cases in `AcademicaPage.tsx` with the real panels.
- [x] 16.2 Update `AcademicaPage.spec.tsx` tab-content assertions for `grados`/`secciones` (same approach as 13.2).
- [x] 16.3 Full regression for PR5: run `pnpm --filter @seei/frontend test PanelGrados.spec.tsx PanelSecciones.spec.tsx AcademicaPage.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR5.

## Phase 17 (PR6): `PanelAulas` — filtros `grado_id`/`seccion_id`/`anio_escolar_id`/`turno`

- [x] 17.1 RED in `apps/frontend/src/academico/paneles/PanelAulas.spec.tsx` (new, `vi.mock`): selecting all 4 filters calls `listarAulas({ grado_id, seccion_id, anio_escolar_id, turno })` (spec: academic-tree-management, "Listado de Aula filtrado por Grado, Sección, AñoEscolar y turno").
- [x] 17.2 RED (same file): `soloLectura` toggling, same pattern.
- [x] 17.3 RED (same file): Crear/Editar/Eliminar wired to `crearAula`/`actualizarAula`/`eliminarAula`; `409` legible message; `turno` field is a `seleccion` with the two known values (`manana`/`tarde`) per D4/open-question in design.md — do not add client-side validation beyond the select's fixed options.
- [x] 17.4 GREEN: create `apps/frontend/src/academico/paneles/PanelAulas.tsx` — 4 filter controls (3 `<select>`s sourced from `listarGrados`/`listarSecciones`/`listarAniosEscolares`, 1 `<select>` for `turno` with the 2 literal options), table + form + dialog wiring.
- [x] 17.5 GREEN: replace the `aulas` stub case in `AcademicaPage.tsx` with `<PanelAulas soloLectura={soloLectura} />`; update `AcademicaPage.spec.tsx`.
- [x] 17.6 Full regression for PR6: run `pnpm --filter @seei/frontend test PanelAulas.spec.tsx AcademicaPage.spec.tsx` green, then full suite + `pnpm typecheck` before opening PR6.

## Phase 18 (PR7): `PanelMatriculas` — aula obligatoria, alta, retiro, traslado

- [x] 18.1 RED in `apps/frontend/src/academico/paneles/PanelMatriculas.spec.tsx` (new, `vi.mock('../academico-api')` AND `vi.mock('../../usuarios/usuarios-api')`): with no `aula_id` selected, the panel renders an instructive empty state and calls `listarMatriculas` zero times (spec: student-enrollment, D9 — "Matrículas exige elegir un Aula"; also covers the "no `take`" backend risk noted in design.md).
- [x] 18.2 RED (same file): selecting an `aula_id` (and optionally `anio_escolar_id`) calls `listarMatriculas({ aula_id, anio_escolar_id })` (spec: student-enrollment, "Listado de Matrícula filtrado por AñoEscolar y Aula").
- [x] 18.3 RED (same file): the row list uses `listarUsuarios()` to resolve `usuario_id → nombres` for display, not a raw UUID (design.md D11).
- [x] 18.4 RED (same file): the row actions are exactly "Eliminar" and "Trasladar" — never "Editar" (spec: student-enrollment, "No existe botón 'Editar' en el listado de Matrícula").
- [x] 18.5 RED (same file): "Crear" (alta) form requires selecting a `usuario_id` (from `listarUsuarios({ rol: 'estudiante' })` or equivalent) and the currently-filtered `aula_id`/`anio_escolar_id`; submitting calls `crearMatricula({ usuario_id, aula_id, anio_escolar_id })`.
- [x] 18.6 RED (same file): "Trasladar" opens `DialogoConfirmacion` explaining the two-step action, then a form with the student fixed and a new `aula_id`/`anio_escolar_id` to pick; confirming calls `crearMatricula(nueva)` **before** `eliminarMatricula(idAnterior)`, in that literal call order (assert via a shared mock call-order spy) — spec: "Trasladar una Matrícula elimina la original y crea una nueva" AND design.md D10 (order matters for `@@unique([usuario_id, aula_id, anio_escolar_id])`).
- [x] 18.7 RED (same file): if `crearMatricula` in the traslado flow returns `{ ok: false }`, `eliminarMatricula` is never called and the error is shown (design.md D10: "si el alta falla, no borra nada").
- [x] 18.8 RED (same file): if `crearMatricula` succeeds but the subsequent `eliminarMatricula` returns `{ ok: false }`, a persistent `role="alert"` names both matrícula ids and instructs which one to delete manually (design.md D10: "role=\"alert\" persistente indicando que quedaron dos matrículas y cuál eliminar").
- [x] 18.9 RED (same file): `soloLectura` hides "Crear", "Eliminar", and "Trasladar" (spec: student-enrollment, "Defensa en profundidad del rol comité sobre Matrícula").
- [x] 18.10 GREEN: create `apps/frontend/src/academico/paneles/PanelMatriculas.tsx` implementing all of the above — this is the largest panel in the change; keep the traslado flow's two-call sequencing in one clearly-named handler (e.g. `trasladarMatricula`) rather than inlined in JSX, so 18.6-18.8 are testable in isolation.
- [x] 18.11 GREEN: replace the `matriculas` stub case in `AcademicaPage.tsx` with `<PanelMatriculas soloLectura={soloLectura} />`; update `AcademicaPage.spec.tsx`.
- [x] 18.12 Full regression for PR7 (final PR of the chain): run `pnpm --filter @seei/frontend test PanelMatriculas.spec.tsx AcademicaPage.spec.tsx` green, then the FULL `pnpm --filter @seei/frontend test` suite and `pnpm typecheck` clean before opening PR7. Manually confirm (per design.md's open question) that submitting an unknown `turno` string against a real/staging backend returns `400 CAMPO_INVALIDO`, not `500` — file a backend follow-up if it doesn't; do not silently work around it client-side.

## Cross-cutting checklist (verify once, applies across PR4-PR7)

- [x] For every panel: confirm the write-action allowlist is `rol !== 'administrador' && rol !== 'director'` derived ONCE in `AcademicaPage` and passed down as `soloLectura` — no panel re-derives it from `useSesion()` directly (D8; keeps the panels testable with a plain boolean prop instead of a session provider).
- [x] For every `DELETE` wrapper call site (`eliminarAnioEscolar`/`eliminarNivel`/`eliminarGrado`/`eliminarSeccion`/`eliminarAula`/`eliminarMatricula`): confirm the panel checks `codigo === 'ENTIDAD_CON_DEPENDIENTES'` specifically (not just `!ok`) to show the `relacion`-aware message from `mensajeDeError`, falling back to the generic status-based message for any other failure.
- [x] Grep `apps/frontend/src/academico` and `apps/frontend/src/comun/piezas` for any `className` token not already in the project's approved token list (same audit as #25 tasks.md Phase 9); confirm nothing new was added to `tailwind.config.*`/`index.css`.

## Post-chain: full suite sanity (run after PR7 merges)

- [x] Run `pnpm --filter @seei/frontend test` (entire suite, all PRs' specs together) and confirm green. (65 files, 365 tests, 2026-08-20)
- [x] Run `pnpm typecheck` and confirm clean (validates the `Ruta`/`ItemMenu`/`PestanaAcademica` union exhaustiveness and the `Record<CodigoAcademico, string>` totality end-to-end). (8/8 tasks, all 4 packages, 2026-08-20)
- [x] Confirm the proposal's Success Criteria checklist: `administrador`/`director` manage all 6 entities from `/academica`; `comite` sees zero write buttons across all 6 panels; activating a year deactivates the previous one with explicit confirmation; `TablaGenerica`/`FormularioGenerico` are importable from `comun/piezas/` for future changes (#27/#28/#29). (verified: all 6 panels derive `acciones` from `soloLectura ? [] : [...]`; all import `TablaGenerica`/`FormularioGenerico` from `../../comun/piezas/`; `PanelAniosEscolares` activation flow covered by tasks 11.6-11.7)
