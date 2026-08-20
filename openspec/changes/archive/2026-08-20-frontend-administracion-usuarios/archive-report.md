# Archive Report: frontend-administracion-usuarios (Backlog #27)

**Date**: 2026-08-20
**Change Name**: frontend-administracion-usuarios
**Artifact Store Mode**: openspec (hybrid workflow)
**Archive Location**: `openspec/changes/archive/2026-08-20-frontend-administracion-usuarios/`

## Final State Authority

### Verification Summary

Per verify-report (2026-08-20), the change passed full verification:
- **Status**: PASS
- **CRITICAL issues**: 0
- **WARNING issues**: 0
- **SUGGESTION issues**: 2 (both low priority, already tracked in design.md Preguntas abiertas and backlog)
- **Test suite**: 70 test files, 457 tests, all pass (independently re-run)
- **Type checking**: 8/8 tasks clean, 0 errors (independently forced fresh run)
- **Spec scenarios**: 25/25 passing (administracion-usuarios-apoderados 12, bloqueo-desbloqueo-cuentas 8, minimal-frontend-router 5)

### Final Status at Close

Per the Task Completion Gate:
- All 20 implementation phases across 7 chained PRs: [x] marked complete
- No unchecked implementation tasks remain
- All spec scenarios: 25/25 PASS; 0 defects
- Build/test: 457 tests all pass; typecheck 8/8 tasks, 0 errors (re-verified independently)

The change is complete and ready for production deployment.

### Code State: Pending Commit

**IMPORTANT**: All implementation (7 chained PRs, ~2,050 lines as forecasted) is complete in the working tree but **NOT YET COMMITTED to the repository**. The archive-report records the state AT CLOSE of the SDD cycle; implementation remains staged/uncommitted pending user review and commit.

- 7 PRs fully implemented per tasks.md Phase breakdown
- All tests pass in the local working tree
- All typecheck validations pass
- No code changes remain pending within this SDD change (the implementation is complete)

The user will commit these 7 PRs after reviewing the archive report and final SDD artifacts.

## Specs Synced

All three domain specs have been merged with delta requirements from this change:

| Domain | Action | Details |
|--------|--------|---------|
| administracion-usuarios-apoderados | Updated | +5 ADDED requirements: listado UI con filtros, alta/edición sin password, cambio de estado, panel apoderados, aislamiento rol comité |
| bloqueo-desbloqueo-cuentas | Updated | +3 ADDED requirements: listado UI comité, desbloqueo con confirmación auditada, visibilidad de botón |
| minimal-frontend-router | Updated | +4 ADDED requirements: Ruta `usuarios` plana, Ruta `cuentas-bloqueadas` independiente, sin deep-link a usuario |

**Merge details**: Each delta spec in `openspec/changes/frontend-administracion-usuarios/specs/{domain}/spec.md` was appended to `openspec/specs/{domain}/spec.md`. All existing requirements remain intact; new requirements are purely additive.

## Archive Contents

The entire change folder has been copied to `openspec/changes/archive/2026-08-20-frontend-administracion-usuarios/` with the following structure:

```
2026-08-20-frontend-administracion-usuarios/
├── proposal.md
├── exploration.md
├── design.md
├── tasks.md
├── verify-report.md
├── archive-report.md (this file)
└── specs/
    ├── administracion-usuarios-apoderados/spec.md
    ├── bloqueo-desbloqueo-cuentas/spec.md
    └── minimal-frontend-router/spec.md
```

**File count**: 9 files (1 new archive-report, 8 original artifacts)

### Files Archived

1. **proposal.md** — Backlog #27 proposal: CRUD of Usuario (5 roles), Apoderado management (estudiante-only), account unlock manual panel (comité-only), UI-only impact on #26's routing and menu infrastructure
2. **exploration.md** — Analysis of current state, 3 entities (Usuario, Apoderado, UsuarioBloqueado), approach comparison, risks
3. **design.md** — 13 architectural decisions (D1-D13) covering routes (usuarios plana, cuentas-bloqueadas independiente), page composition, generic components reuse (TablaGenerica, FormularioGenerico, DialogoConfirmacion from #26), API expansion (9 functions), error messages, role-based UX (allowlist gates, soloLectura), pagination, confirm flows, menú updates
4. **tasks.md** — 20 implementation phases across 7 chained PRs, review workload forecast (7 PRs recommended to stay under 400 lines per PR via split of design's suggested PR1 into routing+menu and error-catalog+stubs), all tasks [x] marked complete + post-chain full-suite sanity verified
5. **verify-report.md** — Full verification (2026-08-20): PASS. All 457 tests passing (up from 439 in the prior 6-PR design forecast), 0 typecheck errors, 0 CRITICAL, 0 WARNING, 2 low-priority SUGGESTIONs
6. **specs/**: Three delta specs merged into main `openspec/specs/`:
   - administracion-usuarios-apoderados: 5 UI requirements (listado, alta/edición, cambio estado, apoderados panel, comité isolation)
   - bloqueo-desbloqueo-cuentas: 3 UI requirements (listado comité, desbloqueo, visibilidad)
   - minimal-frontend-router: 4 routing requirements (usuarios route, cuentas-bloqueadas route, no deep-link usuario, implicit no deep-link)

All artifacts are original sources, not modifications or references.

## Implementation Summary

### Verified Against Spec

Per the verify-report (2026-08-20), the implementation fulfills all 25 spec scenarios across the 3 domains:

#### administracion-usuarios-apoderados (12 scenarios)
- **Requirement: UI de listado central** — UsuariosPage lists usuarios with rol/estado filters via TablaGenerica; empty state handled
- **Requirement: Alta y edición** — FichaUsuarioPage creation/edit forms for 5 roles, no password field, dual-form dispatch on usuario prop
- **Requirement: Cambio de estado** — DialogoConfirmacion before estado change, no Eliminar action anywhere
- **Requirement: Panel de Apoderado** — PanelApoderados mounts only when rol === 'estudiante', CRUD and physical deletion
- **Requirement: Aislamiento rol comité** — usuarios menu item absent for comité, zero write buttons in UsuariosPage when !puedeGestionar

#### bloqueo-desbloqueo-cuentas (8 scenarios)
- **Requirement: UI listado comité** — CuentasBloqueadasPage lists estado='bloqueado' accounts with id/nombres/dni/codigo/bloqueado_hasta
- **Requirement: Desbloqueo confirmado auditado** — DialogoConfirmacion mentions auditoría before POST /desbloquear
- **Requirement: Botón condicional** — desbloquear action renders only for bloqueado rows; endpoint constraint ensures listado never shows other estados

#### minimal-frontend-router (5 scenarios)
- **Requirement: Ruta `usuarios` plana** — parsearRuta/rutaAPath total, case in Enrutador.tsx, selection via component state not URL
- **Requirement: Ruta `cuentas-bloqueadas` independiente** — separate flat route, no nesting under usuarios, role-disjoint architecture confirmed
- **Requirement: Sin deep-link usuario** — reloading /usuarios loses ficha, returns to listado
- **Implicit no deep-link**: State local to UsuariosPage, no URL persistence

All 25 scenarios integrated across UsuariosPage, FichaUsuarioPage, PanelApoderados, CuentasBloqueadasPage components; all role gates, filters, state machines, and error paths tested and passing.

### Code Changes (Not Yet Committed)

Per verify-report (2026-08-20), all implementation complete in the working tree, pending commit/PR by the user:

**Frontend changes (apps/frontend/src/)**:
- `app/rutas.ts`, `Enrutador.tsx` — D1 two new Ruta variants (usuarios, cuentas-bloqueadas)
- `app/menu-por-rol.ts` — D2 USUARIOS to navegable (admin/director), CUENTAS_BLOQUEADAS new (comité-only)
- `usuarios/mensajes-error.ts` — D7 error catalog (5 codes, campo interpolation, status fallback)
- `usuarios/usuarios-api.ts` — D5/D6 CRUD expansion (9 new functions: crear/actualizar/cambiarEstado Usuario, listarApoderados/crear/actualizar/eliminar, listarBloqueadas/desbloquear)
- `usuarios/UsuariosPage.tsx` — D3/D4/D12 listado real, filtros, paginación, ficha selection, allowlist gate
- `usuarios/FichaUsuarioPage.tsx` — D8/D9 alta/edición/estado change, no rol in edit mode, no Eliminar
- `usuarios/paneles/PanelApoderados.tsx` — D10 CRUD, visible only for estudiante, correo trim-to-undefined
- `usuarios/CuentasBloqueadasPage.tsx` — D11 listado, desbloqueo with audited dialog, reload-not-optimistic

**Spec tests**: All 7 files of comprehensive unit/integration specs (rutas.spec.ts, Enrutador.spec.tsx, menu-por-rol.spec.ts, mensajes-error.spec.ts, usuarios-api.spec.ts, UsuariosPage.spec.tsx, FichaUsuarioPage.spec.tsx, PanelApoderados.spec.tsx, CuentasBloqueadasPage.spec.tsx) implement TDD cycles (RED/GREEN) per tasks.md and all pass.

### Test Results

- **Full frontend test suite**: 457 tests passed, 70 test files (Vitest, independently re-run by verification)
- **Type checking**: 0 errors, 8/8 tasks (TypeScript, all packages, independently forced fresh run)
- **Spec scenarios**: 25/25 passing across 3 domain specs; all requirements covered by passing tests

### No CRITICAL Issues Blocking Archive

The verify-report identified 0 CRITICAL issues. The 2 SUGGESTION issues are low-priority, out-of-scope backlog items (manual staging integration test for crearUsuario CAMPO_INVALIDO/correo, and GET /usuarios server-side pagination), both explicitly flagged in design.md Preguntas abiertas as future work and not blocking this delivery.

## Task Completion Status

All 20 implementation phases + 5 cross-cutting checklist items + 3 post-chain sanity items:
- Phase 1-3 (PR1): 11 tasks (routing + menu) ✓
- Phase 4-6 (PR2): 12 tasks (error catalog + gated stubs) ✓
- Phase 7-9 (PR3): 13 tasks (usuarios-api CRUD) ✓
- Phase 10-12 (PR4): 12 tasks (listado + filtros + paginación) ✓
- Phase 13-15 (PR5): 18 tasks (ficha alta/edición + estado change) ✓
- Phase 16-18 (PR6): 17 tasks (PanelApoderados CRUD) ✓
- Phase 19-20 (PR7): 12 tasks (cuentas bloqueadas listado + desbloqueo) ✓
- Cross-cutting (5 items): gate allowlist discipline, soloLectura propagation, mensajeDeError wiring, className audit, no reverse cross-domain import ✓
- Post-chain sanity (3 items): full suite green, typecheck green, success-criteria verified ✓

**All 92 tasks marked complete in the archived `tasks.md`.**

## Dependencies & Impact

- **Dependent upon**: #25 (menú/enrutamiento, archived), #8 (backend académico, archived), and implicitly #26 (frontend académico, archived) for TablaGenerica/FormularioGenerico/DialogoConfirmacion patterns
- **Enables**: #28 (configuración), #29 (importación Excel), future RBAC-heavy domains — reusable UI patterns (pagination in client, role-based allowlist gates, audited confirm dialogs) now demonstrated and tested
- **No breaking changes**: Frontend-only, no backend migrations, API changes (backend already exposes all endpoints), or deployment changes
- **Rollback**: Revert all commits from the change; restore usuarios/cuentas-bloqueadas menu items to `{ clase: 'proximamente' }`

## Implementation Notes & Discrepancies

### Design Discrepancy Resolution (2026-08-20)

**Issue raised by verify-report**: Design.md originally described desbloqueo manual as a contextual panel within Usuario ficha (administrador/director scope), but the backend (`AuthController.desbloquear`, `@Roles('comite')`) and administracion-usuarios-apoderados backend rules (comite rejected across UsersModule) make this combination impossible: the role that can invoke desbloqueo is the only role comité can be, and comité cannot see Usuario ficha.

**Resolution**: User confirmed (2026-08-20) during design phase — **CuentasBloqueadasPage is a standalone route**, independent of /usuarios, with its own menu item visible only to comité. Specs were corrected mid-design (bloqueo-desbloqueo-cuentas spec.md lines 13-22, minimal-frontend-router spec.md lines 14-21) to reflect this decision. Implementation and code follow the corrected spec, not the original proposal. **No defect or leftover code remains** — the architectural change was applied cleanly across specs, design, and implementation.

### Pre-Existing Architectural Pattern Reused

**academico to usuarios import direction** (academico/PanelMatriculas importing usuarios/usuarios-api): This is a pre-existing, spec-documented exception from #26 (`listarUsuarios` is the seed function designed to be consumed by PanelMatriculas before #27 existed). Design.md D5 explicitly states this dependency. No new violation introduced; verify-report confirmed no reverse import (usuarios does not import academico).

### Design Questions Remaining (Out of Scope)

Per design.md Preguntas abiertas, two questions remain open as future backlog items:
1. ActualizarUsuarioDto still accepts rol server-side even though UI never exposes it (cascade/reject rule for role changes with Apoderado rows) — flagged as candidate for #7 backend redesign
2. GET /usuarios has no server-side pagination (currently relies on client-side slice) — flagged as candidate for #7 backend scalability

Neither blocks this delivery; both are explicitly out-of-scope backend items already tracked.

## Delivery Strategy

- **Mode**: openspec (filesystem-based artifact store + Engram persistence)
- **Spec sync**: Complete — 3 domain specs updated with 12 merged delta requirements (5+3+4)
- **Archive**: Complete — entire change folder copied to archive/2026-08-20-{change-name}/
- **Main specs updated**: openspec/specs/{3 domains}/spec.md now include all UI requirements
- **SDD cycle**: CLOSED — no further orchestration needed

## Change Completeness Checklist

- [x] Proposal artifact recovered and reviewed
- [x] Spec artifacts (3 deltas) recovered and reviewed
- [x] Design artifact recovered and reviewed
- [x] Tasks artifact recovered and reviewed
- [x] Verify-report artifact recovered and reviewed
- [x] Design discrepancy (desbloqueo scope) identified during planning and resolved in specs/design before implementation
- [x] Task Completion Gate passed (all 20 phases + 5 cross-cutting + 3 post-chain items checked, 92/92 complete)
- [x] Native Review Receipt Gate satisfied (disabled/unmanaged mode, no review blocking)
- [x] All delta specs merged/appended to main specs
- [x] Entire change folder copied to archive/2026-08-20-{change-name}/
- [x] Archive contains all artifacts (proposal, specs, design, tasks, verify-report, archive-report)
- [x] Main specs updated to reflect 12 new UI requirements (5+3+4 across 3 domains)
- [x] All 25 spec scenarios covered and passing
- [x] 0 CRITICAL issues remaining in verify-report
- [x] 457 tests passing, typecheck clean
- [x] Code complete in working tree, not yet committed (pending user review)

## Final Verdict: **ARCHIVED AND CLOSED (Pending Commit)**

The change `frontend-administracion-usuarios` (Backlog #27) has been fully planned, implemented, verified, and archived. All 12 new UI requirements across 3 domain specs are merged and documented. The design discrepancy regarding desbloqueo scope (contextual panel vs. standalone route) was resolved mid-design in favor of the architectural correctness (standalone route, role-disjoint), and the implementation follows the corrected specs cleanly with no leftover code. No open issues, no pending SDD tasks, no discrepancies between artifacts and implementation remain.

The SDD cycle for this change is complete. Implementation (7 chained PRs, ~2,050 lines) is staged in the working tree, pending the user's commit review.

**Archived to**: `openspec/changes/archive/2026-08-20-frontend-administracion-usuarios/`

**Main specs updated**: 
- `openspec/specs/administracion-usuarios-apoderados/spec.md` (+5 UI requirements)
- `openspec/specs/bloqueo-desbloqueo-cuentas/spec.md` (+3 UI requirements)
- `openspec/specs/minimal-frontend-router/spec.md` (+4 routing requirements)

**Test evidence**: 457/457 tests passing, 0 typecheck errors (independently re-verified)

**Implementation**: 7 chained PRs, ~2,050 lines, 92 tasks + cross-cutting items, all complete

**Status**: Ready for commit and deployment.
