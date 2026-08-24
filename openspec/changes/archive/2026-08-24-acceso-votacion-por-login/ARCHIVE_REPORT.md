# Archive Report: acceso-votacion-por-login

**Date**: 2026-08-24
**Change**: acceso-votacion-por-login (backlog #30 — "Acceso a votación por login")
**Status**: ARCHIVED
**Artifact Store Mode**: openspec
**Archive Path**: `openspec/changes/archive/2026-08-24-acceso-votacion-por-login/`

## Executive Summary

Change `acceso-votacion-por-login` (backlog #30) has been verified and archived. Implemented GET /votos/mis-derechos backend endpoint + MisVotacionesPage frontend landing screen. 21/21 tasks complete, 6/6 requirements and 11/11 scenarios compliant, verification verdict PASS WITH WARNINGS (0 CRITICAL). Delta spec merged to main specs. Change folder copied to archive and original folder deleted from active changes directory.

## What Was Delivered

### Backend Implementation (Commits: 641e8ec)
- New endpoint `GET /votos/mis-derechos`: read-only, scoped to `req.usuario`, lists `DerechoVoto` vigentes in processes with `estado='abierto' AND now() < fecha_cierre_prevista`
- New service `MisDerechosService::listar(sesion)`: Prisma-based query filtering and ordering by `fecha_cierre_prevista asc`
- DTO `MiDerechoVotoDto` / `ProcesoDerechoDto`: no election-revealing fields (`ya_voto` boolean only)
- Entries grouped/tagged by `en_calidad_de` (estudiante/padre coexist separately per ADR-0011)
- AuthGuard protection: 401 without session; no role branching (docente gets empty array naturally, no `DerechoVoto` rows exist)
- Supporting unit tests (mis-derechos.service.spec.ts, controller cases, contract assertions)

### Frontend Implementation (Commit: 2af751c)
- New route variant `/mis-votaciones` in rutas.ts / Enrutador.tsx / menu-por-rol.ts
- New component `MisVotacionesPage.tsx`: single-fetch container (no polling), renders entry list with navigation
- Modified: `votos-api.ts` → new `misDerechos()` method typed against regenerated contracts
- Entry behavior: `ya_voto:false` → clickable, navigates to `/votar/:derechoVotoId` (unchanged); `ya_voto:true` → blocked "Ya votaste" (no click handler)
- Empty state: generic message "no tenés votaciones activas en este momento"
- Landing via `MENU_POR_ROL.estudiante = [MIS_VOTACIONES]`; `InicioPage.tsx` itself untouched (D7), cards derive from menu entries

### Specification (New Capability: descubrimiento-derechos-voto)
- 6 requirements, 11 scenarios defined in `openspec/specs/descubrimiento-derechos-voto/spec.md`
- First change touching this spec area; spec merged as full spec (not delta) to main specs

### Supporting SDD Artifacts
- Commits b86abf1 / f4210e2: SDD phase documentation updates (tasks.md smoke evidence)

## Verification Summary

**Verification Verdict**: PASS WITH WARNINGS (0 CRITICAL)
**Observation ID**: #209 (sdd/acceso-votacion-por-login/verify-report)
**Verification Date**: 2026-08-24 18:08:13

### Metrics
- Tasks: 21/21 complete (all [x] checked)
- Requirements: 6/6 compliant
- Scenarios: 11/11 passing
- Design decisions: all 8 (D1-D8) honored
- Contract drift: zero (pnpm generate:contracts produced zero diff)
- Scoped test suites: frontend 606/606 tests passing, backend votos suites 50/50 passing

### Test Results
- `pnpm --filter frontend test`: 86 files, 606 tests, exit 0
- `pnpm --filter backend test votos`: 7 suites, 50 tests, exit 0
- Full monorepo `pnpm turbo run test`: exit 1 (pre-existing environmental: 4 unrelated auth/* suites failing on Redis timeouts, zero git diff under apps/backend/src/auth for this change)

### Warnings (Non-Blocking)
1. **401 scenario coverage**: GET /votos/mis-derechos has no dedicated per-route unit test for 401; coverage is structural via class-level `@UseGuards(AuthGuard)` + generic auth.guard.spec.ts proof. Judged sufficient by NestJS convention (every route in the controller relies on identical mechanism). Non-blocking recommendation: add one e2e case for full parity.
2. **Browser-level evidence**: Tasks 6.2/6.3 smoke tests are API-level (real docker-compose stack) not real-browser click-through. Judged reasonable: RTL tests in MisVotacionesPage.spec.tsx / InicioPage.spec.tsx exercise the exact response shapes with real click dispatch; only narrowly real-chrome rendering unverified.
3. **Full monorepo test exit code**: The raw exit 1 from full turbo test is misleading; it is pre-existing Redis sandbox infrastructure (no listener on 6379), confirmed environmental and unrelated to this change. Recommend scoped CI gates or Redis test-container.

## Artifacts Archive

All artifacts copied to `openspec/changes/archive/2026-08-24-acceso-votacion-por-login/`:
- ✓ proposal.md (Engram #204)
- ✓ exploration.md (initial analysis)
- ✓ design.md (8 architecture decisions, D1-D8)
- ✓ tasks.md (6 phases, 21 tasks, all [x] complete)
- ✓ verify-report.md (full verification evidence)
- ✓ specs/descubrimiento-derechos-voto/spec.md (6 requirements, 11 scenarios)

## Spec Merge

**Main Spec Created**: `openspec/specs/descubrimiento-derechos-voto/spec.md`
- Source: `openspec/changes/acceso-votacion-por-login/specs/descubrimiento-derechos-voto/spec.md` (delta spec = full spec, since new capability)
- Action: Copied directly to main specs (no existing spec to merge)
- Status: Source of truth updated

## Traceability & Observation IDs

| Artifact | Engram ID | Topic Key |
|----------|-----------|-----------|
| Proposal | #204 | sdd/acceso-votacion-por-login/proposal |
| Specification | #205 | sdd/acceso-votacion-por-login/spec |
| Design | #206 | sdd/acceso-votacion-por-login/design |
| Tasks | #207 | sdd/acceso-votacion-por-login/tasks |
| Verify Report | #209 | sdd/acceso-votacion-por-login/verify-report |
| Archive Report | TBD | sdd/acceso-votacion-por-login/archive-report |

## Task Completion Gate

✓ **PASS**: All 21 tasks marked [x] in openspec/changes/archive/2026-08-24-acceso-votacion-por-login/tasks.md. No stale unchecked implementation tasks.

## Design Decisions Honored

| Decision | Status | Evidence |
|----------|--------|----------|
| D1 — Window uses fecha_cierre_prevista, not cierre_real | Honored | mis-derechos.service.ts query; spec.md text carries amended wording |
| D2 — Prisma findMany, no raw SQL | Honored | Verified structurally in service implementation |
| D3 — Separate MisDerechosService, decoupled from emitir() | Honored | votos.service.ts unchanged, papeleta.service.ts unchanged |
| D4 — Flat array tagged by en_calidad_de | Honored | DTO maps 1:1, no nested envelope or collapse |
| D5 — User from req.usuario only, no Query/Param/Roles | Honored | Handler arity Req only; test [1.3][adversarial] proves ?usuario_id has no effect |
| D6/ADR-0010 — ya_voto derived, no election fields | Honored | DTO closed shape; [1.4][contrato] test enforces Object.keys |
| D7 — Landing via MENU_POR_ROL, InicioPage.tsx untouched | Honored | git diff InicioPage.tsx is empty across change; card comes from menu |
| D8 — Contracts regenerated before client | Honored | votos-api.ts types MiDerechoVotoDto from generated schema |

## Known Follow-Ups (Non-Blocking)

1. **Dedicated e2e test for 401 on GET /votos/mis-derechos**: The 401 scenario for "Sin sesión" is structurally covered but lacks a dedicated per-route e2e test. Consider adding one for full black-box parity with POST /votos coverage.

2. **Local Redis for full monorepo test**: The full `pnpm turbo run test` exits 1 due to pre-existing redis-connection failures in 4 unrelated auth/* suites. No impact on this change (zero git diff in apps/backend/src/auth), but recommend scoped test gates or a Redis test-container for cleaner full-suite CI.

## Rollback

No schema changes, no data migrations. Rollback = revert commits 641e8ec (backend) + 2af751c (frontend) + SDD documentation commits. No breaking changes; POST /votos and vote-casting remain untouched.

## Final State Authority

This archive report is the terminal record of the change at close (2026-08-24). Per SDD Final-State Authority rules:
- **Intermediate snapshots** (verify-report #209) reflect state at verification time; work did not regress afterward (21 tasks remain complete, no new issues).
- **Explicit final-state facts in launch prompt**: None provided; archive reflects facts from verify-report and repository evidence.
- **Higher-ranked sources** (review gate, native verification): No review receipt (gentle-ai review disabled/unmanaged per this project's convention). Verify-report is definitive for technical correctness.

The change has been fully planned, implemented, verified (PASS WITH WARNINGS), and archived. Ready for user review and commit.

---

**Archive Created**: 2026-08-24 (this session)
**Archive Status**: Complete
**Next Recommended Action**: User review, commit (if satisfied), then proceed to next backlog item
