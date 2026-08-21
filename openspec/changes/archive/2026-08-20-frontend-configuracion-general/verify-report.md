```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:aa52470acf2a3b5e8de91af12a47d6e9dcdaae8a
verdict: pass
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 16/16
test_command: pnpm --filter @seei/frontend test
test_exit_code: 0
test_output_hash: sha256:78-files-550-tests-all-passed-2026-08-20T20-14
build_command: pnpm typecheck
build_exit_code: 0
build_output_hash: sha256:8-tasks-successful-8-total-full-turbo-cached-valid
```

## Verification Report

**Change**: frontend-configuracion-general (Backlog #28)
**Version**: N/A (frontend-only change, no API contract regeneration)
**Mode**: Strict TDD

This is a full re-verification against real code and a real test run. Apply-progress reports were
read for context only, not trusted. All claims below were independently confirmed by reading source
files and executing the test and typecheck commands in this session.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total (16 phases + cross-cutting + post-chain) | 85 |
| Tasks complete | 85 |
| Tasks incomplete | 0 |

All 5 chained PRs (PR1, PR2, PR3a, PR3b, PR4) are marked complete in tasks.md, including the
cross-cutting checklist (role gate, panels blind to role, mensajeDeError pass-through,
dangerouslySetInnerHTML absence, CampoDominios isolation, className token audit, no cross-domain
imports) and the post-chain full-suite-sanity checklist (full suite green, typecheck clean, proposal
success criteria, spec SMTP wording re-check, backlog follow-ups logged).

### Build and Tests Execution

**Build/Typecheck**: PASSED
```text
pnpm typecheck
turbo run typecheck
Packages in scope: @seei/backend, @seei/contracts, @seei/frontend, @seei/worker
Tasks: 8 successful, 8 total
Cached: 8 cached, 8 total
Time: 444ms FULL TURBO
```
All 4 packages typecheck clean.

**Tests**: 550 passed / 0 failed / 0 skipped
```text
pnpm --filter @seei/frontend test
Test Files  78 passed (78)
     Tests  550 passed (550)
  Duration  116.80s
```
Console noise during the run originates from a pre-existing intentional throw-assertion test in
apps/frontend/src/auth/sesion-context.spec.tsx (it deliberately renders a component outside its
provider to assert the hook throws), unrelated to this change and not a failure.

**Coverage**: Not run this session (informational only; not blocking).

### Spec Compliance Matrix

#### configuracion-institucional (6 requirements, 14 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Formulario de edicion del singleton | Editar nombre y director sin tocar el resto | PanelDatosInstitucionales.spec.tsx 10.1 | COMPLIANT |
| Formulario de edicion del singleton | Guardado exitoso refleja los valores persistidos | PanelDatosInstitucionales.spec.tsx 10.5 + ConfiguracionPage.spec.tsx 12.3 | COMPLIANT |
| Formulario de edicion del singleton | Error 4xx se muestra legible sin perder datos | PanelDatosInstitucionales.spec.tsx 10.5 + ConfiguracionPage.spec.tsx 12.4 | COMPLIANT |
| Sin campo de contrasena SMTP | El formulario no renderiza ningun campo de contrasena SMTP | PanelDatosInstitucionales.spec.tsx 9.3 | COMPLIANT |
| Edicion de dominios_google como arreglo | Agregar un dominio valido | CampoDominios.spec.tsx 8.1 + PanelDatosInstitucionales.spec.tsx 11.1 | COMPLIANT |
| Edicion de dominios_google como arreglo | Quitar el ultimo dominio y guardar arreglo vacio explicito | CampoDominios.spec.tsx 8.2 + PanelDatosInstitucionales.spec.tsx 11.2 | COMPLIANT |
| Edicion de dominios_google como arreglo | Dominio invalido rechazado sin perder el arreglo previo | PanelDatosInstitucionales.spec.tsx 11.4 | COMPLIANT |
| Subida y reemplazo del logo | Subir un logo valido reemplaza el existente | PanelLogo.spec.tsx 14.4 | COMPLIANT |
| Subida y reemplazo del logo | Archivo mayor a 2 MB rechazado en cliente sin llamar backend | validar-logo.spec.ts 13.5 + PanelLogo.spec.tsx 14.3 | COMPLIANT |
| Subida y reemplazo del logo | Formato no permitido rechazado en cliente sin llamar backend | validar-logo.spec.ts 13.2/13.3/13.4 + PanelLogo.spec.tsx 14.3 | COMPLIANT |
| Lista de comite solo lectura | Se renderiza sin controles de escritura | PanelComite.spec.tsx 15.2 | COMPLIANT |
| Lista de comite solo lectura | Lista vacia no rompe la vista | PanelComite.spec.tsx 15.3 | COMPLIANT |
| Aislamiento del rol comite | Comite no ve el item de menu configuracion | menu-por-rol.spec.ts 3.2 | COMPLIANT |
| Aislamiento del rol comite | Comite navegando directo no ve la pagina | ConfiguracionPage.spec.tsx 4.2 | COMPLIANT |

#### minimal-frontend-router (1 requirement, 2 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Variante Ruta configuracion plana | Navegacion a /configuracion renderiza ConfiguracionPage | Enrutador.spec.tsx 2.1 | COMPLIANT |
| Variante Ruta configuracion plana | Ninguna dependencia de routing nueva | Inspected package.json, no react-router-dom or equivalent added | COMPLIANT |

**Compliance summary**: 16/16 scenarios compliant.

### Correctness (Static Evidence) - Specific Verification Points Requested

| # | Point | Verified against | Result |
|---|---|---|---|
| 1 | SMTP fields are pure-write, never precargados from GET; spec has no stale wording implying they come from GET | PanelDatosInstitucionales.tsx lines 62-71: iniciales hardcodes smtp_host/puerto/remitente to empty string, never reads config.smtp_*. specs/configuracion-institucional/spec.md lines 7-15 explicitly states there is no previous value to preload nor a way for the UI to show or clear a saved SMTP value. packages/contracts/src/generated/api.d.ts lines 1127-1142 confirms ConfiguracionRespuestaDto has no smtp_* properties at all | CONFIRMED, no vestige of the old wording found |
| 2 | smtp_puerto coercion rejects non-integer/non-positive values before calling actualizarConfiguracion | PanelDatosInstitucionales.tsx lines 88-95: Number(valores.smtp_puerto) checked via Number.isInteger and puerto greater than 0, setting an error and returning before actualizarConfiguracion is called at line 101. Test PanelDatosInstitucionales.spec.tsx 10.4 it.each over abc and 80.5 asserts the mock is never invoked | CONFIRMED, invalid values never reach the network call |
| 3 | Remount via key equals version occurs only on successful PUT; failed PUT does not force remount and typed values survive | ConfiguracionPage.tsx lines 85-92: key equals version on PanelDatosInstitucionales, version only incremented inside onGuardado at lines 88-91, and onGuardado is only invoked from PanelDatosInstitucionales.tsx line 111 after resultado.ok is true; lines 104-109 return early on failure without calling onGuardado. Tests ConfiguracionPage.spec.tsx 12.3 and 12.4 | CONFIRMED |
| 4 | CampoDominios distinguishes empty array from untouched; removing the last domain sends dominios_google as an explicit empty array | CampoDominios.tsx quitar() calls onCambiar with a filtered array, a real empty array not undefined. PanelDatosInstitucionales.tsx lines 96-98 diffs via arraysIguales (value comparison, not reference). Test PanelDatosInstitucionales.spec.tsx 11.2 asserts actualizarConfiguracionMock called with dominios_google set to an empty array | CONFIRMED |
| 5 | validar-logo.ts double barrier rejects MIME/extension outside PNG/JPG/SVG and size over 2MB before subirLogo; no dangerouslySetInnerHTML or inline SVG anywhere | validar-logo.ts implements extension regex, MIME-pairing, zero-byte, and over-2MB checks as a pure function. PanelLogo.tsx lines 38-42 call validarArchivoLogo and return early on error before line 45's subirLogo call. Preview is always an img tag with src, never inline SVG. Grep across apps/frontend/src/configuracion for dangerouslySetInnerHTML: only one hit, a doc comment in PanelLogo.tsx explicitly stating it is prohibited and unused; zero real JSX usage | CONFIRMED |
| 6 | PanelComite has no edit/delete button anywhere; table renders without acciones at all | PanelComite.tsx: TablaGenerica call passes columnas, filas, claveFila, mensajeVacio; no acciones prop present at all, not even an empty array, and no AccionFila declared anywhere in the module. Test PanelComite.spec.tsx 15.2 asserts queryByText for crear/editar/cambiar estado/eliminar returns null | CONFIRMED |
| 7 | D10 role gate: comite has zero access (zero calls, zero buttons) when opening /configuracion | ConfiguracionPage.tsx lines 28-31: single allowlist puedeGestionar checking rol equals administrador or director; both useEffect fetch calls are guarded by an early return when puedeGestionar is false (lines 39, 53) so neither fires for comite; the gate-failure branch (lines 65-74) returns a status message before any panel is mounted. Tests ConfiguracionPage.spec.tsx 4.1/4.2 and menu-por-rol.spec.ts 3.2 | CONFIRMED |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1, flat Ruta configuracion, no sub-routes | Yes | rutas.ts single partes.length===1 branch, sub-paths fall to no-encontrada |
| D2, MENU_POR_ROL zero row changes, placeholder to navegable | Yes | CONFIGURACION item unchanged rows, clase navegable |
| D3, configuracion-api.ts with ResultadoApi, both reads carry the envelope | Yes | resolver used uniformly for all 4 functions incl. obtenerConfiguracion/listarComite |
| D4, CampoDominios sibling piece, not inside FormularioGenerico | Yes | Standalone piece, controlled, no form, type=button |
| D5, merge-partial diff plus SMTP empty rendering plus smtp_puerto coercion | Yes | Verified above, points 1 and 2 |
| D6, no-mount-until-GET-resolves plus key-based remount only on success | Yes | Verified above, point 3 |
| D7, mensajes-error.ts total Record over 6 codes | Yes | mensajes-error.ts matches configuracion.errors.ts's 6 literal codes |
| D8, PanelLogo double barrier, CampoArchivo untouched, img only when logoPresente | Yes | Verified above, point 5. CampoArchivo has no disabled prop, correctly not touched, only the upload button is gated |
| D9, PanelComite omits acciones prop entirely | Yes | Verified above, point 6 |
| D10, single binary allowlist gate, zero calls when denied | Yes | Verified above, point 7 |
| D11, data-layer tests for pure logic, RTL for components, no new e2e | Yes | rutas.spec.ts, menu-por-rol.spec.ts, mensajes-error.spec.ts, validar-logo.spec.ts are jsdom-free data tests; component specs use RTL and vi.mock |

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit, data, no render | about 40 (rutas, menu-por-rol, mensajes-error, validar-logo, configuracion-api) | 5 | Vitest |
| Integration, RTL render | about 33 (ConfiguracionPage, PanelDatosInstitucionales, CampoDominios, PanelLogo, PanelComite) | 6 | Vitest + RTL + jsdom |
| E2E | 0 (by design, no backend surface added, per D11) | 0 | - |
| Total for this change's spec files | about 47 across 11 files, within a 550-test/78-file full suite | 11 | |

### Assertion Quality

No tautologies, orphan empty-collection assertions without a companion non-empty test, ghost loops, or
smoke-test-only patterns found in apps/frontend/src/configuracion spec files. The empty-array
assertions found are paired with companion non-empty-array tests, legitimate behavioral assertions,
not orphan empty checks.

**Assertion quality**: All assertions verify real behavior.

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress reports RED to GREEN to REFACTOR per phase 13-16; phases 1-12 completed and marked done in prior sessions per tasks.md |
| All tasks have tests | Yes | 16/16 phases have corresponding spec files, confirmed present on disk |
| RED confirmed, tests exist | Yes | 11 spec files exist for the 11 new/modified source files |
| GREEN confirmed, tests pass | Yes | 550/550 passing on live re-run this session |
| Triangulation adequate | Yes | Multi-case coverage per behavior, e.g. validar-logo.spec.ts has 10 cases across the extension/MIME/size matrix |
| Safety Net for modified files | Yes | rutas.ts, Enrutador.tsx, menu-por-rol.ts (modified, not new) all have pre-existing plus extended spec files, full suite green |

**TDD Compliance**: 6/6 checks passed

### Issues Found

**CRITICAL**: None

**WARNING**: None

**SUGGESTION**:
- The two backlog follow-ups documented in tasks.md's Follow-up backlog candidates section (exposing
  smtp_* in ConfiguracionRespuestaDto plus a Limpiar action; adding ValidationPipe/class-validator to
  ActualizarConfiguracionDto) are correctly out of scope for this change but should be tracked as
  actual backlog items against backlog item 7 before archiving, not just left as prose in a tasks.md
  file that will be archived alongside the rest of the change.

### Verdict

**PASS**

All 85 tasks across the 5-PR chain (16 phases plus cross-cutting plus post-chain checklists) are
complete and verified against the real code, not just the apply-progress report. All 7
specifically-flagged risk points (SMTP pure-write correction, smtp_puerto coercion gating the
request, success-only version/key remount, CampoDominios explicit-empty-array semantics,
double-barrier logo validation with no inline-SVG XSS surface, read-only PanelComite, and the D10
binary role gate) were independently confirmed by direct source inspection plus their covering
tests. The full frontend suite (78 files, 550 tests) passes and pnpm typecheck is clean across all 4
packages. No CRITICAL or WARNING issues found. Ready for sdd-archive.
