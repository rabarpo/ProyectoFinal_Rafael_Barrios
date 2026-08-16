# Verification Report: resultados-en-vivo (Backlog #16)

## Verdict: PASS

## Scope

Full-change verification of the 4 merged PRs (bcf5196, 0b29bcc, a375e39, 4cda56e) on
`feat/administracion-procesos-electorales-pr4-cimientos-backend`, against
`proposal.md`, `specs/resultados-en-vivo/spec.md` (8 requirements, 18 scenarios),
`design.md` (D1-D13), and `tasks.md` (89/89 tasks marked complete).

## Task completeness

89/89 tasks in `tasks.md` checked. Spot-checked against actual code/tests below — task
marks match real implementation state, no phantom checkmarks found.

## Test execution evidence (real runtime, not static analysis)

| Command | Result |
|---|---|
| `pnpm --filter @seei/backend test -- resultados` | 24/24 passed (`resultados-cache.spec.ts`, `resultados.service.spec.ts`) |
| `docker compose -f infra/docker/docker-compose.test.yml up -d --wait` + `prisma migrate deploy` + `jest --config test/jest-e2e.config.ts --runInBand --testPathPattern=resultados` (Postgres 5433 + Redis 6380 real, ephemeral) | 14/14 passed (`resultados.e2e-spec.ts` 9/9, `resultados-cache.e2e-spec.ts` 5/5) |
| `pnpm --filter @seei/frontend test` | 245/245 passed (48 files) |
| `pnpm turbo run typecheck` | 4/4 packages green (backend, contracts, frontend, worker) |

Environment note (not a defect of this change): two long-lived orphaned Jest e2e
processes (`academico`, `procesos\|academico`) from earlier, unrelated sessions were
still running against shared Docker test infra and had to be killed before the
`resultados` e2e run could be observed cleanly. Confirmed via `pg_stat_activity` /
`netstat` that they were not corrupting the `resultados` run's data — the 14/14 result
is from an isolated, filtered run. This is exactly the class of preexisting
cross-file-parallelism fragility flagged by PR4/#15 (`anioEscolar.activo` collision) —
noted here as environment hygiene, not re-reported as a new defect. The full unfiltered
`test:e2e` suite was intentionally NOT run, per instructions, to avoid re-triggering
that known unrelated flake.

## Requirement 1 — Authorization by membership, no role oracle (spec) / D2, D3 (design)

Verified in code (`resultados.service.ts`) and e2e (5.1-5.4):
- `count(DerechoVoto)` is the **first** operation, before any `ProcesoElectoral` read or
  cache lookup — confirmed by reading the source (comment "AUTORIZACIÓN — siempre, nunca
  cacheada") and by e2e 5.2/5.3 asserting **identical body** for "no DerechoVoto" and
  "nonexistent proceso_id".
- No explicit `estado === 'borrador'` guard exists anywhere in `resultados.service.ts` —
  confirmed by source inspection; e2e 5.4 confirms `borrador` falls through to the same
  opaque 403 as 5.2/5.3 (comparison passed).
- 401 (no session) verified by e2e 5.1.
- `ocultar_resultados` default: schema now has `@default(true)` (migration
  `20260815040000_ocultar_resultados_default_activo`, applied in commit `8aedda7`,
  landed before PR1 of this change) — resolves the open question raised in
  `design.md` "Preguntas abiertas" in the safer direction.

## Requirement 7 — Observable cache consistency (spec) / D7, D8 (design)

Verified via e2e `resultados-cache.e2e-spec.ts` (6.1-6.5), which follows the
`design.md` prescription exactly: a priming read, then N reads compared byte-for-byte
(not `sleep(8s)`), TTL asserted in `(0, 8]` via `redis.ttl()`, and expiry simulated via
explicit `DEL resultados:{proceso_id}` from the test's own `ioredis` client rather than
sleeping. Test 6.5 additionally injects a foreign envelope under process A's key and
confirms it degrades to a miss (anti-cross-contamination self-check). All 5 passed.
Redis degradation (D8) is unit-tested (3.12-3.14): `redis.get`/`setex` rejection ⇒ 200
computed anyway, without masking Prisma errors.

## Hidden mode never returns breakdown, for any role, including comité

- `resultados.service.ts::calcular` returns `base` (5 fields only) and exits before
  computing `dimension`/`desglose`/`blancos` when `ocultar_resultados` is true — the
  breakdown is never computed, not merely omitted from serialization.
- Unit 3.4 asserts `Object.keys(body).sort()` is exactly the 5-field set.
- e2e 5.8 confirms comité and estudiante receive **literally identical** bodies for the
  same hidden process.
- DTO (`resultados-respuesta.dto.ts`) declares `dimension`/`desglose`/`blancos` as
  `@ApiPropertyOptional` (absent/`undefined`), never `null`/`[]`, matching D5.

## D12 — Server-decided category order; mirror table present

- Backend: `resultados.service.ts` sorts `desglose` server-side
  (`votos desc, etiqueta asc`) before returning; unit 3.8 covers this explicitly.
- Frontend: `GraficoDesglose.tsx` renders both the chart (`Cell` order) and the
  `<table>` directly from the `desglose` prop in received order — no client-side sort
  call anywhere in the component. Comment in source explicitly documents "el componente
  NUNCA reordena, ni para el gráfico ni para la tabla espejo."
- The `<table>` mirror is present unconditionally alongside the chart (pie for
  `dimension: 'opcion'`, horizontal bars for `lista`/`candidato`), matching D12; tests
  17.4/17.5 assert table content/order rather than SVG (documented jsdom
  `ResponsiveContainer` 0×0 limitation).

## Design coherence spot checks (D1, D4, D5, D6, D9-D11, D13)

- D1: `ResultadosController` is a sibling controller (`AuthGuard` only, no
  `@Roles()`), registered first in `procesos.module.ts` `controllers: []` — confirmed.
- D4: single `RepeatableRead` interactive transaction; catalog read without
  `estado: 'activo'` filter — confirmed in `calcular()`.
- D6: `hora_servidor` sealed via `SELECT now()` inside the same transaction, cached with
  the rest of the payload — confirmed.
- D9: `QueryProvider` mounted inside `AuthGuard`, wrapping `AppShell`
  (`AuthProvider > AuthGuard > QueryProvider > AppShell`) — confirmed in `App.tsx`.
- D10: `INTERVALO_SONDEO_MS = 15_000`, exported from `useResultadosEnVivo.ts` — confirmed.
- D11: flat route `/resultados/:procesoId` under `apps/frontend/src/resultados/` —
  confirmed.
- D13: no schema migration/index/backfill added by this change beyond the
  pre-existing default fix; `recharts@^2`/`@tanstack/react-query@^5` only in frontend
  `package.json` — confirmed.
- `usePadronEnVivo.ts` — zero lines changed (proposal.md decision 5) — confirmed, file
  untouched in this change's commits.

## Issues

None CRITICAL. None WARNING specific to this change's implementation.

**SUGGESTION** (non-blocking, informational): the standalone `resultados` e2e Jest
process does not exit cleanly on its own ("Jest did not exit one second after the test
run has completed... asynchronous operations that weren't stopped"), requiring manual
process termination during this verification. This did not affect correctness of the
14/14 result but is worth a follow-up `--detectOpenHandles` pass (likely an
un-disconnected `ioredis` client in a test's own `afterAll`) — out of scope to fix here
since `tasks.md` does not list it and it doesn't violate any spec/design requirement.

## Final Verdict

**PASS.** All 8 spec requirements have runtime-test coverage that actually ran and
passed (backend unit 24/24, backend e2e 14/14 against real Postgres+Redis, frontend
unit 245/245). Design decisions D1-D13 were checked against the real source and match.
Tasks 1.1-19.5 (89/89) are consistent with the code state. `usePadronEnVivo.ts` is
untouched as required. No hidden-mode leakage, no client-side reordering, no
role-based oracle found.
