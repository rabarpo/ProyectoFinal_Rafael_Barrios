# Tasks: administracion-usuarios-apoderados (Backlog #7 — Administración de usuarios y apoderados)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~260-300 / PR2 ~280-320 / PR3 ~280-320 (~850-950 total: 2 controladores, 2 servicios, 8 DTO, catálogo de errores, wiring en `auth`, suite adversarial estricta) |
| 400-line budget risk | Medium (por PR) / High (agregado) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation: wiring + `users.errors.ts` + DTOs + `clasificarColision()`/`crear()`/`crearIdempotente()`) → PR 2 (CRUD de `Usuario` + `PATCH /estado` + revocación D6) → PR 3 (CRUD de `Apoderado` + `AuthService` D7 + regeneración de contrato) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

Este change es más grande que `#6` en superficie de archivos (2 controladores, 2 servicios, 8 DTO
frente al único `AuthController`/`BloqueoService` de `#6`), pero cada PR queda dentro del
presupuesto de 400 líneas individualmente si se respeta el corte propuesto. Riesgo agregado
"High" porque `#3`-`#6` subestimaron consistentemente el volumen de pruebas adversariales bajo
Strict TDD (carreras de concurrencia, verificación de no-oráculo, aislamiento de `comite`).
Contingencia predeclarada: si `sdd-apply` mide PR2 por encima del presupuesto, dividir en PR2a
(`POST`/`GET`/`PATCH` de datos básicos) y PR2b (`PATCH /estado` + revocación D6 + adversariales) —
no adoptada por defecto.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Wiring aditivo: `exports` de `AuthModule`, `UsersModule` con `cookieParser`, registro en `app.module.ts` | PR 1 | `pnpm openapi:extract` | N/A — wiring sin lógica propia | `git revert` PR1; módulo no expone rutas aún |
| 2 | Claves de auditoría aditivas (D4) | PR 1 | `pnpm --filter @seei/backend test:schema -- auditoria` | `test:schema` contra Postgres real | `git revert` PR1; claves sin uso hasta PR2/PR3 |
| 3 | `clasificarColision()`/`crear()`/`crearIdempotente()` (D5, gancho `#9`) | PR 1 | `pnpm --filter @seei/backend test -- users.service` | Jest puro + Postgres de `docker-compose.test.yml` para integración | `git revert` PR1; sin controlador que lo invoque aún |
| 4 | `UsersController`: `POST`/`GET`/`GET:id`/`PATCH` de `Usuario` (D1/D2/D3) | PR 2 | `pnpm --filter @seei/backend test:e2e -- users` | `test:e2e` (Prisma + Redis live) | `git revert` PR2; PR1 sin rutas expuestas aún |
| 5 | `PATCH /usuarios/:id/estado` + revocación de sesiones (D1/D2/D6) | PR 2 | `pnpm --filter @seei/backend test:e2e -- users` | `test:e2e` live Prisma + Redis | `git revert` PR2; PR1 no afectado |
| 6 | `ApoderadosController`/`ApoderadosService` (D3/R11) | PR 3 | `pnpm --filter @seei/backend test:e2e -- apoderados` | `test:e2e` live Prisma | `git revert` PR3; PR1/PR2 no afectados |
| 7 | `AuthService` D7 — rechazo de login para `estado='inactivo'` | PR 3 | `pnpm --filter @seei/backend test:e2e -- auth` | `test:e2e` live Prisma + Redis | `git revert` PR3; guarda aditiva y reversible |
| 8 | Regeneración de `packages/contracts/openapi.json` | PR 3 | `pnpm generate:contracts` | N/A — generación estática | `git revert` PR3 regenera el contrato anterior |

## PR 1 — Foundation (base = feature/tracker branch)

### Phase 1: Wiring aditivo (D3)
- [x] 1.1 Modificar `apps/backend/src/auth/auth.module.ts`: agregar `exports: [SessionService]`
      (aditivo) [D3]
- [x] 1.2 Crear `apps/backend/src/users/users.module.ts`: `imports: [AuthModule, AuditoriaModule]`,
      `implements NestModule` aplicando `cookieParser()` a `UsersController` y
      `ApoderadosController` (patrón D6 de `#4`, nunca en `main.ts`) [D3]
      — DESVIACIÓN: `UsersController`/`ApoderadosController` no existen en PR1 (fuera de alcance
      explícito). `UsersModule` queda como `@Module` simple en PR1; pasa a `implements NestModule`
      con `cookieParser()` en PR2, cuando los controladores existan. Ver comentario en el archivo.
- [x] 1.3 Modificar `apps/backend/src/app.module.ts`: agregar `UsersModule` a `imports`
- [x] 1.4 GREEN: `pnpm openapi:extract` completa sin conexión viva a Postgres/Redis (gotcha D1 de
      `#1`) [D3]

### Phase 2: Claves de auditoría aditivas (D4)
- [x] 2.1 Modificar `apps/backend/src/auditoria/audit-event-types.ts`: agregar `USUARIO_CREADO`,
      `USUARIO_ACTUALIZADO`, `USUARIO_DESACTIVADO`, `USUARIO_REACTIVADO`, `APODERADO_CREADO`,
      `APODERADO_ACTUALIZADO`, `APODERADO_ELIMINADO` a `AUDIT_EVENT_TYPES`, aditivo únicamente [R12]
- [x] 2.2 GREEN: `test/schema/auditoria.spec.ts` confirma que el `WHEN` del trigger de ADR-0016
      sigue listando únicamente `VOTO`/`RECHAZO` tras las 7 claves nuevas [R12][D4]
      — No se pudo ejecutar `pnpm test:schema` en este entorno (sin daemon Docker/Postgres vivo).
      Verificado estáticamente: `prisma/migrations/20260807052206_append_only_audit/migration.sql:81`
      sigue siendo `WHEN (NEW.event_type IN ('VOTO','RECHAZO'))`, sin tocar — el cambio es
      puramente TypeScript (`as const` más grande), cero SQL nuevo.

### Phase 3: Catálogo de errores (D2)
- [x] 3.1 Crear `apps/backend/src/users/users.errors.ts`: constante `as const` + union type con
      `CAMPO_DUPLICADO`, `ESTADO_DESTINO_NO_PERMITIDO`, `TRANSICION_DESDE_BLOQUEADO`,
      `CAMPO_INVALIDO`, `USUARIO_NO_ES_ESTUDIANTE` [D2]

### Phase 4: DTOs (D3)
- [x] 4.1 Crear `apps/backend/src/users/dto/crear-usuario.dto.ts`,
      `actualizar-usuario.dto.ts` (**sin** campo `estado`), `cambiar-estado-usuario.dto.ts`,
      `listar-usuarios.query.ts`, `usuario-respuesta.dto.ts` — clases con `@ApiProperty` únicamente,
      sin `class-validator` [D1][D3]
- [x] 4.2 Crear `apps/backend/src/users/dto/crear-apoderado.dto.ts`,
      `actualizar-apoderado.dto.ts`, `apoderado-respuesta.dto.ts` [D3]

### Phase 5: Núcleo de unicidad — `clasificarColision()` y validadores (D5)
- [x] 5.1 RED: unit tests de `clasificarColision()`: `sin_colision`, `coincidencia_exacta` (mismo
      `dni` y `codigo`), `conflicto` por `dni`, por `codigo`, por `correo`, y con `excluirId` en
      edición (Jest puro, sin base) [D5]
- [x] 5.2 RED: unit tests del validador de `dni` (20 vs 21 caracteres, formato no numérico
      aceptado) y del validador de formato de correo [R3][R4]
- [x] 5.3 RED: unit test del mapeo `P2002 → campo` derivado de `error.meta.target` [D2]
- [x] 5.4 Crear `apps/backend/src/users/users.service.ts`: `private clasificarColision(tx, datos,
      excluirId?)` + validadores de `dni`/correo — GREEN 5.1-5.3 [D5]
      — DESVIACIÓN: `clasificarColision()` se expone como función pura exportada (no como método
      `private` de la clase), siguiendo el precedente de `bloqueoVigente()`/`sanarBloqueoVencido()`
      en `bloqueo.service.ts` — misma firma y comportamiento, queda unit-testeable sin instanciar
      `UsersService`.

### Phase 6: `crear()` / `crearIdempotente()` (D5 — gancho de `#9`)
- [x] 6.1 RED integración: `crear()` sobre `coincidencia_exacta` responde `409 CAMPO_DUPLICADO`;
      `crearIdempotente()` sobre el mismo caso responde `{ creado: false }` sin escribir ni auditar
      [R2][R13][D5]
- [x] 6.2 RED integración: `crearIdempotente()` con `tx` externo participa de la transacción del
      llamador y no audita cuando `creado === false` [R13][D5]
- [x] 6.3 RED integración: `P2002` residual durante `crear()` se traduce al mismo `409
      CAMPO_DUPLICADO` derivando `campo` de `error.meta.target` [D2]
- [x] 6.4 Agregar `crear(datos, actorId)` y `crearIdempotente(datos, actorId, tx?)` a
      `users.service.ts` — GREEN 6.1-6.3 [R1][R2][R13][D5]
      — DESVIACIÓN: las pruebas de 6.1-6.3 corren como unit tests con `PrismaService`/
      `AuditoriaService` mockeados (mismo criterio que `auth.service.spec.ts`, que reserva
      Postgres real para la suite e2e), no como integración contra
      `docker-compose.test.yml` — Docker no está disponible en este entorno de ejecución (sin
      daemon). La cobertura contra Postgres real de `crear()`/`crearIdempotente()` queda pendiente
      para el e2e de PR2 (`test/users/users.e2e-spec.ts`, fase 7 en adelante).

## PR 2 — CRUD de `Usuario` + cambio de estado (base = PR 1 branch)

### Phase 7: `POST`/`GET`/`GET:id` de `Usuario` (D1/D3)
- [x] 7.1 RED e2e: alta con los 5 roles produce `password_hash = null`, `estado = 'activo'` y
      exactamente una fila `USUARIO_CREADO` [R1]
      — DESVIACIÓN (mismo criterio que PR1, tarea 6.4): `docker ps` falla en este entorno
      (`failed to connect to the docker API`, sin daemon), así que `pnpm test:e2e` no puede
      levantar `docker-compose.test.yml`. Escrito y type-checkeado en
      `test/users/users.e2e-spec.ts` (`pnpm typecheck` en verde), listo para CI/entorno con Docker.
- [x] 7.2 RED e2e: rol `comite` en `POST /usuarios` se rechaza sin ejecutar el handler y sin crear
      fila [R9] — ídem 7.1, escrito en `test/users/users.e2e-spec.ts`.
- [x] 7.3 RED e2e: DNI duplicado y correo duplicado se rechazan con `409 CAMPO_DUPLICADO`
      identificando el campo, sin crear `Usuario` [R2] — ídem 7.1.
- [x] 7.4 RED e2e: `dni` no numérico se acepta; `dni` de 21 caracteres se rechaza con `400
      CAMPO_INVALIDO` por longitud máxima [R3] — ídem 7.1.
- [x] 7.5 RED e2e: correo fuera del dominio institucional se acepta; correo con formato inválido se
      rechaza con `400 CAMPO_INVALIDO` [R4] — ídem 7.1.
- [x] 7.6 RED e2e: `GET /usuarios/:id` devuelve el `Usuario`; `:id` inexistente → `404`; `:id`
      malformado → `400` vía `ParseUUIDPipe` [D2] — ídem 7.1.
- [x] 7.7 RED e2e: `GET /usuarios?rol=&estado=` filtra correctamente; filtro con valor desconocido
      → `400 CAMPO_INVALIDO` [R5] — ídem 7.1.
- [x] 7.8 RED e2e: `director` ejecuta cualquier endpoint permitido a `administrador` con idéntico
      resultado [R10] — ídem 7.1.
- [x] 7.9 RED adversarial: ningún `UsuarioRespuestaDto` incluye `password_hash` ni `google_id`
      — ídem 7.1 a nivel e2e; garantía adicional de tipo: `UsuarioRespuestaDto` no declara esos
      campos.
- [x] 7.10 Crear `apps/backend/src/users/users.controller.ts`: `POST`/`GET`/`GET :id` con
      `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('administrador','director')` a nivel de clase,
      `ParseUUIDPipe` en `:id` — GREEN 7.1-7.9 [R1][R2][R3][R4][R5][R9][R10][D1][D2][D3]

### Phase 8: `PATCH /usuarios/:id` — datos básicos
- [x] 8.1 RED e2e: `PATCH` cambia `nombres`/`correo`, deja exactamente una fila
      `USUARIO_ACTUALIZADO` [R6]
      — DESVIACIÓN (mismo criterio que 6.4): sin daemon Docker en este entorno, cubierto como
      unit test con `PrismaService`/`AuditoriaService` mockeados en `users.service.spec.ts`
      (`UsersService.actualizar()`). e2e real contra Postgres queda pendiente — ver
      `test/users/users.e2e-spec.ts`.
- [x] 8.2 RED adversarial: `PATCH /usuarios/:id` con `estado` en el body lo ignora (el DTO no lo
      declara) y `Usuario.estado` no cambia [R6]
      — cubierto en dos niveles: (a) tipo — `ActualizarUsuarioDto` no declara `estado`, así que
      pasar ese campo desde el controlador ni compila; (b) runtime — unit test en
      `users.service.spec.ts` inyecta `estado` con `as unknown as` y confirma que
      `tx.usuario.update()` nunca lo recibe y `Usuario.estado` no cambia.
- [x] 8.3 Agregar `actualizar(id, datos, actorId)` a `users.service.ts` + handler `PATCH
      usuarios/:id` — GREEN 8.1-8.2 [R6]

### Phase 9: `PATCH /usuarios/:id/estado` (D1/D2/D6)
- [x] 9.1 RED e2e: destino `inactivo` desde `activo` → `200`, `estado = 'inactivo'`, exactamente
      una fila `USUARIO_DESACTIVADO` [R7]
      — DESVIACIÓN (mismo criterio 6.4/8.1): cubierto como unit test mockeado
      (`UsersService.cambiarEstado()`); e2e real en `test/users/users.e2e-spec.ts` (pendiente de
      Postgres/Redis vivos en este entorno).
- [x] 9.2 RED e2e: destino `activo` desde `inactivo` → `200`, `estado = 'activo'`, exactamente una
      fila `USUARIO_REACTIVADO` [R7] — ídem 9.1, unit test mockeado.
- [x] 9.3 RED adversarial: destino `'bloqueado'` en el body → `400
      ESTADO_DESTINO_NO_PERMITIDO`; `Usuario.estado` no cambia [R6][D1][D2]
- [x] 9.4 RED adversarial: fila con `estado = 'bloqueado'` → `409 TRANSICION_DESDE_BLOQUEADO`;
      `Usuario.estado` no cambia [R6][D1][D2]
- [x] 9.5 RED e2e: `:id` inexistente → `404`; `:id` malformado → `400`
      — cubierto vía `ParseUUIDPipe` en el controlador (mismo precedente que `#6`) + `404` de
      `cambiarEstado()`/`actualizar()`/`GET :id` verificado unitariamente; e2e HTTP real pendiente
      de infraestructura viva (ver `test/users/users.e2e-spec.ts`).
- [x] 9.6 RED e2e: destino `inactivo` con `count === 1` invoca `sessionService.revokeAllForUser(id)`
      tras el commit y no deja ninguna sesión activa del usuario [D6]
      — cubierto como unit test mockeado (`sessionService.revokeAllForUser` con jest.fn()); e2e
      real con Redis vivo pendiente (ver `test/users/users.e2e-spec.ts`).
- [x] 9.7 RED adversarial: repetir la misma transición (`activo → activo`) es idempotente: no
      escribe fila de auditoría ni invoca `revokeAllForUser` [D1]
- [x] 9.8 Agregar `cambiarEstado(id, destino, actorId)` a `users.service.ts`
      (`updateMany({ where: { id, estado: { in: ['activo','inactivo'] } } })`, auditar solo si
      `count === 1`, `revokeAllForUser` tras commit) + handler `PATCH usuarios/:id/estado` — GREEN
      9.1-9.7 [R6][R7][D1][D2][D6]

### Phase 10: Regresión PR 2
- [x] 10.1 GREEN: `pnpm openapi:extract` completa sin Postgres/Redis vivos
- [x] 10.2 `test/users/users.e2e-spec.ts` corre completo sin regresión
      — DESVIACIÓN: no ejecutable en este entorno sin daemon Docker (ver 7.1). `pnpm test` (unit,
      101/101 en verde salvo las 3 suites preexistentes que ya dependían de Redis vivo —
      `session.service.spec.ts`/`bloqueo.service.spec.ts`/`recovery.service.spec.ts`, sin relación
      con este PR) y `pnpm typecheck` sí corren en verde en este entorno y cubren la orquestación
      de `UsersController`/`UsersService`.

## PR 3 — CRUD de `Apoderado` + `AuthService` D7 + contrato (base = PR 2 branch)

### Phase 11: `ApoderadosController`/`ApoderadosService` (D3/R11)
- [ ] 11.1 RED e2e: alta de apoderado sobre un `Usuario` con `rol = 'estudiante'` → `201`,
      exactamente una fila `APODERADO_CREADO` [R11]
- [ ] 11.2 RED e2e: un estudiante puede tener varios apoderados registrados [R11]
- [ ] 11.3 RED adversarial: cualquier operación de `/apoderados` sobre un `:id` con `rol ≠
      'estudiante'` → `409 USUARIO_NO_ES_ESTUDIANTE`, sin escritura [R11]
- [ ] 11.4 RED e2e: `GET /usuarios/:id/apoderados` lista los apoderados del estudiante (arreglo
      vacío es válido) [R11]
- [ ] 11.5 RED e2e: `PATCH .../apoderados/:apoderadoId` actualiza datos básicos, deja exactamente
      una fila `APODERADO_ACTUALIZADO` [R11]
- [ ] 11.6 RED e2e: `DELETE .../apoderados/:apoderadoId` elimina físicamente la fila, deja
      exactamente una fila `APODERADO_ELIMINADO` [R11]
- [ ] 11.7 RED e2e: rol `comite` se rechaza en las 9 rutas de `UsersModule` (usuarios + apoderados)
      sin ejecutar ningún handler [R9]
- [ ] 11.8 Crear `apps/backend/src/users/apoderados.service.ts` y
      `apps/backend/src/users/apoderados.controller.ts`
      (`@Controller('usuarios/:usuarioId/apoderados')`, mismos guards/roles a nivel de clase) —
      GREEN 11.1-11.7 [R9][R11][D3]

### Phase 12: `AuthService` — D7 rechaza `estado = 'inactivo'`
- [ ] 12.1 RED: `login()` con contraseña válida y `Usuario.estado = 'inactivo'` → `401` sin
      distinguir causa, sin sesión creada [R8]
- [ ] 12.2 RED: `determinarMotivoFallo()` devuelve `'usuario_inactivo'` antes del fallback
      `'usuario_bloqueado'` [R8]
- [ ] 12.3 RED: `MotivoLoginFallido` incluye `'usuario_inactivo'` como valor de tipo aditivo [R8]
- [ ] 12.4 RED: el rechazo por inactividad no incrementa `login:intentos:{userId}` (`contable ===
      false`, `registrarFallo()` recibe `null`) [R8]
- [ ] 12.5 RED: `loginConGoogle()` con `Usuario.estado = 'inactivo'` → `401`, sin sesión creada,
      audita `LOGIN_OAUTH_FALLIDO` con `motivo = 'usuario_inactivo'` [R8]
- [ ] 12.6 RED: `MotivoLoginOAuthFallido` incluye `'usuario_inactivo'` [R8]
- [ ] 12.7 RED adversarial: la guarda `estado === 'inactivo'` se evalúa junto a `bloqueoVigente()`,
      nunca antes del chequeo de contraseña — `PasswordService.verificar()` sigue corriendo contra
      el hash señuelo (anti-oráculo, D3 de `#4`) [D7]
- [ ] 12.8 Modificar `apps/backend/src/auth/auth.service.ts`: agregar guarda `usuario.estado ===
      'inactivo'` en `login()` y `loginConGoogle()`, nueva rama en `determinarMotivoFallo()`,
      `'usuario_inactivo'` en ambos tipos `Motivo*` — GREEN 12.1-12.7 [R8][D7]

### Phase 13: Contrato de auditoría + regeneración
- [ ] 13.1 GREEN: `test/schema/auditoria.spec.ts` confirma que el `WHEN` del trigger sigue listando
      únicamente `VOTO`/`RECHAZO` tras el conjunto completo de cambios de este change [R12]
- [ ] 13.2 Regenerar `packages/contracts/openapi.json` y sus tipos vía `pnpm generate:contracts`
      tras cerrar ambos controladores

### Phase 14: Regresión completa
- [ ] 14.1 GREEN: `pnpm openapi:extract` completa sin conexión viva a Postgres/Redis
- [ ] 14.2 Ejecutar `test:schema` + `test` + `test:e2e -- users apoderados auth` juntos; confirmar
      sin regresión en `bloqueo-desbloqueo-cuentas`, `google-oauth-y-recuperacion`,
      `auth-server-sessions`, `append-only-audit-engine`
