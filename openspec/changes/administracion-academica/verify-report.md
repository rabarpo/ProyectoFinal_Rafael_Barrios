```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:732a07d54d70e1e9a85abc994fbc1165aba59e94a7d1870135fa529915b2d183
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 16/16
scenarios: 29/29
test_command: pnpm --filter @seei/backend test
test_exit_code: 1
test_output_hash: sha256:732a07d54d70e1e9a85abc994fbc1165aba59e94a7d1870135fa529915b2d183
build_command: pnpm --filter @seei/backend typecheck
build_exit_code: 0
build_output_hash: sha256:70685b4df7789c854b9e1ceab7d78a6d0f9a0831c11eb0010b7b5fdbe0e50c39
```

# Verify Report: administracion-academica (Backlog #8)

**Date**: 2026-08-08
**Scope**: full 7-PR chain (PR1 Cimientos, PR2 AnioEscolar CRUD, PR3 Activacion, PR4 Nivel+Grado,
PR5 Seccion, PR6 Aula+D6, PR7 Matricula+contrato), branch
administracion-academica-pr7-matricula, HEAD 70bfd8d
**Mode**: full artifact set (proposal + 3 specs + design + tasks) - Strict TDD active

**VERDICT: PASS WITH WARNINGS** (0 CRITICAL, 2 WARNING, 0 SUGGESTION)

## Environment constraint (same as #6/#7)

docker ps fails in this sandbox (failed to connect to the docker API) - no Docker daemon
available. pnpm test:e2e and pnpm test:schema cannot run against real Postgres/Redis in this
session. All 7 apply-progress agents documented this explicitly per PR as a pre-declared
environment limitation, not missing work: every e2e/integration/adversarial test that needs
Postgres is written and tsc --noEmit type-checked, with an equivalent unit-test-level GREEN
covering the same business logic via mocked Prisma. This is reported below as WARNING 1
(environment gap to close in real CI before merge), following the exact precedent set by
bloqueo-desbloqueo-cuentas (WARNING 1 there) and administracion-usuarios-apoderados.

## Task completeness

All 30 phases / ~140 sub-tasks in tasks.md are marked [x]. Verified against git log: 7 feat
commits + 7 docs(...): mark PRn tasks complete commits + 1 chore(contracts) commit, one per PR,
matching the 7-PR chain declared in design.md "Corte de PR recomendado" and tasks.md "Suggested
Work Units". No unchecked task found in openspec/changes/administracion-academica/tasks.md.

## Build/static evidence (re-run fresh, independent of apply-time claims)

- pnpm --filter @seei/backend typecheck (tsc --noEmit): exit 0, no errors.
- pnpm --filter @seei/contracts run check:drift (regenerates openapi.json/api.d.ts from the
  live Swagger document and diffs against the committed files): exit 0, "Contratos sincronizados."
  Confirms the PR7 contract regeneration is current and complete; packages/contracts/openapi.json
  contains all 6 resource groups plus the dedicated activation route:
  /anios-escolares, /anios-escolares/{id}, /anios-escolares/{id}/activar, /niveles,
  /niveles/{id}, /grados, /grados/{id}, /secciones, /secciones/{id}, /aulas,
  /aulas/{id}, /matriculas, /matriculas/{id} (no PATCH /matriculas/{id}, matching D3).
- git status --short packages/contracts/ after the drift check: clean, no uncommitted diff.

## Runtime test evidence

- pnpm --filter @seei/backend test (Jest, no live Postgres/Redis needed for unit specs): 241/271
  tests PASS across 19/22 suites, exit code 1. The 3 failing suites are
  session.service.spec.ts, bloqueo.service.spec.ts, recovery.service.spec.ts - all
  Redis-dependent, pre-existing (unrelated to this change, part of auth-server-sessions /
  bloqueo-desbloqueo-cuentas / google-oauth-y-recuperacion), failing only because no Redis
  daemon is reachable in this sandbox (MaxRetriesPerRequestError). Independently re-confirmed in
  this session, not merely asserted from apply-progress notes.
- Scoped to this change: pnpm --filter @seei/backend test -- academico -> 7/7 suites, 125/125
  tests PASS, exit code 0 (anios-escolares.service.spec.ts, aulas.service.spec.ts,
  grados.service.spec.ts, matriculas.service.spec.ts, niveles.service.spec.ts,
  secciones.service.spec.ts, prisma-errores.spec.ts). Zero regression in PR1-PR6 modules caused
  by PR7.
- e2e (apps/backend/test/academico/*.e2e-spec.ts, one per entity, supertest + live Postgres)
  and test/schema/auditoria.spec.ts [TM4]: written and tsc --noEmit clean, not executable
  in this sandbox (no Docker). See WARNING 1.

## D1 - Activacion de anio escolar, concurrencia (re-inspected in depth per instructions)

AniosEscolaresService.activar() (apps/backend/src/academico/anios-escolares.service.ts:284-316)
implements the exact order design.md D1 requires: desactivar -> activar inside one
$transaction, idempotent short-circuit when the target is already active (no audit row), and a
catch that distinguishes the partial-index collision (P2002, target contains activo) from a
plain nombre unique violation via objetivoContiene().

The originally-failing concurrency test (design.md tasks 10.4/10.5) is now
anios-escolares.service.spec.ts:346-486, describe block "concurrencia simulada". The fix is
structurally sound: the mock models a FIFO write-lock held until the entire $transaction
callback resolves (not just the individual statement), released only in a finally, and
updateMany/update re-read live state at unlock time (READ COMMITTED semantics) - this matches
design.md's documented concurrency table line-for-line ("el updateMany de T1 toma el lock...T2 se
bloquea, y al desbloquearse reevalua su where..."). Re-ran pnpm --filter @seei/backend test --
anios-escolares 3 consecutive times: [10.4] and [10.5] GREEN every run, no flakiness
observed. This corroborates the apply-time claim of "estable en 8+ corridas repetidas". The real
Postgres-backed concurrency e2e (Promise.all over supertest) remains written but unexecuted
(WARNING 1) - the mock is a credible substitute given how precisely it encodes Postgres's documented
partial-unique-index lock behavior, but it is not a substitute for the real-DB adversarial run
required by "Strict TDD Mode: enabled" before merge.

## D6 - Coherencia jerarquica (Aula-Seccion, Matricula-Aula)

- AulasService.crear() (aulas.service.ts:143-257): inside the same $transaction, after
  resolving Grado/Seccion/AnioEscolar, compares seccion.grado_id !== datos.grado_id and
  seccion.anio_escolar_id !== datos.anio_escolar_id, throwing 409 COHERENCIA_JERARQUICA with
  {campo, esperado, recibido} before the unicidad check and the create. Matches design.md D6 and
  spec scenarios "Aula con grado_id distinto..." / "...anio_escolar_id distinto...". Unit tests
  [22.1]/[22.2] GREEN.
- MatriculasService.crear() (matriculas.service.ts:113-227): after resolving
  Usuario/Aula/AnioEscolar and the rol === 'estudiante' check, compares
  aula.anio_escolar_id !== datos.anio_escolar_id, throwing 409 COHERENCIA_JERARQUICA before the
  unicidad check and the create. Matches spec "Coherencia jerarquica de Matricula con su Aula".
  Unit test [25.5] GREEN.

## Usuario.rol='estudiante' restriction in Matricula

MatriculasService.crear() checks usuario.rol !== 'estudiante' -> 409
USUARIO_NO_ES_ESTUDIANTE (same error code ApoderadosService used in #7 for the analogous
restriction), placed after existence checks and before the D6 coherence check, matching spec
"Matriculacion de un Usuario que no es estudiante se rechaza". Unit test [25.4] GREEN.

## ADR-0016 trigger untouched

apps/backend/src/auditoria/audit-event-types.ts adds exactly 18 new keys (4 ANIO_ESCOLAR_* + 3
NIVEL_* + 3 GRADO_* + 3 SECCION_* + 3 AULA_* + 2 MATRICULA_*), all additive to the
existing as const object - no removed/renamed keys. Directly inspected
prisma/migrations/20260807052206_append_only_audit/migration.sql:80-81: the trigger
eventoauditoria_claves_eleccion_trg clause is still literally
FOR EACH ROW WHEN (NEW.event_type IN ('VOTO','RECHAZO')) - zero SQL touched by this change. The
schema contract test test/schema/auditoria.spec.ts [TM4] (unmodified) asserts exactly this and
would fail if the clause changed; it could not run in this sandbox (WARNING 1) but its assertion is
structurally independent of the count of AUDIT_EVENT_TYPES keys, so the additive-only nature of
this PR cannot break it.

## Module registration and wiring (D0)

AcademicoModule (academico.module.ts) registers all 6 controllers/services, implements
NestModule, and applies cookieParser() via forRoutes(...) to all 6 controllers - no controller
omitted (an omission would silently 401 all its routes). AppModule.imports includes
AcademicoModule. All 6 controllers carry @UseGuards(AuthGuard, RolesGuard) +
@Roles('administrador', 'director') at class level (grep-confirmed across all 6
*.controller.ts files, zero misses).

## Spec compliance matrix

| Spec | Requirements | Scenarios | Runtime evidence |
|---|---|---|---|
| school-year-management | 4 | 8 | 20/20 GREEN unit tests covering all 8 scenarios (CRUD, activation, concurrency, delete-guard, audit); e2e written/type-checked, not run (Docker) |
| academic-tree-management | 7 | 13 | 71/71 GREEN unit tests (niveles+grados 28, secciones 18, aulas 25) covering all 13 scenarios incl. D6 coherence; e2e written/type-checked, not run |
| student-enrollment | 5 | 8 | 21/21 GREEN unit tests covering all 8 scenarios incl. role restriction and D6 coherence; e2e written/type-checked, not run |
| Total | 16 | 29 | 125/125 unit tests GREEN mapping 1:1 to all 29 scenarios; e2e/schema/integration layers written and type-checked but blocked by the sandbox's missing Docker daemon |

Unit-test counts by suite (from the fresh re-run above): anios-escolares.service.spec.ts 20,
niveles.service.spec.ts + grados.service.spec.ts = 28, secciones.service.spec.ts 18,
aulas.service.spec.ts 25, matriculas.service.spec.ts 21, prisma-errores.spec.ts 13 (shared
translator, not spec-scenario-specific) - sums to 125 total in the academico/ suite, matching
the fresh test -- academico run exactly.

## Design coherence (design.md D0-D6)

- D0 (single AcademicoModule, 6 controllers/services): confirmed in academico.module.ts.
- D1 (activation order + concurrency): confirmed above, no deviation.
- D2 (P2003 dual meaning, precheck + residual catch): confirmed in every eliminar()/crear() -
  spot-checked anios-escolares.service.ts (4-dependent guard) and aulas.service.ts
  (2-dependent guard incl. forward-looking ProcesoAula).
- D3 (flat routes, no re-parenting in PATCH, no PATCH for Matricula): confirmed -
  matriculas.controller.ts has no @Patch, update DTOs omit FK fields structurally.
  Zero deviation on the "campos no declarados ni siquiera compilan" claim (Partial-Pick types).
- D4 (18 additive audit keys, ADR-0016 untouched): confirmed above.
- D5 (error catalog, 400/404/409 split): confirmed - academico.errors.ts union includes
  RESTRICCION_UNICA, REFERENCIA_INEXISTENTE, ENTIDAD_CON_DEPENDIENTES,
  ACTIVACION_CONCURRENTE, CAMPO_INVALIDO, COHERENCIA_JERARQUICA, USUARIO_NO_ES_ESTUDIANTE
  (7 codes, matching design.md D5 + the resolved D6 addition).
- D6 (hierarchical coherence guards): confirmed above for both Aula and Matricula.

No design deviation found beyond the two explicitly declared in tasks.md (task 1.1's NestModule
deferral to PR2, and task 3.4's extra pure helper relacionDesdeFieldName), both already documented
as intentional, non-breaking deviations with rationale - consistent with the precedent set in #7.

## Success Criteria (proposal.md) - all 4 confirmed

- [x] 6 entities have REST CRUD, authenticated + role-authorized - confirmed via controller
      inspection + contract paths.
- [x] Activating a school year atomically deactivates the previous one; concurrency produces a
      legible business error, not a raw 500 - confirmed via D1 code + concurrency unit tests.
- [x] FK-restricted DELETEs return a legible business message instead of propagating Postgres's
      raw error - confirmed via D2 precheck + residual catch pattern across all 6 entities.
- [x] Every write is recorded in audit within the same transaction - confirmed: every crear/
      actualizar/eliminar/activar calls this.auditoria.log(tx, ...) inside the same
      $transaction callback, spot-checked across all 6 services.

## Issues

CRITICAL (0): none.

WARNING (2):

1. (environment gap, same pattern as #6/#7, non-blocking for this sandbox but MUST be closed in
   real CI before merge) pnpm test:e2e and pnpm test:schema cannot run in this sandbox - no
   Docker daemon (docker ps fails). This affects every e2e/integration test across the 6
   test/academico/*.e2e-spec.ts files and test/schema/auditoria.spec.ts [TM4], including the
   real-Postgres concurrency adversarial test for D1 (Promise.all over supertest) and all
   real-Postgres D6 coherence/FK-guard scenarios. All are written and tsc --noEmit clean;
   equivalent unit-test coverage (125/125 GREEN, mocked Prisma) exists for every scenario, but a
   mock cannot fully substitute for Postgres's actual partial-unique-index locking behavior or its
   actual FK constraint enforcement. Recommend running the full test:e2e/test:schema suite
   against docker-compose.test.yml in CI or a Docker-enabled environment before merging to main,
   with particular attention to the D1 concurrency e2e test given it is the highest-risk piece of
   this change per design.md's own risk assessment.
2. (pre-existing, unrelated to this change, non-blocking) The same 3 Redis-dependent unit suites
   that failed in #6/#7's verify passes (session.service.spec.ts, bloqueo.service.spec.ts,
   recovery.service.spec.ts) still fail in this sandbox for the same reason (no Redis daemon
   reachable). Zero relation to administracion-academica's src/academico/ code; not a
   regression introduced by this change.

SUGGESTION (0): none.

## Next steps

Ready for sdd-archive from a spec/task/design-completeness standpoint: 30/30 task phases, 16/16
requirements, 29/29 scenarios all mapped to passing evidence (unit-test-level for all, full
e2e/schema-level pending a Docker-enabled run), clean typecheck, clean contract drift check, zero
design deviation beyond the two already declared and accepted. Both WARNINGs are non-blocking for
this sandbox and mirror the exact precedent already accepted for bloqueo-desbloqueo-cuentas and
administracion-usuarios-apoderados in this same repository - recommend running the full
test:e2e/test:schema suite in a Docker-enabled CI environment before the corresponding PR merges
to main, especially the D1 concurrency adversarial e2e test, but this does not block archiving the
SDD change record itself.
