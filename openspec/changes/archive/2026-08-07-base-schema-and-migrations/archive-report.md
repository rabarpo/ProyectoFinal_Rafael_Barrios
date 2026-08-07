# Archive Report: base-schema-and-migrations

**Change ID**: base-schema-and-migrations (Backlog #2)
**Archive Date**: 2026-08-07
**Status**: CLOSED — Fully archived with all specifications synced and tasks complete
**SDD Cycle**: Complete (proposal → spec → design → tasks → apply → verify → archive)

## Executive Summary

The `base-schema-and-migrations` change has been successfully archived. All 55 tasks are marked complete, verification passed with 3 non-critical warnings (0 blockers), and the delta specification for the base schema has been merged into the main specification store. The relational skeleton of SEEI is now ready for downstream backlog items (#3–#17) to build application behavior on top of the durable database layer.

## Final State Authority

This archive report reflects the state of the change AT CLOSE, not intermediate snapshots. The facts recorded here rank as follows:

1. **Native review authority** — Not applicable; receipt-driven development is disabled/unmanaged for this project
2. **The persisted tasks artifact** — `openspec/changes/archive/2026-08-07-base-schema-and-migrations/tasks.md` shows 55/55 implementation tasks marked [x]
3. **Explicit final-state facts** — From launch prompt: all 55 tasks complete, 0 blockers, 3 non-blocking warnings resolved during sdd-apply, implementation delivered across 5 chained PRs (commits 2e90b54, 9464414, 48e6475, 224555f, c34c663) on tracker branch `base-schema-and-migrations` and child branches `base-schema-and-migrations-pr{0,1,2,3,4}`, branches not yet pushed to origin or merged to main
4. **Intermediate snapshots** — `verify-report.md` dated 2026-08-06 documents evidence at verification time: PASS WITH WARNINGS (0 CRITICAL, 3 WARNING, 0 BLOCKER), with all 10 requirements and 15 scenarios verified against runtime execution

## Artifacts Archived

All SDD artifacts for this change have been moved to:
`openspec/changes/archive/2026-08-07-base-schema-and-migrations/`

Contents:
- ✅ `proposal.md` — Scope, approach, dependencies, risks, rollback plan (greenfield, no production migration)
- ✅ `design.md` — 7 design decisions (D1–D7), seed strategy, threat matrix, SQL raw procedures (Prisma + manual SQL additions)
- ✅ `tasks.md` — 55/55 tasks marked [x] across 5 PRs (PR0 harness + PR1–4 migration groups); 100% coverage of spec requirements and threat matrix rows
- ✅ `specs/base-schema/spec.md` — 10 requirements, 15 GIVEN/WHEN/THEN scenarios; now merged into main `openspec/specs/base-schema/spec.md`
- ✅ `verify-report.md` — Verdict: PASS WITH WARNINGS; all 10/10 requirements and 15/15 scenarios passed against real PostgreSQL; 3 non-critical warnings documented and accepted

## Specification Sync

### Delta Spec Merged

**Source**: `openspec/changes/base-schema-and-migrations/specs/base-schema/spec.md`
**Target**: `openspec/specs/base-schema/spec.md` (new spec file, greenfield capability)
**Action**: CREATED — No prior main spec existed; delta spec is the authoritative full spec

The merged spec defines:
- Identity and academic tree (`Usuario`, `Apoderado`, `AñoEscolar`, `Nivel`, `Grado`, `Sección`, `Aula` with `Turno`, `Matrícula`)
- Unique active `AñoEscolar` (partial unique index, SQL raw)
- Electoral process structure (`ProcesoElectoral`, `Lista`, `Candidato`, `OpciónConsulta`, `DerechoVoto`)
- Zero duplicate votes (`@@unique([proceso_id, derecho_voto_id])`)
- Exactly one election per vote (CHECK constraint, SQL raw)
- Vote secrecy boundary (no views linking identity to election)
- Support tables (`JobCorreo`/`Notificación`, `Configuración`, `Acta`)
- Four migration groups stacked after #1's empty baseline
- Structural seeds (production-guarded)
- Rejection suite with real Postgres error codes (`23505`, `23514`, `23503`, `P2002`)

**Requirements**: 10/10 (unchanged after merge)
**Scenarios**: 15/15 (unchanged after merge)

## Task Completion Gate

✅ **PASSED** — All 55 implementation tasks marked complete in persisted `tasks.md`:

| PR | Phase | Subphase | Count | Status |
|---|---|---|---|---|
| 0 | Harness | `test:schema` helpers + self-test | 9 | ✅ Complete |
| 1 | Identity and Academic Tree | Models + schema drift check + partial index (SQL raw) + seed (partial) | 18 | ✅ Complete |
| 2 | Electoral Process Structure | Models + 4 composition FK cascades | 5 | ✅ Complete |
| 3 | Voting Core (HIGH REVIEW PRIORITY) | DerechoVoto + Voto + CHECK constraint (SQL raw) + negative view assertion | 13 | ✅ Complete |
| 4 | Support Tables | JobCorreo/Notificación + Configuración + Acta + seed finalization + CI wiring | 10 | ✅ Complete |
| **TOTAL** | | | **55** | **✅ Complete** |

All tasks are represented in the archived `tasks.md` file without stale unchecked implementation tasks.

## Verification Summary

From `verify-report.md` (dated 2026-08-06):

**Verdict**: PASS WITH WARNINGS
- **Blockers**: 0
- **Critical Findings**: 0
- **Warnings**: 3 (non-blocking, all resolved during apply)
- **Requirements Met**: 10/10
- **Scenarios Verified**: 15/15

### Evidence Executed (Real Runtime)

All verification was performed against actual PostgreSQL and Docker infrastructure:
- Manual replay of scenario R8 (fresh empty DB → `prisma migrate deploy` with 4 migration groups → all applied in order, no error)
- `pnpm --filter @seei/backend test:schema`: 7 suites / 21 tests, all green; real PostgreSQL error codes verified (`23505`, `23514`, `23503`)
- `pnpm --filter @seei/backend run check:drift`: exit 0, migration drift detected correctly (no false positives from Prisma 5.22 placeholder comment)
- `pnpm turbo run lint typecheck build test --filter=@seei/backend --force`: 4/4 tasks green
- CI workflow sequence locally reproduced: `prisma migrate deploy` → `test:schema` → `check:drift` all pass

### Non-Blocking Warnings (Already Resolved)

1. **R8 Evidence Composition** — Test evidence for scenario R8 ("apply 4 migrations to empty baseline") is composite: (a) CI step order ensures success before test:schema runs, (b) `migration-inventory.spec.ts` asserts exact 19-table inventory as postcondition. During verification, the literal scenario was manually replayed independently on fresh empty DB and passed. Deemed sufficient functional evidence; documentation follow-up only.

2. **Prisma Shadow Database** — `shadowDatabaseUrl` added to schema.prisma datasource (design decision D2 contingency resolved during apply) points to PostgreSQL superuser, used only for authoring tooling (`prisma migrate dev --create-only`, drift check). No runtime impact on `seei_app`/`seei_migrator` roles. Documented in schema.prisma header comment.

3. **Migration Drift Script Logic Adjustment** — `check-migration-drift.sh` filters comment and blank lines before deciding drift (Prisma 5.22 always writes 30-byte placeholder). Original `design.md` D2 snippet not updated to reflect final logic. Documentation follow-up only.

All three warnings remain non-critical, non-blocking, and do not prevent archive closure.

## Implementation Branches and Commits

**Feature-branch-chain strategy** (per tasks.md decision):
- **Tracker branch**: `base-schema-and-migrations`
- **Child branches**: `base-schema-and-migrations-pr0`, `base-schema-and-migrations-pr1`, `base-schema-and-migrations-pr2`, `base-schema-and-migrations-pr3`, `base-schema-and-migrations-pr4`
- **Commits**: 2e90b54, 9464414, 48e6475, 224555f, c34c663 (in order across PRs)
- **Status**: Branches exist locally; not yet pushed to origin or merged to main (delivery is a separate step outside this archive)

Each PR is autonomous, independently reviewable, and targets its immediate predecessor:
- PR0 (harness) → tracker branch / main
- PR1 (identity+academic) → PR0
- PR2 (electoral) → PR1
- PR3 (voting core) → PR2
- PR4 (support) → PR3

## Design Decisions Reflected

All 7 design decisions (D1–D7) from `design.md` are implemented:

| D | Decision | Evidence |
|---|---|---|
| D1 | Explicit `onDelete` semantics per relation (Restrict/Cascade/no SetNull) | schema.prisma: Restrict default, Cascade only for pure composition of discardable draft process; Voto relations Restrict explicit |
| D2 | SQL raw appended by hand to same migration.sql + dual drift verification | identity_and_academic_tree and voting_core migrations carry SQL raw at end; check-migration-drift.sh detects DSL drift content-based; catalog assertions detect SQL raw loss |
| D3 | Raw `pg` for SQL raw/FK (error codes 23505/23514/23503), Prisma Client for DSL (P2002) | expect-pg-error.ts, pg-client.ts harness; test suites split restriction verification by source |
| D4 | 4 migration groups + 5 PRs (PR0 harness separate) | 5 commits on 5 chained branches; no single PR exceeds 400 authored lines |
| D5 | `blanco NOT NULL DEFAULT false` + `CHECK num_nonnulls(...) + blanco::int = 1` | Voto model confirmed; voting_core migration SQL raw implements exact formula |
| D6 | Single `ProcesoAula` join table as scope authority (not separate ProcesoNivel/ProcesoGrado) | schema.prisma confirmed; electoral.spec.ts tests reject ProcesoAula with invalid Aula FK |
| D7 | `Configuracion` carries no SMTP secrets (only `smtp_host`/`smtp_puerto`/`smtp_remitente`) | schema.prisma confirmed; seed.spec.ts asserts absence of password/secret column names |

## Hardblock Status

**Predecessor Hardblock** — This change declares: "No PR can reach `sdd-apply` until Backlog #1 (`system-scaffolding`) is implemented."

**Current Status**: #1 (system-scaffolding) is already archived (2026-08-06). This change was able to proceed to full implementation, verification, and now archive closure. ✅ Hardblock satisfied.

## Rollback Plan

Greenfield schema, no production data migration. If any slice becomes untenable:
1. `git revert` the affected PR(s) from their feature branches
2. If already applied to shared dev/CI database: `docker compose down -v` or forward migration deleting added tables (no maintained down migrations per #1 precedent)
3. No impact on prior commits or branches

## Open Items from Design (Not Blocking)

Per `design.md` "Preguntas abiertas":
- Prisma version 5.22.0 `--create-only` behavior contingency verified during apply; confirmed no empty/missing file scenarios needed special handling ✅
- Academic tree hierarchy is provisional until #8 defines business rules; post-implementation additive migration is accepted risk
- `ProcesoAula` as sole scope axis needs #11 confirmation before 4-step wizard is built; if #11 needs durable "entire 3rd grade" fact, additive table required
- Production deployment path (`prisma migrate deploy` integration) not yet defined in repo (ADR-0007 covers topology, not release step); not blocking #2
- Documentation: `TECH-DESIGN.md` should declare individual-candidate voting (`Voto.candidato_id`) — separate documentation task, out of scope

## Traceability (Engram Observations)

For hybrid mode (openspec + engram), the following SDD artifacts were persisted during the cycle. Archive closure documents these observation IDs for full traceability:

*(Observation IDs would be recorded here if artifacts had been stored in Engram mode. In hybrid mode, the authoritative records are the filesystem artifacts listed above, plus the archive report saved to both openspec and Engram.)*

## Source of Truth

Main specifications are now updated. Downstream backlog items (#3–#17) should reference:
- **Schema Authority**: `openspec/specs/base-schema/spec.md` (10 requirements, 15 scenarios) — now the live spec
- **Design Authority**: `openspec/changes/archive/2026-08-07-base-schema-and-migrations/design.md` (7 decisions, threat matrix, SQL raw procedures)
- **Implementation Authority**: 5 chained PRs on `base-schema-and-migrations*` branches, commits 2e90b54–c34c663

## SDD Cycle Complete

✅ **Proposal** — Scope, approach, dependencies, rollback (2026-08-05 or prior)
✅ **Specification** — 10 requirements, 15 scenarios (2026-08-05 or prior)
✅ **Design** — 7 decisions, threat matrix, SQL procedures (2026-08-05 or prior)
✅ **Tasks** — 55/55 tasks planned across 5 PRs (2026-08-05 or prior)
✅ **Apply** — All tasks completed, 5 PRs implemented on feature-branch-chain (2026-08-06)
✅ **Verify** — PASS WITH WARNINGS, 10/10 reqs + 15/15 scenarios verified on real PostgreSQL (2026-08-06)
✅ **Archive** — All specs synced, change folder archived, audit trail closed (2026-08-07)

**The change is ready for delivery.** Next step: push branches to origin, open/merge PRs as per repository policy, and merge tracker branch to main (outside the scope of this archive phase).
