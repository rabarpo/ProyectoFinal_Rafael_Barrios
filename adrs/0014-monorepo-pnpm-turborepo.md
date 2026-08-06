# ADR 0014: Monorepo con pnpm workspaces + Turborepo, contrato OpenAPI como artefacto generado y versionado

## Estado

Aceptado

## Contexto

El [ADR-0002] fija el stack TypeScript full-stack (NestJS, React+Vite, worker Node.js) y el
[ADR-0004] fija el contrato REST con OpenAPI generado desde el backend y consumido como tipos por
el frontend. Ninguno de los dos ADR decide cómo se organiza el código fuente de tres aplicaciones
que comparten un contrato, ni cómo ese contrato generado viaja de un paquete a otro sin volverse
una fuente de verdad ambigua. El backlog #1 (`system-scaffolding`) es el primer change de
implementación: antes de escribir la primera línea de un módulo de dominio hace falta un
herramental de monorepo, un runner de tareas consciente del grafo de dependencias entre paquetes,
y una decisión explícita sobre dónde vive — y cómo se versiona — el artefacto generado del
contrato.

## Decisión

**Monorepo con pnpm workspaces + Turborepo**, y el **contrato OpenAPI generado tratado como
artefacto versionado en el repositorio**, no como un paso de build efímero:

- `pnpm-workspace.yaml` declara `apps/*` y `packages/*`: `apps/backend`, `apps/frontend`,
  `apps/worker`, `packages/contracts`, más `infra/docker` como paquete no publicable para
  Dockerfiles/compose/Caddy.
- `turbo.json` modela el grafo real de dependencias entre tareas: `openapi:extract` (backend, sin
  dependencias) → `generate:contracts` (`packages/contracts`, `dependsOn:
  ["@seei/backend#openapi:extract"]`) → `build`/`typecheck`/`lint`/`test`/`test:e2e` con caché de
  Turborepo por tarea. Esto evita que cada paquete reinvente su propio orden de build y permite que
  CI ejecute `pnpm turbo run build test` una sola vez, en paralelo donde el grafo lo permite.
- El documento `dist-openapi/openapi.json` (extraído del backend) y los tipos generados
  `packages/contracts/src/generated/api.d.ts` **se commitean al repositorio**. Un script de
  verificación de deriva (`check-drift.ts`, corrido en CI antes de `lint typecheck build test`)
  regenera ambos artefactos y falla el build si el árbol de trabajo queda sucio — incluyendo el
  caso de un endpoint nuevo que aún no generó ningún archivo rastreado (`git add
  --intent-to-add` antes del `diff --exit-code`, ya que un archivo no rastreado no aparece en un
  `git diff` a secas).
- Configuración de TypeScript/lint/formato se mantiene **inline por aplicación**, sin extraer un
  paquete `packages/config` compartido todavía — la duplicación entre tres aplicaciones pequeñas es
  tolerable; la extracción se revisita cuando la duplicación real moleste (fuera de alcance de este
  ítem, ver `proposal.md`).

## Alternativas consideradas

- **Nx** — runner de monorepo con generadores de código y grafo de dependencias también consciente
  de caché remota; no se eligió porque su superficie de configuración (plugins, generadores,
  `project.json` por paquete) excede lo que un walking skeleton de tres aplicaciones necesita, y
  Turborepo cubre el caso concreto (orden de tareas + caché) con menos piezas que aprender.
- **Lerna** (solo orquestación de publicación, sin runner de tareas con grafo) — descartado porque
  el problema real no es publicar paquetes a un registry, sino ordenar `openapi:extract` antes de
  `generate:contracts` antes de `build`; Lerna no resuelve eso sin acoplarse a otro runner de
  tareas de todos modos.
- **No commitear el contrato generado** (regenerarlo siempre en build/CI, tratarlo como artefacto
  efímero) — no se eligió porque un desarrollador de frontend sin backend corriendo localmente
  perdería el tipado del cliente; commitearlo permite `pnpm install` + `pnpm turbo run build` en
  frío sin depender de que el backend haya corrido primero, al costo de necesitar el drift check
  para no divergir en silencio (riesgo ya nombrado en el [ADR-0004]).

## Consecuencias

- Un solo comando (`pnpm turbo run build` / `pnpm turbo run test`) construye y prueba las cuatro
  unidades del workspace en el orden correcto, con caché de Turborepo acelerando ejecuciones
  repetidas en CI y en local.
- El contrato generado es visible en cada diff de PR: un cambio de DTO en el backend que no
  regenera `api.d.ts` se ve como un archivo desactualizado en la revisión de código, además de
  fallar el drift check en CI — doble señal, no solo una comprobación automatizada silenciosa.
- **Costo real:** el repositorio incluye un artefacto generado (`api.d.ts`, y el `openapi.json` que
  lo origina) que debe regenerarse y commitearse manualmente cada vez que cambia el contrato antes
  de abrir PR, o el drift check bloquea CI. Esto es intencional (ver Alternativas), pero es
  fricción real de flujo de trabajo, no gratuita.
