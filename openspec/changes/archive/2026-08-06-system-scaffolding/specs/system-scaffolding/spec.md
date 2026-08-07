# Especificación: system-scaffolding

## Purpose

Provee el andamiaje de repositorio (monorepo, esqueletos de aplicación, pipeline de contrato
OpenAPI, entorno local con Docker Compose/Caddy, CI, dos roles de Postgres) que demuestra que las
cañerías del sistema funcionan (Frontend → HTTPS/REST+OpenAPI → Backend → Postgres/Redis → Worker,
según TECH-DESIGN.md) sin decidir qué fluye por ellas. Capacidad greenfield — no hay spec previa que
modificar.

## Requirements

### Requirement: Monorepo y pipeline de tareas
El sistema MUST usar pnpm workspaces con Turborepo, y MUST exponer `build`, `test` y `lint` como
comandos ejecutables desde la raíz del repositorio para las tres apps (`apps/backend`,
`apps/frontend`, `apps/worker`) y `packages/contracts` (ADR-0001, ADR-0002).

#### Scenario: Build y test corren desde la raíz
- GIVEN un checkout limpio del repositorio con dependencias instaladas vía pnpm
- WHEN se ejecuta `pnpm turbo run build` y luego `pnpm turbo run test` desde la raíz
- THEN ambos comandos terminan con código de salida 0 sin ejecutarse manualmente dentro de cada paquete

### Requirement: Distribución de paquetes sin `packages/config`
El sistema MUST distribuir el código en `apps/{backend,frontend,worker}`, `packages/contracts` e
`infra/docker`. La configuración de tsconfig/eslint/prettier MUST mantenerse inline por aplicación;
`packages/config` MUST NOT existir en este change.

#### Scenario: No existe extracción de configuración compartida
- GIVEN el árbol de paquetes del monorepo tras aplicar este change
- WHEN se inspecciona el directorio `packages/`
- THEN existe `packages/contracts` y NO existe ningún directorio `packages/config`

### Requirement: Pipeline de contratos OpenAPI con drift check en CI
El sistema MUST generar tipos desde `@nestjs/swagger` hacia `packages/contracts`, consumidos por
`apps/frontend` y por los tests e2e de `apps/backend`. CI MUST regenerar los contratos y fallar el
job ante cualquier diferencia no comiteada, mitigando el costo declarado del ADR-0004.

La detección MUST incluir los archivos **no rastreados**: `git diff --exit-code` por sí solo los
ignora, de modo que un endpoint nuevo —que produce un archivo generado nuevo— pasaría el check en
falso. El paso de CI MUST ejecutar `git add --intent-to-add -- packages/contracts` antes de
comparar, o un mecanismo equivalente que sí observe archivos nuevos.

#### Scenario: CI falla ante contrato desincronizado
- GIVEN un pull request donde el DTO de `apps/backend` cambió pero `packages/contracts` no fue
  regenerado ni comiteado
- WHEN el job de CI ejecuta el paso de generación de contratos seguido de la comparación
- THEN el job de CI termina en fallo antes de llegar al paso de test

#### Scenario: CI falla ante un endpoint nuevo cuyo contrato generado no fue comiteado
- GIVEN un pull request que agrega un endpoint nuevo en `apps/backend`, cuya regeneración produce un
  archivo **nuevo** dentro de `packages/contracts` que no fue comiteado
- WHEN el job de CI ejecuta el paso de generación de contratos seguido de la comparación
- THEN el job de CI termina en fallo, porque la comparación observa archivos no rastreados y no solo
  modificaciones de archivos ya versionados

#### Scenario: CI pasa con contrato sincronizado
- GIVEN un pull request donde `packages/contracts` fue regenerado y comiteado junto con el cambio de DTO
- WHEN el job de CI ejecuta el mismo paso de generación seguido de la comparación
- THEN el job de CI continúa sin fallo en ese paso

### Requirement: Walking skeleton verificable end-to-end
El sistema MUST exponer `GET /health` en el backend, que SHALL ejecutar `SELECT 1` contra Postgres
(sin esquema de dominio) y `PING` contra Redis, reportando el estado real de ambas dependencias. Una
página de frontend MUST consumir el cliente generado de `packages/contracts` para renderizar ese
estado. Es prueba interna de desarrollo/CI: sin pulido de UI, no es una demo para stakeholders.

#### Scenario: `/health` reporta ambas dependencias saludables
- GIVEN Postgres y Redis corriendo y accesibles desde el backend
- WHEN se hace `GET /health`
- THEN la respuesta tiene status 200 y un cuerpo que indica éxito de `SELECT 1` y de `PING`

#### Scenario: `/health` refleja una dependencia caída
- GIVEN Redis detenido o inaccesible mientras Postgres sigue disponible
- WHEN se hace `GET /health`
- THEN la respuesta indica explícitamente el fallo de Redis, sin ocultar el estado real ni devolver 200 genérico

#### Scenario: Frontend renderiza el estado real vía cliente generado
- GIVEN el backend respondiendo `/health` con Postgres y Redis saludables
- WHEN se carga la página de health del frontend, que llama al backend a través del cliente generado
- THEN la página renderiza el estado devuelto por el backend, no un valor mockeado en el frontend

### Requirement: Trabajo BullMQ `system.ping` de ida y vuelta
El sistema MUST implementar un trabajo BullMQ `system.ping` encolado desde el backend y procesado por
`apps/worker`, con el heartbeat del último procesamiento legible desde `/health`.

#### Scenario: El heartbeat llega de vuelta al backend
- GIVEN el worker corriendo y conectado a la misma instancia de Redis que el backend
- WHEN el backend encola un trabajo `system.ping`
- THEN el worker lo procesa y `/health` refleja un timestamp de heartbeat posterior al encolado, dentro de un tiempo de espera razonable

### Requirement: No-acoplamiento del `system.ping` al patrón outbox
El trabajo `system.ping` MUST NOT tener acoplamiento a ninguna tabla de base de datos ni reutilizar
convenciones del patrón outbox del ADR-0012. El sistema MUST documentar, mediante convención de
nombres y una nota en doc-comment/README, que este trabajo no es andamiaje reutilizable para #12/#15.

#### Scenario: `system.ping` no toca la base de datos
- GIVEN el código fuente del trabajo `system.ping` en `apps/worker`
- WHEN se inspecciona su implementación
- THEN no hay ninguna consulta ni cliente de Postgres/Prisma referenciado dentro de ese handler

### Requirement: Entorno local reproducible con Docker Compose y Caddy
El sistema MUST levantar backend, frontend, worker, Postgres y Redis detrás de Caddy con HTTPS local
(`tls internal`) mediante `docker compose up`, usando un archivo compose base sin puertos de DB/Redis
publicados hacia el host y un archivo `.dev.yml` de overrides para comodidad de desarrollo
(ADR-0007).

#### Scenario: `docker compose up` reproduce el sistema completo
- GIVEN el repositorio con Docker instalado y sin contenedores previos corriendo
- WHEN se ejecuta `docker compose up` (con el override de desarrollo)
- THEN los cinco servicios quedan healthy y `GET /health` vía Caddy sobre HTTPS responde 200 con Postgres y Redis en estado saludable

#### Scenario: El compose base no publica puertos de DB/Redis
- GIVEN el archivo `docker-compose.yml` base sin el override de desarrollo
- WHEN se inspeccionan sus definiciones de servicio para `postgres` y `redis`
- THEN ninguno declara `ports` que mapeen hacia el host

### Requirement: Dos roles de Postgres separados
El sistema MUST aprovisionar, en el script de init de Docker Compose, un rol migrador/propietario con
privilegios DDL usado exclusivamente por `prisma migrate`, y un rol de aplicación en runtime con el
que corre el backend, disponibles como dos cadenas de conexión distintas tanto en desarrollo local
como en CI (ADR-0003, enmienda registrada en `proposal.md`). La revocación de `UPDATE`/`DELETE` sobre
la tabla de auditoría queda fuera de este change (ítem #3).

#### Scenario: El backend no puede correr migraciones
- GIVEN la cadena de conexión de runtime configurada en el backend
- WHEN el backend intenta ejecutar una operación DDL con esa conexión (p. ej. `CREATE TABLE`)
- THEN Postgres rechaza la operación por falta de privilegios

#### Scenario: `prisma migrate` corre exclusivamente con el rol migrador
- GIVEN la cadena de conexión del rol migrador/propietario
- WHEN se ejecuta `prisma migrate deploy` en desarrollo local y en CI
- THEN la migración baseline se aplica sin errores de permisos, usando una cadena de conexión distinta a la del backend

### Requirement: Migración baseline vacía de Prisma
El sistema MUST incluir una única migración baseline de Prisma sin modelos de dominio, aplicable
limpiamente vía `prisma migrate deploy` tanto en Docker como en CI.

#### Scenario: La migración baseline se aplica limpiamente en CI
- GIVEN una base de datos Postgres nueva sin migraciones aplicadas, en el job de CI
- WHEN CI ejecuta el paso de migración con el rol migrador
- THEN la migración baseline se aplica sin error y no crea ninguna tabla de dominio

### Requirement: Configuración de comandos en `openspec/config.yaml`
El sistema MUST actualizar `openspec/config.yaml` con `testing.status: available`,
`testing.test_command: "pnpm turbo run test"`, `testing.build_command: "pnpm turbo run build"`, los
mismos valores replicados en `apply.test_command`/`verify.test_command` y `verify.build_command`, y
`coverage_threshold` MUST permanecer en 0.

#### Scenario: Los comandos quedan completados y consistentes
- GIVEN `openspec/config.yaml` tras aplicar este change
- WHEN se comparan los campos `testing.test_command`, `apply.test_command`, `verify.test_command`, `testing.build_command` y `verify.build_command`
- THEN todos usan `pnpm turbo run test` / `pnpm turbo run build` según corresponda, y `coverage_threshold` sigue siendo 0
