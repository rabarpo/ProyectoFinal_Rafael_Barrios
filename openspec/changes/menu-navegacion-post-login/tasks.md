# Tasks: Menú principal y navegación post-login (#25)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~330-380 (6 new files, 6 modified files) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

Decision needed because estimate sits close enough to 400 to warrant a check-in before `sdd-apply` starts, per `ask-on-risk`. If the actual diff creeps past ~380 lines during apply, re-run this forecast and consider splitting Unit 2 (menu-por-rol + placeholder) from Unit 3 (nav mount + InicioPage) into a `feature-branch-chain`.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | D1 routing: `inicio` variant + `/procesos/nuevo` path | PR 1 (single PR) | `pnpm --filter @seei/frontend test rutas.spec.ts useRuta.spec.tsx Enrutador.spec.tsx` | N/A — pure unit/component tests, no live backend needed | Revert `rutas.ts`, `Enrutador.tsx`, and the 3 spec files; no data effects |
| 2 | D2/D3/D8 menu-por-rol data map + D5 placeholder | PR 1 (single PR) | `pnpm --filter @seei/frontend test menu-por-rol.spec.ts NavegacionPrincipal.spec.tsx` | N/A — data/component tests only | Revert `menu-por-rol.ts` and `NavegacionPrincipal.tsx`; no consumers outside this change yet |
| 3 | D4/D6 wire AppShell + InicioPage | PR 1 (single PR) | `pnpm --filter @seei/frontend test AppShell InicioPage.spec.tsx` | N/A — component render tests | Revert `AppShell.tsx` mount line and delete `InicioPage.tsx`; `Enrutador.tsx` case reverts with Unit 1 |

## Phase 1: D1 — Routing foundation (`rutas.ts`)

- [x] 1.1 RED in `apps/frontend/src/app/rutas.spec.ts`: add/adjust round-trip case asserting `parsearRuta('/') → { nombre: 'inicio' }` and `rutaAPath({ nombre: 'inicio' }) === '/'`.
- [x] 1.2 RED in `apps/frontend/src/app/rutas.spec.ts`: assert `parsearRuta('/procesos/nuevo') → { nombre: 'proceso-nuevo' }`, `rutaAPath({ nombre: 'proceso-nuevo' }) === '/procesos/nuevo'`, and `parsearRuta('/procesos/nuevo/extra') → { nombre: 'no-encontrada', pathname: '/procesos/nuevo/extra' }`. Confirm tests fail against current code.
- [x] 1.3 GREEN: in `apps/frontend/src/app/rutas.ts` add `{ nombre: 'inicio' }` to the `Ruta` union, change `partes.length === 0` branch to return `{ nombre: 'inicio' }`, add a `partes[0] === 'procesos' && partes.length === 2 && partes[1] === 'nuevo'` branch returning `{ nombre: 'proceso-nuevo' }`, and update `rutaAPath`'s `case 'inicio': return '/'` / `case 'proceso-nuevo': return '/procesos/nuevo'`.
- [x] 1.4 Verify precedence: `/procesos/nuevo` must not fall into the existing `candidatos`/`apertura` branches (`partes.length >= 3` guards already exclude length-2 paths) — confirm with 1.1/1.2 passing, no new guard needed.

## Phase 2: D1 — Update dependent specs (RED→GREEN for the moved root)

- [x] 2.1 Update `apps/frontend/src/app/useRuta.spec.tsx:23` — change the assertion from `toHaveTextContent('proceso-nuevo')` to `toHaveTextContent('inicio')` after `pushState('/')`. Run to confirm it fails first against unmodified `rutas.ts`, then passes after Phase 1.
- [x] 2.2 Update `apps/frontend/src/app/Enrutador.spec.tsx` — assert `/` now mounts a placeholder/`InicioPage` marker instead of `ProcesoWizardPage`; add or update a case asserting `/procesos/nuevo` mounts `ProcesoWizardPage`. RED first against current `Enrutador.tsx`.
- [x] 2.3 Confirm no other spec file hardcodes `/` → `proceso-nuevo` (search `grep -rn "proceso-nuevo" apps/frontend/src --include=*.spec.*`); update any additional match found.

## Phase 3: Verify existing `proceso-nuevo` navigation callers (no hardcoded path)

- [x] 3.1 Confirm `apps/frontend/src/procesos/ProcesosIndexPage.tsx:47` calls `navegar({ nombre: 'proceso-nuevo' })` (not a hardcoded `/`) — already verified via `rutaAPath`, so it resolves to `/procesos/nuevo` automatically once Phase 1 lands. No code change required; add a regression assertion in the existing `ProcesosIndexPage` spec if one exercises this click and does not already assert the resulting pathname.
- [x] 3.2 Confirm `apps/frontend/src/votos/VotacionPage.tsx:156` calls `navegar({ nombre: 'proceso-nuevo' })` (not hardcoded) — same conclusion; add/confirm a pathname assertion in the existing `VotacionPage` spec if missing.

## Phase 4: D2/D3 — `menu-por-rol.ts` data module

- [x] 4.1 RED: create `apps/frontend/src/app/menu-por-rol.spec.ts` asserting, for each of the 5 roles (`administrador`, `director`, `comite`, `docente`, `estudiante`), the exact set of `id`s per the D3 table (procesos/proceso-nuevo/candidatos + role-specific placeholders; empty for docente/estudiante).
- [x] 4.2 RED (same file): invariant — no item with `clase: 'proximonte'`/`'proximamente'` has a `ruta` field.
- [x] 4.3 RED (same file): invariant — every `clase: 'navegable'` item's `ruta` satisfies `parsearRuta(rutaAPath(item.ruta))` deep-equals `item.ruta` (round-trip), importing `parsearRuta`/`rutaAPath` from `./rutas`.
- [x] 4.4 GREEN: create `apps/frontend/src/app/menu-por-rol.ts` with `type RolSesion = SesionUsuario['rol']`, discriminated union `ItemMenu` (`'navegable'` with `ruta: Ruta`; `'proximamente'` without), and `const MENU_POR_ROL: Record<RolSesion, readonly ItemMenu[]>` populated per the D3 table (administrador/director: procesos + proceso-nuevo + candidatos + 4 placeholders [académica, usuarios, configuración, importación Excel]; comite: procesos + proceso-nuevo + candidatos + 1 placeholder [académica]; docente/estudiante: `[]`).
- [x] 4.5 Run 4.1-4.3 to green; confirm TypeScript rejects a role missing from `RolUsuario` (compile-time check, no runtime test needed — cite `Record` totality per D2).

## Phase 5: D5 — Disabled placeholder presentation

- [x] 5.1 RED: create `apps/frontend/src/app/NavegacionPrincipal.spec.tsx` — a role with a `proximamente` item renders a `<button disabled>` with the item's label and "Próximamente" text, and clicking it does not change `window.location.pathname`.
- [x] 5.2 RED (same file): a role with zero items (docente/estudiante) renders without throwing and shows no navigable or placeholder items.
- [x] 5.3 RED (same file): a navigable item click calls `navegar()`/updates `useRuta()` to the item's `Ruta` (assert resulting pathname via `rutaAPath`).
- [x] 5.4 GREEN: create `apps/frontend/src/app/NavegacionPrincipal.tsx` — reads `rol` from `useSesion()`, renders `MENU_POR_ROL[rol] ?? []`; navigable items call `navegar(item.ruta)` on click; placeholder items render `<button type="button" disabled>{item.etiqueta} · Próximamente</button>` with no `href`/`onClick`. Use only tokens listed in D7 (`primary`, `on-primary`, `surface-white`, `surface-container`, `border-gray`, `on-surface-variant`, `text-label-md`, `text-caption`, `rounded-control`, `rounded-card`, `shadow-elevation`, `max-page`).

## Phase 6: D6 — `InicioPage`

- [x] 6.1 RED: create `apps/frontend/src/app/InicioPage.spec.tsx` — `administrador` role renders a greeting plus cards for its `MENU_POR_ROL` items (navigable + placeholder).
- [x] 6.2 RED (same file): `estudiante`/`docente` role renders an explicit empty state, no crash, no fetch/network calls triggered.
- [x] 6.3 GREEN: create `apps/frontend/src/app/InicioPage.tsx` — reads `rol` from `useSesion()`, greets by rol, renders a card grid derived from `MENU_POR_ROL[rol] ?? []` (no `useEffect`, no data fetching, no local component state beyond what render needs).

## Phase 7: D4 — Mount navigation + Enrutador wiring

- [x] 7.1 GREEN: in `apps/frontend/src/app/AppShell.tsx`, render `<NavegacionPrincipal />` inside the existing `<header>` as a second row/section; rewrite the file's top comment from "Sin navegación, sin menú — fuera de alcance de la propuesta" to document the #25 scope (navigation by role, no submenus/nested routes).
- [x] 7.2 GREEN: in `apps/frontend/src/app/Enrutador.tsx`, add `case 'inicio': return <InicioPage />;` and import `InicioPage`; update the file's top comment to note `/` now mounts `InicioPage` (not `ProcesoWizardPage`) and `proceso-nuevo` moved to `/procesos/nuevo`.
- [x] 7.3 Re-run Phase 2 specs (2.1, 2.2) to confirm they now pass green end-to-end with the real `InicioPage`/`NavegacionPrincipal` mounted.

## Phase 8: Threat-matrix RED tests (design.md "Enrutamiento (cliente)")

- [x] 8.1 RED→GREEN: confirm/extend existing `AuthGuard`/`Enrutador` spec coverage that `/` and `/procesos/nuevo` without a session render `LoginPage`, never `InicioPage`/`ProcesoWizardPage` (session decides, not URL — D11 unchanged).
- [x] 8.2 RED→GREEN: `/procesos/nuevo/extra` resolves to `no-encontrada` inside the shell, no exception (covered by 1.2, cross-check in `Enrutador.spec.tsx`).
- [x] 8.3 RED→GREEN in `menu-por-rol.spec.ts` or `NavegacionPrincipal.spec.tsx`: a `SesionUsuario` with a `rol` value absent from `MENU_POR_ROL` renders `InicioPage`/nav with zero items and no thrown error (covers "Comportamiento defensivo ante rol sin entrada en el mapa" scenario from spec.md).

## Phase 9: D7 — Token audit

- [x] 9.1 Grep `apps/frontend/src/app/NavegacionPrincipal.tsx` and `InicioPage.tsx` for any `className` token not in the D7-approved list; confirm none were added to `apps/frontend/tailwind.config.*` or `index.css`.

## Phase 10: Full regression

- [x] 10.1 Run `pnpm --filter @seei/frontend test` (full suite) and confirm all green, including Phases 1-9 specs plus pre-existing suites untouched by this change.
- [x] 10.2 Run `pnpm typecheck` and confirm no errors (validates `Record<RolSesion, …>` totality and `Ruta` union exhaustiveness in `Enrutador.tsx`'s `switch`).

## External reference check (pre-close checklist, not a code task)

Run before closing the PR — the design flagged `/procesos/nuevo` as a moved path with no data migration but possible stale external references:

- [x] `grep -rn "procesos/nuevo\|'/'.*proceso-nuevo\|href=\"/\"" apps/frontend/src apps/backend/src --include=*.ts --include=*.tsx` — check for any code comment/string still assuming `/` opens the process wizard. Result: only matches are this change's own new code/comments (`rutas.ts`, `Enrutador.tsx`, spec files) — no stale references found.
- [x] `grep -rn "^\s*\*.*proceso-nuevo\|Sin navegación, sin menú" apps/frontend/src` — confirm the `#24` "sin navegación, sin menú" contract comment was fully replaced (task 7.1), not left duplicated elsewhere. Result: `Sin navegación, sin menú` no longer appears anywhere; the one `proceso-nuevo` comment match is this change's own new `Enrutador.tsx` doc line.
- [x] `grep -rn "/procesos/nuevo\|apuntar a /\|crear.*proceso.*inicio" README.md TECH-DESIGN.md TECH-DESIGN-ORIGINAL.md` (repo root) — check for stale docs pointing at `/` for process creation. Result: no matches.
- [x] Search any outbox/email templates (`apps/backend/src/**/*plantilla*`, `**/*template*`, `**/*correo*`) for a hardcoded `/` link intended to open the process wizard. Result: `apps/backend/src/votos/correo-comprobante.ts` found — already links to `${app_base_url}/comprobante/${voto_id}`, not `/`; no stale reference.
- [x] If any match is found, file it as a follow-up note in the PR description rather than silently fixing unrelated doc/template files outside this change's scope, unless the fix is a one-line path string. N/A — no matches required a follow-up.

## Post-apply: corrección item "Candidatos" del menú

Revisión manual tras `sdd-apply` detectó que las tareas 4.1/4.4 originales incluían un item
"candidatos" en `MENU_POR_ROL` que navegaba a la misma `Ruta 'procesos'` que el item "Procesos"
— no existe ninguna `Ruta` de listado de candidatos sin `procesoId`. Confirmado con el usuario:
se **quitó** el item "candidatos" de `menu-por-rol.ts` (ver comentario en el propio archivo) y se
actualizaron `menu-por-rol.spec.ts` y `specs/menu-navegacion-post-login/spec.md` para reflejar
solo 2 items reales (`procesos`, `proceso-nuevo`) en vez de 3. Suite completa reverificada verde
(270/270) y `pnpm typecheck` limpio tras el ajuste.
