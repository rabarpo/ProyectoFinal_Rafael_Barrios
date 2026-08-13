# Proposal: Sistema de Diseño Visual (Backlog #24)

## Intent

`apps/frontend` has zero styling infrastructure (no Tailwind, no CSS framework, no `className` usage anywhere in `src/`). The 11 existing components (login flow + process wizard from #11) are functionally complete but visually unstyled, so the product cannot be demoed or used credibly by the institution. `DESIGN-SYSTEM.md` already documents the intended visual language (colors, typography, spacing, shape, elevation) but nothing in the codebase implements it. This change translates that documentation into real, reusable tokens and applies them to the components that already exist.

## Scope

### In Scope
- Introduce Tailwind CSS v4 via `@tailwindcss/vite` in `apps/frontend`.
- Define design tokens in `src/index.css` using `@theme`, mapped from `DESIGN-SYSTEM.md`: colors (institution-blue as primary), typography scale (Hanken Grotesk), border radius scale, spacing scale.
- Resolve the `primary` color conflict: use `institution-blue` (`#000066`) as the source of truth for `primary`; the `#000000` value in the front-matter is a stale Material export artifact and is not used.
- Load Hanken Grotesk self-hosted (`@font-face` with local font files bundled in the frontend), not via Google Fonts CDN, to avoid depending on external network access/CSP exceptions in an institutional environment.
- Apply the tokens to all 11 existing components: `auth/{FormularioCredenciales,LoginPage,BotonGoogle,DialogoVinculacion}.tsx`, `app/{AppShell,App}.tsx`, `procesos/ProcesoWizardPage.tsx`, `procesos/pasos/{PasoDatos,PasoPublico,PasoPadron,PasoRevision}.tsx`.
- For `BotonGoogle.tsx`: style only the container/wrapper around the Google Identity Services widget (spacing, alignment, surrounding surface). The widget's internal rendering is controlled by Google and is explicitly not styled.

### Out of Scope
- New components not yet implemented (candidate cards, voting progress indicator, chips/badges) — these belong to the backlog items that introduce candidates/ballot UI (#12/#14) and will consume these same tokens when built.
- Dark mode / theme switching — `DESIGN-SYSTEM.md` specifies light mode only.
- Visual regression testing tooling or a component storybook.
- Changing existing component behavior, props, or test selectors (role/label-based Testing Library queries stay intact).

## Capabilities

### New Capabilities
- `sistema-diseno-visual`: Frontend styling infrastructure (Tailwind v4 tokens) and application of the visual design system to existing login and process-wizard components.

### Modified Capabilities
None.

## Approach

1. Add `tailwindcss` + `@tailwindcss/vite` to `apps/frontend`, wire the Vite plugin.
2. Create `src/index.css` with `@theme` block encoding colors, font family, radii, and spacing from `DESIGN-SYSTEM.md`'s front-matter, using `institution-blue` for `primary`.
3. Bundle Hanken Grotesk font files under `apps/frontend/src/assets/fonts/` (or `public/fonts/`) with a local `@font-face` declaration; no external font CDN.
4. Apply Tailwind utility classes incrementally to each of the 11 components, following `DESIGN-SYSTEM.md`'s component guidance (buttons, input fields, layout/spacing) where applicable to what already exists (forms, wizard steps, shell) — candidate-card/badge/progress-bar guidance is intentionally not implemented since those components don't exist yet.
5. Keep all existing Testing Library selectors (role/label) untouched; only `className` additions.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/frontend/package.json` | Modified | Add `tailwindcss`, `@tailwindcss/vite` deps |
| `apps/frontend/vite.config.ts` | Modified | Register Tailwind Vite plugin |
| `apps/frontend/src/index.css` | New | Design tokens via `@theme`, font-face |
| `apps/frontend/src/assets/fonts/` | New | Self-hosted Hanken Grotesk font files |
| `apps/frontend/src/auth/*.tsx` (4 files) | Modified | Apply styling classes |
| `apps/frontend/src/app/*.tsx` (2 files) | Modified | Apply styling classes |
| `apps/frontend/src/procesos/**/*.tsx` (5 files) | Modified | Apply styling classes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Adding `className` breaks a test relying on DOM structure/text | Low | Tests use role/label selectors; verify full suite after each component |
| Self-hosted font files bloat bundle or license terms unclear | Low | Hanken Grotesk is open-source (OFL); include only needed weights (400/500/600/700) |
| `institution-blue` vs front-matter `primary` mismatch causes confusion later | Low | Documented explicitly in this proposal and in `@theme` comments |
| Google Identity widget styling expectations mismatch | Med | Scope explicitly limited to container only; documented as known constraint |

## Rollback Plan

Revert the commit(s) introducing Tailwind config and `className` changes; no schema/data changes are involved. Components remain functionally identical without their styling classes (graceful degradation to unstyled HTML).

## Dependencies

- `DESIGN-SYSTEM.md` (already present) as the token source of truth.
- Hanken Grotesk font files (OFL-licensed, to be sourced and vendored).

## Success Criteria

- [ ] `apps/frontend` builds and runs with Tailwind v4 tokens active.
- [ ] All 11 existing components render with the design system's colors, typography, radii, and spacing.
- [ ] Hanken Grotesk loads self-hosted, with no external font CDN request.
- [ ] Full existing test suite passes unchanged (no selector changes needed).
- [ ] `BotonGoogle.tsx` container is styled; the Google widget itself is untouched.

## Proposal question round

This proposal was assembled from exploration output without a live interactive round with the end user. Before moving to spec/design, confirm or correct these assumptions:

1. **Font licensing/delivery**: Assumed self-hosted Hanken Grotesk (OFL) for CSP/network-independence in an institutional network. Is self-hosting acceptable, or is a CDN (Google Fonts) actually preferred for simplicity?
2. **Primary color source of truth**: Assumed `institution-blue` (`#000066`) overrides the stale `primary: #000000` in `DESIGN-SYSTEM.md` front-matter, per your prior decision. Should `DESIGN-SYSTEM.md` itself be corrected in this change, or left as-is with the token file as the actual source of truth?
3. **Depth of styling for wizard steps**: `DESIGN-SYSTEM.md` describes buttons, inputs, and layout in detail but not wizard-specific patterns (step indicators, multi-step navigation). Should this change invent a reasonable step-indicator treatment now, or leave wizard step transitions visually plain until a dedicated design pass?
4. **Scope of `AppShell`**: Should the shell get institutional branding (logo placeholder, header bar) now, or just container/spacing tokens since no logo asset exists yet?

If no correction is given, this proposal proceeds with the assumptions stated above.
