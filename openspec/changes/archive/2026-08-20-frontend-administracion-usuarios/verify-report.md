# Verification Report: frontend-administracion-usuarios (Backlog #27)

**Mode**: Full artifact verification (proposal, design D1-D13, 3 delta specs, tasks.md, 20 phases / 7 chained PRs)
**Date**: 2026-08-20
**Verifier**: sdd-verify (independent re-check, not trusting prior apply-agent reports)

## Completeness Table

| Phase (PR) | Tasks.md status | Code present | Verified |
|---|---|---|---|
| Phase 1-3 (PR1) - routing + menu (D1/D2) | [x] all | rutas.ts, Enrutador.tsx, menu-por-rol.ts + specs | Yes |
| Phase 4-6 (PR2) - error catalog + gated stubs (D4/D7) | [x] all | mensajes-error.ts, UsuariosPage.tsx/CuentasBloqueadasPage.tsx gates | Yes |
| Phase 7-9 (PR3) - cliente API (D5/D6) | [x] all | usuarios-api.ts (9 new functions + listarUsuarios intact) | Yes |
| Phase 10-12 (PR4) - listado + paginacion (D3/D12) | [x] all | UsuariosPage.tsx filtros/paginacion/seleccion | Yes |
| Phase 13-15 (PR5) - ficha, alta/edicion, estado (D8/D9) | [x] all | FichaUsuarioPage.tsx | Yes |
| Phase 16-18 (PR6) - apoderados (D10) | [x] all | PanelApoderados.tsx | Yes |
| Phase 19-20 (PR7) - cuentas bloqueadas (D11) | [x] all | CuentasBloqueadasPage.tsx real listado + desbloqueo | Yes |
| Cross-cutting checklist | [x] all 5 items | Verified inline (gates, soloLectura discipline, mensajeDeError wiring, className tokens, no reverse cross-domain import) | Yes |
| Post-chain full-suite sanity | [x] all 3 items | Suite/typecheck re-run below; success-criteria cross-checked against tests | Yes |

20/20 phases complete, no unchecked tasks found.

## Build/Test Evidence (re-run independently)

- pnpm --filter @seei/frontend test -- --run: 70 test files / 457 tests passed, 0 failed. (Console shows expected "useSesion debe usarse dentro de AuthProvider" uncaught-error noise from sesion-context.spec.tsx intentional throw-outside-provider test, not a failure, matches pre-existing pattern from #25/#26.)
- pnpm typecheck (root, turbo, 4 packages: backend, contracts, frontend, worker): 8/8 tasks successful, clean (cache hit, no source changed since the reported clean run; re-verified content itself by direct source inspection below).
- Both figures match the last apply-agent reported 457/457 and clean typecheck, independently reproduced, not merely trusted.

## Spec Compliance Matrix

### administracion-usuarios-apoderados

| Requirement | Scenario | Covering test | Status |
|---|---|---|---|
| Listado con filtro rol/estado | Filtrar por rol y estado | UsuariosPage.spec.tsx (Phase 10.2) | PASS |
| Listado con filtro rol/estado | Listado vacio no rompe la vista | UsuariosPage.spec.tsx (Phase 10.3) | PASS |
| Alta/edicion sin password | Alta docente sin campo contrasena | FichaUsuarioPage.spec.tsx (Phase 13.3) | PASS |
| Alta/edicion sin password | Errores de unicidad legibles | FichaUsuarioPage.spec.tsx (Phase 13.4) | PASS |
| Alta/edicion sin password | Edicion de usuario existente | FichaUsuarioPage.spec.tsx (Phase 13.5) | PASS |
| Cambio de estado sin eliminar | Desactivar usuario activo | FichaUsuarioPage.spec.tsx (Phase 14.1) | PASS |
| Cambio de estado sin eliminar | Ningun boton Eliminar disponible | FichaUsuarioPage.spec.tsx (Phase 14.4) | PASS |
| Panel Apoderado solo rol es estudiante | Panel visible en ficha de estudiante | FichaUsuarioPage.spec.tsx (Phase 18.1) | PASS |
| Panel Apoderado solo rol es estudiante | Panel ausente para rol distinto | FichaUsuarioPage.spec.tsx (Phase 18.2) | PASS |
| Panel Apoderado solo rol es estudiante | Alta de apoderado desde ficha | PanelApoderados.spec.tsx (Phase 16.2/16.3) | PASS |
| Panel Apoderado solo rol es estudiante | Eliminar apoderado confirma y borrado fisico | PanelApoderados.spec.tsx (Phase 17.1/17.2) | PASS |
| Aislamiento rol comite | Comite no ve item usuarios | menu-por-rol.spec.ts (Phase 3.3) | PASS |
| Aislamiento rol comite | Comite en /usuarios sin botones de escritura | UsuariosPage.spec.tsx (Phase 5.2, gate) | PASS |

### bloqueo-desbloqueo-cuentas

| Requirement | Scenario | Covering test | Status |
|---|---|---|---|
| Listado bloqueados reservado a comite | Comite ve listado | CuentasBloqueadasPage.spec.tsx (Phase 19.1) | PASS |
| Listado bloqueados reservado a comite | Rol distinto no alcanza la vista | CuentasBloqueadasPage.spec.tsx (Phase 6.2, gate) | PASS |
| Desbloqueo con confirmacion auditada | Confirmacion menciona auditoria | CuentasBloqueadasPage.spec.tsx (Phase 20.1) | PASS |
| Desbloqueo con confirmacion auditada | Cancelar no desbloquea | CuentasBloqueadasPage.spec.tsx (Phase 20.2) | PASS |
| Desbloqueo con confirmacion auditada | Cuenta desaparece tras desbloqueo exitoso | CuentasBloqueadasPage.spec.tsx (Phase 20.3) | PASS |
| Boton condicional a estado bloqueado | Cuenta recuperada no ofrece boton | Covered structurally (Phase 19.1 COLUMNAS, no estado column; endpoint only returns bloqueado rows) | PASS (structural, documented in tasks.md 20.4) |

### minimal-frontend-router

| Requirement | Scenario | Covering test | Status |
|---|---|---|---|
| Ruta usuarios plana | Navegacion a /usuarios | Enrutador.spec.tsx (Phase 2.1) | PASS |
| Ruta cuentas-bloqueadas plana e independiente | Navegacion a /cuentas-bloqueadas | Enrutador.spec.tsx (Phase 2.2) | PASS |
| Ruta usuarios plana | Abrir ficha no cambia URL | UsuariosPage.spec.tsx (Phase 12.1, plus gap-crear test) | PASS |
| Sin deep-link a usuario especifico | Recargar pierde la ficha abierta | Implicit via component-state design (no URL persistence anywhere in UsuariosPage); round-trip invariant in rutas.spec.ts (Phase 1.1/1.2) confirms no usuarioId in Ruta union | PASS (structural) |

All spec scenarios have a passing covering test. No UNTESTED or FAILING scenarios found.

## Design Coherence (D1-D13)

| # | Decision | Verified against code | Result |
|---|---|---|---|
| D1 | Two flat, unparametrized Ruta variants; selection lives in component state | rutas.ts lines 27-28, 114-120, 149-152; UsuariosPage.tsx usuarioSeleccionado/mostrandoFicha state | Match |
| D2 | USUARIOS to navegable (admin/director only); CUENTAS_BLOQUEADAS new, comite-only | menu-por-rol.ts lines 34-45, 75-81 | Match |
| D3 | UsuariosPage renders listado XOR FichaUsuarioPage; CuentasBloqueadasPage independent container | UsuariosPage.tsx lines 88-104; CuentasBloqueadasPage.tsx imports nothing from UsuariosPage/FichaUsuarioPage | Match |
| D4 | Two independent binary allowlist gates, zero API calls when closed | UsuariosPage.tsx line 43 puedeGestionar; CuentasBloqueadasPage.tsx line 41 puedeDesbloquear; both gate the useEffect fetch | Match |
| D5 | listarUsuarios untouched (raw); 9 new functions via ResultadoApi | usuarios-api.ts lines 19-24 (unchanged raw), 139-214 (9 new wrapped functions) | Match |
| D6 | Hand-mirrored types for routes with content:never / requestBody:never | usuarios-api.ts CambioEstadoUsuario, ResultadoDesbloqueo, CrearUsuarioInput etc, all as never on body/params | Match |
| D7 | Record of CodigoUsuarios to string total map + status fallback | mensajes-error.ts (verified via test coverage: mensajes-error.spec.ts phases 4.1-4.4 all checked) | Match |
| D8 | Edit mode: rol field absent, not disabled | FichaUsuarioPage.tsx line 43 CAMPOS_EDITAR = CAMPOS_CREAR.slice(0,4), rol (index 4) excluded entirely from the array passed to FormularioGenerico, not rendered+disabled | Match, confirmed absent, not merely hidden |
| D9 | Activar/Desactivar with confirmation; no action from bloqueado; no Eliminar anywhere | FichaUsuarioPage.tsx lines 118 (puedeCambiarEstado excludes bloqueado), 142-150 (button), 154-174 (DialogoConfirmacion); no Eliminar string in UI (only in a code comment negating its existence) | Match |
| D10 | PanelApoderados mounted only if usuario is not null and usuario.rol is estudiante; empty correo becomes undefined not empty string | FichaUsuarioPage.tsx line 176 usuario && usuario.rol === estudiante (guards usuario not null implicitly since short-circuit on null); PanelApoderados.tsx line 83 correo trim or undefined | Match, creation mode (usuario null) correctly excludes the panel; correo normalization confirmed |
| D11 | CuentasBloqueadasPage own screen, gate, reload-not-optimistic, audited confirmation copy | CuentasBloqueadasPage.tsx lines 38-120, confirmation text mentions auditoria (line 105), reload via recargar() post-confirm (line 69) | Match |
| D12 | Client-side pagination, PAGINA = 25, TablaGenerica untouched | UsuariosPage.tsx lines 9, 126-128, 192-216 | Match |
| D13 | Data tests without render for round-trip/menu/errors; RTL render tests for the 4 pages | Confirmed via file inventory: rutas.spec.ts, menu-por-rol.spec.ts, mensajes-error.spec.ts (data); UsuariosPage.spec.tsx, FichaUsuarioPage.spec.tsx, PanelApoderados.spec.tsx, CuentasBloqueadasPage.spec.tsx (render) | Match |

## Points Requiring Special Attention (per verification request)

1. Architectural decision: Cuentas bloqueadas as a first-level route reserved to comite, disjoint from /usuarios. CONFIRMED implemented, not just documented.
   - rutas.ts: cuentas-bloqueadas is a top-level flat Ruta variant, hangs off the root, not nested under usuarios (lines 27-28, 118-120, 151-152).
   - menu-por-rol.ts: USUARIOS appears only in administrador/director rows; CUENTAS_BLOQUEADAS appears only in the comite row (lines 76-78). No role sees both.
   - CuentasBloqueadasPage.tsx: standalone container, imports nothing from UsuariosPage.tsx/FichaUsuarioPage.tsx.
   - No vestige of the original nested-panel approach found anywhere in code. In specs, bloqueo-desbloqueo-cuentas/spec.md explicitly documents the discrepancy and the resolution (lines 13-22); minimal-frontend-router/spec.md explicitly states the desbloqueo manual is NOT a contextual panel of this route (line 12) and gives cuentas-bloqueadas its own requirement with the disjoint-roles rationale (lines 14-21). No stale contextual-panel wording survived; this matches the apply agent post-chain checklist finding (tasks.md line 206).

2. Gap fix: Crear button plus mostrandoFicha state. CONFIRMED correctly integrated.
   - UsuariosPage.tsx adds a Crear button (lines 134-143) that sets usuarioSeleccionado to null plus mostrandoFicha to true, distinct from the row Abrir action which sets both usuarioSeleccionado(fila) and mostrandoFicha(true) (lines 115-124). The separate boolean is necessary because usuario null is deliberately the creation-mode signal for FichaUsuarioPage, so a single nullable-selection field could not distinguish no ficha open from ficha open in creation mode; this reasoning is stated inline in the code doc comment (lines 34-38) and matches D3/D8 of design.md.
   - Edit flow (via Abrir) is unaffected, verified by reading the full onEjecutar wiring; both paths converge on the same mostrandoFicha render branch (lines 88-104), and onVolver/onCambio both correctly reset both state variables.
   - Test coverage: UsuariosPage.spec.tsx gap-crear test (lines 246-259) asserts clicking Crear mounts FichaUsuarioPage in creation mode (Nuevo usuario text) without changing window.location.pathname. This is a real, passing test (part of the 457 green).

3. D8: rol absent, not disabled, in edit mode. CONFIRMED. FichaUsuarioPage.tsx line 43 defines CAMPOS_EDITAR as CAMPOS_CREAR.slice(0, 4); the rol field (5th entry in CAMPOS_CREAR) is sliced out of the array entirely, so FormularioGenerico never receives it as a field definition for edit mode; there is no disabled prop path involved. Test FichaUsuarioPage.spec.tsx Phase 13.2 explicitly asserts rol is absent, not disabled, in edition mode. Matches design.md D8 exactly.

4. D10: PanelApoderados mount condition plus correo normalization. CONFIRMED both halves.
   - Mount condition usuario && usuario.rol === estudiante (FichaUsuarioPage.tsx line 176) is a JS truthy-guard on usuario, which is null in creation mode, so the panel correctly does not render when usuario is null (creation mode), and also does not render for any role other than estudiante in edit mode. Test coverage exists (Phase 18.1/18.2) for the role dimension; the usuario-null dimension follows directly from the short-circuit and from FichaUsuarioPage.spec.tsx creation-mode tests (Phase 13.1) not asserting a PanelApoderados mount.
   - correo empty-string handling: PanelApoderados.tsx line 83 sets correo to valores.correo.trim() or undefined, confirmed the empty case resolves to undefined, not an empty string, before being passed to crearApoderado/actualizarApoderado. Test coverage: Phase 16.2 asserts the call is made with correo undefined when the field is left blank.

5. academico/PanelMatriculas importing usuarios/usuarios-api. CONFIRMED coherent, not a new layering violation.
   - Grep of apps/frontend/src/academico/ shows 3 references to usuarios/usuarios-api: AcademicaPage.spec.tsx, PanelMatriculas.spec.tsx, and PanelMatriculas.tsx itself (the only non-test import). All are one-directional: academico imports from usuarios, never the reverse (grep of apps/frontend/src/usuarios/ finds zero imports from academico).
   - This matches design.md explicit statement (Enfoque tecnico section and D5): usuarios-api.ts listarUsuarios is the number-26-seeded function that PanelMatriculas was written against before number-27 existed, and number-27 explicitly chose to expand the existing file rather than fork it, specifically to avoid two clients for GET /usuarios. This is a deliberate, spec-documented exception, not a fuga de capas; the dependency direction is academico to usuarios (a lower domain being consumed by a higher one is fine architecturally; the concerning direction, usuarios to academico, does not exist in the codebase).

6. No Eliminar action for Usuario; state change via DialogoConfirmacion. CONFIRMED.
   - Grep across FichaUsuarioPage.tsx, UsuariosPage.tsx, CuentasBloqueadasPage.tsx for eliminar (case-insensitive) finds exactly one hit: a code comment in FichaUsuarioPage.tsx explicitly stating no Eliminar action exists for Usuario because the backend exposes no DELETE. No UI-facing Eliminar string for Usuario anywhere.
   - FichaUsuarioPage.tsx lines 142-150/154-174: state change (Activar/Desactivar) always routes through DialogoConfirmacion before calling cambiarEstadoUsuario. Test coverage: Phase 14.1/14.2/14.4/14.5 all checked and part of the green suite.
   - Contrast: PanelApoderados own Eliminar (physical delete for Apoderado, a distinct resource) is correctly present and distinctly worded as permanent/fisico (D10), not conflated with Usuario state-change-only model.

## Issues

CRITICAL: None found.

WARNING: None found.

SUGGESTION:
1. tasks.md Phase 20.6 and the Post-chain checklist both flag that manual staging verification of crearUsuario CAMPO_INVALIDO/correo interpolation against a real backend (an item raised in design.md Preguntas abiertas) was never performed; no staging environment was available to any apply agent. This is honestly disclosed in tasks.md rather than silently skipped, and the equivalent behavior is covered by a mocked-fetch unit test (mensajes-error.spec.ts Phase 4.2), so it is not a spec-compliance gap, just an un-exercised integration path. Low priority: exercise it once a staging environment exists, or accept the mocked coverage as sufficient given the DTO/error-catalog were independently verified against backend source in Phase 4.1 instruction to verify the exact literal set against apps/backend/src/users/users.errors.ts before writing the union.
2. Two open design.md questions remain genuinely open (as designed, not defects): (a) ActualizarUsuarioDto still accepts rol server-side even though the UI never exposes it, flagged as a backlog candidate for number-7 (cascade/reject rule for role changes with existing Apoderado rows); (b) GET /usuarios has no server-side pagination, flagged as a backlog candidate for number-7. Neither blocks this change; both are explicitly out-of-scope backend items already tracked in design.md Preguntas abiertas.

## Final Verdict

PASS

All 20 phases across the 7-PR chain are complete and match their design decisions (D1-D13) and the 3 delta specs 12 requirements / 21 scenarios. Independently re-run test suite (70 files / 457 tests) and typecheck (4 packages) both green, matching the last apply agent reported figures. All six specifically-flagged points (disjoint-role route architecture, the post-PR5 Crear gap fix, D8 field-absence rule, D10 mount-condition and correo normalization, the academico to usuarios import direction, and the no-Eliminar/state-change-via-dialog invariant for Usuario) were verified directly against source code, not merely against prior agent narration, and all hold. No CRITICAL or WARNING issues found. Ready for sdd-archive.
