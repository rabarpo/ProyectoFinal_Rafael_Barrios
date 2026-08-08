# Exploración: bloqueo-desbloqueo-cuentas (Backlog #6 — Bloqueo y desbloqueo de cuentas)

## Estado actual

`AuthService.login()` (`apps/backend/src/auth/auth.service.ts`) ya rechaza el login cuando
`usuario.estado === 'bloqueado'`, usando el mismo 401 uniforme que las otras 3 causas de rechazo
(usuario inexistente, sin password_hash, contraseña incorrecta) — ver `determinarMotivoFallo()` y
`MotivoLoginFallido`, que ya incluye `'usuario_bloqueado'`. Este change NO debe reimplementar ese
rechazo — solo decide CUÁNDO se llega a `estado='bloqueado'` (el conteo de intentos) y construye
el camino de desbloqueo.

`SessionService.revokeAllForUser(userId)` (`session.service.ts`) ya existe, está probado (#4) y es
idempotente ante sesiones huérfanas — es exactamente el punto de extensión que #6 debe invocar
tras un bloqueo (automático o manual).

`AUDIT_EVENT_TYPES.LOGIN_FALLIDO` ya existe y ya se audita en cada intento fallido dentro de
`auditarLoginFallido()`, en un `$transaction` de Prisma usando `AuditoriaService.log(tx, ...)` —
este es el patrón transaccional obligatorio a seguir.

`RolesGuard` + `@Roles(...)` (`roles.guard.ts`, `roles.decorator.ts`) ya están implementados, y
`auth.controller.ts` documenta explícitamente `whoami()` como "la ruta protegida de referencia
para #6-#22" — el endpoint de desbloqueo manual debería usar `@UseGuards(AuthGuard, RolesGuard)` +
`@Roles('comite')`, siguiendo ese mismo patrón.

`recovery.service.ts::confirmar()` es la plantilla transaccional más cercana para el desbloqueo
manual: `UPDATE` dentro de `$transaction` + registro de auditoría en la MISMA transacción, y recién
después del commit llama a `sessionService.revokeAllForUser(userId)` fuera de la transacción (con
el modo de falla residual aceptado, mismo patrón D7 documentado en `auth.service.ts`).

## Hueco confirmado en el modelo de datos

`Usuario` en `schema.prisma` NO tiene columna para contar intentos fallidos ni para la expiración
del bloqueo. Esto fue diferido EXPLÍCITAMENTE por #2 (`base-schema-and-migrations`):
`openspec/changes/archive/2026-08-07-base-schema-and-migrations/proposal.md` línea 38 dice
literalmente que los campos "intentos fallidos, `bloqueado_hasta`" están "diferidas a #4/#5/#6 como
migraciones aditivas". `TECH-DESIGN.md` (línea 77) ya nombra la columna esperada: `bloqueado_hasta`
(expiración corta, ADR-0008) — esto FIJA el nombre/forma de la columna, no es una decisión abierta
para este change.

## ADR-0008 (fuente central)

Decisión 3, "Desbloqueo por doble vía": el bloqueo por intentos fallidos expira automáticamente a
los 10-15 minutos, y ADICIONALMENTE el comité puede desbloquear manualmente desde su panel, con el
desbloqueo auditado con el usuario del comité que lo ejecutó. Alternativas descartadas: solo
automático (deja atascado a un votante legítimo) y solo manual (el comité se vuelve cuello de
botella). Sección de consecuencias: "el bloqueo es un estado del usuario con vencimiento" —
refuerza que el estado vive en Postgres (columnas `estado`/`bloqueado_hasta`), no solo en Redis.

## Trade-off Redis vs Postgres para el conteo de intentos

Redis con TTL natural (mismo patrón que ya usan `SessionService`/`RecoveryService` — `EX`
segundos, `INCR`) es la opción más simple para CONTAR intentos consecutivos, porque el TTL de
10-15 min limpia el contador solo, sin job de limpieza. PERO el estado final `bloqueado` DEBE
reflejarse en Postgres porque `login()` ya lee `usuario.estado` desde Prisma — un contador
solo-en-Redis no puede por sí mismo hacer que `login()` rechace. Recomendación: usar Redis
(`INCR` + `EXPIRE`) solo como contador transitorio de intentos consecutivos, y al llegar a N,
escribir transaccionalmente `estado='bloqueado'` + `bloqueado_hasta = now() + ventana` en Postgres
(mismo patrón `$transaction` + auditoría que ya usa `login()`), luego revocar sesiones. La
expiración automática se resuelve comparando `bloqueado_hasta` contra `now()` al momento del
login (mismo patrón de chequeo manual que ya usa `SessionService.obtener()` para
`SESSION_ABSOLUTE_TTL_SECONDS` — chequeo explícito, no un TTL que borre la fila solo). La
alternativa pura-Postgres (columnas `intentos_fallidos` + `bloqueado_hasta`, sin Redis) es más
simple de auditar/inspeccionar pero requiere lógica explícita de reseteo del contador en login
exitoso o tras expiración — mayor superficie de bugs de concurrencia sin el `INCR` atómico de
Redis.

## Riesgo de secuenciación con #7

#7 (administración de usuarios) NO es una dependencia formal de #6 según `BACKLOG.md` — ambos
dependen solo de #4. No existe ningún controller de administración de usuarios todavía (`Glob` de
`*.controller.ts` bajo `apps/backend/src` solo devuelve `auth.controller.ts`,
`health.controller.ts`, `system-ping.controller.ts`). El desbloqueo manual por el comité NO
necesita ningún endpoint de #7: es una acción específica de bloqueo (p. ej. `POST
/auth/usuarios/:id/desbloquear`), protegida con `@Roles('comite')`, sin depender de un CRUD
completo de usuarios. El riesgo es bajo pero vale señalarlo: si #6 se entrega antes que #7, el
panel de "desbloquear" del frontend del comité va a necesitar listar usuarios bloqueados sin
depender de pantallas de administración que #7 todavía no construyó — puede necesitar un endpoint
mínimo de listado (p. ej. `GET /auth/usuarios/bloqueados`) dentro del propio alcance de #6.

## Áreas afectadas

- `apps/backend/prisma/schema.prisma` — columna nueva `bloqueado_hasta DateTime?` en `Usuario`
  (nombre ya fijado por TECH-DESIGN.md); posible columna `intentos_fallidos Int @default(0)` si se
  elige la variante pura-Postgres, o ninguna si el conteo vive en Redis
- `apps/backend/prisma/migrations/*` — migración nueva aditiva
- `apps/backend/src/auth/auth.service.ts` — `login()` debe incrementar el contador en el `if` de
  rechazo existente (rama `password_incorrecta`) y decidir cuándo bloquear; NO debe tocar el 401
  uniforme existente
- `apps/backend/src/auth/session.service.ts` — sin cambios de código, solo consumir el
  `revokeAllForUser(userId)` ya existente
- `apps/backend/src/auditoria/audit-event-types.ts` — claves nuevas aditivas, p. ej.
  `CUENTA_BLOQUEADA` / `CUENTA_DESBLOQUEADA` (patrón aditivo ya documentado en el archivo)
- `apps/backend/src/auth/auth.controller.ts` (o un controller nuevo dentro de `auth/`) — endpoint
  nuevo de desbloqueo manual protegido con `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('comite')`
- Posible `apps/backend/src/auth/bloqueo.service.ts` nuevo (o extender `AuthService`) para el
  conteo de intentos y el desbloqueo manual, siguiendo el patrón transaccional de
  `recovery.service.ts::confirmar()`
- `apps/backend/src/redis/redis.provider.ts` — reutilizar el cliente Redis existente si se elige
  el enfoque de contador en Redis (sin cambio estructural, ya inyectable vía `REDIS_CLIENT`)

## Enfoques

1. **Contador en Redis + estado persistido en Postgres (recomendado)** — `INCR`/`EXPIRE` en Redis
   para intentos fallidos consecutivos (ventana configurable por env, reflejando el patrón
   `SESSION_TTL_SECONDS`); al llegar a N, una transacción de Prisma fija `estado='bloqueado'` +
   `bloqueado_hasta`, audita `CUENTA_BLOQUEADA`, y luego `revokeAllForUser()` fuera de la
   transacción.
   - Pros: incremento de contador atómico sin locking a nivel de aplicación; el TTL limpia el
     contador solo; coincide con los idiomas Redis ya existentes en el código
     (`SessionService`, `RecoveryService`); Postgres sigue siendo la fuente autoritativa para la
     lectura de `login()`
   - Cons: dos almacenes de datos para razonar sobre una sola funcionalidad; hay que cuidar el
     doble registro de auditoría de `CUENTA_BLOQUEADA` si dos intentos fallidos superan N en
     simultáneo (necesita un chequeo de estado dentro de la transacción)
   - Esfuerzo: Medio

2. **Postgres puro (columnas `intentos_fallidos` + `bloqueado_hasta`, sin Redis)** — incrementa la
   columna contador transaccionalmente en cada login fallido; resetea en éxito; chequea
   `bloqueado_hasta` manualmente al momento del login.
   - Pros: única fuente de verdad, más simple de auditar/inspeccionar directamente en Postgres;
     sin preocupación de consistencia entre almacenes
   - Cons: sin `INCR` atómico; necesita locking explícito de fila o concurrencia optimista para
     evitar updates perdidos bajo intentos fallidos concurrentes; más lógica custom de
     reseteo/expiración para escribir y testear
   - Esfuerzo: Medio-Alto

## Recomendación

Enfoque 1 (contador en Redis + estado de bloqueo persistido en Postgres). Reutiliza exactamente
los idiomas que este código ya establece para `SessionService`/`RecoveryService` (Redis
`INCR`/`EXPIRE` para contadores transitorios, Postgres como fuente durable que lee `login()`), y
mantiene el camino de bloqueo/auditoría/revocación de sesión sobre el mismo patrón transaccional ya
probado en `recovery.service.ts::confirmar()`. La expiración automática se chequea manualmente
contra `bloqueado_hasta` al momento del login, no vía un job de TTL de Postgres — consistente con
cómo `SessionService.obtener()` ya chequea a mano el techo absoluto de sesión.

## Riesgos

- N (número de intentos) y la ventana exacta (10 vs 15 min) no están fijados por PRD/TECH-DESIGN
  — solo dice "configurable"; `sdd-propose` debe proponer valores por defecto explícitos.
- Puede necesitarse un endpoint mínimo de "listar usuarios bloqueados" dentro del propio alcance
  de #6 para que el panel del comité sea usable antes de que exista #7 — no es un bloqueo duro,
  pero sí una decisión de alcance a hacer explícita en la propuesta.
- Concurrencia: intentos fallidos simultáneos cerca del umbral podrían disparar dos veces la
  transición de bloqueo; la transacción debe protegerse contra doble registro de auditoría de
  `CUENTA_BLOQUEADA` (chequear el estado previo / usar `updateMany` con una condición).

## Listo para propuesta

Sí. El punto de extensión de #4 (`revokeAllForUser`), el guard de roles, el patrón transaccional de
auditoría, y el nombre de columna esperado por TECH-DESIGN.md están todos confirmados en el código
real — `sdd-propose` puede pasar directo a fijar el umbral N, la ventana exacta, y el contrato del
endpoint de desbloqueo manual.
