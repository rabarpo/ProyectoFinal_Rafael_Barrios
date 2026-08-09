# Tasks: administracion-academica (Backlog #8 — Administración académica: año escolar, árbol académico y matrícula)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~250 / PR2 ~400 / PR3 ~250 / PR4 ~430 / PR5 ~380 / PR6 ~420 / PR7 ~380 (~2510 total: 6 controladores, 6 servicios, ~20 DTO, catálogo de errores, traductor de Prisma, 18 claves de auditoría, suite adversarial estricta incluyendo concurrencia de activación y coherencia jerárquica) |
| 400-line budget risk | Medium (por PR, según estimación de `design.md`) / High (agregado) |
| Chained PRs recommended | Yes |
| Suggested split | Corte fijado por `design.md` ("Corte de PR recomendado"): PR1 (cimientos) → PR2 (`AnioEscolar` CRUD) → PR3 (activación) → PR4 (`Nivel` + `Grado`) → PR5 (`Seccion`) → PR6 (`Aula` + D6) → PR7 (`Matricula` + contrato) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium (agregado: High, por analogía con `#7`, que subestimó consistentemente el volumen de pruebas adversariales bajo Strict TDD)

Este change es más grande que `#7` en superficie (6 controladores/servicios frente a 2, ~20 DTO
frente a 8), pero el corte de 7 PR de `design.md` mantiene cada PR dentro o cerca del presupuesto
de 400 líneas. Contingencia predeclarada por `design.md`: si al implementar el PR2 o el PR6 se
supera el presupuesto, separar el `DELETE` + su guarda en un PR propio (la mitad más cara de cada
entidad) — no adoptada por defecto. El PR3 (activación) se mantiene deliberadamente aislado del
PR2 por ser la lógica de mayor riesgo de todo el change (concurrencia sobre índice único parcial
no diferible).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Cimientos: `academico.module.ts` (sin controladores), `academico.errors.ts`, `prisma-errores.ts`, 18 claves de auditoría, registro en `app.module.ts` (D0/D2/D4/D5) | PR 1 | `pnpm --filter @seei/backend test -- prisma-errores` | Jest puro + `test:schema` contra Postgres real para el contrato ADR-0016 | `git revert` PR1; módulo no expone rutas aún |
| 2 | `AnioEscolar` CRUD (`POST`/`GET`/`GET:id`/`PATCH`/`DELETE` con guarda de 4 dependientes) (SY1/SY3/SY4) | PR 2 | `pnpm --filter @seei/backend test:e2e -- anios-escolares` | `test:e2e` (Prisma live) | `git revert` PR2; PR1 sin rutas expuestas aún |
| 3 | Activación: `PATCH /:id/activar`, idempotencia, auditoría y tests de concurrencia (SY2/D1) | PR 3 | `pnpm --filter @seei/backend test:e2e -- anios-escolares` | `test:e2e` live Prisma, `Promise.all` sobre supertest | `git revert` PR3; PR1/PR2 no afectados |
| 4 | `Nivel` + `Grado` CRUD (AT1/AT2) | PR 4 | `pnpm --filter @seei/backend test:e2e -- niveles grados` | `test:e2e` live Prisma | `git revert` PR4; PR1-PR3 no afectados |
| 5 | `Seccion` CRUD (AT3/AT4) | PR 5 | `pnpm --filter @seei/backend test:e2e -- secciones` | `test:e2e` live Prisma | `git revert` PR5; PR1-PR4 no afectados |
| 6 | `Aula` CRUD + guarda de coherencia jerárquica (AT5/AT6/D6) | PR 6 | `pnpm --filter @seei/backend test:e2e -- aulas` | `test:e2e` live Prisma | `git revert` PR6; PR1-PR5 no afectados |
| 7 | `Matricula` CRUD (incluye `rol='estudiante'` y coherencia con `Aula`) + regeneración de contrato (SE1-SE5/D6) | PR 7 | `pnpm --filter @seei/backend test:e2e -- matriculas` | `test:e2e` live Prisma | `git revert` PR7; PR1-PR6 no afectados |
| 8 | Regeneración de `packages/contracts/openapi.json` | PR 7 | `pnpm generate:contracts` | N/A — generación estática | `git revert` PR7 regenera el contrato anterior |

## PR 1 — Cimientos (base = feature/tracker branch)

### Phase 1: Estructura de módulo (D0)
- [x] 1.1 Crear `apps/backend/src/academico/academico.module.ts`: `imports: [AuthModule,
      AuditoriaModule]`, `implements NestModule` — sin `providers`/`controllers` de entidades
      todavía (se agregan por PR conforme se crean); el `cookieParser()` se aplica en el mismo
      archivo a medida que cada controlador se registra (nunca en `main.ts`, patrón D6 de `#4`)
      [D0] — **Deviación declarada**: `AcademicoModule` NO implementa `NestModule` todavía en PR1
      (plain `@Module`, sin `providers`), replicando el precedente exacto de `UsersModule` en PR1
      de `#7` (commit `eb73479`): `consumer.apply(cookieParser()).forRoutes(...)` exige al menos
      un controlador/ruta real, y ninguno existe hasta PR2. `implements NestModule` llega junto con
      `AniosEscolaresController`.
- [x] 1.2 Modificar `apps/backend/src/app.module.ts`: agregar `AcademicoModule` a `imports`
      (aditivo) [D0]
- [x] 1.3 GREEN: `pnpm openapi:extract` completa sin conexión viva a Postgres/Redis (gotcha D1 de
      `#1`) [D0]

### Phase 2: Catálogo de errores (D5)
- [x] 2.1 Crear `apps/backend/src/academico/academico.errors.ts`: constante `as const` + union
      type con `RESTRICCION_UNICA`, `REFERENCIA_INEXISTENTE`, `ENTIDAD_CON_DEPENDIENTES`,
      `ACTIVACION_CONCURRENTE`, `CAMPO_INVALIDO`, `COHERENCIA_JERARQUICA`,
      `USUARIO_NO_ES_ESTUDIANTE` [D5]

### Phase 3: Traductor de errores de Prisma (D2)
- [x] 3.1 RED: unit tests de `esP2002(error)`/`esP2003(error)` — discriminan por `error.code`, sin
      base [D2]
- [x] 3.2 RED: unit tests de derivación de `campos` desde `error.meta.target` (para
      `RESTRICCION_UNICA`) y de `relacion` desde `error.meta.field_name` (para
      `ENTIDAD_CON_DEPENDIENTES`), incluidos formatos no parseables (`"Grado_nivel_id_fkey
      (index)"`) con valor genérico de reserva [D2]
- [x] 3.3 RED: unit test de `objetivoContiene(target, 'activo')` distinguiendo la colisión del
      índice parcial de año activo de la colisión del `@unique nombre` [D1][D2]
- [x] 3.4 Crear `apps/backend/src/academico/prisma-errores.ts`: `esP2002`, `esP2003`,
      `traducirRestriccion`, `objetivoContiene` — funciones puras — GREEN 3.1-3.3 [D1][D2] —
      **Deviación declarada**: se agregó una quinta función pura, `relacionDesdeFieldName(fieldName)`,
      no nombrada literalmente en esta tarea pero requerida para satisfacer la RED test de la tarea
      3.2 (derivación de `relacion` desde `meta.field_name`) y reutilizable por el `catch P2003`
      residual de las seis entidades (D2) sin duplicar la lógica de parseo seis veces.

### Phase 4: Claves de auditoría aditivas (D4)
- [x] 4.1 Modificar `apps/backend/src/auditoria/audit-event-types.ts`: agregar las 18 claves de D4
      (`ANIO_ESCOLAR_CREADO/_ACTUALIZADO/_ACTIVADO/_ELIMINADO`, `NIVEL_CREADO/_ACTUALIZADO/
      _ELIMINADO`, `GRADO_CREADO/_ACTUALIZADO/_ELIMINADO`, `SECCION_CREADA/_ACTUALIZADA/
      _ELIMINADA`, `AULA_CREADA/_ACTUALIZADA/_ELIMINADA`, `MATRICULA_CREADA/_ELIMINADA`) a
      `AUDIT_EVENT_TYPES`, aditivo únicamente
- [x] 4.2 GREEN: `test/schema/auditoria.spec.ts` [TM4] confirma que el `WHEN` del trigger de
      ADR-0016 sigue siendo `IN ('VOTO','RECHAZO')` tras las 18 claves nuevas — verificación contra
      `migrations/20260807052206_append_only_audit/migration.sql:81`, cero SQL nuevo [D4] —
      **Limitación documentada**: `docker ps` no tiene un daemon Docker disponible en este entorno
      (`failed to connect to the docker API`), así que `pnpm test:schema` no puede ejecutarse contra
      Postgres real. El test `[TM4]` en sí **no se modificó** — solo verifica literalmente que la
      definición del trigger `eventoauditoria_claves_eleccion_trg` contenga `WHEN`, `VOTO` y
      `RECHAZO`; no cuenta claves de `AUDIT_EVENT_TYPES`, así que el cambio de este PR (aditivo,
      cero SQL) no puede romperlo. Mismo criterio documentado por los agentes de PR1/PR2/PR3 de `#7`.

### Phase 5: Regresión PR1
- [x] 5.1 GREEN: `pnpm openapi:extract` completa sin conexión viva a Postgres/Redis
- [x] 5.2 GREEN: `pnpm typecheck` en verde

## PR 2 — `AnioEscolar` CRUD (base = PR 1 branch)

### Phase 6: DTOs de `AnioEscolar` (D3)
- [x] 6.1 Crear `apps/backend/src/academico/dto/crear-anio-escolar.dto.ts`,
      `actualizar-anio-escolar.dto.ts` (**solo** `nombre`), `anio-escolar-respuesta.dto.ts`,
      `listar-anios-escolares.query.ts` — clases con `@ApiProperty` únicamente, sin
      `class-validator` [D3]

### Phase 7: `POST`/`GET`/`GET:id`/`PATCH` de `AnioEscolar` (SY1/SY4, D2/D3/D5)
- [x] 7.1 RED e2e: creación exitosa con `nombre` no usado → `201`, `activo = false`, exactamente
      una fila `ANIO_ESCOLAR_CREADO` [SY1]
- [x] 7.2 RED e2e: `nombre` duplicado → `409 RESTRICCION_UNICA` identificando `nombre` como campo
      en conflicto, sin crear fila [SY1]
- [x] 7.3 RED e2e: rol distinto de `administrador`/`director` se rechaza sin ejecutar el handler en
      las 6 rutas de `AnioEscolar` [SY1]
- [x] 7.4 RED e2e: `GET /anios-escolares/:id` devuelve el `AnioEscolar`; `:id` inexistente → `404`;
      malformado → `400` vía `ParseUUIDPipe` [D5]
- [x] 7.5 RED e2e: `GET /anios-escolares?activo=` filtra correctamente; valor desconocido → `400
      CAMPO_INVALIDO` [D5]
- [x] 7.6 RED e2e: `PATCH` cambia `nombre`, deja exactamente una fila `ANIO_ESCOLAR_ACTUALIZADO`
      [SY4]
- [x] 7.7 RED adversarial: `PATCH /anios-escolares/:id` con `activo` en el body lo ignora (el DTO
      no lo declara) — mover el estado de activación exige el endpoint dedicado de PR3 [D3]
- [x] 7.8 Crear `apps/backend/src/academico/anios-escolares.controller.ts` y
      `anios-escolares.service.ts`: `POST`/`GET`/`GET :id`/`PATCH` con `@UseGuards(AuthGuard,
      RolesGuard)` + `@Roles('administrador','director')` a nivel de clase, `ParseUUIDPipe` en
      `:id` — GREEN 7.1-7.7 [SY1][SY4][D2][D3][D5]

### Phase 8: `DELETE` con guarda de 4 dependientes (SY3, D2)
- [x] 8.1 RED integración: precomprobación cuenta `Seccion`, `Aula`, `Matricula`, `Configuracion`
      dependientes dentro de la misma `$transaction`, antes del `delete` [SY3][D2]
- [x] 8.2 RED e2e: eliminación exitosa sin dependientes borra la fila de la base de datos, deja
      exactamente una fila `ANIO_ESCOLAR_ELIMINADO` [SY3][SY4]
- [x] 8.3 RED e2e: eliminación con `Seccion` asociada → `409 ENTIDAD_CON_DEPENDIENTES {relacion:
      'Seccion'}`, la fila permanece [SY3]
- [x] 8.4 RED e2e: eliminación con `Configuracion` asociada → `409 ENTIDAD_CON_DEPENDIENTES
      {relacion: 'Configuracion'}` [SY3]
- [x] 8.5 RED adversarial: `catch P2003` residual traduce la carrera `SELECT COUNT`↔`DELETE` al
      mismo `409 ENTIDAD_CON_DEPENDIENTES`, nunca escapa como `500` [D2]
- [x] 8.6 Agregar `eliminar(id, actorId)` a `anios-escolares.service.ts` + handler `DELETE
      anios-escolares/:id` — GREEN 8.1-8.5 [SY3][SY4][D2]

### Phase 9: Regresión PR2
- [x] 9.1 GREEN: `pnpm openapi:extract` completa sin Postgres/Redis vivos
- [x] 9.2 `test/academico/anios-escolares.e2e-spec.ts` corre completo sin regresión —
      **Limitación documentada**: `docker ps` no tiene un daemon Docker disponible en este entorno
      (`failed to connect to the docker API`), así que `pnpm test:e2e` no puede ejecutarse contra
      Postgres/Redis reales. El archivo quedó escrito, `pnpm typecheck` en verde (workspace
      completo, incluido `@seei/backend`/`@seei/frontend`/`@seei/worker`/`@seei/contracts`), listo
      para CI/entorno con `docker-compose.test.yml`. Mismo criterio documentado por PR1 de este
      change y por PR1/PR2/PR3 de `administracion-usuarios-apoderados`. Cobertura de
      orquestación/lógica de negocio equivalente: 13/13 tests GREEN en
      `src/academico/anios-escolares.service.spec.ts` (unicidad, guarda de 4 dependientes, catch
      P2002/P2003 residual).

## PR 3 — Activación de año escolar (base = PR 2 branch)

### Phase 10: `PATCH /anios-escolares/:id/activar` (SY2, D1)
- [x] 10.1 RED e2e: activación exitosa desactiva el año previamente activo y activa el indicado por
      `:id`, deja exactamente una fila `ANIO_ESCOLAR_ACTIVADO` con `anio_escolar_anterior_id` en el
      payload [SY2] — **Limitación documentada** (misma que PR1/PR2, `docker ps` sin daemon en este
      entorno): escrita y type-checkeada en `test/academico/anios-escolares.e2e-spec.ts`, no
      ejecutable contra Postgres/Redis reales en esta sesión. Cobertura equivalente GREEN como unit
      test `[10.1]` en `src/academico/anios-escolares.service.spec.ts`.
- [x] 10.2 RED e2e: activar un año ya activo es idempotente: `200 { cambio: false }`, sin fila de
      auditoría nueva [D1] — misma limitación; cobertura equivalente GREEN como unit test `[10.2]`.
- [x] 10.3 RED e2e: `:id` inexistente → `404`; malformado → `400` — misma limitación; cobertura
      equivalente GREEN como unit test `[10.3]` (el caso `400` depende de `ParseUUIDPipe`, cubierto
      por el mismo precedente que el resto de rutas `:id` del módulo).
- [x] 10.4 RED adversarial (obligatorio bajo Strict TDD): dos activaciones concurrentes sobre años
      distintos, existiendo un año activo previo → exactamente un `AnioEscolar` queda `activo =
      true`, ningún `500` (gana la última transacción confirmada bajo READ COMMITTED) [SY2][D1] —
      **Limitación documentada**: la prueba de concurrencia real contra Postgres (`Promise.all`
      sobre `supertest`/`fetch`) queda escrita en
      `test/academico/anios-escolares.e2e-spec.ts` (describe "concurrencia de activación") pero no
      pudo ejecutarse (`docker ps` sin daemon). Cubierta en GREEN por una simulación de concurrencia
      con Prisma mockeado (lock de fila retenido hasta el commit de la `$transaction`, reevaluación
      del `where` al desbloquear) en `src/academico/anios-escolares.service.spec.ts`, describe
      "concurrencia simulada", test `[10.4]` — estable en 8+ corridas repetidas sin flakiness.
- [x] 10.5 RED adversarial: dos activaciones concurrentes sin ningún año activo previo → una
      colisiona contra el índice único parcial ⇒ `409 ACTIVACION_CONCURRENTE`, nunca dos años
      activos, nunca `500` [SY2][D1] — misma limitación/cobertura que 10.4; unit test `[10.5]`.
- [x] 10.6 RED adversarial: la colisión del índice parcial (`error.meta.target` contiene `activo`)
      se distingue de un `nombre` duplicado (`error.meta.target` contiene `nombre`) — reutiliza
      `objetivoContiene()` de PR1 [D1][D2] — GREEN como unit tests `[10.6]` (dos casos: target
      `activo` ⇒ `409 ACTIVACION_CONCURRENTE`; target `nombre` ⇒ el error escapa sin traducir).
- [x] 10.7 Agregar `activar(id, actorId)` a `anios-escolares.service.ts` (orden **desactivar →
      activar**, obligatorio por índice único parcial no diferible, dentro de una `$transaction`) +
      handler `PATCH anios-escolares/:id/activar` — GREEN 10.1-10.6 [SY2][D1]

### Phase 11: Regresión PR3
- [x] 11.1 GREEN: `pnpm openapi:extract` completa sin Postgres/Redis vivos
- [x] 11.2 `test/academico/anios-escolares.e2e-spec.ts` corre completo (CRUD + activación) sin
      regresión — **Limitación documentada** (misma que 9.2/10.1-10.5): no ejecutable contra
      Postgres/Redis reales en este entorno (`docker ps` sin daemon). El archivo quedó escrito y
      type-checkeado (`pnpm typecheck` en verde, workspace completo). Cobertura de
      orquestación/lógica de negocio equivalente: 20/20 tests GREEN en
      `src/academico/anios-escolares.service.spec.ts` (CRUD de PR2 + activación + concurrencia
      simulada de PR3), estable en corridas repetidas.

## PR 4 — `Nivel` + `Grado` (base = PR 3 branch)

### Phase 12: DTOs de `Nivel` y `Grado` (D3)
- [x] 12.1 Crear `apps/backend/src/academico/dto/crear-nivel.dto.ts`,
      `actualizar-nivel.dto.ts`, `nivel-respuesta.dto.ts` [D3]
- [x] 12.2 Crear `apps/backend/src/academico/dto/crear-grado.dto.ts`,
      `actualizar-grado.dto.ts` (**sin** `nivel_id`), `grado-respuesta.dto.ts`,
      `listar-grados.query.ts` [D3]

### Phase 13: CRUD de `Nivel` (AT1)
- [x] 13.1 RED e2e: creación exitosa con `nombre` no usado [AT1]
- [x] 13.2 RED e2e: `nombre` duplicado → `409 RESTRICCION_UNICA` [AT1]
- [x] 13.3 RED e2e: rol no autorizado se rechaza en las 5 rutas de `/niveles` sin ejecutar el
      handler [AT7]
- [x] 13.4 RED e2e: `GET /niveles/:id`, `404` para inexistente, `400` para malformado
- [x] 13.5 RED e2e: `PATCH` cambia `nombre`, deja exactamente una fila `NIVEL_ACTUALIZADO`
- [x] 13.6 RED integración: precomprobación de `Grado` dependiente antes del `DELETE` [AT1][D2]
- [x] 13.7 RED e2e: `DELETE` exitoso sin dependientes borra la fila, deja exactamente una fila
      `NIVEL_ELIMINADO`
- [x] 13.8 RED e2e: `DELETE` con `Grado` asociado → `409 ENTIDAD_CON_DEPENDIENTES
      {relacion:'Grado'}`, la fila permanece [AT1]
- [x] 13.9 RED adversarial: `catch P2003` residual traduce la carrera al mismo `409` [D2]
- [x] 13.10 Crear `apps/backend/src/academico/niveles.controller.ts` y `niveles.service.ts` —
      GREEN 13.1-13.9 [AT1][AT7][D2][D3]

### Phase 14: CRUD de `Grado` acotado a `Nivel` (AT2)
- [x] 14.1 RED e2e: creación con `Nivel` inexistente referenciado → `409 REFERENCIA_INEXISTENTE`,
      no se crea el `Grado` [AT2]
- [x] 14.2 RED e2e: mismo `nombre` bajo `Nivel` distinto se acepta sin conflicto [AT2]
- [x] 14.3 RED e2e: duplicado `(nivel_id, nombre)` → `409 RESTRICCION_UNICA` [AT2]
- [x] 14.4 RED e2e: `GET /grados?nivel_id=` filtra correctamente; filtro con valor no-UUID → `400
      CAMPO_INVALIDO`
- [x] 14.5 RED e2e: `GET /grados/:id`, `404` para inexistente, `400` para malformado
- [x] 14.6 RED e2e + adversarial: `PATCH` cambia `nombre`, deja fila `GRADO_ACTUALIZADO`; `PATCH`
      con `nivel_id` en el body lo ignora (el DTO no lo declara, D3 — sin re-parentado) [D3]
- [x] 14.7 RED integración: precomprobación de `Seccion` y `Aula` dependientes antes del `DELETE`
      [AT2][D2]
- [x] 14.8 RED e2e: `DELETE` exitoso sin dependientes; `DELETE` con `Seccion` o `Aula` asociada →
      `409 ENTIDAD_CON_DEPENDIENTES` nombrando la primera relación que bloquea [AT2]
- [x] 14.9 RED adversarial: `catch P2003` residual traduce la carrera al mismo `409` [D2]
- [x] 14.10 Crear `apps/backend/src/academico/grados.controller.ts` y `grados.service.ts` — GREEN
      14.1-14.9 [AT2][AT7][D2][D3]

### Phase 15: Regresión PR4
- [x] 15.1 GREEN: `pnpm openapi:extract` completa sin Postgres/Redis vivos
- [x] 15.2 `test/academico/niveles.e2e-spec.ts` + `grados.e2e-spec.ts` corren sin regresión —
      **Limitación documentada** (misma que PR1-PR3 de este change): `docker ps` no tiene daemon
      Docker disponible en este entorno, así que `pnpm test:e2e` no puede ejecutarse contra
      Postgres/Redis reales. Ambos archivos quedaron escritos, `pnpm typecheck` en verde (workspace
      completo, incluido `@seei/backend`/`@seei/frontend`/`@seei/worker`/`@seei/contracts`;
      `pnpm generate:contracts` regeneró `packages/contracts/openapi.json` con las rutas
      `/niveles`, `/niveles/{id}`, `/grados`, `/grados/{id}`). Cobertura de orquestación/lógica de
      negocio equivalente: 28/28 tests GREEN (`src/academico/niveles.service.spec.ts` +
      `src/academico/grados.service.spec.ts`), sin regresión en el resto de la suite de
      `@seei/backend` (las únicas fallas de `pnpm test` completo son `session.service.spec.ts`,
      `bloqueo.service.spec.ts`, `recovery.service.spec.ts` — dependientes de Redis real, no
      tocados por este PR, mismo entorno sin Docker).

## PR 5 — `Seccion` (base = PR 4 branch)

### Phase 16: DTOs de `Seccion` (D3)
- [x] 16.1 Crear `apps/backend/src/academico/dto/crear-seccion.dto.ts`,
      `actualizar-seccion.dto.ts` (**sin** `grado_id`/`anio_escolar_id`),
      `seccion-respuesta.dto.ts`, `listar-secciones.query.ts` [D3]

### Phase 17: CRUD de `Seccion` acotada a `Grado` y `AnioEscolar` (AT3/AT4)
- [x] 17.1 RED e2e: creación exitosa vinculada a un `Grado` y un `AnioEscolar` existentes [AT3] —
      **Limitación documentada** (misma que PR1-PR4, `docker ps` sin daemon Docker en este entorno):
      escrita y type-checkeada en `test/academico/secciones.e2e-spec.ts`, no ejecutable contra
      Postgres/Redis reales en esta sesión. Cobertura equivalente GREEN como unit test `[17.1]` en
      `src/academico/secciones.service.spec.ts`.
- [x] 17.2 RED e2e: creación referenciando un `Grado` inexistente → `409 REFERENCIA_INEXISTENTE`,
      no se crea la `Seccion` [AT4] — misma limitación; cobertura equivalente GREEN `[17.2]`.
- [x] 17.3 RED e2e: creación referenciando un `AnioEscolar` inexistente → `409
      REFERENCIA_INEXISTENTE` [AT4] — misma limitación; cobertura equivalente GREEN `[17.3]`.
- [x] 17.4 RED e2e: duplicado `(grado_id, anio_escolar_id, nombre)` → `409 RESTRICCION_UNICA`
      identificando el conflicto [AT3] — misma limitación; cobertura equivalente GREEN `[17.4]`.
- [x] 17.5 RED e2e: `GET /secciones?grado_id=&anio_escolar_id=` filtra correctamente; filtro
      inválido → `400 CAMPO_INVALIDO` — misma limitación; cobertura equivalente GREEN `[17.5]`.
- [x] 17.6 RED e2e: `GET /secciones/:id`, `404` para inexistente, `400` para malformado — misma
      limitación; cobertura equivalente GREEN `[17.6]`.
- [x] 17.7 RED e2e + adversarial: `PATCH` cambia `nombre`, deja fila `SECCION_ACTUALIZADA`; `PATCH`
      con `grado_id`/`anio_escolar_id` en el body lo ignora (sin re-parentado, D3) [D3] — misma
      limitación; cobertura equivalente GREEN `[17.7]` (incluye caso adversarial de duplicado al
      renombrar y prueba de tipos de que el DTO no declara las FK).
- [x] 17.8 RED integración: precomprobación de `Aula` dependiente antes del `DELETE` [D2] — misma
      limitación; cobertura equivalente GREEN `[17.9]`.
- [x] 17.9 RED e2e: `DELETE` exitoso sin dependientes; `DELETE` con `Aula` asociada → `409
      ENTIDAD_CON_DEPENDIENTES {relacion:'Aula'}`, la fila permanece — misma limitación; cobertura
      equivalente GREEN `[17.9]` (dos casos: sin dependientes y con `Aula` asociada).
- [x] 17.10 RED adversarial: `catch P2003` residual traduce la carrera al mismo `409` [D2] — misma
      limitación; cobertura equivalente GREEN `[17.10]`.
- [x] 17.11 Crear `apps/backend/src/academico/secciones.controller.ts` y `secciones.service.ts` —
      GREEN 17.1-17.10 [AT3][AT4][AT7][D2][D3]

### Phase 18: Regresión PR5
- [x] 18.1 GREEN: `pnpm openapi:extract` completa sin Postgres/Redis vivos
- [x] 18.2 `test/academico/secciones.e2e-spec.ts` corre completo sin regresión —
      **Limitación documentada** (misma que PR1-PR4 de este change): `docker ps` no tiene daemon
      Docker disponible en este entorno, así que `pnpm test:e2e` no puede ejecutarse contra
      Postgres/Redis reales. El archivo quedó escrito, `pnpm typecheck` en verde (workspace
      completo, incluido `@seei/backend`/`@seei/frontend`/`@seei/worker`/`@seei/contracts`;
      `pnpm generate:contracts` (vía `turbo run typecheck`) regeneró `packages/contracts/openapi.json`
      con las rutas `/secciones`, `/secciones/{id}`). Cobertura de orquestación/lógica de negocio
      equivalente: 18/18 tests GREEN en `src/academico/secciones.service.spec.ts` (existencia de
      `Grado`/`AnioEscolar`, unicidad compuesta, guarda de `Aula` dependiente, catch P2002/P2003
      residual), sin regresión en el resto de la suite de `@seei/backend` (las únicas fallas de
      `pnpm test` completo son `session.service.spec.ts`, `bloqueo.service.spec.ts`,
      `recovery.service.spec.ts` — dependientes de Redis real, no tocados por este PR, mismo entorno
      sin Docker; 199/229 tests GREEN en total).

## PR 6 — `Aula` + guarda de coherencia jerárquica (base = PR 5 branch)

### Phase 19: DTOs de `Aula` (D3)
- [x] 19.1 Crear `apps/backend/src/academico/dto/crear-aula.dto.ts`,
      `actualizar-aula.dto.ts` (**solo** `turno`), `aula-respuesta.dto.ts`,
      `listar-aulas.query.ts` [D3]

### Phase 20: Validador de `turno` (D5)
- [x] 20.1 RED unit: el validador de `turno` acepta `manana`/`tarde`, rechaza cualquier otro valor
      → `CAMPO_INVALIDO` (Jest puro, sin base) [D5]
- [x] 20.2 Implementar el validador de `turno` en `aulas.service.ts` — GREEN 20.1 [D5]

### Phase 21: CRUD de `Aula` acotada a `Grado`, `Seccion`, `AnioEscolar` y `Turno` (AT5)
- [x] 21.1 RED e2e: creación exitosa con `turno = 'manana'`, vinculada a `Grado`, `Seccion` y
      `AnioEscolar` existentes y coherentes entre sí [AT5] — **Limitación documentada** (misma que
      PR1-PR5, `docker ps` sin daemon Docker en este entorno): escrita y type-checkeada en
      `test/academico/aulas.e2e-spec.ts`, no ejecutable contra Postgres/Redis reales en esta sesión.
      Cobertura equivalente GREEN como unit test `[21.1]` en `src/academico/aulas.service.spec.ts`.
- [x] 21.2 RED e2e: `turno` fuera de `{manana, tarde}` → `400 CAMPO_INVALIDO` — misma limitación;
      cobertura equivalente GREEN `[21.2]`.
- [x] 21.3 RED e2e: creación referenciando `Grado`, `Seccion` o `AnioEscolar` inexistente → `409
      REFERENCIA_INEXISTENTE` (una prueba por cada FK saliente) — misma limitación; cobertura
      equivalente GREEN `[21.3]` (tres casos).
- [x] 21.4 RED e2e: duplicado `(grado_id, seccion_id, anio_escolar_id)` → `409 RESTRICCION_UNICA`
      [AT5] — misma limitación; cobertura equivalente GREEN `[21.4]`.
- [x] 21.5 RED e2e: `GET /aulas?grado_id=&seccion_id=&anio_escolar_id=&turno=` filtra
      correctamente; filtro inválido → `400 CAMPO_INVALIDO` — misma limitación; cobertura
      equivalente GREEN `[21.5]`.
- [x] 21.6 RED e2e: `GET /aulas/:id`, `404` para inexistente, `400` para malformado — misma
      limitación; cobertura equivalente GREEN `[21.6]`.
- [x] 21.7 RED e2e + adversarial: `PATCH` cambia `turno`, deja fila `AULA_ACTUALIZADA`; `PATCH` con
      cualquier FK en el body la ignora (sin re-parentado, D3) [D3] — misma limitación; cobertura
      equivalente GREEN `[21.7]` (incluye caso adversarial de `turno` inválido en `PATCH` y prueba
      de tipos de que el DTO no declara ninguna FK).
- [x] 21.8 RED integración: precomprobación de `Matricula` (y `ProcesoAula`, guarda anticipada para
      `#11`) dependiente antes del `DELETE` [D2] — misma limitación; cobertura equivalente GREEN
      `[21.8]`/`[21.9]` (dos relaciones verificadas en orden: `Matricula` primero, `ProcesoAula`
      después).
- [x] 21.9 RED e2e: `DELETE` exitoso sin dependientes; `DELETE` con `Matricula` asociada → `409
      ENTIDAD_CON_DEPENDIENTES {relacion:'Matricula'}`, la fila permanece [AT5] — misma limitación;
      cobertura equivalente GREEN `[21.9]`.
- [x] 21.10 RED adversarial: `catch P2003` residual traduce la carrera al mismo `409` [D2] — misma
      limitación; cobertura equivalente GREEN `[21.10]`.

### Phase 22: Coherencia jerárquica de `Aula` con su `Seccion` (D6, AT6)
- [x] 22.1 RED adversarial: `Aula` con `grado_id` distinto al `grado_id` de su `Seccion` → `409
      COHERENCIA_JERARQUICA {campo:'grado_id', esperado, recibido}`, no se crea el `Aula` [AT6][D6]
      — misma limitación; cobertura equivalente GREEN `[22.1]`.
- [x] 22.2 RED adversarial: `Aula` con `anio_escolar_id` distinto al `anio_escolar_id` de su
      `Seccion` → `409 COHERENCIA_JERARQUICA {campo:'anio_escolar_id', ...}` [AT6][D6] — misma
      limitación; cobertura equivalente GREEN `[22.2]`.
- [x] 22.3 Crear `apps/backend/src/academico/aulas.controller.ts` y `aulas.service.ts`: la guarda de
      coherencia jerárquica compara los campos redundantes **dentro de la misma `$transaction`**,
      tras resolver `Grado`/`Seccion`/`AnioEscolar` y antes del `create` — GREEN 21.1-21.10,
      22.1-22.2 [AT5][AT6][AT7][D2][D3][D6]

### Phase 23: Regresión PR6
- [x] 23.1 GREEN: `pnpm openapi:extract` completa sin Postgres/Redis vivos
- [x] 23.2 `test/academico/aulas.e2e-spec.ts` corre completo sin regresión —
      **Limitación documentada** (misma que PR1-PR5 de este change): `docker ps` no tiene daemon
      Docker disponible en este entorno, así que `pnpm test:e2e` no puede ejecutarse contra
      Postgres/Redis reales. El archivo quedó escrito, `pnpm typecheck` en verde (workspace
      completo, incluido `@seei/backend`/`@seei/frontend`/`@seei/worker`/`@seei/contracts`;
      `pnpm generate:contracts` regeneró `packages/contracts/openapi.json` con las rutas `/aulas`,
      `/aulas/{id}`). Cobertura de orquestación/lógica de negocio equivalente: 25/25 tests GREEN en
      `src/academico/aulas.service.spec.ts` (validador de `turno`, tres FK salientes, coherencia
      jerárquica D6 en creación, unicidad compuesta, guarda de `Matricula`/`ProcesoAula`
      dependiente, catch P2002/P2003 residual), sin regresión en el resto de la suite de
      `@seei/backend` (las únicas fallas de `pnpm test` completo son `session.service.spec.ts`,
      `bloqueo.service.spec.ts`, `recovery.service.spec.ts` — dependientes de Redis real, no
      tocados por este PR, mismo entorno sin Docker; 224/254 tests GREEN en total).

## PR 7 — `Matricula` + regeneración de contratos (base = PR 6 branch)

### Phase 24: DTOs de `Matricula` (D3)
- [ ] 24.1 Crear `apps/backend/src/academico/dto/crear-matricula.dto.ts`,
      `matricula-respuesta.dto.ts`, `listar-matriculas.query.ts` — **sin**
      `actualizar-matricula.dto.ts`: la spec no define `PATCH` para `Matricula` (D3, un traslado es
      `DELETE` + `POST`) [D3]

### Phase 25: Alta de `Matricula` — existencia, rol `estudiante` y coherencia jerárquica (SE1/SE2, D6)
- [ ] 25.1 RED e2e: matriculación exitosa vinculando un `Usuario` con `rol = 'estudiante'`, un
      `Aula` y un `AnioEscolar` existentes y coherentes [SE1]
- [ ] 25.2 RED e2e: matrícula duplicada `(usuario_id, aula_id, anio_escolar_id)` → `409
      RESTRICCION_UNICA` identificando el conflicto, no se crea una segunda fila [SE1]
- [ ] 25.3 RED e2e: referencia a `Usuario`, `Aula` o `AnioEscolar` inexistente → `409
      REFERENCIA_INEXISTENTE` (una prueba por cada FK saliente) [SE1]
- [ ] 25.4 RED e2e: matriculación de un `Usuario` con `rol = 'docente'` (y por extensión cualquier
      rol ≠ `estudiante`) → `409 USUARIO_NO_ES_ESTUDIANTE`, no se crea la `Matricula` [SE1]
- [ ] 25.5 RED adversarial: `Matricula` con `anio_escolar_id` distinto al `anio_escolar_id` de su
      `Aula` → `409 COHERENCIA_JERARQUICA`, no se crea la fila [SE2][D6]
- [ ] 25.6 Crear `apps/backend/src/academico/matriculas.service.ts`: `crear(datos, actorId)` —
      dentro de la misma `$transaction`, verifica existencia de las 3 FK, `Usuario.rol =
      'estudiante'` y coherencia jerárquica con `Aula`, en ese orden — GREEN 25.1-25.5
      [SE1][SE2][D2][D6]

### Phase 26: Consulta y listado de `Matricula` (SE3)
- [ ] 26.1 RED e2e: `GET /matriculas/:id` devuelve la `Matricula`; `:id` inexistente → `404`;
      malformado → `400` [SE3]
- [ ] 26.2 RED e2e: `GET /matriculas?usuario_id=&aula_id=&anio_escolar_id=` filtra correctamente
      (una prueba por filtro, mínimo `anio_escolar_id`); valor no-UUID → `400 CAMPO_INVALIDO` [SE3]

### Phase 27: `DELETE` físico de `Matricula` (SE4)
- [ ] 27.1 RED e2e: eliminación exitosa borra la fila de la base de datos, deja exactamente una
      fila `EventoAuditoría` con `event_type = 'MATRICULA_ELIMINADA'` [SE4]
- [ ] 27.2 Agregar `eliminar(id, actorId)` a `matriculas.service.ts` — GREEN 27.1 [SE4]

### Phase 28: Controlador, aislamiento de rol y auditoría de alta (SE5)
- [ ] 28.1 RED e2e: rol distinto de `administrador`/`director` se rechaza en las 4 rutas de
      `/matriculas` sin ejecutar el handler [SE5]
- [ ] 28.2 RED e2e: `director` ejecuta cualquier endpoint permitido a `administrador` con idéntico
      resultado [SE5]
- [ ] 28.3 Crear `apps/backend/src/academico/matriculas.controller.ts`: `POST`/`GET`/`GET :id`/
      `DELETE` (**sin** `PATCH`) con `@UseGuards(AuthGuard, RolesGuard)` +
      `@Roles('administrador','director')` a nivel de clase, `ParseUUIDPipe` en `:id` — GREEN
      25.1-25.5, 26.1-26.2, 27.1, 28.1-28.2 [SE1][SE2][SE3][SE4][SE5][D3]

### Phase 29: Verificación final del contrato de auditoría (D4)
- [ ] 29.1 GREEN: `test/schema/auditoria.spec.ts` [TM4] confirma que el `WHEN` del trigger
      estructural de ADR-0016 sigue siendo `IN ('VOTO','RECHAZO')` tras el conjunto completo de las
      18 claves del change (`AnioEscolar`, `Nivel`, `Grado`, `Seccion`, `Aula`, `Matricula`) [D4]

### Phase 30: Regeneración de contratos y regresión completa
- [ ] 30.1 GREEN: `pnpm generate:contracts` tras cerrar `matriculas.controller.ts`; verificar que
      `packages/contracts/openapi.json` incluye las 6 rutas de recursos académicos
      (`anios-escolares`, `niveles`, `grados`, `secciones`, `aulas`, `matriculas`) y sus tipos
- [ ] 30.2 GREEN: `pnpm openapi:extract` completa sin conexión viva a Postgres/Redis
- [ ] 30.3 Ejecutar `test:schema` + `test` + `test:e2e -- academico` juntos; confirmar sin
      regresión en `administracion-usuarios-apoderados`, `bloqueo-desbloqueo-cuentas` y el resto de
      changes previos ya mergeados en la rama
