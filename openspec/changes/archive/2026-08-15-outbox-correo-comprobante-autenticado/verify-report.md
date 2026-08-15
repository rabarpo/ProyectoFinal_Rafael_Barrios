# Verification Report: outbox-correo-comprobante-autenticado (Backlog #15)

**Verified commit**: 057a05a (feat/administracion-procesos-electorales-pr4-cimientos-backend)
**Mode**: Full artifact verification (proposal + specs + design + tasks)
**Verdict**: **PASS WITH WARNINGS**

## Completeness

All 76 tasks across 5 PRs (Phases 1-19) in `tasks.md` are checked `[x]`. Source inspection and
runtime evidence confirm the checked state matches the actual code -- no task was found marked
complete without a corresponding artifact.

| PR | Phases | Status |
|----|--------|--------|
| PR1 - transaccion/migracion/e2e atomicidad | 1-5 | Complete, verified |
| PR2 - worker outbox | 6-9 | Complete, verified |
| PR3 - endpoint comprobante | 10-12 | Complete, verified |
| PR4 - pagina comprobante frontend | 13-15 | Complete, verified |
| PR5 - reconciliacion/docs/cierre ADR-0018 | 16-19 | Complete, verified |

## Build / Test Evidence (commands actually executed this session)

| Command | Result | Notes |
|---|---|---|
| `pnpm --filter @seei/worker test` | 10/10 green | 3 files (vitest) |
| `pnpm --filter @seei/backend test -- votos` | 41/41 green | 6 suites incl. votos.service, comprobante.service, correo-comprobante, comprobante, papeleta, controller |
| `pnpm --filter @seei/backend test` (full unit) | 467/497 green, 30 failed in 3 suites | Failures are `auth/session.service.spec.ts`, `auth/bloqueo.service.spec.ts`, `auth/recovery.service.spec.ts` -- all Redis-dependent, unrelated to #15 scope; failed because no standalone Redis was running for this isolated command. Every votos/comprobante/outbox/reconciliar-outbox suite is green. Not a #15 regression. |
| Ephemeral Postgres + `prisma migrate deploy` | Applied cleanly, includes `20260814030000_jobcorreo_outbox_voto` | 7 pre-existing columns of `JobCorreo` untouched; 3 new nullable columns present |
| `jest --testPathPattern=outbox-atomicidad` (real Postgres) | 3/3 green | [4.1] commit conjunto, [4.2] rollback conjunto, [4.3] idempotencia -- literal ADR-0018 closure condition |
| `jest --testPathPattern=comprobante-autenticado` (real Postgres) | 4/4 green | [11.1] 200 propio, [11.2] 403 ajeno=inexistente, [11.3] 401 sin cookie, [11.4] 400 no-UUID |
| `pnpm --filter @seei/frontend test` | 214/214 green | 41 files (vitest), includes ComprobantePage, PanelComprobante, rutas |
| `pnpm typecheck` | 8/8 tasks green (FULL TURBO) | @seei/backend, @seei/contracts, @seei/frontend, @seei/worker |

Note: running the full `pnpm --filter @seei/backend test:e2e` (all 32 e2e files serially, no
per-name filtering support) reproduces cross-suite DB-state pollution in unrelated suites
(`procesos-*`, `importacion`, `padron`) already documented in apply-progress as a pre-existing
sandbox flake -- confirmed independently in this session, not caused by #15. Isolating
`outbox-atomicidad` and `comprobante-autenticado` against a freshly migrated, single-purpose
ephemeral stack is the correct and sufficient evidence for this change's own specs.

## Spec Compliance Matrix

### outbox-correo spec

| Requirement | Scenario | Status | Evidence |
|---|---|---|---|
| Insercion de JobCorreo dentro de la transaccion | Voto y JobCorreo nacen juntos | PASS | `votos.service.ts:341` insert inside `$transaction`; e2e [4.1] green |
| Insercion de JobCorreo dentro de la transaccion | Fallo revierte ambas filas | PASS | No try/catch around insert (D4); e2e [4.2] green |
| Columnas estructuradas aditivas | Migracion no toca columnas existentes | PASS | Migration applied cleanly; schema additive/nullable |
| Worker idempotente por id de job | Envio exitoso marca enviado | PASS | processor.spec.ts (part of 10/10 worker green) |
| Worker idempotente por id de job | Reintento de job ya enviado es no-op | PASS | same suite |
| Worker idempotente por id de job | Fallo transitorio agota reintentos, marca fallido | PASS | processor propagates (D7); main.ts on('failed') listener |
| Contenido del correo nunca revela la eleccion | Contenido verificado | PASS with WARNING | blacklist unit tests + e2e [4.1] persisted cuerpo check; see WARNING 1 below |
| Reconciliacion sin ejecucion contra datos reales | Consulta via JOIN | PASS | reconciliar-outbox.ts read-only, unit tested |
| Cierre de ADR-0018 condicionado a prueba verde | Actualizacion tras suite verde | PASS | ADR Estado field updated, cites green suite |

### comprobante-autenticado spec

| Requirement | Scenario | Status | Evidence |
|---|---|---|---|
| Endpoint autenticado de comprobante completo | Usuario consulta su propio comprobante | PASS | e2e [11.1] 200 + eleccion_resumen |
| Endpoint autenticado de comprobante completo | Peticion sin autenticacion es rechazada | PASS | e2e [11.3] 401 |
| Endpoint autenticado de comprobante completo | Comprobante de otro usuario es rechazado | PASS | e2e [11.2] 403, identico a votoId inexistente |
| Pagina de comprobante unico, sin listado agregado | Acceso via enlace del correo | PASS | ComprobantePage mounted only inside AuthGuard/Enrutador |
| Pagina de comprobante unico, sin listado agregado | Acceso via URL directa equivalente | PASS | rutas.ts direct route variant |
| Pagina de comprobante unico, sin listado agregado | No existe listado agregado en el alcance | PASS | grep found no aggregate listing surface in frontend |

## Design Coherence

Design.md's decisions D1-D15 were spot-checked against code and match: D1 (schema shape --
FK+UNIQUE(voto_id) confirmed), D2 (pure renderer, content materialized in tx -- confirmed, with
disclosed spec-text deviation noted below), D3 (usuario_id from locked row, not session --
confirmed at votos.service.ts:343), D4 (no try/catch -- confirmed), D8 (processor is a pure
function over ports, no PrismaClient import -- confirmed), D11 (endpoint keyed by opaque votoId,
403 uniform -- confirmed), D12 (route /comprobante/:votoId, checkbox replaced by informational
line -- confirmed in PanelComprobante.tsx), D13 (read-only reconciliation script -- confirmed),
D14 (ADR-0018 in-place edit, Contexto/Decision untouched -- confirmed).

Two documented, disclosed deviations (already logged in design.md's own "Desviaciones respecto de
la propuesta" section and in apply-progress):

1. Email body materialized inside the transaction rather than rendered by the worker at dispatch
   time (contradicts proposal.md's literal step 2; justified by asunto/cuerpo being NOT NULL
   since #2, and by making the "never reveals the election" guarantee verifiable on the persisted
   row rather than only at send time).
2. `apps/backend/jest.config.ts` testRegex widened to also match `scripts/*.spec.ts` (not listed
   in design.md's file table) -- minor tooling change to make reconciliar-outbox.spec.ts runnable
   via the standard test command.

Neither breaks a spec requirement; both are WARNING-level, not CRITICAL.

## Issues

### CRITICAL
None found.

### WARNING

1. The outbox-correo spec's "Contenido del correo" requirement text ("unicamente con
   codigo_comprobante, hora y enlace") is narrower than the implemented email body, which also
   includes `proceso.nombre`. The deviation is intentional and disclosed in design.md, and does
   not violate the actual security property (the election is never included) -- but the written
   spec text itself was not updated to reflect the final "and the process name" content. Recommend
   updating the spec wording in a follow-up so the requirement matches the shipped behavior.
2. Full serial `test:e2e` run (all 32 files together) shows pre-existing cross-suite
   test-isolation flakiness unrelated to #15 (`procesos-*`, `importacion`, `padron` suites),
   confirmed present in a fresh session. Worth a separate investigation outside this change's
   scope; does not block this change since every #15-owned e2e file passes in isolation against a
   freshly migrated database.

### SUGGESTION

1. `apps/backend/jest.config.ts` testRegex widening for `scripts/*.spec.ts` is reasonable but not
   reflected in design.md's file-change table; worth a one-line note for future readers.
2. A `JobCorreo` in `fallido` state has no manual-retry or alerting surface today (already flagged
   as an open question in design.md, not a defect of this change).

## Success Criteria (from proposal.md) -- all confirmed

- [x] Voto + JobCorreo confirmed in the same transaction; e2e proves commit/rollback together
- [x] ADR-0018 state is "Superado por #15"
- [x] Worker sends in batches, retries with a bound, idempotent by job id
- [x] No sent email reveals the election (code/hora/enlace/proceso name only)
- [x] Authenticated endpoint returns full comprobante (with eleccion_resumen) for a voto_id
- [x] Access is via direct link/URL; no aggregated "Mis votaciones" listing exists in scope
- [x] JobCorreo migration is additive/nullable; no existing column renamed/reordered
- [x] Reconciliation mechanism exists, read-only, not run against real data (greenfield)

## Final Verdict

**PASS WITH WARNINGS** -- 0 CRITICAL, 2 WARNING, 2 SUGGESTION. Implementation matches
proposal/design/specs for both capabilities (outbox-correo, comprobante-autenticado). All
target-scoped tests (worker unit, backend votos unit, both #15 e2e suites, frontend unit,
typecheck) pass against real infrastructure re-run independently in this verification session.
Ready for sdd-archive.
