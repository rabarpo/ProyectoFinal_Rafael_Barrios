```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:cb1fdcaab68d7a65c9cf4bb4181ac7c5d1b72b8ceb3a370d645c1bd3139cec04
verdict: pass
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 11/11
test_command: pnpm --filter @seei/backend test -- votos
test_exit_code: 0
test_output_hash: sha256:e7eb224f95f366750a2d031923419911aba211956a628ac060cccd92f202bdd7
build_command: pnpm turbo run typecheck --force
build_exit_code: 0
build_output_hash: sha256:4362faa93cd02b17f25c9ea224ea4b75464f6671d04530ebea7ea25727b6bb63
```

## Verification Report

**Change**: vote-casting (Backlog #14 - Emision del voto en 3 pasos)
**Version**: N/A (single spec revision, amended pre-sdd-tasks for D2)
**Mode**: Strict TDD (apply-progress artifact sdd/vote-casting/apply-progress found and used as the
TDD-cycle evidence source; cross-referenced against real code and fresh test execution, not trusted
blindly)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 94 |
| Tasks complete (checked) | 94 |
| Tasks incomplete | 0 |
| Tasks verified against real code/tests (not just checkmarks) | 94/94 |
| PR commits confirmed present on branch | 6/6 (34b9adc, 01dd91b, d01e0af, 29804d2, d738e1a, c2dbcb7) |

### Build & Tests Execution

Build (typecheck, forced/uncached): PASSED
```text
$ pnpm turbo run typecheck --force
Tasks: 7 successful, 7 total (backend, contracts, frontend, worker)
```

Backend unit tests, scoped to this change: 30 passed / 0 failed
```text
$ pnpm --filter @seei/backend test -- votos
PASS src/votos/comprobante.spec.ts
PASS src/votos/papeleta.service.spec.ts
PASS src/votos/votos.service.spec.ts
PASS src/votos/votos.controller.spec.ts
Tests: 30 passed, 30 total
```

Backend full unit suite: re-run twice, non-deterministic - 479/483 then 481/483. All failures are
confined to src/auth/bloqueo.service.spec.ts (Redis TTL/timing race, e.g. expecting 2 and
getting 1 on a rapid-fire counter test, and an updateMany/$transaction call-count race) and
src/importacion/importacion.service.spec.ts (a 5000ms Jest hook timeout generating/processing a
2001-row CSV - the same pre-existing perf-sensitive flake apply-progress already disclosed).
ZERO of the flaky failures are in src/votos/* - all four votos unit suites pass cleanly and
identically on both runs. Not scored against this change spec compliance; pre-existing,
unrelated to vote-casting.

Frontend tests: 209 passed / 0 failed (40/40 files)
```text
$ pnpm --filter @seei/frontend test
Test Files  40 passed (40)
Tests       209 passed (209)
```

Backend e2e (Docker brought up in this session, docker-compose.test.yml/.env.test), RE-EXECUTED:
- votos-emitir.e2e-spec.ts + votos-concurrencia.e2e-spec.ts, run with --runInBand (matching the
  project CI concurrency, since this machine default multi-worker Jest run causes unrelated
  cross-suite DB collisions on AnioEscolar @@unique([activo]) when many *.e2e-spec.ts files
  race in parallel against the same shared database - an environment/parallelism artifact affecting
  the WHOLE e2e suite, not specific to votos, confirmed by re-running serially): 18/18 passed,
  covering camino feliz, rollback intermedio, idempotencia por clave, colision 23505 real, las tres
  causas de rechazo, voto en blanco, doble derecho ADR-0011, hora_servidor bracketed contra
  clock_timestamp(), secreto del voto, inyeccion/derecho_voto_id no-UUID, y los tres arneses de
  concurrencia determinista (incluido el INSERT crudo sin commit - la prueba fuerte de PR4).
- votos-frontera-cierre.spec.ts (schema): 3/3 passed - frontera exacta [apertura, cierre) con
  now() constante dentro de una transaccion pg cruda.

Coverage: not available (no coverage tool run in this session)

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Transaccion atomica unica de emision del voto | Camino feliz | votos-emitir.e2e-spec.ts [11.2], votos.service.spec.ts [7.1] | COMPLIANT |
| Transaccion atomica unica de emision del voto | Fallo intermedio revierte todo | votos-emitir.e2e-spec.ts [11.3] (payload de auditoria malformado forzado, rollback confirmado) | COMPLIANT |
| Idempotencia por clave de cliente | Reintento con misma clave | votos-emitir.e2e-spec.ts [11.4], votos.service.spec.ts [6.3] | COMPLIANT |
| Colision de UNIQUE nunca burbujea como error | Segundo voto genuino con clave distinta | votos-emitir.e2e-spec.ts [11.5], votos.service.spec.ts [8.1]-[8.2] | COMPLIANT |
| Colision de UNIQUE nunca burbujea como error | Concurrencia real de dos conexiones | votos-concurrencia.e2e-spec.ts [13.1]-[13.3] (pg crudo sin commit, dos conexiones coordinadas, red probabilistica) | COMPLIANT |
| Validacion del derecho al voto dentro de la transaccion | Proceso cerrado | votos-emitir.e2e-spec.ts [11.6], votos.service.spec.ts [6.5] | COMPLIANT |
| Validacion del derecho al voto dentro de la transaccion | Derecho ya ejercido | votos-emitir.e2e-spec.ts [11.5], votos.service.spec.ts [6.6] | COMPLIANT |
| Secreto del voto en auditoria | Payload sin eleccion | votos-emitir.e2e-spec.ts [11.11], votos.service.spec.ts [7.4],[8.4], static grep of votos.service.ts construction sites | COMPLIANT |
| Boleta mobile-first de 3 pasos con voto en blanco explicito | Voto en blanco explicito | votos-emitir.e2e-spec.ts [11.8], votos.service.spec.ts [7.2], PasoBoleta.spec.tsx [17.1]-[17.2] | COMPLIANT |
| Doble derecho ADR-0011 sin salto a mitad de flujo | Cada derecho se ejerce de forma independiente | votos-emitir.e2e-spec.ts [11.9], BandaVotandoComo.spec.tsx [20.1]-[20.2] | COMPLIANT |
| Comprobante y punto de extension para JobCorreo | Hora de cierre y de comprobante coinciden | votos-emitir.e2e-spec.ts [11.10], votos-frontera-cierre.spec.ts [14.1]-[14.2] | COMPLIANT |

Compliance summary: 11/11 scenarios compliant, all with e2e/schema/unit evidence re-executed and
green in this session against real Postgres.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| POST /votos transaction (D2-D5,D7,D8,D10,D12,D16) | Implemented | votos.service.ts:228-330, single prisma.$transaction, one $queryRaw (D4) covering lock+validate+idempotency in one snapshot |
| DerechoVoto.estado derived, no migration | Implemented | schema.prisma has no estado column on DerechoVoto; state derived via voto_id IS NOT NULL subquery in D4 $queryRaw |
| now() sealing (D3) | Implemented | Same $queryRaw statement uses now() for both window checks and (via table DEFAULT now()) hora_servidor |
| 23505 capture outside callback (D5) | Implemented | catch block wraps this.prisma.$transaction(...), esColisionDeVoto() checks both meta.target string and column-array shapes |
| esColisionDeVoto real bug fix (PR4) | Implemented, correct | Handles Prisma real meta.target as a column-name array (not just constraint-name string); matches exact column sets, avoiding false positives from partially-overlapping constraints |
| RechazoVoto own transaction (D10) | Implemented | Thrown inside callback (rolls back cleanly), caught outside, auditoria.log runs in a fresh $transaction |
| Vote secrecy (D11) | Implemented | VOTO payload: proceso_id, derecho_voto_id, codigo_comprobante, hora_servidor; RECHAZO payload: proceso_id, derecho_voto_id, motivo - grepped, no forbidden keys in either construction site |
| Comprobante derivation (D12) | Implemented | comprobante.ts, Crockford Base32 of first 80 bits of Voto.id, deterministic |
| D6 status codes | Implemented | votos.controller.ts:64, res.status(resultado.creado ? 201 : 200), identical body |
| D9 error taxonomy | Implemented | votos.errors.ts matches design exactly: CAMPO_INVALIDO, SIN_DERECHO, VOTACION_CERRADA, DERECHO_YA_EJERCIDO, ELECCION_INVALIDA |
| D13 papeleta read endpoint | Implemented | papeleta.service.ts + GET /votos/papeleta/:id, additive tipo field on PapeletaProcesoDto only (PR5 gap-fix), does not touch PR2 transaction |
| D14/D15 frontend route, container, idempotency key | Implemented | rutas.ts variant votacion, VotacionPage.tsx, clave-idempotencia.ts (sessionStorage + in-memory fallback) |
| Both UNIQUE constraints present, no new migration | Implemented | schema.prisma:336-337, @@unique([proceso_id, derecho_voto_id]) and @@unique([proceso_id, clave_idempotencia]), both pre-existing from #2 |
| ADR-0018 created | Implemented | adrs/0018-ventana-temporal-jobcorreo-diferido.md exists, references ADR-0006/ADR-0012/A1, documents the three binding obligations and closure condition |
| [#15] Punto de extension JobCorreo marker | Implemented | votos.service.ts:327, immediately after auditoria.log(tx, VOTO, ...), before callback return |
| BandaVotandoComo wiring | NOT implemented (disclosed) | Component built and tested (3/3), but not imported/rendered in VotacionPage.tsx - confirmed by grep, zero matches. tasks.md 22.1 itself does not mandate this wiring; apply-progress discloses the exact reason (no name/aula-label data source exists yet) |
| Audit-event-types.ts bitacora entry for #14 | NOT found | design.md Cambios de archivos table lists audit-event-types.ts as Modify for the changelog comment documenting #14 as first emitter of VOTO/RECHAZO, but no vote-casting commit touches this file (confirmed via git log on the file: no vote-casting commit present) and the file changelog-comment block has no vote-casting/#14 entry |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 module location, DerechoVoto.usuario_id authorization, no @Roles | Yes | votos.module.ts/votos.controller.ts confirmed, @UseGuards(AuthGuard) only |
| D2 estado derived, no column/migration | Yes | Confirmed in schema, matches spec.md amended wording exactly |
| D3 now() for both window check and hora_servidor | Yes | Single $queryRaw, table DEFAULT now() |
| D4 single lock+validate+idempotency statement, FOR UPDATE OF dv | Yes | Exact SQL shape confirmed |
| D5 catch outside callback, both constraints recognized | Yes, plus a real fix | PR4 found and correctly fixed the meta.target array-of-columns case |
| D6 201 vs 200, identical body | Yes | Confirmed in controller |
| D7 idempotency via existing @@unique column, no new table | Yes | No ClaveIdempotencia table added |
| D8 aula defensive check folded into causa 2 | Yes | EXISTS(...ProcesoAula...) in the same $queryRaw, motivo: aula_no_corresponde |
| D9 taxonomy, 403 identical for ajeno/inexistente | Yes | Confirmed, no discriminating body |
| D10 RechazoVoto own transaction | Yes | Confirmed |
| D11 zero new audit keys, canonical payloads | Yes for payloads; changelog-comment obligation NOT fulfilled (see Correctness table) | |
| D12 comprobante derivation | Yes | Crockford Base32, 80 bits, deterministic, tested |
| D13 single papeleta read endpoint, not the validation | Yes | papeleta.service.ts separate from votos.service.ts, does not emit RECHAZO |
| D14 route/container/pieces split, single parametrized PantallaRechazo | Yes | 4-variant component confirmed, not 5 separate files |
| D15 sessionStorage + in-memory fallback idempotency key | Yes | clave-idempotencia.ts confirmed |
| D16 extension point marker + ADR-0018 | Yes | Marker present at exact designed location; ADR-0018 exists and is well-formed |
| Chained-PR delivery plan (PR1-PR6) reflected in commit history | Yes | 6 distinct commits confirmed on the shared feature branch, matching this repo established no-separate-branches convention |
| No-decomposition rule (BACKLOG.md): validation+UNIQUE+idempotency never separable | Yes | All three live together in PR2 single emitir() method (commit 01dd91b); PR3 (d01e0af) only adds the HTTP controller wrapper around the already-complete, already-tested transaction - it does not split the guarantee itself |

### Issues Found

CRITICAL: None

WARNING:
1. audit-event-types.ts is missing the changelog-comment entry that design.md Cambios de
   archivos table commits to adding (D11 - sin claves nuevas: solo la entrada de bitacora que
   documenta a #14 como primer emisor de VOTO/RECHAZO). No vote-casting commit touches this file.
   Functionally inert (VOTO/RECHAZO already exist from #3, the ADR-0016 trigger WHEN clause
   already covers both, and no new key was needed), but it breaks the project own established
   documentation convention (every other change that emits/introduces audit events has added a
   dated comment block to this file, as seen for #3 through #13). Does not affect spec compliance
   or the 0 votos duplicados guarantee.
2. Local (non-CI) full backend e2e/unit suite runs are non-deterministic when executed with Jest
   default multi-worker parallelism on this machine: cross-suite collisions on AnioEscolar
   @@unique([activo]) constraint and Redis-timing races in auth/bloqueo.service.spec.ts produce
   different failure sets on different runs (confirmed: 4 failures on one run, 2 on the next, all
   outside src/votos/*). This is a pre-existing environment/CI-parity issue (this repo CI job has
   no explicit --runInBand, relying on GitHub Actions typically-lower CPU count to naturally
   serialize workers) unrelated to this change; when run serially (--runInBand, matching the
   effective CI behavior), all votos-scoped, unit, e2e, and schema suites are 100 percent green and
   deterministic.
3. Backend full unit suite has a pre-existing timing flake (importacion.service.spec.ts, 5000ms
   Jest hook timeout on a 2001-row CSV generation/processing test) already disclosed by
   apply-progress. Confirmed unrelated: zero backend files were touched by any vote-casting PR.

SUGGESTION:
1. Consider raising the default Jest hook timeout (or chunking the CSV-generation setup) in
   importacion.service.spec.ts to remove the recurring pre-existing flake from future verify
   sessions noise, since it currently requires manual triage every time the full suite is run.
2. When #16/#20 (Mis votaciones) or a future revisit of #13 DerechoVoto read surface adds a
   student-name/aula-label field, wire BandaVotandoComo into VotacionPage at that point -
   apply-progress already flags this as the natural landing spot.

### Assertion Quality
No tautologies, ghost loops, or assertion-without-production-code-call patterns found across
votos.service.spec.ts (19 test cases, 44 assertions), votos.controller.spec.ts (3 cases, 8
assertions), papeleta.service.spec.ts (5 cases, 13 assertions), comprobante.spec.ts (3 cases, 4
assertions), and the eight frontend piece/container spec files (BandaVotandoComo, PantallaRechazo,
PanelComprobante, PasoBoleta, PasoConfirmacion, PasoInformacionProceso, VotacionPage,
clave-idempotencia - 6 to 14 assertions each). Tests consistently assert on distinct values (HTTP
status, error codes, row counts, SQL predicate results, audit payload keys/values, comprobante
codes) rather than trivial/empty checks. Mock-to-assertion ratios stay well under 2x throughout.

Assertion quality: All assertions verify real behavior

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress (Engram topic sdd/vote-casting/apply-progress) reports a full RED/GREEN/REFACTOR table for PR6; prior PRs evidence referenced by tasks.md own RED/GREEN task pairing throughout all 22 phases |
| All tasks have tests | Yes | 94/94 tasks map to RED items across unit (backend+frontend), e2e, and schema layers |
| RED confirmed (tests exist) | Yes | All referenced test files exist: votos.service.spec.ts, votos.controller.spec.ts, papeleta.service.spec.ts, comprobante.spec.ts, votos-emitir.e2e-spec.ts, votos-concurrencia.e2e-spec.ts, votos-frontera-cierre.spec.ts, 8 frontend spec files |
| GREEN confirmed (tests pass) | Yes | Re-executed this session: 30/30 backend unit (votos-scoped), 209/209 frontend, 18/18 e2e, 3/3 schema - all green |
| Triangulation adequate | Yes | Multiple scenarios per requirement (e.g. three concurrency arneses for the same guarantee, four rejection-cause branches), distinct expected values throughout |
| Safety Net for modified files | Yes | apply-progress documents pre-existing suites staying green alongside new tests at each PR boundary (e.g. PR6: 206 pre-existing frontend tests stayed green while 3 new ones went RED to GREEN) |

TDD Compliance: 6/6 checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (backend) | 30 | 4 | Jest, mocked PrismaService/$queryRaw |
| Integration (frontend, votos-specific) | approx 60 (9 spec files, 5-14 assertions each) | 9 | Vitest + Testing Library |
| E2E (backend, real Postgres/Redis) | 18 | 2 | Jest + real HTTP + Prisma + raw pg |
| Schema | 3 | 1 | Jest + raw pg client |
| Total (votos-scoped, backend) | 51 | 7 | |

Note: exact votos-only frontend test count was not isolated from the full 209 in this session; the
full 40/40 files, 209/209 tests figure is reported as-is and includes pre-existing procesos,
candidatos, and auth frontend suites in addition to the 9 votos-specific spec files.

---

### Changed File Coverage
Coverage analysis skipped, no coverage tool run in this verify session (not blocking per protocol).

---

### Quality Metrics
Linter: not run in this session
Type Checker: No errors (pnpm turbo run typecheck --force, 7/7 tasks green)

### Verdict
PASS. Implementation matches proposal/spec/design across all 8 requirements and 11 scenarios; all
94 task checkmarks in tasks.md verified against real code, not trusted blindly. Backend-unit
(votos-scoped, 30/30), frontend (209/209), backend e2e (18/18, re-run serially to match this repo
effective CI concurrency), and schema (3/3) suites all re-executed and green in this session against
real Postgres; typecheck re-executed and green (7/7 packages). The BACKLOG.md no-decomposition rule
is honored: validation+UNIQUE+idempotency ship together, indivisibly, in PR2 (01dd91b); PR3 only
adds the HTTP wrapper. Vote secrecy confirmed by direct source inspection of both audit-payload
construction sites (VOTO and RECHAZO) - neither contains any of the five forbidden keys. The
PR4 esColisionDeVoto() fix is correct and does not reintroduce any gap. ADR-0018 exists, is
well-formed, and correctly documents the disclosed JobCorreo deferral window. BandaVotandoComo
non-wiring is a genuinely disclosed, non-blocking gap consistent with apply-progress own account -
the double-derecho prevention mechanism (the UNIQUE constraint, D4/D5) is fully independent of the
band UI wiring and was verified working via the ADR-0011 e2e scenario [11.9]. One WARNING (missing
audit-event-types.ts changelog comment) does not affect spec compliance, runtime behavior, or the
0 votos duplicados guarantee - it is a documentation-convention gap only. No CRITICAL findings.
Ready for archive once the WARNING is acknowledged (or fixed) by the orchestrator/user.
