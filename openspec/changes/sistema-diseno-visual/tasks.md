# Tasks: sistema-diseno-visual (Backlog #24 — Tokens Tailwind v4 + aplicación a 11 componentes)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~230 / PR2 ~250 / PR3 ~290 / PR4 ~180 (~950 total, per-PR under budget) — estimación de `design.md`, "Corte de PR recomendado" |
| 400-line budget risk | Low (por PR y agregado) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (cimientos: tokens + fuente) → PR2 (login y shell) → PR3 (asistente parte 1) → PR4 (asistente parte 2) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

Ningún PR se acerca al presupuesto de 400 líneas, así que no hace falta decisión adicional del
usuario sobre el corte (ya fijado por `design.md`, "Corte de PR recomendado"). PR2, PR3 y PR4 no
pueden mergear antes del PR1: sin `@theme` las clases no existen y el resultado sería HTML sin
estilo con `className` muerto. Los binarios de fuente (`.woff2`) no cuentan al presupuesto de
líneas pero sí a la identidad del snapshot. `AuthGuard.tsx` queda explícitamente fuera de alcance
(no se estiliza en este change).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Cimientos: devDeps, `vite.config.ts`, `src/index.css` (`@font-face`+`@theme`), fuente vendorizada, `main.tsx` | PR 1 | `pnpm --filter @seei/frontend test -- index.css` | `pnpm --filter @seei/frontend build` (build real, sin mocks) | `git revert` PR1; sin componente consumidor aún, `className` inerte |
| 2 | Login y shell: `AppShell`, `App`, `LoginPage`, `FormularioCredenciales`, `DialogoVinculacion`, `BotonGoogle` | PR 2 | `pnpm --filter @seei/frontend test -- auth` | Testing Library sobre specs existentes | `git revert` PR2; PR1 sin consumidor afectado |
| 3 | Asistente parte 1: `ProcesoWizardPage` (tarjeta, nav, `Paso N de 4`), `PasoDatos`, `PasoPublico` | PR 3 | `pnpm --filter @seei/frontend test -- ProcesoWizardPage PasoDatos PasoPublico` | Testing Library sobre specs existentes + 1 spec nuevo | `git revert` PR3; PR2 no afectado |
| 4 | Asistente parte 2: `PasoPadron`, `PasoRevision`, pasada responsive y revisión de contraste/foco | PR 4 | `pnpm --filter @seei/frontend test -- PasoPadron PasoRevision` | Recorrido manual (375px/1440px) + Testing Library | `git revert` PR4; PR3 no afectado |

## PR 1 — Cimientos (base = feature/tracker branch)

### Phase 1: Infraestructura Tailwind v4 y tokens
- [x] 1.1 Modificar `apps/frontend/package.json`: agregar `tailwindcss@^4` y `@tailwindcss/vite@^4`
      a `devDependencies` [D1]
- [x] 1.2 Modificar `apps/frontend/vite.config.ts`: agregar `tailwindcss()` a `plugins` junto a
      `react()`; `server.proxy` y bloque `test` intactos [D1]
- [x] 1.3 RED: crear `apps/frontend/src/index.css.spec.ts` — `readFileSync` afirma
      `--color-primary: #000066`, `--text-display-lg`, `--text-headline-lg`, `--text-title-md`,
      `--text-body-lg`, `--text-body-md`, `--text-label-md`, `--text-caption`, `--shadow-elevation`
      contiene `0 4px 20px`, `--font-sans` empieza por `'Hanken Grotesk'` — falla, `index.css` no
      existe
- [x] 1.4 RED adversarial: extender `index.css.spec.ts` — ningún archivo de `src/**`/`index.html`
      contiene `fonts.googleapis.com`/`fonts.gstatic.com`/`@import url(http`; `@font-face` apunta a
      `./assets/fonts/`; el `.woff2` referenciado existe en disco (`existsSync`) — falla
- [x] 1.5 GREEN: crear `apps/frontend/src/index.css` — `@import "tailwindcss"` + `@font-face` (D2) +
      `@theme` completo (D3: color 1:1, tipografía con sufijos `--line-height`/`--font-weight`,
      `--radius-control`/`--radius-card`/`--shadow-elevation`/`--container-page`) — pasa 1.3
- [x] 1.6 Crear `apps/frontend/src/assets/fonts/HankenGrotesk-Variable.woff2`: subconjunto `latin`,
      eje `wght` 100–900, sin itálica — pasa 1.4
- [x] 1.7 Crear `apps/frontend/src/assets/fonts/OFL.txt`: licencia OFL 1.1 que acompaña la fuente
- [x] 1.8 Modificar `apps/frontend/src/main.tsx`: agregar `import './index.css'` — única línea
- [x] 1.9 Regresión: `pnpm --filter @seei/frontend test` suite completa verde sin tocar
      `*.spec.tsx`; `pnpm --filter @seei/frontend build` compila y `dist` incluye `.woff2` con hash;
      `pnpm --filter @seei/frontend typecheck` limpio

## PR 2 — Login y shell (base = PR 1 branch)

### Phase 2: AppShell y App (D7)
- [x] 2.1 RED: confirmar `AppShell.spec.tsx`/`App.spec.tsx` en verde antes de tocar los componentes
      (línea base)
- [x] 2.2 Modificar `AppShell.tsx`: `<header>` con `border-b border-border-gray bg-surface-white` +
      contenedor de página (`mx-auto w-full max-w-page px-5 md:px-12`), rol en
      `text-label-md text-on-surface-variant`, "Cerrar sesión" como botón terciario; `<main>` con
      mismo contenedor + `py-10 md:py-12`; `<div>` raíz `min-h-screen bg-background text-on-surface`
      — sin logo, sin navegación [D7]
- [x] 2.3 Modificar `App.tsx` solo si la composición necesita una clase de raíz; si no, documentar
      que queda sin cambios — `App.tsx` no tiene elemento raíz propio (solo compone
      `AuthProvider`/`AuthGuard`/`AppShell`), queda sin cambios
- [x] 2.4 GREEN verificar: `AppShell.spec.tsx`/`App.spec.tsx` pasan sin modificarse — pasa 2.1

### Phase 3: LoginPage y FormularioCredenciales
- [x] 3.1 RED: confirmar `LoginPage.spec.tsx`/`FormularioCredenciales.spec.tsx` en verde (línea
      base) — `LoginPage.tsx` no tiene spec propio, se ejercita vía `App.spec.tsx`,
      `LoginFlow.spec.tsx` y `GoogleFlow.spec.tsx`; los tres en verde
- [x] 3.2 Modificar `LoginPage.tsx`: contenedor centrado + tarjeta + separador "o" antes de
      `BotonGoogle`
- [x] 3.3 Modificar `FormularioCredenciales.tsx`: `<div>` por par label+input (D4.1), input/botón
      con patrones de D3
- [x] 3.4 GREEN verificar: specs pasan sin modificarse, cero cambio de selector/texto — pasa 3.1

### Phase 4: DialogoVinculacion y BotonGoogle (D4, D6)
- [x] 4.1 RED: confirmar `DialogoVinculacion.spec.tsx`/`BotonGoogle.spec.tsx` en verde, en
      particular `toBeEmptyDOMElement()` sin `VITE_GOOGLE_CLIENT_ID` (línea base)
- [x] 4.2 Modificar `DialogoVinculacion.tsx`: tarjeta sobre el mismo `div[role="dialog"]`
      (D4 regla 2), fila de botones
- [x] 4.3 Modificar `BotonGoogle.tsx`: `className` sobre el `div[data-testid="boton-google"]`
      existente, cero wrapper nuevo, cero selectores descendientes, cero `width`/`transform`/
      `filter`/`scale` sobre el contenedor [D6]
- [x] 4.4 GREEN verificar: specs pasan sin modificarse, `toBeEmptyDOMElement()` sigue cumpliéndose
      — pasa 4.1

### Phase 5: Regresión PR2
- [x] 5.1 `pnpm --filter @seei/frontend test` suite completa verde; `pnpm --filter @seei/frontend
      typecheck` limpio

## PR 3 — Asistente, parte 1 (base = PR 2 branch)

### Phase 6: ProcesoWizardPage — tarjeta, navegación e indicador (D5)
- [ ] 6.1 RED: confirmar `ProcesoWizardPage.spec.tsx` en verde, en particular
      `getByRole('heading', …)` (líneas 53/69) (línea base)
- [ ] 6.2 RED: agregar en `ProcesoWizardPage.spec.tsx` — en paso 2, `getByText(/paso 2 de 4/i)`
      presente; `queryByRole('heading', { name: /paso 2 de 4/i })` es `null` — falla, el indicador
      no existe todavía
- [ ] 6.3 GREEN: modificar `ProcesoWizardPage.tsx` — agregar
      `<p className="text-label-md text-primary">Paso {estado.paso} de 4</p>`, tarjeta del
      asistente y barra de navegación con patrones de botón primario/terciario de D3 — pasa 6.1-6.2

### Phase 7: PasoDatos
- [ ] 7.1 RED: confirmar `PasoDatos.spec.tsx` en verde (línea base)
- [ ] 7.2 Modificar `PasoDatos.tsx`: campos apilados con patrón de input de D3
- [ ] 7.3 GREEN verificar: `PasoDatos.spec.tsx` pasa sin modificarse — pasa 7.1

### Phase 8: PasoPublico (D4 — regex ancladas sobre nombre accesible)
- [ ] 8.1 RED: confirmar `PasoPublico.spec.tsx` en verde, en particular las regex ancladas
      `getByRole('radio', { name: /^estudiantes$/i })`, `/^aulas$/i`, `/^padres de familia$/i`
      (líneas 33/87/136/142) (línea base)
- [ ] 8.2 Modificar `PasoPublico.tsx`: `fieldset`/`legend` estilizados; fragmentos condicionales
      `<>…</>` → `<div className="…">` (D4.1); cero texto nuevo dentro de los `<label>` de radio
- [ ] 8.3 GREEN verificar: `PasoPublico.spec.tsx` pasa sin modificarse, nombres accesibles de los
      radios sin cambio — pasa 8.1

### Phase 9: Regresión PR3
- [ ] 9.1 `pnpm --filter @seei/frontend test` suite completa verde; `pnpm --filter @seei/frontend
      typecheck` limpio

## PR 4 — Asistente, parte 2 (base = PR 3 branch)

### Phase 10: PasoPadron
- [ ] 10.1 RED: confirmar `PasoPadron.spec.tsx` en verde (línea base)
- [ ] 10.2 Modificar `PasoPadron.tsx`: cifras y desglose por aula con escala tipográfica
- [ ] 10.3 GREEN verificar: `PasoPadron.spec.tsx` pasa sin modificarse — pasa 10.1

### Phase 11: PasoRevision
- [ ] 11.1 RED: confirmar `PasoRevision.spec.tsx` en verde (línea base)
- [ ] 11.2 Modificar `PasoRevision.tsx`: `dl/dt/dd` en grilla, checkbox alineado, botón primario
- [ ] 11.3 GREEN verificar: `PasoRevision.spec.tsx` pasa sin modificarse — pasa 11.1

### Phase 12: Pasada responsive y revisión manual final
- [ ] 12.1 Recorrido manual (rollout R4): login → shell → los 4 pasos del asistente, en viewport
      375px y 1440px
- [ ] 12.2 Revisión manual de contraste (`on-primary` sobre `primary`, `on-surface-variant` sobre
      `surface-white`) y foco visible con teclado en cada input/botón — documentar en la
      descripción del PR
- [ ] 12.3 Regresión final: `pnpm --filter @seei/frontend test` suite completa verde;
      `pnpm --filter @seei/frontend build` compila; `pnpm --filter @seei/frontend typecheck` limpio
