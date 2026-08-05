# Propuesta: system-scaffolding (Backlog #1 — Andamiaje del sistema)

## Intención

El repositorio contiene solo documentación: no hay `package.json`, ni árbol de código fuente, ni test
runner, ni CI. Cada uno de los 22 ítems restantes del backlog depende de este. `openspec/config.yaml`
ya exige que el primer change de implementación configure el gestor de paquetes, el test runner y CI
antes del trabajo de features — este change es ese mandato. Demuestra que las cañerías funcionan
(camino HTTP frontend→backend→DB, camino de cola backend→Redis→worker, terminación HTTPS, generación
de contrato tipado) sin decidir qué fluye por esas cañerías.

## Alcance

### Dentro de alcance
- Herramental de monorepo: pnpm workspaces + Turborepo, configuración compartida de TS/lint/formato
  mantenida **inline por aplicación** (ver la decisión más abajo)
- Esqueletos de aplicación: `apps/backend` (NestJS), `apps/frontend` (React+Vite), `apps/worker`
  (Node.js+BullMQ) — cero módulos de dominio
- `packages/contracts`: tipos OpenAPI generados desde `@nestjs/swagger`, consumidos por el frontend y
  por los tests e2e del backend; drift check en CI (regenerar y luego comparar) que mitiga el costo
  nombrado del ADR-0004. **Corrección posterior al diseño:** `git diff --exit-code` a secas no
  detecta archivos no rastreados, por lo que un endpoint nuevo pasaría el check en falso; la
  comparación debe precederse de `git add --intent-to-add -- packages/contracts` o equivalente. Ver
  `design.md` y el escenario correspondiente en la spec
- Docker Compose (base + override de desarrollo) + Caddy con HTTPS local (`tls internal`), según
  ADR-0007
- **Dos roles de Postgres, no uno** (enmendado después de la exploración del Backlog #3 — ver la nota
  más abajo): un rol de migración/propietario con privilegios DDL, usado únicamente por
  `prisma migrate` en desarrollo local, CI y despliegue; y un rol de aplicación de runtime con el que
  se conecta el backend. Ambos aprovisionados en el script de init de Docker Compose y cableados como
  dos cadenas de conexión separadas en CI. El ítem #3 más adelante revoca `UPDATE`/`DELETE` sobre la
  tabla de auditoría al rol de runtime — esa revocación es trabajo de #3, pero los roles en sí deben
  existir aquí, porque retroadaptar una división de roles después de que el backend ya corre como
  propietario es un cambio de infraestructura disruptivo, no aditivo
- Test runners Jest (backend) / Vitest (frontend, worker); CI con GitHub Actions
- Prisma instalado con datasource/generator y una única **migración baseline vacía** (sin modelos de
  dominio)
- Walking skeleton (esqueleto ambulante; solo prueba interna de desarrollo/CI — sin pulido de UI, no
  destinado a stakeholders): `/health` llegando a Postgres (`SELECT 1`) y Redis (`PING`); una página
  de frontend que consume el cliente generado; un ida y vuelta del trabajo BullMQ `system.ping`;
  `docker compose up` reproduciendo todo eso detrás de Caddy
- Actualización de `openspec/config.yaml`: `testing.status: available`, `test_command: "pnpm turbo run
  test"`, `build_command: "pnpm turbo run build"`, replicados en las secciones `apply`/`verify`;
  `coverage_threshold` queda en 0 (el código del walking skeleton es demasiado pequeño para un
  porcentaje global significativo; revisar en #2)

### Fuera de alcance
- #2 esquema/migraciones (`Usuario`, `ProcesoElectoral`, `Voto`, `DerechoVoto`, etc.)
- #3 motor de auditoría append-only
- #4 autenticación (sin login, sesiones ni guards; la dependencia del cliente Redis puede instalarse
  porque BullMQ la necesita, pero sin semántica de sesión)
- #12/#15 patrón outbox real: el trabajo de demostración `system.ping` es un **ping puro con cero
  acoplamiento a la base de datos**, documentado mediante convención de nombres + una nota en
  doc-comment/README que lo declara no reutilizable y NO andamiaje de outbox — sin regla de lint ni
  otra imposición técnica en este ítem
- `packages/config` (extracción de tsconfig/eslint/prettier compartidos) — explícitamente diferido; por
  ahora se usa configuración inline por aplicación, la extracción ocurre después, cuando la duplicación
  realmente moleste
- pdfmake/ExcelJS/Passport/Nodemailer — no se instalan; solo se establece el límite de proceso del
  worker que los alojará después (ADR-0002)

## Capacidades

### Capacidades nuevas
- `system-scaffolding`: herramental de monorepo, esqueletos de aplicación, pipeline del contrato
  OpenAPI, desarrollo local con Docker Compose/Caddy, CI y el walking skeleton libre de esquema
  descrito arriba

### Capacidades modificadas
Ninguna — change greenfield, no hay specs existentes que modificar.

## Enfoque

pnpm workspaces + Turborepo (`apps/{backend,frontend,worker}` + `packages/contracts` +
`infra/docker`). OpenAPI generado desde `@nestjs/swagger` hacia `packages/contracts`, con un drift
check en CI como mitigación concreta del costo declarado del ADR-0004. Jest para el backend, Vitest
para frontend/worker. GitHub Actions es el proveedor de CI confirmado. Dos archivos de Docker Compose
separan el endurecimiento de producción de la comodidad de desarrollo (ADR-0007: DB/Redis nunca
expuestos a Internet). El TDD estricto (configuración global) aplica a cada línea del walking skeleton
— endpoint de health, trabajo ping, página de health del frontend — escrita RED→GREEN→REFACTOR, aunque
`coverage_threshold` quede en 0.

## Áreas afectadas

| Área | Impacto | Descripción |
|------|--------|--------------|
| raíz del repositorio | Nueva | Gestor de paquetes, `pnpm-workspace.yaml`, `turbo.json`, `.github/workflows/` |
| `apps/backend` | Nueva | Esqueleto NestJS, `@nestjs/swagger`, Jest, init de Prisma + migración baseline |
| `apps/frontend` | Nueva | Esqueleto Vite+React, Vitest+RTL, consumo del cliente generado |
| `apps/worker` | Nueva | Esqueleto Node.js+BullMQ, Vitest, trabajo `system.ping` |
| `packages/contracts` | Nueva | Tipos OpenAPI generados, con drift check en CI |
| `infra/docker` | Nueva | Dockerfiles por aplicación, `docker-compose.yml` + `.dev.yml`, `Caddyfile` |
| `openspec/config.yaml` | Modificada | Campos de comando de `testing`, `apply`, `verify` |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|------|------------|------------|
| Es probable que se exceda el presupuesto de revisión de 400 líneas en un único PR (más de 6 manifiestos, 3 Dockerfiles, 2 archivos compose, workflow de CI, 3 esqueletos de aplicación) | Alta | Marcado para que `sdd-tasks` planifique slices de PR encadenados; la decisión de la división no se toma aquí |
| El proveedor de CI no estaba declarado previamente en el repositorio | Resuelto | El usuario confirmó GitHub Actions; queda registrado como restricción decidida |
| Que quienes implementen #12/#15 en el futuro confundan el trabajo de demostración `system.ping` con andamiaje de outbox | Media | Convención de nombres + nota en doc-comment/README; sin imposición técnica en este ítem |
| El paso de confianza en el HTTPS local (CA interna de Caddy) es fricción de onboarding | Media | Debe documentarse en la documentación de setup, o quienes contribuyan diagnosticarán mal el comportamiento roto de cookies como un bug de la aplicación |

## Plan de rollback

Este change agrega solo andamiaje, sin datos de dominio ni migraciones más allá de una baseline vacía.
Si un slice resulta inviable: hacer `git revert` del o los PR relevantes (según el plan de slices
encadenados de `sdd-tasks`); descartar los volúmenes correspondientes con `docker compose down -v`; no
existe estado destructivo de esquema que haya que migrar hacia atrás. Dado que nada depende de este
código salvo ítems posteriores del backlog (ninguno construido todavía), el rollback completo es un
`git revert` limpio sin riesgo de pérdida de datos.

## Dependencias

- Ninguna — este es el primer change de implementación (Backlog #1), no depende de código previo

## Criterios de éxito

- [ ] `pnpm turbo run build` y `pnpm turbo run test` se ejecutan con éxito desde la raíz del repositorio
- [ ] `docker compose up` levanta Caddy (HTTPS), backend, frontend, worker, Postgres y Redis
- [ ] `/health` reporta éxito de `SELECT 1` en Postgres y de `PING` en Redis
- [ ] La página de frontend renderiza el estado de health mediante el cliente generado de
      `packages/contracts`
- [ ] El trabajo `system.ping` hace el ida y vuelta backend→Redis→worker, con el heartbeat visible en
      `/health`
- [ ] Una migración baseline vacía de Prisma se aplica limpiamente en Docker/CI
- [ ] CI (GitHub Actions) ejecuta build, test y el drift check del contrato OpenAPI
- [ ] Los campos de comando de `testing`/`apply`/`verify` en `openspec/config.yaml` están completados
- [ ] Postgres aprovisiona dos roles distintos (migración/propietario y aplicación de runtime); el
      backend corre como el rol de runtime, `prisma migrate` corre como el rol de migración, y ambas
      cadenas de conexión están disponibles en desarrollo local y en CI

## Registro de enmiendas

- **La exploración del Backlog #3 (motor de auditoría append-only)** reveló que esta propuesta
  aprovisionaba un único rol de Postgres, mientras que la garantía de auditoría append-only del
  ADR-0003 requiere una división de roles entre migración y runtime. El usuario decidió enmendar este
  ítem en lugar de que #3 absorbiera el cambio, dado que el aprovisionamiento de roles es
  infraestructura y este ítem todavía no fue implementado. El alcance y los criterios de éxito de
  arriba se actualizaron en consecuencia; las sentencias `REVOKE` sobre la tabla de auditoría siguen
  siendo responsabilidad de #3.
