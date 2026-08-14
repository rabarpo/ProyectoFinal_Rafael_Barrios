# Archive Report: apertura-proceso-congelamiento-padron (Backlog #13)

**Archive Date**: 2026-08-14
**Change ID**: apertura-proceso-congelamiento-padron
**Backlog Item**: #13 — Apertura del proceso y congelamiento del padrón
**Artifact Store**: OpenSpec
**Archive Status**: COMPLETE

## Executive Summary

The SDD change `apertura-proceso-congelamiento-padron` (#13) has been fully planned, implemented, verified, and archived. The change introduces process opening functionality (`POST /procesos/:id/abrir`) with concurrent-safe ballot creation and result-hiding freezing. Verification verdict: PASS (0 CRITICAL, 0 open WARNING). All 69/69 implementation tasks completed. All 16/16 spec scenarios compliant. Ready for delivery as 5 chained PRs (PR1 through PR5).

## Artifacts Synced to Main Specs

**Main Spec**: `openspec/specs/electoral-process-management/spec.md`

Delta spec merged successfully. Changes:
- **ADDED**: 7 new requirements covering process opening, concurrency safety, ballot materialization, timestamp sealing, result freezing, uniqueness guarantees, and audit logging.
- **MODIFIED**: 1 existing requirement (edit blocking after state change) extended with new scenario verifying that processes opened by `#13` transition remain immutable.

Merged requirements:
1. Apertura de proceso con confirmación explícita
2. Transición `borrador → abierto` concurrency-safe e idempotente
3. Materialización de `DerechoVoto` con elegibilidad recalculada
4. Sellado de `apertura_real` con reloj de Postgres
5. `ocultar_resultados` inmutable una vez `abierto`
6. Unicidad de `DerechoVoto` por proceso, usuario y calidad
7. Auditoría de apertura en la misma transacción
8. Edición de un proceso (MODIFIED: blocking now verified runtime behavior post-opening)

## Archive Location

**Archived to**: `openspec/changes/archive/2026-08-14-apertura-proceso-congelamiento-padron/`

All artifacts preserved:
- `exploration.md` ✓
- `proposal.md` ✓
- `design.md` ✓ (14 architecture decisions, D1–D14)
- `tasks.md` ✓ (69/69 tasks complete; 5-PR chained delivery plan)
- `specs/electoral-process-management/spec.md` ✓ (delta)
- `verify-report.md` ✓ (verdict: PASS)

Original change folder remains at `openspec/changes/apertura-proceso-congelamiento-padron/` pending git operations (diff + delete per project convention).

## Verification Summary

**Verdict**: PASS  
**Evidence Base**: 65 backend unit + 166 frontend + 14 e2e + 12 schema + typecheck (7/7)

| Category | Result |
|----------|--------|
| Blockers | 0 |
| CRITICAL findings | 0 |
| open WARNINGs | 0 |
| Requirements compliant | 8/8 |
| Scenarios compliant | 16/16 |
| Tasks complete | 69/69 |

**Key Verification Evidence** (per verify-report.md):
- Backend unit (procesos.service.spec.ts, procesos.controller.spec.ts, padron.service.spec.ts): **65/65 passed**
- Frontend (AperturaProcesoPage.spec.tsx, PanelConfirmacionApertura.spec.tsx, rutas.spec.ts): **166/166 passed** (32/32 files)
- Backend e2e (procesos-abrir.e2e-spec.ts): **14/14 passed** against real Postgres/Redis
- Schema (voting.spec.ts additions, unique constraint + UUID type): **12/12 passed** (unique index verified, duplicate rejection verified at 23505)
- Typecheck: **7/7 successful** (all packages green)

All 16 scenarios verified:
- Apertura sin confirmación ✓ (400 CAMPO_INVALIDO)
- Apertura con confirmación ✓ (200, estado='abierto')
- Reintento idempotente ✓ (200 no-op, no duplicate rows)
- Apertura rechazada en estado no-abrible ✓ (409 PROCESO_NO_ABRIBLE)
- Materialización usa elegibilidad recalculada ✓ (recalc at open time, not preview)
- Doble derecho en comunidad ✓ (dos filas por cuenta: estudiante + padre)
- apertura_real sellado con clock_timestamp() ✓ (servidor, no Node Date.now())
- ocultar_resultados inmutable ✓ (editar()/eliminar() siguen rechazando post-open)
- Unicidad (proceso_id, usuario_id, en_calidad_de) ✓ (UNIQUE constraint + test of 23505 violation)
- Auditoría PROCESO_ABIERTO ✓ (una sola vez, con conteos)
- Edición rechazada tras apertura ✓ (regresión e2e confirma PROCESO_NO_EDITABLE)
- 5 más (spec scenarios covered by e2e [12.2]–[14.1] y regression tests)

## Implementation Scope

**Files Affected** (per design.md):
- `apps/backend/prisma/schema.prisma` — D1/D2: `@@unique([proceso_id, usuario_id, en_calidad_de])`, `aula_snapshot String @db.Uuid`
- `apps/backend/prisma/migrations/20260813020000_derecho_voto_unicidad_apertura/migration.sql` — ALTER COLUMN, CREATE UNIQUE INDEX
- `apps/backend/src/procesos/procesos.service.ts` — D3–D8: `abrir()` method, materialization helper
- `apps/backend/src/procesos/procesos.controller.ts` — D9: `POST /procesos/:id/abrir` endpoint
- `apps/backend/src/procesos/dto/abrir-proceso.dto.ts` — D9: `{ confirmar: boolean }`
- `apps/backend/src/procesos/dto/apertura-respuesta.dto.ts` — D10: response DTO
- `apps/backend/src/procesos/procesos.errors.ts` — D5: `PROCESO_NO_ABRIBLE`
- `apps/backend/src/auditoria/audit-event-types.ts` — D11: `PROCESO_ABIERTO`
- `packages/contracts/openapi.json` — regenerated (POST /procesos/{id}/abrir)
- `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` — D13: route variant + wiring
- `apps/frontend/src/procesos/procesos-api.ts` — D13: `abrir()` wrapper
- `apps/frontend/src/procesos/AperturaProcesoPage.tsx` — D13/D14: container + effects
- `apps/frontend/src/procesos/piezas/PanelConfirmacionApertura.tsx` — D13: presentational panel
- `apps/frontend/src/procesos/ProcesosIndexPage.tsx` — D13: "Abrir proceso" button
- `apps/backend/test/procesos/procesos-abrir.e2e-spec.ts` — e2e suite (14 tests)
- `apps/backend/test/schema/voting.spec.ts` — schema tests (3 additions, 12 total)

**Total Lines (approx)**: ~1390–1790 across 5 PR slices (per tasks.md forecast)

## Delivery Strategy

**Chained PRs** (5-PR feature-branch-chain strategy):
- **PR1** (Low risk): Schema + migration + error keys + audit key + schema tests
- **PR2** (High): Guard (UPDATE...RETURNING) + DTOs + endpoint
- **PR3** (High): Materialization + auditing
- **PR4** (Medium): Full e2e suite (idempotence, 409, real concurrency, regression)
- **PR5** (High): Frontend route, page, panel, button wiring

**Review budget**: 400-line decision-needed budget per slice. All slices forecast as borderline-to-high due to test density (not production code volume).

**Delivery note**: All code is currently uncommitted in working tree (PR1–PR5 artifacts mixed in git staging). Chained PRs not yet materialized as separate commits/branches — that is follow-up delivery work, separate from this archive step.

## Known Issues & Follow-ups

**Resolved in this session**:
- E2E and schema tests re-executed against real Docker Postgres/Redis (same session) after Docker Desktop startup: 14/14 + 12/12 passed. Verified clock_timestamp() sealing, real concurrency race resolution, unique-constraint violation.

**Pre-existing (not caused by this change)**:
- Backend full suite has 4 failing suites (session.service, bloqueo.service, recovery.service, importacion.service) — all Redis timeout errors, unrelated to procesos/DerechoVoto. Flagged for awareness.
- procesos-crear.e2e-spec.ts had 2 pre-existing failures (#11/PR6) — not this change.

**Open questions (tasks.md, not blockers)**:
- `DerechoVoto.estado` (pendiente/ejercido) — does #14 add the column or derive from Voto existence? (#13 does not add it)
- `en_calidad_de` enum promotion — when #14 exists and needs a second consumer, should it become `CalidadVotante` enum?
- Confirmation screen padrón preview — does #13 add `GET /procesos/:id/padron-previo` or settle for post-open counts? (settled: post-open counts only, per D14)
- Load test of materialization transaction — out of scope, explicit post-merge follow-up

## Reconciliation with Dependencies

**Blocks `#14` (vote-casting)** — assumes:
- `DerechoVoto.aula_snapshot` as UUID snapshot of frozen aula ✓ (D2 implemented)
- Two rows per account in `comunidad` (estudiante + padre) ✓ (D1/D6 implemented)
- UNIQUE(proceso_id, derecho_voto_id) on Voto ✓ (already in schema, untouched)
- `DerechoVoto.estado` NOT added (column does not exist) — #14 must add or derive

**Blocked by `#12`, `#11`** (archived):
- Confirms Candidato.aula is text, no FK (input to business rule 2)
- ProcesoElectoral/ProcesoAula schema stable

## Final State Authority

Per skill `sdd-archive` Final-State Authority section:

This archive report describes the state of the change **at close** (2026-08-14), not snapshots taken earlier. Intermediate `verify-report.md` (PASS verdict) and `apply-progress` (69/69 tasks marked complete) were created at earlier points; this report integrates all sources:

1. **Verify-report verdict** (highest authority for verification): PASS, 0 CRITICAL, 0 open WARNING
2. **Tasks artifact** (tasks.md): 69/69 complete, verified against real code/tests
3. **Launch prompt facts** (this archiving session): all change work complete, delivery split into 5 PRs not yet materialized, archive folder created and populated
4. **Earlier snapshots** (for historical record): `verify-report.md` dated at verify time; full e2e/schema re-run in same session after Docker startup confirmed verdicts

**Contradiction notes**: None. All sources agree: change is complete, verified, ready for delivery as chained PRs.

## Sign-off

**Change**: apertura-proceso-congelamiento-padron (#13)  
**Status**: Archived and closed  
**Ready for**: PR delivery (5-PR chain) and integration into main branch  
**Not ready for**: Further spec/design/task changes (cycle complete)

---

**Archive completion**: 2026-08-14  
**Archive performed by**: sdd-archive executor  
**Verification status**: PASS (per verify-report.md)  
**Spec merge**: Complete (delta into openspec/specs/electoral-process-management/spec.md)  
**Artifact preservation**: Complete (all 6 change artifacts archived with date prefix)
