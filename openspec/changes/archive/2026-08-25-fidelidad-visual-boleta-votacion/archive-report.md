# Archive Report: fidelidad-visual-boleta-votacion

**Change**: fidelidad-visual-boleta-votacion (Backlog #31 — Fidelidad visual de la boleta de votación contra capturas de referencia)
**Date**: 2026-08-25
**Status**: ARCHIVED — Cycle Complete
**Mode**: openspec (hybrid — also persisted to Engram for traceability)

## Final State Summary

All phases (0–5) are complete. All 29 phases (tasks 1.1–29.6) marked [x]. Verify verdict: **PASS WITH WARNINGS** (0 CRITICAL, 1 WARNING, 1 SUGGESTION). No blockers. The change is fully planned, designed, implemented, tested, verified, and ready for deployment.

Implementation spans 5 stacked PRs (chained on `feat/administracion-procesos-electorales-pr4-cimientos-backend`):

1. **PR1** (`cb53b47`): Backend `periodo_lectivo` field in `ComprobanteDto` (D2)
2. **PR2** (`adb9aa4`): Paso 1 rewrite with badge, hero, rules icons, footer (D4/D5/D8)
3. **PR3** (`79838c6`): `BotonSeleccion` shared ARIA contract + `BannerInstrucciones` + `TarjetaVotoBlanco` rewrite + `PasoBoleta` banner (D1/D6)
4. **PR4** (`8ccd7db`): `TarjetaLista`/`TarjetaCandidato`/`TarjetaOpcion` rewrites adopting photo+ribbon+button pattern (D1/D8)
5. **PR5** (`8cdcd5e`): `PanelComprobante` with `periodo_lectivo` conditional, static "Sincronizado" indicator, "Cerrar Sesión" button (D2/D3/D7); wiring in `VotacionPage`/`ComprobantePage`

All 5 PRs are committed on the current branch (`cb53b47`..`8cdcd5e`), plus the verify-report commit (`b8e6550`). No external GitHub PRs — this project uses internal commit history per convention.

## Artifact Traceability

### Engram Observations (IDs for external reference)
- **Proposal** (obs ID 219): `sdd/fidelidad-visual-boleta-votacion/proposal`
- **Spec** (obs ID 220): `sdd/fidelidad-visual-boleta-votacion/spec`
- **Design** (obs ID 221): `sdd/fidelidad-visual-boleta-votacion/design`
- **Tasks**: Located at `openspec/changes/fidelidad-visual-boleta-votacion/tasks.md` (not persisted to Engram in hybrid mode; filesystem is source of truth)
- **Verify Report** (obs ID 223): `sdd/fidelidad-visual-boleta-votacion/verify-report` (Verdict: PASS WITH WARNINGS at 2026-08-25 10:36:58)
- **Archive Report** (this file): `sdd/fidelidad-visual-boleta-votacion/archive-report`

### OpenSpec Artifacts (filesystem locations at archive date)
- Proposal: `openspec/changes/fidelidad-visual-boleta-votacion/proposal.md`
- Exploration: `openspec/changes/fidelidad-visual-boleta-votacion/exploration.md`
- Design: `openspec/changes/fidelidad-visual-boleta-votacion/design.md`
- Tasks: `openspec/changes/fidelidad-visual-boleta-votacion/tasks.md`
- Verify Report: `openspec/changes/fidelidad-visual-boleta-votacion/verify-report.md`
- Delta Specs: `openspec/changes/fidelidad-visual-boleta-votacion/specs/` (both archived)
- **Archived to**: `openspec/changes/archive/2026-08-25-fidelidad-visual-boleta-votacion/`

### Merged Main Specs
- **vote-casting**: Delta spec merged into `openspec/specs/vote-casting/spec.md`
  - 3 new requirements added: `periodo_lectivo` field, Banner de instrucciones, Modelo de interacción foto+cinta+doble botón
  - 3 existing requirements modified: Paso 1 refactored (badge, hero, icons, footer), Variantes refactored (ribbon pattern), Boleta mobile-first refactored (explicit voto en blanco visual)
- **comprobante-autenticado**: Delta spec merged into `openspec/specs/comprobante-autenticado/spec.md`
  - 1 new requirement added: Botón "Cerrar Sesión"
  - 1 existing requirement modified: Jerarquía visual expanded (conditonal `periodo_lectivo`, static "Sincronizado")
  - 1 requirement removed: "Sin campos nuevos en `ComprobanteDto`" (replaced by conditional field logic)

## Task Completion Gate

**Result**: PASS

All 29 task phases (grouped into 5 PRs) marked [x]:
- PR1 — Backend (Phases 1–4): 4/4 ✓
- PR2 — Paso 1 (Phases 5–8): 4/4 ✓
- PR3 — BotonSeleccion + Tarjetas (Phases 9–16): 8/8 ✓
- PR4 — Adopción del patrón (Phases 17–22): 6/6 ✓
- PR5 — Paso 3 (Phases 23–28): 6/6 ✓
- Phase 29 — Checklist final: 1/1 ✓

No stale checkboxes; completion visibility is accurate to actual code delivered.

## Verification Summary

**Verdict**: PASS WITH WARNINGS — 0 CRITICAL, 1 WARNING, 1 SUGGESTION

**Critical Findings**: None

**Warnings**:
1. **PasoBoleta.spec.tsx test [21.1]** (focus movement by arrow keys): Asserts structural properties (button not type=radio, no shared name) instead of literally testing `document.activeElement` movement. A reasonable jsdom-limitation proxy (jsdom does not implement native radiogroup arrow-key focus navigation), but does not directly assert focus movement as the spec scenario literally describes. Non-blocking; recommend Playwright e2e test if revisited to capture true keyboard navigation behavior.

**Suggestions**:
1. **Task 24.1** ("Sincronizado shown identically in any state"): No dedicated test by exact name in `PanelComprobante.spec.tsx` — satisfied by construction (unconditional JSX render, no `&&`/`if` wrapper) and indirectly covered by other tests, but lacks an explicit assertion for full task traceability. Future opportunity for named test assertion.

**Build & Tests**:
- Backend: `pnpm --filter @seei/backend test -- votos.service comprobante.service` → 75/75 tests PASS
- Frontend: `pnpm --filter @seei/frontend test` → 691/691 tests PASS (all 95 files)
- Typecheck: `pnpm --filter @seei/frontend typecheck` → PASS (clean)

**Spec Compliance**:
- Requirements: 9 total (6 vote-casting new/modified + 2 comprobante-autenticado new/modified + 1 comprobante-autenticado removed)
- Scenarios: 18 new/modified scenarios across both specs
- All 18 scenarios COMPLIANT via executed green tests (no partial or deferred scenarios)
- All 8 design decisions (D1–D8) verified in source code

## Final-State Facts (Post-Verify)

The following work was completed and verified after the verify-report snapshot (obs #223, 2026-08-25 10:36:58):

### Implementation Notes from Verify

1. **PR1 & PR2 Already Committed**: Commits `cb53b47` (PR1, backend period) and `adb9aa4` (PR2, Paso 1) were already live on the branch at verify time; only PR3–PR5 remained uncommitted in the working tree. Verify report accurately notes this entry point condition.

2. **Code-to-Spec Traceability Confirmed**: All 8 design decisions (D1–D8) have corresponding code evidence:
   - D1 (ARIA contract): `BotonSeleccion.tsx` with sr-only radio + label wrapping
   - D2 (periodo_lectivo): `ComprobanteDto` field + `construirComprobante()` populated + `ComprobanteService` delegated
   - D3 (Sincronizado static): Unconditional JSX render in `PanelComprobante.tsx`, mandatory comment noting product decision
   - D4 (Hero fallback): `PasoInformacionProceso.tsx` renders bg-primary on 404, button remains functional
   - D5 (Inline SVG icons): `iconos-reglas.tsx` defined, no new npm dependency
   - D6 (Static banner): `BannerInstrucciones.tsx` no role="alert", no live region
   - D7 (Presentational pure): `PanelComprobante` receives `onVolverAlInicio`/`onCerrarSesion` props, no internal `useSesion()`
   - D8 (Design tokens): All grid gaps, colors, rounded-card spacing match DESIGN-SYSTEM.md, no hex literals

3. **Out of Scope Boundary Held**:
   - `AppShell.tsx`, `NavegacionPrincipal.tsx`, `menu-por-rol.ts` untouched (confirmed by verify-report diff)
   - `VotosService.emitir()` untouched (only `construirComprobante()` changed, diff purely additive 89+/0-)
   - No "San Alfonso" reference leaks to any component (`rg -ril "san alfonso" apps/` returns only negative assertion in test)

4. **Test Coverage & Regression**:
   - Backend: 19 tests of `VotosService.emitir()` unchanged and pass; 75/75 total backend tests pass
   - Frontend: All 691 tests pass; 95/95 files tested
   - No regression in app-wide test suite

5. **Contract Regeneration**: `pnpm openapi:extract` executed in PR1 (per tasks.md "Bloqueo previo a PR5"); `periodo_lectivo` now documented as optional in `packages/contracts/src/generated/api.ts`.

### Chain Strategy Executed As Designed

Five PRs implemented per tasks.md Review Workload Forecast (Medium-High risk, ~1210 lines):
- PR1: Service layer (backend only), isolated testing
- PR2: Frontend Paso 1 refactor (high visual impact, low risk to existing)
- PR3: Accessibility contract (`BotonSeleccion`), riskiest component-level change
- PR4: Adoption of PR3 pattern across 3 card variants (depends on PR3 validation)
- PR5: Full wiring (depends on PR1 for field availability, PR4 for pattern)

Each has clear rollback boundary (`git revert` per tasks.md); staged delivery reduces reviewer cognitive load.

## Spec Merge Details

### Delta Spec: vote-casting

**ADDED Requirements** (3):
- Campo `periodo_lectivo` en el comprobante (2 scenarios: with `AnioEscolar` active, without active)
- Banner de instrucciones en el Paso 2 (1 scenario: appears on Paso 2 entry)
- Modelo de interacción foto+cinta+doble botón con semántica ARIA preservada (4 scenarios: button triggers selection, "Ver Propuesta Completa" doesn't interfere, `TarjetaVotoBlanco` icon+button)

**MODIFIED Requirements** (3):
- Paso 1 with rules: Now includes badge, hero with overlay, rules with icons, footer; previously logo-only layout without badge
- Variantes de tarjeta: Now specifies ribbon pattern (cinta "Lista N°", etc.) and double-button structure; previously tarjeta-as-label layout
- Boleta mobile-first: Now visual pattern specified (circular icon + dedicated button for voto en blanco); previously punteado border style

All new/modified requirements appended to main spec; no requirements removed from vote-casting.

**Insertion point**: New requirements added after "Variantes de tarjeta..." and before "Ningún cambio de comportamiento..." to maintain logical grouping (data changes before behavior preservation).

### Delta Spec: comprobante-autenticado

**ADDED Requirements** (1):
- Botón "Cerrar Sesión" en el comprobante (2 scenarios: post-voto path, relectura autenticada path)

**MODIFIED Requirements** (1):
- Jerarquía visual de éxito: Now includes conditional `periodo_lectivo` field (render if present) and static "Sincronizado" indicator (always shown, decorative); previously prohibited both fields

**REMOVED Requirements** (1):
- Sin campos nuevos en `ComprobanteDto` (Reason: `periodo_lectivo` now added as optional real field; Migration: replaced by conditional rendering logic and vote-casting delta spec requirement)

**Spec correctness**: The removed requirement was a past constraint that is no longer valid due to the real `periodo_lectivo` field backing. The removal is documented with explicit Reason and Migration to explain the change.

## Change Folder Archival

Source: `openspec/changes/fidelidad-visual-boleta-votacion/`
Destination: `openspec/changes/archive/2026-08-25-fidelidad-visual-boleta-votacion/`

Archived contents:
```
2026-08-25-fidelidad-visual-boleta-votacion/
├── exploration.md
├── proposal.md
├── design.md
├── tasks.md (all 29 phases marked [x])
├── verify-report.md
├── specs/
│   ├── vote-casting/
│   │   └── spec.md (delta — archived)
│   └── comprobante-autenticado/
│       └── spec.md (delta — archived)
└── archive-report.md (this file)
```

Original `openspec/changes/fidelidad-visual-boleta-votacion/` directory removed after successful archival and verification of copy completeness.

## Authority & Ranking

**Final-State Authority Hierarchy (per SKILL.md)** — used to resolve any lingering contradictions between verify-report snapshots and post-verify work:

1. **Native Review Receipt** — N/A (no gentle-ai review gate used for this change; receipt-driven development is disabled per project configuration)
2. **Tasks Artifact** — All 29 phases complete, persisted in openspec/changes/fidelidad-visual-boleta-votacion/tasks.md, verified by this archive executor
3. **Explicit Final-State Facts** (from orchestrator launch prompt) — Verification verdict PASS WITH WARNINGS, all 5 PRs committed on branch, no stale unchecked tasks
4. **Verify-Report** — Intermediate snapshot (obs ID 223), accurate at time of verify (2026-08-25 10:36:58), cited for test counts, warnings, and design decision traceability

**Conflicts Resolved**:
- No contradictions between authority sources; final state is unanimous across all artifacts.

## Ready for Deployment

- [x] Proposal phase PASS
- [x] Spec phase PASS
- [x] Design phase PASS
- [x] Tasks phase PASS
- [x] Implementation (apply) PASS (5 PRs committed; PR1 & PR2 live, PR3–PR5 verified)
- [x] Verification (verify) PASS WITH WARNINGS (0 CRITICAL blockers)
- [x] Archive phase PASS (specs merged, change folder archived, no stale checkboxes)

**Next Action**: Commit archive-report.md and verified spec merges. Recommendation: Deploy per project CI/CD policy (chained commits on main or feature branch merge).

## Metadata

- **Project**: ProyectoFinal_Test01
- **Change ID**: fidelidad-visual-boleta-votacion
- **Backlog Item**: #31 (continuation of rediseno-boleta-votacion #31)
- **Created**: 2026-08-24 (proposal phase start, obs #219)
- **Verified**: 2026-08-25 (verify-report, obs #223)
- **Archived**: 2026-08-25 (this archive-report timestamp)
- **Total Cycle Duration**: ~1 day (proposal → archive; implements 5-PR visual fidelity delta across 3 steps)
- **SDD Mode**: openspec + Engram (hybrid)
- **Artifact Store**: OpenSpec filesystem + Engram persistent memory
- **Implementation Status**: All code committed to branch; ready for next cycle or deployment
