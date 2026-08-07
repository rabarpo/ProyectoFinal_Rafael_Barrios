# Especificación: auth-server-sessions

## Purpose

Define el flujo de autenticación usuario/contraseña con sesión en servidor (cookie httpOnly
respaldada por Redis, ADR-0004), el `AuthGuard`/`RolesGuard` que #6-#22 reutilizarán, el punto de
extensión de bloqueo de cuenta para #6, y el registro de auditoría obligatorio de cada login
exitoso, login fallido y logout. Capacidad greenfield — no hay spec previa que modificar. Fuera de
alcance: Google OAuth, recuperación de contraseña, conteo/expiración automática de bloqueo, y
cualquier UI de login en `apps/frontend`.

## Requirements

### Requirement: Columna de credencial en `Usuario`
El sistema MUST agregar `password_hash` (y cualquier columna de credencial estrictamente
necesaria) a `Usuario` mediante una migración de Prisma aditiva, apilada después de la migración
de `append-only-audit-engine`.

#### Scenario: La columna existe tras la migración
- GIVEN la migración de este change aplicada
- WHEN se inspecciona `Usuario` en el esquema
- THEN existe `password_hash` como columna de credencial

### Requirement: Login exitoso crea sesión y cookie
El sistema MUST, ante credenciales usuario/contraseña válidas, crear una sesión en Redis
(`session:{id}` con `userId`/`rol` y TTL) y devolver una cookie httpOnly que referencia esa sesión.

#### Scenario: Credenciales válidas crean sesión y cookie
- GIVEN un `Usuario` existente con `estado` distinto de `bloqueado` y contraseña conocida
- WHEN se hace login con usuario/contraseña correctos
- THEN existe una clave `session:{id}` en Redis con el `userId` correspondiente
- AND la respuesta incluye una cookie httpOnly referenciando esa sesión

### Requirement: Login fallido no crea sesión
El sistema MUST rechazar el login con credenciales inválidas sin crear ninguna sesión en Redis ni
emitir cookie, y MUST registrar un evento `LOGIN_FALLIDO`.

#### Scenario: Contraseña incorrecta no crea sesión
- GIVEN un `Usuario` existente
- WHEN se hace login con la contraseña incorrecta
- THEN no se crea ninguna clave de sesión en Redis para ese intento
- AND no se emite cookie de sesión

#### Scenario: Login fallido queda auditado
- GIVEN el mismo intento con contraseña incorrecta
- WHEN el login se rechaza
- THEN existe exactamente una fila `EventoAuditoría` con `event_type = 'LOGIN_FALLIDO'`

### Requirement: Login contra usuario bloqueado es rechazado
El sistema MUST rechazar el login cuando `Usuario.estado === 'bloqueado'`, sin crear sesión,
independientemente de si la contraseña provista es correcta.

#### Scenario: Usuario bloqueado con contraseña correcta es rechazado
- GIVEN un `Usuario` con `estado = 'bloqueado'` y contraseña correcta provista
- WHEN se intenta el login
- THEN el login se rechaza y no se crea sesión en Redis

### Requirement: Logout invalida sesión y expira cookie
El sistema MUST, ante un logout con sesión válida, eliminar la clave de sesión correspondiente en
Redis, expirar la cookie en la respuesta, y registrar un evento `LOGOUT`.

#### Scenario: Logout invalida la sesión activa
- GIVEN una sesión activa con cookie válida
- WHEN se invoca logout
- THEN la clave `session:{id}` ya no existe en Redis
- AND la cookie de la respuesta queda expirada
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'LOGOUT'`

### Requirement: `AuthGuard` exige sesión válida
El sistema MUST rechazar toda solicitud a una ruta protegida por `AuthGuard` que no traiga una
cookie de sesión válida y vigente en Redis.

#### Scenario: Solicitud sin cookie es rechazada
- GIVEN una ruta protegida por `AuthGuard`
- WHEN se solicita sin cookie de sesión
- THEN la solicitud se rechaza sin ejecutar el handler

#### Scenario: Solicitud con sesión inexistente en Redis es rechazada
- GIVEN una cookie que referencia un `session:{id}` ya eliminado o expirado
- WHEN se solicita una ruta protegida por `AuthGuard`
- THEN la solicitud se rechaza

### Requirement: `RolesGuard` autoriza por rol
El sistema MUST proveer `RolesGuard` junto con un decorador `@Roles()` que rechace solicitudes de
un usuario autenticado cuyo rol no esté entre los roles permitidos para la ruta.

#### Scenario: Rol no autorizado es rechazado
- GIVEN una ruta anotada con `@Roles('ROL_X')` y una sesión válida cuyo `rol` es distinto de `ROL_X`
- WHEN se solicita esa ruta
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: Punto de extensión de revocación de sesión
El sistema MUST exponer `SessionService.revokeAllForUser(userId)`, invocable e idempotente, sin
implementar aquí el conteo de intentos fallidos ni la expiración automática de bloqueo (#6).

#### Scenario: `revokeAllForUser` elimina todas las sesiones del usuario
- GIVEN un usuario con dos o más sesiones activas en Redis
- WHEN se invoca `SessionService.revokeAllForUser(userId)`
- THEN ninguna clave `session:{id}` de ese usuario permanece en Redis

### Requirement: Auditoría de auth transaccional
El sistema MUST registrar cada login exitoso, login fallido y logout vía `AuditoriaService.log(tx,
...)`, cada uno dentro de su propio `prisma.$transaction()`.

#### Scenario: Fallo de la escritura de auditoría aborta el login
- GIVEN un login exitoso cuyo registro de auditoría falla dentro de la misma transacción
- WHEN la transacción hace rollback
- THEN no queda sesión creada en Redis ni cookie válida emitida para ese intento

### Requirement: Preservación de `lazyConnect` en Redis
El sistema MUST preservar `lazyConnect: true` en el cliente Redis reutilizado por
`SessionService`, sin forzar conexión temprana en constructores de módulo.

#### Scenario: `src/openapi.ts` extrae el contrato sin Redis/Postgres vivos
- GIVEN `AppModule` instanciado por `src/openapi.ts` en CI sin Redis ni Postgres disponibles
- WHEN se extrae el contrato OpenAPI
- THEN la extracción se completa sin error de conexión a Redis
