# Tasks: Descubrimiento de derechos de voto propios al iniciar sesión

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380-430 (backend ~330, frontend ~230, minus overlap; generated contracts excluded) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend) → PR 2 (frontend) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (long-lived branch, tagged commits per project convention) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend: `GET /votos/mis-derechos` end-to-end (service + controller + module), contracts regenerated | PR 1 | `pnpm --filter backend test votos` | `pnpm --filter backend start:dev` + manual `curl -b session GET /votos/mis-derechos` | Revert `mis-derechos.*`, controller/module edits, regenerated `api.ts`; no schema/data change |
| 2 | Frontend: `/mis-votaciones` route, menu entry, `MisVotacionesPage`, `votos-api.misDerechos()` | PR 2 | `pnpm --filter frontend test votos rutas InicioPage` | `pnpm --filter frontend dev` + manual login as estudiante → click "Mis votaciones" | Revert routing/menu/page/api-client edits; backend endpoint stays functional standalone |

## Phase 1: Backend — RED (failing tests first)

- [x] 1.1 Create `apps/backend/src/votos/dto/mi-derecho-voto.dto.ts` with `ProcesoDerechoDto`/`MiDerechoVotoDto` shapes (D6/D4), no election-revealing fields.
- [x] 1.2 Create `apps/backend/src/votos/mis-derechos.service.spec.ts` (RED) covering: filter D1 (abierto/cerrado/borrador — spec scenarios "Múltiples procesos abiertos" & "Proceso cerrado excluido"), order by `fecha_cierre_prevista asc`, dual `en_calidad_de` not collapsed (ADR-0011 scenario), `ya_voto` true/false, empty list for role without `DerechoVoto`.
- [x] 1.3 Add controller-level RED cases to `apps/backend/src/votos/votos.controller.spec.ts`: `401` without session, handler receives `req.usuario` only, `?usuario_id=<ajeno>` has no effect on the query (threat-matrix IDOR row).
- [x] 1.4 Add contract RED case asserting `MiDerechoVotoDto` serialization excludes `lista_id`/`opcion_id`/`candidato_id`/`blanco`/`codigo_comprobante` (`Object.keys` assertion, ADR-0010/D6 threat-matrix row).

## Phase 2: Backend — GREEN

- [x] 2.1 Implement `apps/backend/src/votos/mis-derechos.service.ts::listar(sesion)` per design core query (D1/D2/D4/D6: `findMany` with `estado: 'abierto', fecha_cierre_prevista: { gt: new Date() }`, `orderBy fecha_cierre_prevista asc`, `votos take:1` → `ya_voto`). Make 1.2 and 1.4 pass.
- [x] 2.2 Add `@Get('mis-derechos')` to `apps/backend/src/votos/votos.controller.ts` with no `@Query()`/`@Param()`, resolving user from `req.usuario` only (D5). Make 1.3 pass.
- [x] 2.3 Register `MisDerechosService` in `apps/backend/src/votos/votos.module.ts` providers.
- [x] 2.4 Run `pnpm --filter backend test votos` — confirm 1.2/1.3/1.4 green and `votos.service.spec.ts`/`papeleta.service.spec.ts` unmodified and still green.

## Phase 3: Contract Sync (D8 gate — blocks Phase 4/5)

- [x] 3.1 Run `pnpm generate:contracts`; confirm `packages/contracts/src/generated/api.ts` includes `/votos/mis-derechos` and `MiDerechoVotoDto` schema.
- [x] 3.2 Run `pnpm check:drift` (or project's drift check) — diff reviewed and contains exactly the expected additions (`/votos/mis-derechos`, `MiDerechoVotoDto`, `ProcesoDerechoDto`), no unrelated drift. Exit code 1 is expected/correct here since the regenerated contracts are intentionally left uncommitted per this run's instructions (git-diff-based check compares against last commit); re-run after committing PR1 to get a clean exit.

## Phase 4: Frontend — RED (failing tests first)

- [x] 4.1 Add route RED cases to `apps/frontend/src/app/rutas.spec.ts`: `/mis-votaciones` parses/inverts (`rutaAPath`), `/mis-votaciones/algo` → `no-encontrada`.
- [x] 4.2 Split `apps/frontend/src/app/InicioPage.spec.tsx` case `[6.2]` into: docente still sees empty state (unchanged assertion), and estudiante now sees the "Mis votaciones" card (new RED assertion against `MENU_POR_ROL.estudiante`).
- [x] 4.3 Create `apps/frontend/src/votos/MisVotacionesPage.spec.tsx` (RED) with `votos-api` mocked: single fetch on mount (no polling), pending entry click navigates to `/votar/:derechoVotoId`, `ya_voto:true` entry renders blocked "Ya votaste" with no click handler, empty list renders generic message.

## Phase 5: Frontend — GREEN

- [x] 5.1 Add `misDerechos()` to `apps/frontend/src/votos/votos-api.ts`, typed against regenerated `@seei/contracts` schema.
- [x] 5.2 Add `mis-votaciones` route variant + `rutaAPath` case in `apps/frontend/src/app/rutas.ts`. Make 4.1 pass.
- [x] 5.3 Add `case 'mis-votaciones'` in `apps/frontend/src/app/Enrutador.tsx` rendering `MisVotacionesPage`.
- [x] 5.4 Add `MIS_VOTACIONES` entry and `estudiante: [MIS_VOTACIONES]` in `apps/frontend/src/app/menu-por-rol.ts`. Make 4.2 pass. Do NOT modify `InicioPage.tsx` (D7 — cards derive from `MENU_POR_ROL`).
- [x] 5.5 Create `apps/frontend/src/votos/MisVotacionesPage.tsx`: single-fetch container (style of `ComprobantePage`), renders entries, navigates to existing unmodified `/votar/:derechoVotoId` (`VotacionPage.tsx`) on pending click. Make 4.3 pass.

## Phase 6: Integration & Regression

- [x] 6.1 Run `pnpm turbo run test` — confirm full suite green, including unmodified `votos.service.spec.ts` and `VotacionPage.spec.tsx`. Frontend: 86/86 files, 606/606 tests green. Backend: all `votos/*` suites green (`votos.service.spec.ts`, `mis-derechos.service.spec.ts`, `votos.controller.spec.ts`, `comprobante.spec.ts`, `papeleta.service.spec.ts` unmodified/green); 4 unrelated `auth/*.spec.ts` suites (`session.service`, `bloqueo.service`, `recovery.service`) failed on Redis-connection timeouts — pre-existing sandbox infra limitation (no Redis server running), untouched by this change, confirmed by file diff (`git status` shows zero edits under `apps/backend/src/auth/`).
- [ ] 6.2 Manual smoke: login as estudiante with a `DerechoVoto` in an open process → "Mis votaciones" card visible → list loads once → click pending entry navigates to `/votar/:derechoVotoId`.
- [ ] 6.3 Manual smoke: login as docente → no "Mis votaciones" card, `InicioPage` empty state unchanged.
