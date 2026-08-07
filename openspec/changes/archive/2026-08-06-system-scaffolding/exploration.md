# Exploración: system-scaffolding (Backlog #1 — Andamiaje del sistema)

## Estado actual

El repositorio contiene solo documentación: `PRD.md`, `TECH-DESIGN.md`, `Design.md`, 13 ADR,
`REVISION-ADVERSARIAL.md`, `BACKLOG.md` y `openspec/`. No hay `package.json`, ni árbol de código
fuente, ni test runner, ni CI. `openspec/config.yaml` registra el stack previsto (monorepo
TypeScript, backend NestJS, frontend React+Vite, worker Node.js, PostgreSQL, Redis+BullMQ,
REST+OpenAPI, VPS/Docker Compose/Caddy) con `test_command`/`build_command` vacíos y
`testing.status: planned-not-available`. Las reglas de `openspec/config.yaml` ya exigen: "El primer
change de implementación debe configurar el gestor de paquetes, el test runner y CI antes del
trabajo de features" — este ES ese change.

Arquitectura según TECH-DESIGN.md: tres desplegables — Frontend (SPA React+Vite) → HTTPS/REST+OpenAPI
→ Backend (monolito modular NestJS, único escritor de la base de datos de negocio) → tabla outbox en
PostgreSQL → BullMQ (Redis) → Worker (Node.js: correo, PDF, exportaciones) → SMTP. Todo detrás de
Caddy/Nginx con HTTPS en un único VPS mediante Docker Compose (ADR-0007).

## Áreas afectadas (a crear; todavía no existe ninguna)

- Raíz del repositorio — gestor de paquetes + manifiesto de workspaces, tsconfig/eslint/prettier
  compartidos, `turbo.json` (o equivalente), workflow de CI
- `apps/backend` — esqueleto NestJS, generación de OpenAPI (`@nestjs/swagger`), configuración de test
  con Jest, init de Prisma
- `apps/frontend` — esqueleto Vite+React, configuración de Vitest+RTL, consumo del cliente OpenAPI
  generado
- `apps/worker` — esqueleto Node.js + BullMQ, configuración de Vitest
- `packages/contracts` (o `packages/api-client`) — tipos OpenAPI generados, fuente única compartida
  por frontend y por los tests de backend/frontend
- `infra/docker` — Dockerfiles por aplicación, `docker-compose.yml` (base) + `docker-compose.dev.yml`
  (overrides de desarrollo), `Caddyfile`
- `openspec/config.yaml` — `testing.test_command`, `testing.build_command` y los campos
  `test_command`/`build_command` por fase deben completarse como parte de este change

## Q1 — Límite de alcance nítido

**Dentro de alcance (ítem #1):**

- Herramental de monorepo: gestor de paquetes, workspaces, configuración compartida de TS/lint/
  formato, ejecutor de tareas
- Esqueletos de aplicación para backend/frontend/worker con **cero módulos de dominio** (auth,
  procesos, votos, etc. NO se construyen aquí)
- Pipeline de generación de OpenAPI (NestJS → JSON OpenAPI → tipos de cliente generados) integrado en
  build/CI, consumido por el frontend y los tests (ADR-0004)
- Docker Compose para desarrollo local: Caddy con HTTPS local, backend, frontend, worker, PostgreSQL,
  Redis, conectados entre sí — no endurecimiento de producción
- Test runner + esqueleto de CI por paquete (Jest para backend, Vitest para frontend/worker/paquetes
  compartidos), con `test_command`/`build_command` escritos en `openspec/config.yaml`
- Un "walking skeleton" (esqueleto ambulante) mínimo: un endpoint de health que llega a Postgres
  (`SELECT 1`, sin esquema) y a Redis (PING), un trabajo BullMQ de demostración que prueba el cableado
  backend→Redis→worker, y una página de frontend que llama al endpoint de health a través de los tipos
  generados
- Prisma instalado y configurado (datasource/generator) con una única **migración baseline vacía**
  que demuestre que el pipeline de migraciones corre en Docker/CI — sin modelos de dominio

**Explícitamente diferido (no debe absorberse aquí de forma silenciosa):**

- #2 Esquema y migraciones: `Usuario`, `ProcesoElectoral`, `Voto`, `DerechoVoto`, etc. — el walking
  skeleton usa cero tablas de dominio
- #3 Motor de auditoría append-only (triggers, `EventoAuditoría`) — no se toca
- #4 Autenticación: sin login, sin lógica de cookies de sesión, sin guards. El andamiaje puede
  instalar la *dependencia* del cliente Redis o del session-store (ya necesaria para BullMQ) pero no
  debe implementar semántica de sesión
- #12/#15 patrón outbox real (tabla `JobCorreo` + despachador que la lee): el trabajo BullMQ de
  demostración usado para probar el cableado debe ser un **ping puro sin acoplamiento a la base de
  datos**, no un esbozo del lector del outbox — esto mantiene el ítem libre de esquema y evita
  confundir a quienes implementen el ADR-0012 más adelante
- Dependencias pdfmake/ExcelJS/Passport/Nodemailer — todavía no se instalan; solo se establece el
  límite de proceso del worker que las alojará después

**Regla de límite:** este ítem demuestra que las cañerías funcionan (camino HTTP
frontend→backend→DB, camino de cola backend→Redis→worker, terminación HTTPS, generación de contrato
tipado). No decide qué fluye por esas cañerías — eso corresponde a cada ítem posterior del backlog.

## Q2 — Herramental de monorepo

| Enfoque | Ventajas | Desventajas | Esfuerzo |
|---|---|---|---|
| npm workspaces (simple) | Cero herramental extra, viene incorporado en npm | Sin grafo de tareas ni caché; instalaciones lentas con más de 20 ítems de backlog; riesgo de dependencias fantasma (npm hoistea de forma laxa) | Bajo |
| Yarn workspaces (classic/berry) | Maduro, la opción PnP elimina dependencias fantasma | El PnP de berry genera fricción con parte del herramental de NestJS/Vite; la falta de familiaridad del equipo agrega riesgo | Bajo–Medio |
| **pnpm workspaces + Turborepo** | `node_modules` estricto y sin hoisting (evita fugas silenciosas entre backend/frontend/worker); pnpm es rápido y eficiente en disco; Turborepo aporta un pipeline liviano de tareas (`build`/`test`/`lint`) con caché local y `--filter`, que escala limpiamente a lo largo de 23 ítems de backlog; superficie de configuración mínima | Una pieza móvil más que los workspaces simples; el equipo debe aprender la sintaxis de pipeline de `turbo.json` | Bajo–Medio |
| Nx | El grafo de tareas más potente, generadores, detección de afectados, plugins oficiales de Nest/React | Configuración más pesada, generadores opinados que chocan con un repositorio que ya tiene convenciones arquitectónicas fuertes provenientes de los ADR/TDD; curva de aprendizaje más pronunciada; excesivo para 3 apps + 1–2 paquetes compartidos | Medio–Alto |

**Recomendación:** pnpm workspaces + Turborepo. El proyecto es pequeño (3 apps, 1–2 paquetes
compartidos), por lo que la maquinaria de generadores/plugins de Nx es sobrecarga injustificada; los
workspaces simples por sí solos carecen de caché y de una estrategia de "afectados" que gana valor
una vez que los 23 ítems del backlog aterrizan de forma incremental. El enlazado estricto de pnpm
protege directamente la intención de ADR-0001 ("los módulos deben mantenerse disciplinados") al
impedir que backend/frontend/worker compartan de forma silenciosa dependencias no declaradas.

## Q3 — Distribución de paquetes y aplicaciones

```text
apps/
  backend/     NestJS — módulos por dominio del PRD (vacío salvo el módulo de health por ahora)
  frontend/    SPA React + Vite
  worker/      consumidor Node.js + BullMQ
packages/
  contracts/   tipos OpenAPI generados + DTO compartidos escritos a mano (si los hubiera);
               publicado como paquete de workspace, consumido por apps/frontend y por los
               tests e2e de apps/backend
  config/      base compartida de tsconfig, eslint, prettier (opcional, puede empezar inline)
infra/
  docker/      un Dockerfile por aplicación (multi-stage)
  docker-compose.yml         servicios base (backend, worker, postgres, redis, caddy)
  docker-compose.dev.yml     overrides solo de desarrollo (puertos publicados, volúmenes de
                             recarga en caliente)
  Caddyfile
```

El cliente OpenAPI generado vive en `packages/contracts` (nunca directamente dentro de
`apps/frontend`), generado a partir de la salida de `@nestjs/swagger` de `apps/backend` mediante un
script (p. ej. `openapi-typescript` u `orval`) ejecutado como `pnpm run generate:contracts`. Tanto
`apps/frontend` como los propios tests e2e/de integración de `apps/backend` importan desde
`packages/contracts`, de modo que la deriva del contrato rompe la compilación en todas partes a la
vez — satisfaciendo directamente el costo declarado del ADR-0004 ("debe automatizarse en build/CI o
el frontend y el backend divergen silenciosamente").

CI debe incluir un **drift check** (verificación de deriva): regenerar `packages/contracts` y luego
fallar si hay diferencias sin comitear. Este es el mecanismo concreto contra el riesgo nombrado en
el ADR-0004.

> **Corrección aportada por la fase de diseño:** esta exploración proponía `git diff --exit-code` a
> secas. Ese comando ignora los archivos no rastreados, así que un endpoint nuevo —que genera un
> archivo nuevo— pasaría el check en falso. La comparación debe precederse de
> `git add --intent-to-add -- packages/contracts` o un mecanismo equivalente. Ver `design.md`.

## Q4 — Test runner y CI

| Paquete | Runner | Fundamento |
|---|---|---|
| `apps/backend` | Jest | El propio herramental de andamiaje de Nest (`@nestjs/testing`) apunta a Jest por defecto; la menor fricción y el mejor soporte de la comunidad |
| `apps/frontend` | Vitest + React Testing Library | Nativo de Vite (comparte configuración y pipeline de transformación), rápido, ESM-first |
| `apps/worker` | Vitest | Proceso Node plano, sin framework obligatorio — se alinea con el frontend para minimizar la superficie de herramental (2 runners en total, no 3) |
| `packages/contracts` | Vitest (si hay lógica escrita a mano) | Consistencia |
| e2e (backend) | Jest + Supertest contra un Postgres/Redis descartable (`docker-compose.test.yml` o testcontainers-node) | Valida el camino real HTTP+DB, no mocks |
| e2e (frontend, navegador) | Playwright | El E2E de navegador es solo una devDependency — no entra en conflicto con el rechazo de Playwright/Chromium *dentro del worker de producción* del ADR-0002; esa restricción trata sobre los recursos de runtime del VPS, no sobre el herramental de CI |

Actualizaciones recomendadas de `openspec/config.yaml`:

```yaml
testing:
  status: available
  test_command: "pnpm turbo run test"
  build_command: "pnpm turbo run build"
  coverage_threshold: 0   # kept at 0 for this item: walking-skeleton code is tiny; TDD process
                          # still applies per-line, but a global % threshold is not meaningful
                          # until domain code (item #2+) exists. Revisit once #2 lands.
```

Los `test_command`/`build_command` de las secciones apply/verify deben reflejar los mismos valores.

El proveedor de CI **no está declarado en ningún lugar del repositorio** (no hay `.github/`, ni
referencias a CI en TECH-DESIGN.md). GitHub Actions es el supuesto por defecto recomendado, pero se
marca como pregunta abierta para que `sdd-propose` la confirme explícitamente en lugar de asumirla en
silencio.

## Q5 — Docker Compose / Caddy / HTTPS para desarrollo local

Servicios: `caddy`, `backend`, `frontend` (servidor de desarrollo de Vite en modo dev, proxyeado por
Caddy para que las sesiones basadas en cookies se comporten como en producción — la sesión por cookie
httpOnly del ADR-0004 requiere semántica HTTPS real para probarse correctamente, incluso antes de que
el ítem #4 implemente el login), `worker`, `postgres`, `redis`.

- **TLS local:** la directiva `tls internal` de Caddy emite certificados desde una CA local de forma
  automática; documentar el paso único para confiar en esa CA (`caddy trust` o montar el certificado)
  para que los navegadores no adviertan. Esto es obligatorio, no cosmético, porque las cookies con
  flag `Secure` (ADR-0004) necesitan HTTPS real para ejercitarse localmente.
- **Dos archivos compose**, replicando la división del ADR-0007 entre endurecimiento de producción y
  comodidad de desarrollo: `docker-compose.yml` (base — sin puertos de DB/Redis publicados en el
  host, en línea con el "la DB y Redis nunca se exponen a Internet" del ADR-0007) más
  `docker-compose.dev.yml` (overrides solo de desarrollo: publicar Postgres/Redis en `127.0.0.1` para
  herramental local, bind mounts de hot-reload). Esto evita que la comodidad de desarrollo se filtre
  al archivo compose que eventualmente despliegue en el VPS.
- Postgres/Redis: volúmenes Docker nombrados, un `.env.example` versionado (nunca secretos reales) y
  servicios que se alcanzan entre sí por el nombre de host de la red Docker (`postgres`, `redis`),
  consistente con la topología de producción del ADR-0007 para que desarrollo y producción se
  mantengan estructuralmente idénticos.

## Q6 — Walking skeleton y estimación de presupuesto de líneas

El slice extremo a extremo más pequeño que demuestra los cimientos:

1. Backend `GET /health` — `SELECT 1` mediante una consulta raw de Prisma (sin esquema) más un `PING`
   de Redis, documentado con decoradores de `@nestjs/swagger`
2. Prisma instalado, datasource/generator configurados, una migración baseline **vacía**
   (`prisma migrate dev --create-only`) que demuestre que el pipeline de migraciones corre a través de
   Docker/CI
3. Página de frontend que llama a `/health` a través del cliente generado de `packages/contracts`,
   renderizando el estado de db/redis/worker
4. Worker: una cola/trabajo BullMQ `system.ping`, encolado por un disparador de depuración del backend
   (o al arrancar el backend), procesado por el worker, con el heartbeat legible de vuelta a través de
   `/health` (p. ej. timestamp de último procesamiento en Redis)
5. `docker compose up` levanta los cinco servicios detrás de Caddy/HTTPS y reproduce el esqueleto
   completo localmente

**Riesgo de presupuesto de líneas:** este ítem abarca más de 6 manifiestos de paquete, más de 6
tsconfigs, configuración de ESLint/Prettier, `turbo.json`, 3 Dockerfiles, 2 archivos compose, un
Caddyfile, `.env.example`, bootstrap de NestJS + módulo de health + tests, bootstrap de Vite + página
de health + tests, bootstrap del worker + trabajo ping + tests, init de Prisma + migración baseline,
un workflow de CI, y documentación de README/setup. De forma realista, esto excede el presupuesto de
revisión de 400 líneas de cambios autorados si se entrega como un único PR — la mayor parte es
configuración escrita a mano, no "goldens generados" excluibles. **Recomendación: `sdd-tasks` debería
planificar slices de PR encadenados**, por ejemplo:

- Slice A: herramental de monorepo (gestor de paquetes, workspaces, turbo, configuraciones
  compartidas) — sin código de aplicación
- Slice B: esqueleto del backend + Jest + módulo de health/tests + migración baseline de Prisma
- Slice C: esqueleto del frontend + Vitest + cableado de generación del cliente OpenAPI + página de
  health/tests
- Slice D: esqueleto del worker + trabajo ping de BullMQ + tests
- Slice E: Docker Compose + Caddy/HTTPS + pipeline de CI que une A–D, actualización de
  `openspec/config.yaml`

Este es un pronóstico para `sdd-tasks`, no una decisión tomada aquí.

## Q7 — Riesgos y restricciones provenientes de los ADR / la revisión adversarial

- **El costo del ADR-0004 es real** (el paso de generación OpenAPI→cliente debe automatizarse o la
  deriva del contrato es silenciosa): se aborda arriba con el drift check en CI — no debe omitirse.
- **El costo del ADR-0002 es real** (Node es de un solo hilo por proceso; la generación de PDF
  intensiva en CPU debe vivir solo en el worker, nunca en el backend): el andamiaje no debería
  instalar pdfmake todavía, pero el límite de proceso del worker debe seguir siendo el único lugar que
  alguna vez lo aloje — una restricción estructural para ítems futuros (#17), no para este.
- **ADR-0007** (Postgres/Redis nunca expuestos a Internet en producción; la comodidad de desarrollo no
  debe filtrarse al archivo compose de producción): se aborda mediante la división en dos archivos
  compose descrita arriba.
- **Patrón outbox del ADR-0012**: el trabajo BullMQ de demostración debe seguir siendo un ping puro con
  cero acoplamiento a la base de datos — no es un esbozo del futuro despachador del outbox. Marcar esto
  explícitamente en `sdd-propose`/`sdd-design` para que quienes implementen #12/#15 no asuman que el
  trabajo del walking skeleton es andamiaje de outbox reutilizable.
- **ADR-0003**: Prisma necesitará SQL raw para triggers y restricciones (auditoría append-only, UNIQUE
  compuesto) que el DSL de esquema de Prisma no puede expresar — el andamiaje solo necesita demostrar
  que el mecanismo de migración funciona de extremo a extremo (migración baseline vacía); los ítems
  #2/#3 agregarán las migraciones con SQL raw.
- **Ítems abiertos de REVISION-ADVERSARIAL.md** (herramental de pruebas de carga, aspectos de la ley de
  protección de datos, simulacro de contingencia, wireframes desactualizados): ninguno bloquea este
  ítem, pero el dimensionamiento y la red de Docker Compose no deberían impedir inyectar más adelante
  k6/artillery (#23) contra la misma topología de compose — no hace falta ningún cambio de andamiaje
  ahora, solo evitar decisiones que lo imposibiliten (por ejemplo, no fijar límites de conexión muy por
  debajo de lo que necesitaría una prueba de carga).
- **Proveedor de CI sin confirmar** — no hay `.github/` ni mención de CI en ningún lugar del
  repositorio; tratarlo como pregunta abierta para `sdd-propose`, no como supuesto silencioso.
- **El TDD estricto también aplica a este ítem**: aunque `coverage_threshold` quede en 0 (todavía no es
  significativo), cada línea del walking skeleton (endpoint de health, trabajo ping, página de health
  del frontend) debería escribirse igualmente RED→GREEN→REFACTOR según la configuración global de TDD
  estricto — el umbral bajo de cobertura trata sobre que la métrica es prematura, no sobre saltearse el
  proceso de TDD.

## Recomendación

Adoptar el herramental de monorepo pnpm + Turborepo, la distribución `apps/*` + `packages/contracts` +
`infra/docker`, los test runners Jest (backend) + Vitest (frontend/worker) y el walking skeleton libre
de esquema descrito en Q6, acotado y encadenado en slices de PR según el pronóstico de presupuesto de
400 líneas. Mantener este ítem estrictamente en "las cañerías funcionan" — todo concepto de dominio
(esquema, auth, auditoría, contenido del outbox) queda afuera.

## Riesgos

- Presupuesto de líneas: entregar este ítem en un único PR excederá el presupuesto de revisión de 400
  líneas; necesita slices encadenados (ver Q6).
- El proveedor de CI no está declarado en el repositorio — debe confirmarse antes de
  `sdd-tasks`/`sdd-apply`, no asumirse.
- Riesgo de que quienes implementen #12/#15 confundan el trabajo ping de demostración de BullMQ con
  andamiaje de outbox — debe nombrarse claramente como no reutilizable.
- El paso de confianza en el HTTPS local (CA interna de Caddy) es un punto de fricción de onboarding;
  debe documentarse, o quienes se sumen verán comportamiento roto de cookies y lo diagnosticarán mal
  como un bug de la aplicación.

## Listo para Proposal

Sí. El límite de alcance, la elección de herramental, la distribución, la configuración de test/CI, el
enfoque de Docker Compose/HTTPS y la definición del walking skeleton son todos lo suficientemente
concretos para que `sdd-propose` redacte un `proposal.md`, con dos ítems marcados para confirmación
explícita durante la fase de propuesta: (1) el proveedor de CI (se asume GitHub Actions), y (2) el plan
de entrega en slices de PR encadenados dado el presupuesto de 400 líneas.
