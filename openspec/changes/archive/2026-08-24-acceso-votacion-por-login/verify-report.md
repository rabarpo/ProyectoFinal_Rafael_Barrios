```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4a35b630bf2a2a094e22dae7d378ef499abc41660e7f754e74fba424de3ae5c1
verdict: pass
blockers: 0
critical_findings: 0
requirements: 6/6
scenarios: 11/11
test_command: pnpm --filter frontend test AND pnpm --filter backend test votos
test_exit_code: 0
test_output_hash: sha256:d8367e09f48f267a3ed6fe88f728c9e0a04da29011bafd4b0d63a34eec457597
build_command: pnpm generate:contracts
build_exit_code: 0
build_output_hash: sha256:e2689fb74b5719d1b53b403a46f2cb6e60747b7c6882332a521c98a9554b0d4f
```

## Verification Report

Change: acceso-votacion-por-login (backlog #30)
Version: N/A
Mode: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 21 |
| Tasks complete | 21 |
| Tasks incomplete | 0 |

### Build and Tests Execution

Contract build (D8 gate): PASSED
- pnpm generate:contracts ran with a full turbo cache hit (backend openapi:extract cache hit, contracts generate cache hit).
- git diff --stat -- packages/contracts is empty: zero drift against current code.

Scoped tests (authoritative for this change): PASSED
- pnpm --filter frontend test: Test Files 86 passed (86), Tests 606 passed (606), exit code 0.
- pnpm --filter backend test votos: 7 suites passed, 50 tests passed, exit code 0 (correo-comprobante, comprobante, comprobante.service, votos.service, mis-derechos.service, papeleta.service, votos.controller).

Full monorepo run (pnpm turbo run test): exit code 1, NOT a regression of this change.
- Backend: 4 suites failed, 50 passed, 54 total; 31 tests failed, 601 passed, 632 total.
- Frontend: 86/86 files, 606/606 tests passed.
- Failures are entirely confined to apps/backend/src/auth/session.service.spec.ts, bloqueo.service.spec.ts, recovery.service.spec.ts, all failing on MaxRetriesPerRequestError / hook timeout while connecting to Redis.
- Verified environmental, not caused by this change:
  - netstat -an showed no listener on port 6379 (no local Redis server running in this sandbox).
  - git log -1 for apps/backend/src/auth/ shows the last touch was an unrelated prior PR (auth OpenAPI decoration), and git status --porcelain for that directory is empty for this change.
  - auth.guard.spec.ts, the guard this change actually depends on via class-level UseGuards, does not touch Redis and passes.

Coverage: not measured this session (no coverage tool run) -> not available.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Listado propio scoped al usuario de sesion | Sin sesion -> 401 | Structural: class-level UseGuards(AuthGuard); auth.guard.spec.ts proves the 401 path generically; no dedicated per-route unit test | COMPLIANT (structural) |
| Listado propio scoped al usuario de sesion | Parametro usuario_id ignorado | votos.controller.spec.ts, case [1.3][adversarial] usuario_id ajeno en query | COMPLIANT |
| Filtro por procesos abiertos y orden por cierre | Multiples procesos abiertos ordenados | mis-derechos.service.spec.ts [1.2] devuelve ambas entradas, cierre mas proximo primero | COMPLIANT |
| Filtro por procesos abiertos y orden por cierre | Proceso cerrado excluido | mis-derechos.service.spec.ts [1.2] proceso cerrado no aparece + where assertion (estado abierto, fecha_cierre_prevista gt now) | COMPLIANT |
| Separacion por calidad de derecho (ADR-0011) | Estudiante y padre coexisten | mis-derechos.service.spec.ts [1.2] estudiante y padre coexisten, entradas separadas | COMPLIANT |
| Estado ya votaste sin exponer la eleccion | Derecho ya ejercido | mis-derechos.service.spec.ts [1.2] ya_voto true + [1.4][contrato] Object.keys assertion | COMPLIANT |
| Estado ya votaste sin exponer la eleccion | Derecho pendiente | mis-derechos.service.spec.ts [1.2] ya_voto false | COMPLIANT |
| Estado vacio generico | Sin derechos vigentes | mis-derechos.service.spec.ts [1.2] rol sin DerechoVoto devuelve lista vacia | COMPLIANT |
| Estado vacio generico | Rol sin DerechoVoto (docente y roles de gestion) | MENU_POR_ROL.docente = [] + menu-por-rol.spec.ts [5.4] + InicioPage.spec.tsx [6.2] docente empty state; endpoint has no role branching, same empty-list path | COMPLIANT |
| Aterrizaje frontend con navegacion bloqueada | Click en derecho pendiente navega a la boleta | MisVotacionesPage.spec.tsx [4.3] click en entrada pendiente navega a votar/derechoVotoId | COMPLIANT |
| Aterrizaje frontend con navegacion bloqueada | Entrada ya votada no es clickeable | MisVotacionesPage.spec.tsx [4.3] entrada ya votada bloqueada, sin handler | COMPLIANT |

Compliance summary: 11/11 scenarios compliant (1 structural, justified below).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| GET /votos/mis-derechos never reads usuario_id from query/param/body | Implemented | votos.controller.ts handler arity is Req only, no Query()/Param() decorator present |
| Filter window matches emitir() window (D1 spec amendment) | Implemented | mis-derechos.service.ts uses estado abierto, fecha_cierre_prevista gt now, matches votos.service.ts window; spec.md text already carries the D1 wording |
| en_calidad_de never collapsed | Implemented | mis-derechos.service.ts maps 1:1, no grouping or reduce |
| DTO never serializes election-revealing fields | Implemented | mi-derecho-voto.dto.ts declares only derecho_voto_id, en_calidad_de, ya_voto, proceso fields; no lista_id/opcion_id/candidato_id/blanco/codigo_comprobante, not even voto id |
| docente gets no menu item, no endpoint branching | Implemented | menu-por-rol.ts docente is empty array; endpoint has no role branching, relies on DerechoVoto never existing for that role |
| POST /votos untouched | Implemented | votos.service.ts emitir() and its spec file are byte-identical (git diff empty); POST describe block in votos.controller.spec.ts unmodified |

### Coherence (Design)
| Decision | Followed | Notes |
|----------|-----------|-------|
| D1 window uses fecha_cierre_prevista, not cierre_real | Yes | mis-derechos.service.ts; spec.md text matches amended D1 wording |
| D2 Prisma findMany, no raw SQL | Yes | this.prisma.derechoVoto.findMany used |
| D3 separate service, decoupled from emitir() | Yes | New MisDerechosService; votos.service.ts and papeleta.service.ts untouched and green |
| D4 flat array tagged by en_calidad_de | Yes | DTO is MiDerechoVotoDto array, no nested envelope |
| D5 user resolved only from req.usuario, no Query/Param, no Roles | Yes | Verified structurally and via [1.3][adversarial] test |
| D6/ADR-0010 ya_voto derived, no election field ever serialized | Yes | DTO closed shape, [1.4][contrato] test enforces Object.keys |
| D7 landing via MENU_POR_ROL, InicioPage.tsx untouched | Yes | git diff for InicioPage.tsx across the change is empty; card comes from MENU_POR_ROL.estudiante |
| D8 contracts regenerated before client consumption | Yes | votos-api.ts types MiDerechoVotoDto from generated schema; regeneration this session produced zero diff |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | apply-progress documents RED to GREEN per task, including one honestly reported deviation (Ruta discriminated-union cases written alongside their RED tests due to TypeScript compile-time constraints shared by every existing route variant) |
| All tasks have tests | Yes | 21/21 tasks; each RED task has a matching GREEN task and passing test file |
| RED confirmed | Yes | All listed spec files exist and were read directly during this verification |
| GREEN confirmed | Yes | Re-executed pnpm --filter frontend test (606/606) and pnpm --filter backend test votos (50/50) this session, both exit 0 |
| Triangulation adequate | Yes | Each scenario has at least one dedicated case with distinct expected values |
| Safety net for modified files | Yes | votos.service.spec.ts and papeleta.service.spec.ts re-ran green and unmodified |

TDD Compliance: 6/6 checks passed.

### Assertion Quality
No tautologies, ghost loops, or assertion-without-production-call patterns found across the new/modified test files reviewed (mis-derechos.service.spec.ts, votos.controller.spec.ts additions, MisVotacionesPage.spec.tsx, rutas.spec.ts additions, InicioPage.spec.tsx additions, menu-por-rol.spec.ts [5.4]). All assertions call production code and assert concrete, varying expected values.

Assertion quality: all assertions verify real behavior.

### Issues Found

CRITICAL: None

WARNING:
1. The Sin sesion to 401 scenario for GET /votos/mis-derechos has no dedicated per-route unit or e2e test; coverage is structural via the class-level UseGuards(AuthGuard) plus auth.guard.spec.ts proving the 401 path generically. This was reported honestly by the apply agent in task 1.3 rather than hidden. Judged sufficient because NestJS applies class-level guards to every handler in the class as a framework-level guarantee, the guard itself is independently unit-tested, and every other route in the same controller relies on the identical mechanism without a dedicated per-route 401 test either (existing codebase convention, not a new gap). Non-blocking recommendation: add one e2e case for this route without a session cookie for full black-box parity with POST /votos e2e coverage.
2. Tasks 6.2/6.3 evidence is API-level smoke against a real docker compose stack rather than a real browser click-through. Judged reasonable, not a gap: the smoke proves the exact response shape that MisVotacionesPage.spec.tsx and InicioPage.spec.tsx already assert against with RTL against jsdom, exercising real click dispatch and DOM assertions, not shallow mocked rendering. The remaining unverified slice is narrowly real-browser chrome rendering, not feature correctness.
3. The full pnpm turbo run test command exits 1 in this sandbox due to 4 unrelated backend auth suites failing on Redis-connection timeouts. Confirmed environmental (no Redis listener) and confirmed pre-existing (zero git diff under apps/backend/src/auth for this change). Not treated as a regression, but the raw exit code of the full monorepo command is misleading without this context; recommend a scoped CI gate or a Redis test-container for full-suite runs going forward.

SUGGESTION:
1. The NavegacionPrincipal.tsx / iconos-menu.tsx icon wiring and the menu-por-rol.spec.ts fixes were correctly identified as necessary consequences of populating estudiante with its first menu item (ICONO_POR_ID is a Record keyed by menu item id, so a missing entry throws at render time), not scope creep. Consider adding this ripple pattern to reusable design guidance for future first-item-for-a-role changes.
2. design.md flags the spec.md cierre_real wording as needing amendment before sdd-apply; spec.md as read during this verification already carries the amended D1 wording, confirming the amendment was applied. No outstanding action.

### Verdict
PASS WITH WARNINGS

21/21 tasks complete, 6/6 requirements and 11/11 scenarios compliant with passing runtime tests, all 8 design decisions (D1-D8) honored, contracts drift-free, and the only test failures present (4 backend auth suites) are confirmed pre-existing and environmental, unrelated to this change. The three WARNING items are informational or process-improvement notes; none represent an unimplemented requirement or a failing covering test within this change scope.
