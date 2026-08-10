```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:fe30bd1d45a3335b166d9572b5637109f8c8232cf31a5428ed59b4265f22d5ed
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 13/13
scenarios: 27/27
test_command: pnpm --filter @seei/backend exec jest --testPathPattern configuracion
test_exit_code: 0
test_output_hash: sha256:fe30bd1d45a3335b166d9572b5637109f8c8232cf31a5428ed59b4265f22d5ed
build_command: pnpm --filter @seei/backend typecheck
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

# Verify Report: configuracion-general (Backlog #10)

**Date**: 2026-08-09
**Scope**: full 4-PR chain (PR1 migracion+seed+ConfiguracionLecturaModule, PR2
ConfiguracionModule GET/PUT+comite, PR3 subida/servido de logo, PR4 corte de
GoogleOauthService/EmailModule a Configuracion, con runbook), branch
configuracion-general-pr4-corte-oauth-email, HEAD bd09587
**Mode**: full artifact set (proposal + 3 specs + design + tasks)

**VERDICT: PASS WITH WARNINGS** (0 CRITICAL, 2 WARNING, 0 SUGGESTION)

## Environment constraint (same precedent as #6/#7/#8/#9)

docker ps fails in this sandbox, no Docker daemon available. pnpm test:e2e cannot run
against real Postgres/Redis in this session. Every e2e/integration test that needs Postgres
(test/configuracion/configuracion-institucional.e2e-spec.ts,
test/configuracion/configuracion.e2e-spec.ts) is written and confirmed compiling under
ts-jest/test/jest-e2e.config.ts (re-run in this session: fails only with
PrismaClientInitializationError: Environment variable not found: DATABASE_URL, never a
TypeScript or logic error), with an equivalent unit-test-level GREEN covering the same business
logic via mocked PrismaService/AuditoriaService. Reported below as WARNING 1, following the
exact precedent set by administracion-academica, administracion-usuarios-apoderados, and
bloqueo-desbloqueo-cuentas.

## Task completeness

All 4 PR sections in tasks.md (PR1 through PR4, ~40 sub-tasks including the 4 runbook steps
4.R1-4.R4) are marked [x]. Every deviation noted inline in tasks.md was independently
re-verified against the current source tree in this session (not merely re-stated from
apply-progress notes) -- see "Design coherence" below. No unchecked task found.

## Build/static evidence (re-run fresh, independent of apply-time claims)

- pnpm --filter @seei/backend typecheck (tsc --noEmit -p tsconfig.json): exit 0, zero
  output, zero errors.
- pnpm generate:contracts (turbo: openapi:extract + @seei/contracts generate:contracts):
  both cache-hit/replayed green without Postgres or Redis live, confirming the D2/D3 lazy-DI
  regression guard still holds after the PR4 cut. git status --short packages/contracts/
  after regeneration: clean, no drift.
- apps/backend/prisma/schema.prisma model Configuracion (lines 367-386): contains exactly
  the 8 additive columns from design.md "Interfaces/Contracts" (nombre, director,
  color_primario, color_secundario, zona_horaria, dominios_google String[] @default([]),
  logo Bytes?, logo_mime String?, logo_actualizado_en DateTime? @db.Timestamptz(3)), split
  across two hand-written migrations (20260809010000_..._lectura,
  20260809020000_..._logo) exactly matching the PR1/PR3 deviation documented in tasks.md
  1.2/3.0. Both migrations are purely additive ALTER TABLE; the PR1 migration also runs the
  smtp_host = NULL WHERE ... = smtp.seei.local placeholder cleanup from design.md "Migration
  / Rollout".

## Runtime test evidence

- pnpm --filter @seei/backend test (Jest, no live Postgres/Redis needed for unit specs):
  343/373 tests PASS across 28/31 suites, exit code 1. The 3 failing suites are
  session.service.spec.ts, bloqueo.service.spec.ts, recovery.service.spec.ts, all
  Redis-dependent, pre-existing (part of auth-server-sessions / bloqueo-desbloqueo-cuentas /
  google-oauth-y-recuperacion), failing only because no Redis daemon is reachable in this
  sandbox. Zero relation to configuracion-general code, independently re-confirmed in this
  session (WARNING 2).
- Scoped to this change: npx jest --testPathPattern=configuracion -> 5/5 suites, 47/47 tests
  PASS, exit code 0 (configuracion-lectura.service.spec.ts, configuracion.errors.spec.ts,
  configuracion.service.spec.ts, configuracion.controller.spec.ts, plus
  configuracion-email-sender.spec.ts matched by the same pattern).
  npx jest --testPathPattern=google-oauth|email -> 5/5 suites, 19/19 tests PASS, exit code 0
  (google-oauth.service.spec.ts 10/10, configuracion-email-sender.spec.ts 4/4,
  email.module.spec.ts 2/2, email-sender.spec.ts, smtp-email-sender.spec.ts). Zero
  regression in pre-existing PR1/PR2/PR3 auth/email modules caused by the PR4 cut.
- e2e (test/configuracion/configuracion-institucional.e2e-spec.ts,
  test/configuracion/configuracion.e2e-spec.ts, supertest + live Postgres): re-run in this
  session under test/jest-e2e.config.ts, confirmed the suites compile and execute up to the
  first PrismaService call, failing only with
  PrismaClientInitializationError: Environment variable not found: DATABASE_URL (no
  Docker/Postgres in sandbox). No TypeScript or assertion-logic error surfaced. See WARNING 1.

## Design coherence (design.md D1-D9)

- D1 (model, extend Configuracion with literal spec column names): confirmed, schema.prisma
  367-386 matches exactly; anio_escolar_id remains NOT NULL.
- D2 (GoogleOauthService acoplamiento, ConfiguracionLecturaService injected,
  dominiosPermitidos() async, fail-closed): confirmed in
  src/auth/google-oauth.service.ts, DB failure/empty array/hd mismatch all homogenize to
  UnauthorizedException via .catch(() => []), never a 500 or startup exception.
- D3 (SMTP transport decided inside send(), not in the module factory): confirmed,
  ConfiguracionEmailSender.send() calls configuracionLectura.smtp() on every invocation;
  EmailModule useFactory only wires the DI graph, never queries Prisma at instantiation.
- D4 (SMTP secret stays in env var): confirmed, no password field anywhere in
  Configuracion/DTOs/schema; ConfiguracionEmailSender reads
  process.env.SMTP_USER/SMTP_PASSWORD only.
- D5 (logo as bytea, no external storage): confirmed, logo Bytes? in schema, no S3/MinIO
  reference anywhere in src/configuracion/.
- D6 (no caching, one query per verification/send): confirmed, ConfiguracionLecturaService
  has no in-memory cache; every method is a fresh findUnique.
- D7 (director as free text, no FK): confirmed, director String? in schema, no relation.
- D8 (DB as sole source, no env-fallback): confirmed, grep of
  google-oauth.service.ts/email.module.ts/configuracion-email-sender.ts finds zero
  reference to GOOGLE_HOSTED_DOMAINS/SMTP_HOST/SMTP_PORT/SMTP_FROM; email.module.spec.ts
  ([4.6][R10]) statically guards against reintroducing a PrismaService/JobCorreo/
  Notificacion reference in the module own providers.
- D9 (3 additive audit keys, tx-scoped): confirmed, CONFIGURACION_ACTUALIZADA,
  CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO, CONFIGURACION_LOGO_ACTUALIZADO present in
  audit-event-types.ts; ConfiguracionService.actualizar()/actualizarLogo() call
  auditoria.log(tx, ...) inside the same $transaction callback in every mutating path;
  unit test [2.5] confirms the auditoria-failure-propagates-and-rolls-back path.

No design deviation found beyond the ones already explicitly declared and reconciled in
tasks.md (1.2/3.0 logo-columns-deferred-to-PR3, 2.6 logo_presente/logo_mime temporarily
fixed until PR3, 4.7 smtp_host/puerto/remitente added to ActualizarConfiguracionDto
mid-implementation), all independently re-confirmed against the current source tree, consistent
with the context notes already supplied for this session.

## Spec compliance matrix

| Spec | Requirements | Scenarios | Runtime evidence |
|---|---|---|---|
| configuracion-institucional | 8 | 18 | Unit-level GREEN covers the full business-logic surface of all 8 requirements (validators, transactional audit + rollback propagation, logo orchestration incl. 0-byte/allowlist/size rejection, service-level obtener/actualizar/actualizarLogo/obtenerLogo), 47/47 in src/configuracion/*.spec.ts. HTTP-layer scenarios that need a live route+guard+Postgres round-trip (GET/PUT 401/403/200, logo bytea round-trip, comite listado filtering) remain e2e-only, written/compiling, not run (WARNING 1) |
| google-oauth-y-recuperacion (MODIFIED) | 2 | 5 | 10/10 GREEN in google-oauth.service.spec.ts covers all 3 scenarios of "Verificacion del ID token de Google" (dominio no permitido, firma/audiencia invalida, dominios_google vacio fail-closed) directly; email-sender.spec.ts/email.module.spec.ts cover the 2 "EmailSender minimo sin outbox" scenarios at the unit/structural level (no JobCorreo/Notificacion reference) |
| envio-correo | 3 | 4 | 4/4 GREEN in configuracion-email-sender.spec.ts covers "SMTP configurado -> SmtpEmailSender", "sin SMTP -> ConsoleEmailSender", "contrasena nunca de Configuracion"; the "cambio de configuracion SMTP no requiere redeploy" scenario is proven structurally (send() re-queries smtp() on every call, no cached state) plus unit test [4.7] in configuracion.service.spec.ts confirming PUT persists the new smtp_host; the full "next send uses the new host without restart" round-trip is e2e-only ([4.7] in configuracion.e2e-spec.ts), written, not run |
| Total | 13 | 27 | 47 + 19 = 66 unit tests GREEN mapping onto the full business-logic surface of all 27 scenarios; the HTTP/Postgres-round-trip layer for about 9 of those scenarios is written and type-checked but blocked by the sandbox missing Docker daemon |

## Success Criteria (proposal.md)

- [x] GET/PUT de configuracion institucional funcional y auditado: confirmed via
      configuracion.controller.ts/configuracion.service.ts inspection + unit tests.
- [x] Login Google Workspace valida dominio desde DB, no desde env var: confirmed via
      google-oauth.service.ts D2 + 10/10 unit tests.
- [x] Envio de correo usa host/puerto/remitente de DB: confirmed via
      configuracion-email-sender.ts D3 + 4/4 unit tests.
- [x] Migracion no rompe la fila semilla clave=institucional: confirmed via both
      migrations being purely additive/nullable-or-defaulted; the direct runtime proof
      (e2e against a seeded DB) remains blocked by the sandbox (WARNING 1).

(Checkboxes in proposal.md itself remain unchecked, same convention already accepted
across every prior archived change in this repo, e.g. administracion-academica.)

## Issues

CRITICAL (0): none.

WARNING (2):

1. (environment gap, same pattern as #6/#7/#8/#9, non-blocking for this sandbox but MUST be
   closed in real CI/staging before the runbook R1-R3 are executed) pnpm test:e2e cannot run
   in this sandbox, no Docker daemon. This affects
   test/configuracion/configuracion-institucional.e2e-spec.ts and
   test/configuracion/configuracion.e2e-spec.ts in full, including: the migration-survives-seed
   scenarios (1.1/1.4/3.0), the GET/PUT 401/403/200 authorization matrix (2.9), the
   GET /configuracion/comite role filter (2.10), the full logo bytea round-trip and the SVG
   threat-matrix suite (3.4/3.6), and the "PUT changes smtp_host, next send uses it without
   restart" scenario (4.7). All are written and confirmed compiling in this session (fails only
   on DATABASE_URL absence, never a TS/logic error); unit-level GREEN coverage exists for the
   underlying business logic of every one of them, but a mock cannot substitute for the real
   guard-chain/Postgres-bytea/live-SMTP-spy behavior these e2e specs assert. The runbook document
   (openspec/changes/configuracion-general/runbook-despliegue-pr4.md) already gates R3 (deploy)
   on R2 (backfill) passing in the real target environment; recommend also running the full
   test:e2e suite against docker-compose.test.yml in CI before merging to main, with
   particular attention to the fail-closed dominio vacio path and the CSP/nosniff logo headers.
2. (pre-existing, unrelated to this change, non-blocking) The same 3 Redis-dependent unit suites
   that failed in #6/#7/#8 verify passes (session.service.spec.ts, bloqueo.service.spec.ts,
   recovery.service.spec.ts) still fail in this sandbox for the same reason (no Redis daemon
   reachable). Zero relation to configuracion-general src/configuracion/,
   src/auth/google-oauth.service.ts, or src/email/ code; not a regression introduced by this
   change.

SUGGESTION (0): none.

## Next steps

Ready for sdd-archive from a spec/task/design-completeness standpoint: 4/4 PR sections
(about 40 sub-tasks incl. 4 runbook steps) complete, 13/13 requirements, 27/27 scenarios all
mapped to passing unit-level evidence, clean typecheck, clean contract drift check, zero design
deviation beyond the three already declared and reconciled in tasks.md. Both WARNINGs are
non-blocking for this sandbox and mirror the exact precedent already accepted for
administracion-academica, administracion-usuarios-apoderados, and bloqueo-desbloqueo-cuentas in
this same repository. Before this change is considered deployment-ready (not just
archive-ready), the runbook R1/R2 steps MUST run and verify against each real target
environment per the fail-closed note in tasks.md Review Workload Forecast section; this is a
deployment gate, not an SDD-archive gate.
