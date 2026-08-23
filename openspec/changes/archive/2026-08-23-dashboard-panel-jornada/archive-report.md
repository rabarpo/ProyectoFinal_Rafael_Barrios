# Archive Report: dashboard-panel-jornada (Backlog #20)

**Date**: 2026-08-23  
**Mode**: openspec  
**Final Status**: PASS WITH WARNINGS (0 CRITICAL, 3 WARNING)  

## Executive Summary

The `dashboard-panel-jornada` change (Backlog #20 — Dashboard y panel de jornada) has been successfully archived after verification and spec sync. All 71 implementation tasks are complete, with final verification status of PASS WITH WARNINGS. Three warnings relate to documentation hygiene, not functional gaps:

1. **spec.md text stale**: The requirement "Votos por hora" in `specs/panel-jornada/spec.md` states the implementation is based on `Voto.creado_en`, but `design.md` D4 and the actual implementation correctly use `Voto.hora_servidor`. The implementation is correct; the spec text was never updated after the design correction.

2. **Task count discrepancy**: `tasks.md` 6.1 reports "4 suites / 34 tests", but live execution shows 3 suites / 28 tests. All pass; this is a reporting error in the task log.

3. **Flake surface underestimated**: The task prompt claims "1 flake (importacion.service.spec.ts)", but live testing confirms 2-4 pre-existing flaky suites (recovery, bloqueo, session, importacion) depending on load and Redis state. This is consistent with tasks.md's own notes (6.2/10.3/15.3) and not a regression from this change.

## Artifact Archive

All SDD artifacts have been copied to `openspec/changes/archive/2026-08-23-dashboard-panel-jornada/`:

- ✅ `proposal.md` — scope, decisions, dependencies, rollback plan
- ✅ `design.md` — 11 architectural decisions (D1-D11), 5 endpoints, cache strategy, threat matrix
- ✅ `specs/panel-jornada/spec.md` — 8 requirements with scenarios (authorization, polling, aggregation, projection)
- ✅ `specs/menu-navegacion-post-login/spec.md` — delta merged: added "Panel de jornada" to menu and projection route
- ✅ `tasks.md` — 71 implementation tasks (all marked `[x]`) across 4 chained PRs
- ✅ `verify-report.md` — full compliance matrix, design verification, live test evidence
- ✅ `exploration.md` — precursor analysis, recommended approaches, scope clarifications

## Spec Sync Results

### New Spec Created

**`openspec/specs/panel-jornada/spec.md`** — Complete specification for the electoral dashboard panel:

| Requirement | Status |
|---|---|
| Autorización restringida a tres roles | ✅ PASS |
| Procesos activos reutiliza GET /procesos?estado=abierto | ✅ PASS |
| Conteo de estudiantes y vínculos apoderado-estudiante | ✅ PASS |
| Porcentaje de participación scoped por proceso | ✅ PASS |
| Votos por hora (Voto.hora_servidor) | ✅ PASS (spec text corrected) |
| Avance por aula con umbral de rezagada | ✅ PASS |
| Correos fallidos scoped por proceso | ✅ PASS |
| Modo proyección sin desglose por candidato | ✅ PASS |
| Sondeo periódico con intervalo configurable | ✅ PASS |

### Existing Spec Updated

**`openspec/specs/menu-navegacion-post-login/spec.md`** — Delta applied:

**MODIFIED**: Requirement "Aterrizaje post-login por rol"
- Updated scenarios to include "Panel de jornada" as real menu item for `administrador`, `director`, `comite`
- Confirmed absence from `docente` and `estudiante` menus

**ADDED**: Requirement "Navegación a Panel de jornada reutiliza la ruta nueva"
- New route `panel-jornada` available to three roles
- Scenarios cover menu click navigation

**ADDED**: Requirement "Ruta de modo proyección sin item de menú"
- Projection route accessible only via direct URL
- Protected by same 3-role authorization
- Scenarios cover authorized/unauthorized access and absence from menu

## Verification Summary (per verify-report.md)

| Evidence Type | Result | Notes |
|---|---|---|
| Task Completion Gate | ✅ PASS | 71/71 tasks marked `[x]` |
| Spec Compliance (panel-jornada) | ✅ PASS | 8/8 requirements with source + live e2e evidence |
| Spec Compliance (menu-navegacion-post-login) | ✅ PASS | 3/3 requirements (1 modified, 2 added) |
| Design Decision Verification (D1-D11) | ✅ PASS | All decisions verified at code level + runtime |
| Threat Matrix | ✅ PASS | Routing, role authorization, projection desglose — all covered |
| Live Test Execution | ⚠️ PASS WITH WARNINGS | Unit: 3 suites / 28 tests (panel-jornada) all pass; backend regression baseline 48/50 suites due to pre-existing Redis-race flakiness (documented 6.2/10.3/15.3); frontend: 85/85 suites / 597 tests pass; e2e: 9/9 panel-jornada tests pass against ephemeral Postgres+Redis |

## Archive State Verification

✅ **All artifacts copied to archive folder**
```
openspec/changes/archive/2026-08-23-dashboard-panel-jornada/
├── proposal.md
├── design.md
├── tasks.md
├── verify-report.md
├── exploration.md
└── specs/
    ├── panel-jornada/spec.md
    └── menu-navegacion-post-login/spec.md
```

✅ **Main specs updated**
- `openspec/specs/panel-jornada/spec.md` — NEW
- `openspec/specs/menu-navegacion-post-login/spec.md` — UPDATED with delta

✅ **No unchecked implementation tasks in archive**
- All 71 tasks have `[x]` checkboxes
- No stale implementation tasks require reconciliation

✅ **No CRITICAL issues blocking archive**
- Three WARNINGs are documentation hygiene gaps (spec text, task reporting discrepancy, flake surface understatement)
- All functional requirements verified by source inspection + live test evidence

## Final Authority Ranking Applied

Per the Final-State Authority section of the skill:

1. **Native review authority**: Not applicable (openspec mode, no review gate)
2. **Persisted tasks artifact**: `tasks.md` shows all 71 implementation tasks complete; no stale unchecked items
3. **Explicit final-state facts from launch prompt**:
   - "Verification completed with verdict PASS WITH WARNINGS" — confirmed by `verify-report.md`
   - "71 tasks are complete" — confirmed by `tasks.md` (all `[x]`)
   - "Just corrected one of three warnings: requirement 'Votos por hora' text in spec.md (`Voto.creado_en` → `Voto.hora_servidor`)" — verified in corrected spec
4. **Intermediate snapshots** (`verify-report.md` at verification time): Treated as history; final state supersedes any intermediate "pending" claims

The archive report records the state AT CLOSE: all implementation complete, all specs synced, three documentation-hygiene warnings recorded but non-blocking.

## Files and Paths

**Archived change folder**: `C:\Rafael\REPOSITORIO\ProyectoFinal_Test01\openspec\changes\archive\2026-08-23-dashboard-panel-jornada\`

**New/updated main specs**:
- `openspec/specs/panel-jornada/spec.md` (new)
- `openspec/specs/menu-navegacion-post-login/spec.md` (updated)

**Active changes folder** (after archive closes): `openspec/changes/dashboard-panel-jornada/` deleted

## SDD Cycle Complete

This change has passed all gates:
- ✅ **Task Completion Gate**: 71/71 tasks marked done
- ✅ **Verification Gate**: PASS WITH WARNINGS (no CRITICAL blocks)
- ✅ **Spec Sync Gate**: Delta specs merged to main specs (`panel-jornada` created, `menu-navegacion-post-login` updated)
- ✅ **Archive Gate**: All artifacts copied to dated archive folder, main specs updated, archive report generated

The change is ready for the next phase. No follow-up work is required unless documentation corrections are prioritized as a separate task.

---

**Archive completed by**: sdd-archive executor  
**Mode**: openspec (filesystem-based, no Engram persistence)  
**Documentation**: This archive report serves as the audit trail for future reference.
