# Verify Report: google-oauth-y-recuperacion (Backlog #5)

**Date**: 2026-08-07 (re-verification)
**Scope**: full 3-PR chain (PR1 Foundation, PR2 Google OAuth login, PR3 Recovery flow), branch `google-oauth-y-recuperacion-pr3-recovery`
**Mode**: full artifact set (proposal/spec/design/tasks) - Strict TDD active
**Context**: re-run after commit `55a66ab` ("chore(contracts): regenerate OpenAPI contract for OAuth/recovery endpoints"), which fixed the sole CRITICAL from the prior verify-report (contract drift). This report supersedes the previous one (previous verdict: FAIL).

**VERDICT: PASS WITH WARNINGS** (0 CRITICAL, 2 WARNING, 0 SUGGESTION)

## Task completeness
62/62 tasks `[x]` across Phases 1-12 (PR1 16/16, PR2 22/22, PR3 24/24). All 3 PRs recorded accepted `size:exception` for the 400-line review budget (425/1288/821 lines) — previously accepted, not re-litigated.

## Fix verification (previous CRITICAL)
- Independently re-ran `pnpm --filter @seei/contracts run check:drift` (regenerates `openapi.json` + `src/generated/api.d.ts` via `turbo run generate:contracts --force` and diffs against the git index): **exit 0**, output `Contratos sincronizados.`
- Inspected commit `55a66ab`: `packages/contracts/openapi.json` +54, `packages/contracts/src/generated/api.d.ts` +126 (180 insertions, 0 deletions), matching exactly the drift previously reported as missing.
- Confirmed `git show HEAD:packages/contracts/openapi.json` contains `/auth/google`, `/auth/recovery`, and `/auth/recovery/confirm` paths alongside the pre-existing `/auth/login`, `/auth/logout`, `/auth/whoami`.
- Working tree clean aside from expected untracked files (`.codegraph/`, this report).

## Build/static evidence
- `pnpm run build` (turbo, all 4 packages incl. `@seei/backend` `nest build`, `@seei/frontend` `vite build`, `@seei/contracts` generate): exit 0, clean, no errors.
- `pnpm --filter @seei/contracts run check:drift`: exit 0 (see above) — was the CRITICAL, now clean.

## Runtime test evidence (real Postgres 16 + Redis 7 ephemeral via `infra/docker/docker-compose.test.yml`, ports 5433/6380, migrations applied via `prisma migrate deploy` incl. `20260807220000_google_id_usuario`)
- **test:e2e** (`node scripts/test-e2e.mjs`, up → migrate deploy → jest `test/jest-e2e.config.ts` → down -v): 6/7 suites, **35/36 tests PASS**. 1 failure: `migrate-baseline.e2e-spec.ts` — same pre-existing WARNING documented in the prior verify-report and originating from `system-scaffolding`/`base-schema-and-migrations` (schema has 19 domain tables besides `_prisma_migrations` because all 8 migrations apply in the shared ephemeral DB run); non-blocking, unrelated to this change, not a regression from the fix commit.
- **unit** (`jest --config jest.config.ts`, live Redis): **12/12 suites, 70/70 tests PASS** (`recovery.service.spec.ts` incl. real `Promise.allSettled` concurrent `confirmar()` race; `google-oauth.service.spec.ts`; `auth.service.spec.ts`). Zero regressions.
- **test:schema** (`jest --config test/schema/jest-schema.config.ts`, live Postgres): **9/9 suites, 42/42 tests PASS** (`usuario.spec.ts` `google_id` nullable+unique; `auditoria.spec.ts` ADR-0016 trigger `WHEN` clause unaffected). Ran successfully in this session with `DATABASE_URL`/`MIGRATION_DATABASE_URL` explicitly exported before Jest (the previous session's inability to run this via `turbo run test:schema` directly was an environment-wiring gap in that invocation path, not a defect in the suite itself — the suite passes end-to-end when given the required env).
- No regressions in `append-only-audit-engine` or `auth-server-sessions` suites (all PASS, part of the unit/e2e/schema runs above).

## Spec compliance
11 requirements / 18 scenario blocks counted directly from `spec.md` (tasks.md brief said 22 — informational discrepancy only, no coverage gap; all 18 scenarios have passing covering tests, re-confirmed in this run):
- R1 `google_id` column — `test:schema/usuario.spec.ts`.
- R2 ID token verification (2 scenarios: domain rejected, invalid sig/aud rejected) — `google-oauth.service.spec.ts` + `auth-google.e2e-spec.ts`.
- R3 unregistered-email login rejected — `auth.service.spec.ts` D3#1 + e2e.
- R4 linking requires password confirmation (3 scenarios) — `auth.service.spec.ts` D3#3/5/6 + e2e.
- R5 OAuth login creates session — e2e Redis+cookie assertion.
- R6 recovery anti-enumeration (2 scenarios) — `recovery.service.spec.ts` 9.1/9.2 + e2e identical 202.
- R7 same endpoint sets first password for OAuth-only accounts — `recovery.service.spec.ts` 10.5 + e2e.
- R8 single-use confirmation (3 scenarios) — `recovery.service.spec.ts` 10.1/10.2/10.3/10.8/10.9 incl. real concurrency race exactly-1-winner.
- R9 transactional audit (2 scenarios) — `auth.service.spec.ts` 7.10/7.11 + `recovery.service.spec.ts` 10.6 compensating `SET`.
- R10 `EmailSender` minimal, no outbox — `email-sender.spec.ts`/`email.module.spec.ts`/`smtp-email-sender.spec.ts`.
- R11 additive audit event types — `test/schema/auditoria.spec.ts`.

## Design coherence
`design.md` D1-D8 re-reviewed; no deviations breaking a spec scenario. Two known intentional deviations, unchanged from prior verify: cooldown claimed before the audit transaction commits (rationale holds — the actual token capability write still strictly follows commit); no `RECUPERACION_FALLIDA` event (matches design.md's explicit open question, deferred to backlog #6). ADR-0017 present, Aceptado, matches D1.

## Issues
**CRITICAL (0)**: none. The previous CRITICAL (contract drift) is resolved and independently re-verified in this run.

**WARNING (2)**, both pre-existing and previously accepted, re-confirmed with no new related findings:
1. `migrate-baseline.e2e-spec.ts` fails in the shared ephemeral-DB e2e run because all 8 migrations apply cumulatively — same known, non-blocking, unrelated infra artifact documented since `system-scaffolding`/`base-schema-and-migrations`.
2. `spec.md` has 18 scenario blocks, not the 22 referenced in `tasks.md`'s brief — informational only, no coverage gap; all 18 scenarios map to a passing test.

**SUGGESTION (0)**: none beyond design.md's own tracked open questions (CSRF, token-in-query-string, `RECUPERACION_FALLIDA`), all explicitly out of scope for this change.

## Next steps
Ready for `sdd-archive`. All 62 tasks complete, all spec scenarios covered by passing runtime tests, build clean, contract drift resolved and independently confirmed, no regressions.

Artifact also written to Engram: `sdd/google-oauth-y-recuperacion/verify-report`
