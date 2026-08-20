# Verification Report: frontend-administracion-academica (Backlog #26)

**Mode**: Full artifacts (proposal, design D1-D12, 5 spec deltas, tasks.md, 18 phases across 7 chained PRs)
**Date**: 2026-08-20

## Completeness Table

| Phase (PR) | Tasks | Status |
|---|---|---|
| 1 (PR1) - D1 routing foundation | 1.1-1.4 | [x] all checked, verified (rutas.ts, Enrutador.tsx) |
| 2 (PR1) - D12 menu-por-rol academica navegable | 2.1-2.4 | [x] all checked |
| 3 (PR1) - D2 pestanas.ts | 3.1-3.2 | [x] all checked |
| 4 (PR1) - D7 mensajes-error.ts | 4.1-4.2 | [x] all checked, verified 7-code total map |
| 5 (PR1) - AcademicaPage shell | 5.1-5.5 | [x] all checked |
| 6-8 (PR2) - TablaGenerica/FormularioGenerico/DialogoConfirmacion | 6.1-8.5 | [x] all checked |
| 9 (PR3) - D6 academico-api.ts CRUD completo | 9.1-9.5 | [x] all checked, ResultadoApi relacion field verified present and wired |
| 10 (PR3) - D11 usuarios-api.ts seed | 10.1-10.3 | [x] all checked, single read-only export confirmed |
| 11-13 (PR4) - PanelAniosEscolares/PanelNiveles + wiring | 11.1-13.3 | [x] all checked |
| 14-16 (PR5) - PanelGrados/PanelSecciones + wiring | 14.1-16.3 | [x] all checked |
| 17 (PR6) - PanelAulas + wiring | 17.1-17.6 | [x] all checked, listarAulas filter widening verified backward-compatible |
| 18 (PR7) - PanelMatriculas + wiring | 18.1-18.12 | [x] all checked; traslado call-order test present but validates a different order than spec.md's literal text (see Issues) |
| Cross-cutting checklist | 3 items | [x] all checked, re-verified below |
| Post-chain full-suite sanity | 3 items | [x] all checked, re-verified below (numbers re-run independently) |

No unchecked tasks. Full verification proceeded per Decision Gates.

## Build/Test Evidence (re-run by this verification, not assumed from prior apply reports)

- `pnpm --filter @seei/frontend test` -> 65 test files, 365 tests, all passed, exit 0.
  (Console shows expected "useSesion debe usarse dentro de AuthProvider" jsdom stack-trace noise from the pre-existing negative test in sesion-context.spec.tsx - not a failure, not introduced by this change.)
- `pnpm typecheck` (root, forced fresh run via `npx turbo run typecheck --force`, bypassing turbo cache for all 4 packages: backend, contracts, frontend, worker) -> 8/8 tasks successful, 0 errors, exit 0.
- Both results match tasks.md's self-reported "Post-chain: full suite sanity" numbers (65 files / 365 tests, 8/8 typecheck) - independently reproduced, not merely trusted.

## Specific verification points requested by the orchestrator

1. ResultadoApi relacion field (PR3 vs design.md D6) - CONFIRMED. design.md D6 fundamento states resolver/resolverVacio propagate relacion the same way as codigo, and explicitly notes design.md D6 already documented relacion in ResultadoApi. academico-api.ts lines 131-137 declare ResultadoApi<T> with ok, data, status, codigo, relacion all present, and extraerRelacion() (lines 163-168) is wired into both resolver (line 180) and resolverVacio (line 197). Matches design intent exactly.

2. listarAulas filter widening (PR6) vs useOpcionesSegmentacion.ts (preexisting caller) - CONFIRMED non-breaking. academico-api.ts lines 30-35 widened the filter type to an all-optional superset (grado_id, seccion_id, anio_escolar_id, turno). useOpcionesSegmentacion.ts's useAulas() (lines 89-137) only ever passes grado_id or anio_escolar_id, a strict subset, so no call site is affected. No test regression: full suite green.

3. PanelMatriculas (PR7) three undocumented decisions:
   - (a) "Crear" requires BOTH aula_id AND anio_escolar_id - confirmed in code (PanelMatriculas.tsx line 232, puedeCrear checks both filtroAulaId and filtroAnioEscolarId are non-empty). This does NOT contradict design.md D9, which only mandates the listing/fetch gate ("Matriculas exige elegir un Aula antes de listar"); recargar() at lines 70-79 correctly requires only filtroAulaId, matching D9 literally. The extra anio_escolar_id gate is specific to the "Crear" button and is justified in-code (lines 32-34 comment) by CrearMatriculaInput.anio_escolar_id being a required field. This is an undocumented-in-design but non-contradictory implementation decision - does not break any written spec or design requirement. Rated SUGGESTION (design.md should note this for traceability), not a defect.
   - (b) listarUsuarios() called without filter, rol equals estudiante filtered client-side - matches D11's own fundamento text, which explicitly describes this exact client-side filtering approach because the user catalog is small. Not a deviation - the design doc itself describes this approach. Compliant.
   - (c) Cross-cutting DELETE ENTIDAD_CON_DEPENDIENTES checklist item centralized in mensajeDeError - verified equivalent behavior. mensajes-error.ts lines 30-40 special-case codigo equals ENTIDAD_CON_DEPENDIENTES with a relacion present to interpolate the entity name, falling back to the generic per-code map otherwise. Every panel calls mensajeDeError with codigo, relacion, status uniformly on failure - the checklist's intent (legible relacion-aware message) is satisfied via one shared function rather than six inline checks. Observable behavior is equivalent; test coverage exists per-panel (409 scenarios in each Panel*.spec.tsx). Compliant, not a deviation of concern.

4. Traslado de matricula call order (crearMatricula before eliminarMatricula) - code and tests CONFIRM crearMatricula always precedes eliminarMatricula (PanelMatriculas.tsx lines 176-214, test PanelMatriculas.spec.tsx lines 178-216 asserts ordenCrear is less than ordenEliminar via invocationCallOrder). Partial-failure handling confirmed: [18.7] if crearMatricula fails, eliminarMatricula is never called (lines 190-196, asserted at spec.tsx lines 241-242); [18.8] if crearMatricula succeeds but eliminarMatricula fails, a persistent role=alert names both matricula ids (PanelMatriculas.tsx lines 201-209) and does not auto-dismiss. However, this literal call order (POST then DELETE) contradicts the literal text of two upstream artifacts - see CRITICAL issue below.

5. No panel calls useSesion() directly - CONFIRMED. Grepping for useSesion across apps/frontend/src/academico/paneles/*.tsx and AcademicaPage.tsx returns exactly one call site: AcademicaPage.tsx line 22. All six panels receive soloLectura as a boolean prop (D8). PanelAniosEscolares.tsx even documents this explicitly in a comment stating it never reads useSesion().

## Spec Compliance Matrix

| Spec delta | Requirement | Scenario | Status | Evidence |
|---|---|---|---|---|
| academic-tree-management | UI cascada Nivel/Grado/Seccion/Aula | Listado de Grado filtrado por Nivel | PASS | PanelGrados.spec.tsx [14.1] |
| | | Listado de Aula filtrado por 4 filtros | PASS | PanelAulas.spec.tsx [17.1] |
| | | Eliminar Nivel con Grado dependiente muestra mensaje legible | PASS | PanelNiveles.spec.tsx [12.3] |
| | Componentes genericos reutilizables | 4 pestanas usan TablaGenerica | PASS | source inspection: PanelNiveles/Grados/Secciones/Aulas.tsx all import from comun/piezas/TablaGenerica |
| | Defensa en profundidad comite | Comite sin botones de escritura | PASS | PanelNiveles/Grados/Secciones/Aulas.spec.tsx soloLectura toggling tests |
| | | Admin/director ven CRUD completo | PASS | same test files, soloLectura false branch |
| school-year-management | UI gestion AnioEscolar | Eliminar con Seccion dependiente | PASS | PanelAniosEscolares.spec.tsx [11.5] |
| | Activacion con confirmacion simple | Activar pide confirmacion, sin nombrar ano desactivado | PASS | PanelAniosEscolares.spec.tsx [11.6] |
| | | Cancelar no activa | PASS | PanelAniosEscolares.spec.tsx [11.6] |
| | Defensa en profundidad comite sobre AnioEscolar | Comite sin boton Activar | PASS | PanelAniosEscolares.spec.tsx [11.3] |
| student-enrollment | UI Matricula con filtros en cascada | Listado filtrado por AnioEscolar y Aula | PASS | PanelMatriculas.spec.tsx [18.2] |
| | Traslado como eliminar+crear, nunca edicion | No existe boton Editar | PASS | PanelMatriculas.spec.tsx [18.4] |
| | | Trasladar elimina la original y crea una nueva | FAIL on literal text | Spec text literally requires DELETE before POST; implementation and its covering test (PanelMatriculas.spec.tsx lines 178-216, [18.6]) instead assert crearMatricula (POST) before eliminarMatricula (DELETE) - see CRITICAL issue below. No test covers the scenario as literally written in spec.md |
| | Defensa en profundidad comite sobre Matricula | Comite sin Crear/Eliminar/Trasladar | PASS | PanelMatriculas.spec.tsx [18.9] |
| minimal-frontend-router | Variante Ruta academica | Navegacion renderiza AcademicaPage con 6 pestanas | PASS | AcademicaPage.spec.tsx [5.1] |
| | | Cambiar pestana no cambia URL | PASS | AcademicaPage.spec.tsx [5.2] |
| | Sin deep-link | Recargar pierde pestana activa | PASS (by construction) | useState local, no sessionStorage/URL write - confirmed by source inspection of AcademicaPage.tsx |
| menu-navegacion-post-login | Item real de academica | Administrador navega a academica | PASS | (from #25, re-confirmed) menu-por-rol.spec.ts [2.1] |
| | | Comite navega a academica en modo lectura | PASS | menu-por-rol.spec.ts [2.1] + AcademicaPage.spec.tsx [5.3] |
| | Aterrizaje post-login por rol | academica pasa de placeholder a real | PASS | menu-por-rol.spec.ts [2.1] |
| | Placeholders deshabilitados | Comite ya no ve placeholder de academica | PASS | menu-por-rol.spec.ts [2.1] |

23 scenarios total across 5 spec deltas; 22 PASS, 1 FAIL on literal-text compliance (traslado call order - functionally safer implementation, but contradicts the spec's written scenario).

## Design Coherence (D1-D12)

| Decision | Check | Status |
|---|---|---|
| D1 - single academica route, tab state local | rutas.ts/Enrutador.tsx variant present; AcademicaPage.tsx uses useState PestanaAcademica | PASS |
| D2 - AcademicaPage + per-entity contained panels, PESTANAS as data | 6 Panel*.tsx files, pestanas.ts exports PESTANAS array | PASS |
| D3 - TablaGenerica interface | ColumnaTabla/AccionFila/props exactly match design's interface block | PASS |
| D4 - FormularioGenerico, all-string values | CampoFormulario discriminated union, onEnviar receives Record of strings | PASS |
| D5 - DialogoConfirmacion inline, no portal | role=dialog, no portal, same shape as DialogoVinculacion | PASS |
| D6 - academico-api.ts expansion, 4 reads untouched, 15 writes via ResultadoApi | Confirmed above (point 1); reads keep raw data/response shape | PASS |
| D7 - mensajes-error.ts total Record plus relacion interpolation | Confirmed; 7-code total map, ENTIDAD_CON_DEPENDIENTES interpolation | PASS |
| D8 - allowlist soloLectura, panels never call useSesion | Confirmed above (point 5); allowlist logic at AcademicaPage.tsx | PASS |
| D9 - filters optional except Matricula requires Aula before listing | Confirmed; recargar() gates on filtroAulaId only, matching D9's literal listing requirement | PASS |
| D10 - traslado: crear antes que eliminar (el orden importa por unique constraint) | Code and test match D10's stated order | PASS vs design.md, but design.md D10 itself contradicts proposal.md's stated scope line and the literal text of student-enrollment's spec.md scenario - see CRITICAL issue |
| D11 - usuarios-api.ts seed, single listarUsuarios | Confirmed, no write functions added | PASS |
| D12 - test strategy (data vs render) | Matches: pure-data specs for pestanas/mensajes-error/routing/menu; RTL render specs for pieces and panels | PASS |

## Issues

### CRITICAL

1. Traslado de matricula: call-order artifact inconsistency (proposal.md / spec.md vs design.md / code).
   - proposal.md Scope states the traslado de matricula is a DELETE followed by POST (decision already taken in backend).
   - openspec/changes/frontend-administracion-academica/specs/student-enrollment/spec.md requirement text states the UI first invokes DELETE on the existing enrollment and then POST a new one, and its scenario literally describes DELETE followed by POST.
   - design.md D10 explicitly reverses this order with a well-reasoned justification: the container executes crearMatricula first and eliminarMatricula(idAnterior) after, citing the unique constraint on usuario_id/aula_id/anio_escolar_id - creating first avoids ever leaving a student unenrolled if the second call fails, at the cost of a possible (recoverable) duplicate.
   - The implementation (PanelMatriculas.tsx lines 176-214) and its test (PanelMatriculas.spec.tsx [18.6], asserting ordenCrear is less than ordenEliminar) correctly and consistently follow design.md's order, not the order literally written in proposal.md/spec.md.
   - Per the verification decision gate (a spec scenario is compliant only when a covering test passed at runtime; a spec scenario with no passing covering test is CRITICAL), no test validates the spec.md scenario as literally written (DELETE then POST) - the only covering test validates the opposite order.
   - This is a documentation defect, not a functional defect: the implemented order is safer and the design rationale is sound. But spec.md (and proposal.md's scope line) were never updated to reflect design's reversal, so the artifact chain is internally inconsistent. This should be corrected - update spec.md's "Traslado de Matricula" requirement and scenario text (and ideally proposal.md's scope line) to state POST (crear) before DELETE (eliminar), matching design.md D10 and the actual/tested behavior - before archiving, so the archived spec accurately describes the shipped system.

### WARNING

None. (Item 3a in the specific verification points above - the extra anio_escolar_id gate on "Crear" in PanelMatriculas - does not contradict any written spec or design requirement, so it is downgraded to a SUGGESTION rather than a WARNING.)

### SUGGESTION

- Document in design.md D9 (or a follow-up note) that the "Crear" button in PanelMatriculas additionally requires anio_escolar_id (not just aula_id), and why (CrearMatriculaInput.anio_escolar_id is required) - this is a real, tested, non-breaking implementation decision that future readers of design.md would not otherwise discover.
- Once spec.md's traslado scenario text is corrected (CRITICAL item above), consider adding a one-line note in design.md D10 cross-referencing that the design intentionally overrides the proposal's originally-stated order, so the "why" survives future re-reads without needing to diff against proposal.md.

## Final Verdict: PASS WITH WARNINGS

All 90 tasks across 18 phases (7 chained PRs) plus the cross-cutting checklist and post-chain sanity items are complete and consistent between code and tasks.md. Test suite (65 files / 365 tests) and typecheck (8/8 tasks, 0 errors) independently re-run by this verification, both green - not assumed from prior apply-agent reports. All five specific points flagged by the orchestrator for extra scrutiny (ResultadoApi relacion, listarAulas filter widening, PanelMatriculas' three undocumented decisions, traslado call order, and useSesion isolation) were independently re-verified against source: four are fully compliant, one (the "Crear" button's extra anio_escolar_id gate) is a benign undocumented decision downgraded to SUGGESTION.

The one CRITICAL finding is a documentation consistency defect, not a functional or test-coverage defect: spec.md's literal scenario text for matricula traslado (DELETE then POST) was never updated to match design.md D10's later, better-reasoned reversal (POST then DELETE), which is what was actually built and tested. Recommend correcting spec.md (and proposal.md's scope line) to match the shipped/tested order before archiving - this is a low-effort text fix, not a code change, and does not block the safety or correctness of the shipped behavior.
