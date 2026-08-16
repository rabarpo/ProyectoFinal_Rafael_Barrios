# Archive Report: resultados-en-vivo (Backlog #16 — Resultados en vivo)

**Change**: resultados-en-vivo  
**Status**: ARCHIVED  
**Date**: 2026-08-15  
**Artifact Store Mode**: hybrid (OpenSpec + Engram)

---

## Executive Summary

The "resultados-en-vivo" (Live Results) change has been successfully completed, verified, and archived. All 89 implementation tasks were marked complete across 4 chained PRs. Full runtime verification was performed against real Postgres + Redis infrastructure. The change delivers a new authenticated endpoint (`GET /procesos/:id/resultados`) with short-term Redis caching (8s TTL), a React Query frontend consumer, and recharts-based visualization of live electoral process results, respecting the immutable `ocultar_resultados` configuration. Final verdict: **PASS** with zero critical or warning issues.

---

## Artifact Traceability

All artifacts retrieved from Engram (hybrid mode). Observation IDs for full-context recovery:

| Artifact | Observation ID | Created | Retrieved |
|----------|----------------|---------|-----------|
| `sdd/resultados-en-vivo/proposal` | #140 | 2026-08-15 16:25:39 | Yes |
| `sdd/resultados-en-vivo/spec` | #141 | 2026-08-15 16:44:14 | Yes |
| `sdd/resultados-en-vivo/design` | #142 | 2026-08-15 16:57:12 | Yes |
| `sdd/resultados-en-vivo/tasks` | #143 | 2026-08-15 17:20:42 | Yes |
| `sdd/resultados-en-vivo/verify-report` | — | 2026-08-15 (OpenSpec) | From openspec/changes/resultados-en-vivo/verify-report.md |

---

## Specs Merged into Main

**Delta spec location**: `openspec/changes/resultados-en-vivo/specs/resultados-en-vivo/spec.md`  
**Main spec destination**: `openspec/specs/resultados-en-vivo/spec.md` **[CREATED - FULL SPEC]**

**Action**: Delta is a complete new specification (no prior main spec existed for `resultados-en-vivo`). Copied directly as-is.

**Content Summary** (8 Requirements, 18 Scenarios):

1. **Autorización por pertenencia, sin restricción de rol** — endpoint under `AuthGuard` (no `@Roles()`), identical `403` for nonexistent proceso_id and no DerechoVoto
2. **Desglose completo cuando `ocultar_resultados = false`** — breakdown by candidato/lista/opción with `hora_servidor` (ISO, sealed by server)
3. **Payload mínimo cuando `ocultar_resultados = true`** — exactly 5 fields: `votos_emitidos`, `padron_total`, `estado_visibilidad`, `hora_servidor`, `resultados_ocultos_por_configuracion` (no `dimension`/`desglose`/`blancos`)
4. **Base de cálculo es el padrón congelado** — `padron_total` from `count(DerechoVoto)`, never from Matricula/Usuario live
5. **Sin categoría de nulos; abstención derivada** — no `nulos` field; abstention = `padron_total - votos_emitidos` (client-side)
6. **Comportamiento según estado del proceso** — same logic for `abierto`, `cerrado`, `acta_emitida`; `borrador` naturally rejected via authorization (no explicit guard needed)
7. **Consistencia observable de lecturas repetidas en ventana corta** — repeated reads within seconds serve identical values; never serve data from wrong proceso_id; after TTL expiry, reflect current vote counts
8. **Vista frontend de resultados en vivo** — participation always visible; breakdown (charts) only when `estado_visibilidad = "visible"`; message when hidden; polling 10-30s (chosen: 15s)

---

## Design Decisions Verified (D1-D13)

| # | Decision | Choice | Verified | Notes |
|---|----------|--------|----------|-------|
| D1 | Backend location | Sibling controller `procesos/resultados.controller.ts` inside `procesos/` module | YES | First in `controllers[]` ordering |
| D2 | Authorization order | `count(DerechoVoto)` **first**, before ProcesoElectoral read or cache | YES | No oracle risk; indexed lookup |
| D3 | Explicit `estado = borrador` guard | **No guard** — rejected via authorization | YES | e2e 5.4 confirms; paid with constant in code |
| D4 | Aggregation query shape | Single `RepeatableRead` interactive transaction; full catalog read (no `estado: 'activo'` filter); mapa.get(id) ?? 0 | YES | Guarantees coherence; preserves 0-vote items and items in 'baja' state |
| D5 | DTO shape | One DTO; `dimension`/`desglose`/`blancos` absent (not null) in hidden mode | YES | Unit 3.4: `Object.keys()` exactly 5 fields; e2e 5.8: comité/estudiante identical bodies |
| D6 | `hora_servidor` meaning | Instant **within the transaction snapshot**, cached with payload; not "now" at response time | YES | `SELECT now()` inside tx; trade-off: up to 8s stale during TTL window |
| D7 | Redis caching design | Clave `resultados:{proceso_id}`, envelope with `{proceso_id, payload}`, TTL 8s, no invalidation, autocheck at deserialize | YES | Prevents cross-contamination; MISS on envelope mismatch; no active invalidation |
| D8 | Redis failure handling | **Degrade**: try/catch only on `get`/`setex`; Prisma errors bubble up | YES | Rationale: Redis is cache (not source of truth); Postgres failure ≠ 500 hidden as cache miss |
| D9 | QueryClientProvider location | Inside `AuthGuard`, useState(crearQueryClient), dies with session, no manual clear() | YES | Confirmed in App.tsx: AuthProvider > AuthGuard > QueryProvider > AppShell > Router |
| D10 | Polling interval | 15s (`INTERVALO_SONDEO_MS`), between TTL (8s) and range (10-30s) | YES | Exported from hook for future override |
| D11 | Frontend route/folder | Flat route `/resultados/:procesoId`, new folder `apps/frontend/src/resultados/`, not under `/procesos/` | YES | Asymmetry intentional: backend owns data (procesos), frontend owns audience (voter) |
| D12 | Chart components | Server sends `dimension`; client maps: opcion → PieChart, lista/candidato → BarChart horizontal; server-ordered breakdown; mirror table present | YES | e2e tests 17.4/17.5 assert table (SVG unmeasurable in jsdom); no client-side reordering |
| D13 | Dependencies & rollout | `@tanstack/react-query@^5` + `recharts@^2` (frontend only); no schema migration/indices/backfill | YES | Verified: latest 2.x recharts declares React 16-18 peerDep (includes 18.3.1) |

---

## Task Completion Audit (89/89 ✅)

**All implementation tasks marked complete.** Spot checks against actual code/test artifacts:

- **PR1 (Phases 1-7)**: Backend complete. DTO ✅, cache pure ✅, service ✅, controller ✅, module ✅, unit tests 24/24 ✅, e2e 14/14 (9 contract + 5 cache requirement) ✅
- **PR2 (Phases 8-12)**: Contract regenerated ✅, `@tanstack/react-query@^5` + `recharts@^2` added ✅, `QueryProvider` + `query-client.ts` ✅, route `/resultados/:procesoId` ✅, `useResultadosEnVivo` hook ✅
- **PR3 (Phases 13-16)**: `ResultadosPage` ✅, `PanelParticipacion` ✅, `AvisoResultadosOcultos` ✅, Enrutador case ✅, frontend tests 245/245 ✅
- **PR4 (Phases 17-19)**: `GraficoDesglose` recharts ✅, table mirror ✅, docs (turbo.json, docker-compose.yml, onboarding.md, README.md) ✅, final regression ✅

**No phantom checkmarks**: Each task aligns with actual implementation state (confirmed via commit inspection and test output).

---

## Verification Report Summary

**Verdict**: **PASS** (Final verdict from `verify-report.md` #obs-none — inline from OpenSpec)

**Test Results**:
- Backend unit (Jest): 24/24 passed
- Backend e2e (Postgres + Redis real, ephemeral Docker): 14/14 passed
  - Contrato e2e (`resultados.e2e-spec.ts`): 9/9 passed
  - Cache requirement e2e (`resultados-cache.e2e-spec.ts`): 5/5 passed
- Frontend unit (Vitest): 245/245 passed (48 files)
- Type checking (turbo): 4/4 packages green

**Coverage**:
- ✅ All 8 spec requirements have runtime test coverage with real infrastructure
- ✅ All 13 design decisions (D1-D13) verified against source code
- ✅ 89/89 tasks consistent with code state
- ✅ No hidden-mode data leakage
- ✅ No client-side reordering of breakdown
- ✅ No role-based oracle vulnerabilities

**Issues**:
- **CRITICAL**: None
- **WARNING**: None specific to this change
- **SUGGESTION** (informational): Jest e2e process does not exit cleanly on its own (un-disconnected ioredis client in afterAll); recommend `--detectOpenHandles` follow-up (out of scope for tasks.md, not blocking)

**Known Preexisting Environment Fragility** (NOT a defect of this change):
- Two orphaned Jest e2e processes (`academico`, `procesos|academico`) from unrelated sessions were still running during verification. They were isolated and did not corrupt the `resultados` run (verified via pg_stat_activity/netstat). This is the same cross-file parallelism issue flagged by PR4/#15 (`anioEscolar.activo` collision). Full unfiltered `test:e2e` suite was intentionally not run to avoid re-triggering that known unrelated flake.

---

## Archive Contents

All artifacts copied to `openspec/changes/archive/2026-08-15-resultados-en-vivo/`:

- ✅ `proposal.md` — complete, 272 lines (5 open design questions resolved; one question point about `usePadronEnVivo.ts` intentionally left intacto)
- ✅ `specs/resultados-en-vivo/spec.md` — complete, 123 lines (8 requirements, 18 scenarios)
- ✅ `design.md` — complete, 344 lines (13 architecture decisions D1-D13, full data flow diagrams, threat matrix, migration/rollout plan)
- ✅ `tasks.md` — complete, 308 lines (89 tasks across 4 PR units, phases 1-19, open questions / out-of-scope items clearly marked)
- ✅ `verify-report.md` — complete, 127 lines (PASS verdict, test execution evidence, requirement-by-requirement verification, design coherence spot checks)

**Also written** (first time to main specs):
- ✅ `openspec/specs/resultados-en-vivo/spec.md` — complete copy of delta spec (becomes authoritative main spec)

---

## Final State — Authority Ranking

Per the Final-State Authority hierarchy (skill instructions, section "Final-State Authority"):

1. **Native review authority**: None in this change (receipt-driven development disabled; no explicit review artifact).
2. **Persisted tasks artifact**: `openspec/changes/resultados-en-vivo/tasks.md` — 89/89 complete, matches implementation state, no stale unchecked items.
3. **Explicit final-state facts in launch prompt**: None beyond the default verify-report verdict.
4. **Verify-report + apply-progress**: Verify-report (Oct 15, inline with archive) declares **PASS** across all 8 spec requirements, all 13 design decisions, and 24+14+245 test coverage.

**Synthesis**: The change is in final state **DONE** at archive time. All verification passed. All tasks complete. No blockers remain.

---

## Rollback Plan

Greenfield, no data persistence in Postgres, no schema changes, no indices, no backfill.

**Simple rollback**: `git revert` of the 4 PR commits on `feat/administracion-procesos-electorales-pr4-cimientos-backend`.

**State cleanup**: Redis keys with `resultados:` prefix vencen solas en ≤ 8s. No manual cleanup required.

**Dependencies**: If `@tanstack/react-query@^5` or `recharts@^2` become problematic, can be replaced without backend contract change (`dimension` field decouples server behavior from frontend library choice).

---

## Known Open Questions (Not Blocking Archive)

Documented in `design.md` "Preguntas abiertas" — all listed as out-of-scope for #16, to be addressed by #17 or future changes:

1. **`ocultar_resultados` default contradiction**: Schema has `@default(false)`, but ADR-0008 describes "hide until close" as active by default. Schema wins today (processes publish live by default). Escalated to #17/spec amendment.
2. **K-anonymity in small electorates**: Tiny padrons (e.g., 8-student classroom) may allow preference inference from breakdown. No design/spec threshold defined; no mitigation invented here. If adopted, add a rule: "if `padron_total < k`, suppress desglose even if `ocultar_resultados = false`" — no contract change needed.
3. **Cache invalidation hook for #17**: If #17 needs instant publication on close, `DEL resultados:{proceso_id}` inside the close transaction would work. Not implemented here (D7: no active invalidation); clave name stable and documented for #17.
4. **Reuse of ResultadosService for #17 acta**: Service computes exactly what an acta needs, but acta requires sealed, non-cached calculation. If reused by #17, must use a path that bypasses cache. Design deferred to #17.
5. **Visual design fidelity**: Components use current `index.css` tokens. Pending design review (same deferral as #15).

---

## Skipped Tasks / Environment-Only Issues

- ✅ Jest e2e cleanup (`--detectOpenHandles`): Recommended as follow-up, not blocking. Out of scope per task definitions.
- ✅ Full unfiltered `test:e2e` suite: Intentionally skipped to avoid re-triggering the known unrelated `anioEscolar.activo` collision flake (preexisting, not a defect of this change).

---

## Learned / Gotchas

1. **reponsiblecontainer SVG in jsdom**: `recharts` `ResponsiveContainer` measures 0×0 under jsdom. All table mirror assertions bypass SVG; frontend tests assert over `<table>` DOM, not chart SVG. Documented in design.md "Estrategia de pruebas".
2. **Cache design consequence**: `hora_servidor` reflects the instant **within the snapshot**, not at response time. Creates up to 8s stale clock. Acceptable because #16 doesn't show countdown; #17 must not use this field for temporal validation.
3. **Transacción interactiva con tipo dinámico**: Can't use `$transaction([...])` batch form when dimension depends on proceso.tipo (known after first read). `RepeatableRead` interactive + read-only handles this cleanly.
4. **Cache permission more restrictive, never more permissive**: `ocultar_resultados` immutable once open (per #13), so cached visibility can't leak more than configured. Fail-safe direction. Depends on external invariant (#13), noted in design.

---

## Summary Table — Change Status

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Proposal** | ✅ Complete | 5 open questions resolved; decision 5 (usePadronEnVivo untouched) confirmed |
| **Specification** | ✅ Complete | 8 requirements, 18 scenarios defined; spec merged to main |
| **Design** | ✅ Complete | 13 decisions (D1-D13) documented with alternatives, rationale, threat matrix |
| **Tasks** | ✅ Complete | 89/89 marked done; consistent with code state; no phantoms |
| **Implementation** | ✅ Complete | 4 PR chain, Phases 1-19, backend + frontend + docs |
| **Verification** | ✅ PASS | 24+14+245 tests passed; all 8 specs + 13 designs verified; zero critical/warning |
| **Archive** | ✅ Complete | All artifacts copied to `openspec/changes/archive/2026-08-15-resultados-en-vivo/` |
| **Main Specs** | ✅ Updated | `openspec/specs/resultados-en-vivo/spec.md` created (new feature) |
| **Rollback** | ✅ Clean | Git revert; Redis TTL auto-cleanup; no Postgres state |
| **SDD Cycle** | ✅ Closed | Change fully planned, implemented, verified, archived |

---

## Archiving Metadata

- **Change name**: resultados-en-vivo
- **Archive date**: 2026-08-15
- **Artifact store**: hybrid (OpenSpec files + Engram observations)
- **Archive location**: `openspec/changes/archive/2026-08-15-resultados-en-vivo/`
- **Observation IDs persisted**: #140 (proposal), #141 (spec), #142 (design), #143 (tasks)
- **Status at archive**: DONE — zero blockers, final verdict PASS
- **Next recommended step**: Close backlog #16; begin backlog #17 (Cierre, escrutinio, actas)

---

*Archive report generated 2026-08-15 by sdd-archive executor. All artifact locations are absolute paths within the OpenSpec filesystem.*
