# Verification Report: dashboard-panel-jornada (Backlog #20)

**Mode**: openspec (full artifact set: proposal, design, specs x2, tasks)
**Verifier**: sdd-verify
**Date**: 2026-08-23

## Completeness

All 71 tasks in `tasks.md` are marked `[x]`. No unchecked tasks found across PR1-PR4 (Phases 1-15).

## Test / Build Evidence (executed live, not taken from tasks.md claims)

| Command | Result | Notes |
|---|---|---|
| `pnpm --filter @seei/backend test -- panel-jornada` | PASS: 3 suites / 28 tests | See discrepancy note below (tasks.md 6.1 claims "4 suites / 34 tests") |
| docker compose up + prisma migrate deploy + jest --testPathPattern panel-jornada (test/jest-e2e.config.ts) against ephemeral Postgres+Redis | PASS: 1 suite / 9 tests, 7.9s | Matches tasks.md 5.10/15.3 exactly |
| `pnpm --filter @seei/backend test` (full unit suite, real Redis up) | 48/50 suites, 578/581 tests | 2 flaky suites this run: session.service.spec.ts (TTL timing), importacion.service.spec.ts (5000ms timeout under load). Re-ran once: a different subset (bloqueo, session) flaked instead - confirms genuine non-determinism (timing/load-sensitive real-Redis tests), not a deterministic regression. All panel-jornada suites passed in every run. |
| `pnpm --filter @seei/backend test` (no Redis available) | 4 suites fail deterministically (recovery, bloqueo, session, importacion) | Expected: these "unit" specs open a real ioredis client to localhost:6380; without the ephemeral Redis container they cannot connect. Not a regression - same behavior pre-dates this change. |
| `pnpm --filter @seei/frontend test` | PASS: 85/85 files, 597/597 tests | Matches tasks.md 15.2 exactly |
| `pnpm typecheck` (turbo, 4 packages) | PASS, clean | backend, contracts, frontend, worker all pass, including openapi:extract/generate:contracts |
| `pnpm --filter @seei/frontend build` | PASS: 789 modules transformed, no errors | Matches tasks.md 15.5 exactly |

Verdict on regression claim: the change's own reported baseline ("539/540 backend, 597/597 frontend, 1 unrelated flake") is not exactly reproducible as stated - the actual pre-existing flake surface is 2-4 suites (recovery/bloqueo/session/importacion) depending on machine load and Redis availability, not a single flaky test. This is consistent with what tasks.md itself documents in notes 6.2/10.3/15.3 (Redis-race flakiness under parallel Jest, importacion timeout under load) - it is a pre-existing, undisputed, out-of-scope flakiness class, confirmed to be unrelated to any file touched by panel-jornada (none of the flaky suites are in src/panel-jornada/). No CRITICAL here, but the exact "1 flake" framing in the task prompt undersells the real flake surface - WARNING.

## Spec Compliance Matrix - panel-jornada

| Requirement | Status | Evidence |
|---|---|---|
| Autorizacion restringida a tres roles (403/401) | PASS | @Roles('administrador','director','comite') class-level in panel-jornada.controller.ts; e2e [5.1]/[5.2]/[5.3] pass live |
| Procesos activos reutiliza GET /procesos?estado=abierto | PASS | No new endpoint added for this; SelectorProcesoActivo receives procesos via props, sourced externally per design |
| Conteo estudiantes/vinculos apoderado-estudiante sin dedup | PASS | calcularInstitucion: apoderado.count() raw, no distinct; unit [3.1] asserts exact call args |
| % participacion scoped por proceso | PASS | calcularParticipacion reused from procesos/escrutinio.ts; unit + e2e cover |
| Votos por hora | PASS (impl.) / WARNING (spec text stale) | Implementation correctly uses hora_servidor (design D4 explicitly corrects an exploration error: Voto.creado_en does not exist in schema). spec.md literal requirement text still says "basada en Voto.creado_en" - never corrected. See Issues. |
| Avance por aula + umbral rezagada (server-side) | PASS | avanceAulas(): relative threshold rezagada = padron>0 && porcentaje <= global - UMBRAL_REZAGO_PP; unit [3.8]/[3.8b]/[3.9] cover exact boundary, one-above-boundary, and padron=0 cases |
| Correos fallidos scoped por proceso, mismos 3 roles | PASS | jobCorreo.count({proceso_id, estado:'fallido'}) inside resumen(), same guard/roles as rest of controller |
| Modo proyeccion sin desglose por candidato (D8) | PASS | proyeccion() structurally never imports/calls calcularEscrutinio; ProyeccionDto has no desglose/blancos/dimension fields; unit [3.11]/[3.11b] + e2e [5.9] assert Object.keys(...) exact set for both ocultar_resultados true/false |
| Sondeo periodico con intervalo configurable | PASS | usePanelSondeo generic hook, INTERVALO_PANEL_MS=15s / INTERVALO_PROYECCION_MS=30s; unit test asserts refetch timing with fake timers |

## Spec Compliance Matrix - menu-navegacion-post-login (delta)

| Requirement | Status | Evidence |
|---|---|---|
| Aterrizaje post-login por rol incluye "Panel de jornada" (admin/director/comite) | PASS | MENU_POR_ROL includes PANEL_JORNADA for those 3 roles, absent for docente/estudiante; menu-por-rol.spec.ts [12.5]/[12.6] |
| Navegacion a Panel de jornada reutiliza ruta nueva | PASS | Ruta { nombre: 'panel-jornada' }, distinct from resultados/proyeccion; Enrutador.tsx case wired to real PanelJornadaPage |
| Ruta de proyeccion sin item de menu, protegida | PASS | No proyeccion entry ever added to MENU_POR_ROL (structural, not filtered); RUTAS_SIN_SHELL=['proyeccion'] in App.tsx; backend guard still applies (e2e [5.1] covers docente 403 on getProyeccion, part of ENDPOINTS_SCOPED) |

## Design Decision Verification

| # | Decision | Status | Evidence |
|---|---|---|---|
| D1 | Modulo propio panel-jornada/, no extiende ProcesosController | PASS | Separate controller/service/module, sibling to procesos/ |
| D2 | 5 endpoints separados bajo /panel-jornada | PASS | institucion, resumen, votos-por-hora, avance-aulas, proyeccion - all confirmed in controller + openapi.json |
| D3 | Avance por aula sobre DerechoVoto.aula_snapshot | PASS | avanceAulas() groups by aula_snapshot, not live Matricula |
| D4 | Serie horaria sobre Voto.hora_servidor, not creado_en | PASS (code) / WARNING (spec.md not updated) | calcularVotosPorHora raw SQL uses hora_servidor. See Issues. |
| D5 | Cache Redis por agregacion | PASS | 4 distinct cache keys (institucion, resumen:{id}, votos-hora:{id}, avance-aulas:{id}); proyeccion reuses them, no 5th key |
| D6 | Panel respeta ocultar_resultados sin excepcion | PASS - verified structurally + at runtime | calcularResumen branches on proceso.ocultar_resultados; hidden branch never calls calcularEscrutinio - confirmed via jest spy (unit [3.4]/[3.6]) AND live e2e [5.7] (admin/director/comite all see estado_visibilidad:'oculto', no desglose/blancos/dimension) |
| D7 | Umbral relativo, evaluado en servidor | PASS | UMBRAL_REZAGO_PP env-configurable, computed server-side, rezagada:boolean in payload |
| D8 | proyeccion() nunca invoca calcularEscrutinio | PASS - verified structurally + at runtime | Source has zero call path to calcularEscrutinio from proyeccion(); unit [3.11]/[3.11b] + e2e [5.9] assert exact key set for both visibility states |
| D9 | usePanelSondeo generico, local al modulo nuevo | PASS | useResultadosEnVivo untouched (confirmed: not present in this change's diff scope) |
| D10 | /proyeccion/:procesoId fuera de AppShell | PASS | RUTAS_SIN_SHELL=['proyeccion'] in App.tsx; App.spec.tsx [14.5] confirms no header/sidebar rendered |
| D11 | 404 inexistente / 409 ESTADO_INVALIDO en borrador | PASS | guardarProceso() throws NotFoundException/ConflictException({codigo:'ESTADO_INVALIDO'}); unit [3.2]/[3.3] + e2e [5.5]/[5.6] |

## Threat Matrix Verification

| Threat | Status | Evidence |
|---|---|---|
| /proyeccion sin id, /proyeccion/../../etc/passwd, /panel-jornada/algo -> no-encontrada | PASS | rutas.spec.ts covers all three; parsearRuta never throws |
| Rol no autorizado navega a mano a /panel-jornada | PASS | MENU_POR_ROL is presentation-only; backend guard is the real gate - e2e [5.1] confirms 403 for docente across all 5 endpoints including proyeccion |
| Fuga de desglose por la puerta de proyeccion | PASS | See D8 evidence above |

## Access-Control Sweep (explicit ask from the request)

- docente/estudiante -> 403 on all 5 endpoints: confirmed live via e2e [5.1] (loop over ENDPOINTS_SCOPED + institucion).
- No session (401): confirmed live via e2e [5.2].
- ocultar_resultados respected without exception for all 3 authorized roles (admin/director/comite) in resumen(): confirmed live via e2e [5.7] - all three roles receive estado_visibilidad:'oculto' with the fields structurally absent.

## Issues

### WARNING - spec.md requirement text not corrected after design.md fixed a factual error (D4)
specs/panel-jornada/spec.md, Requirement "Votos por hora", states: "basada en Voto.creado_en". design.md D4 explicitly documents that Voto.creado_en does not exist in schema.prisma and corrects the field to hora_servidor. The implementation correctly uses hora_servidor (verified in panel-jornada.service.ts), so there is no functional gap - but the spec's literal requirement text is now factually wrong and was never updated to match the corrected design decision. This is a documentation-hygiene gap, not a behavior gap.

### WARNING - task-reported test counts don't match live execution for backend unit suite
tasks.md 6.1 claims panel-jornada unit tests = "4 suites / 34 tests". Live execution shows 3 suites / 28 tests (panel-jornada.service.spec.ts, panel-jornada.constantes.spec.ts, panel-jornada-cache.spec.ts - no 4th spec file exists under src/panel-jornada/). All pass; this is a reporting/count discrepancy in the task log, not a missing-coverage issue.

### WARNING - reported backend regression baseline understates real flake surface
The task prompt's "1 flake (importacion.service.spec.ts)" undercounts what's actually observed live: depending on Redis availability and machine load, 2-4 suites (recovery, bloqueo, session, importacion) can fail non-deterministically. This matches tasks.md's own internal notes (6.2/10.3/15.3) about pre-existing Redis-race/timing flakiness under parallel Jest - so it is not a regression introduced by this change (none of the flaky files are touched by panel-jornada), but the specific "1 flake" framing repeated verbatim through PR2/PR3/PR4 checkpoints is optimistic relative to what a fresh run actually shows.

No CRITICAL issues found.

## Final Verdict: PASS WITH WARNINGS

All spec requirements, all design decisions (D1-D11), and all threat-matrix rows have both source-level and runtime-test evidence. D6/D8 (the two decisions the user called out as non-negotiable) are independently confirmed by live e2e execution, not just static code review. The three WARNINGs above are documentation/reporting-hygiene gaps in tasks.md/spec.md, not functional regressions, and do not block archival - but spec.md's stale D4 reference should be corrected for future readers before/at archive time.
