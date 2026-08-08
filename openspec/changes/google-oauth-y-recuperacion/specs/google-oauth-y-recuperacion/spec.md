# Especificación: google-oauth-y-recuperacion

## Purpose

Define el login con Google OAuth restringido al dominio institucional (verificación manual de ID
token, sin auto-provisión de cuentas) y el flujo de recuperación/establecimiento de contraseña con
token de un solo uso en Redis, reutilizando `SessionService`/`AuditoriaService` de
`auth-server-sessions`. Capacidad nueva — no modifica requisitos existentes. Fuera de alcance:
tablas `JobCorreo`/`Notificacion`, worker de outbox (#15), `Configuracion` SMTP/dominio (#10),
`passport-google-oauth20`, UI de `apps/frontend`.

## Requirements

### Requirement: Columna `google_id` en `Usuario`
El sistema MUST agregar `google_id` (`String?`, `@unique`) a `Usuario` mediante una migración de
Prisma aditiva, apilada después de la migración de credencial de `auth-server-sessions`.

#### Scenario: La columna existe tras la migración
- GIVEN la migración de este change aplicada
- WHEN se inspecciona `Usuario` en el esquema
- THEN existe `google_id` como columna `String?` con restricción `@unique`

### Requirement: Verificación del ID token de Google
El sistema MUST verificar todo ID token de Google recibido usando `google-auth-library`
(`verifyIdToken`), validando firma, audiencia (`GOOGLE_CLIENT_ID`) y el claim `hd` contra el/los
dominio(s) institucional(es) configurados por variable de entorno.

#### Scenario: Token de dominio no permitido es rechazado
- GIVEN un ID token de Google válido cuyo claim `hd` no coincide con ningún dominio permitido
- WHEN se intenta login OAuth con ese token
- THEN el login se rechaza sin crear sesión ni vincular ninguna cuenta
- AND se registra un evento `LOGIN_OAUTH_FALLIDO`

#### Scenario: Token con firma o audiencia inválida es rechazado
- GIVEN un ID token que falla la verificación de firma o de audiencia (`client_id`)
- WHEN se intenta login OAuth con ese token
- THEN el login se rechaza sin crear sesión

### Requirement: Login OAuth con correo no registrado es rechazado
El sistema MUST rechazar el login OAuth cuando el correo del ID token verificado no coincide con
ningún `Usuario.correo` existente. El sistema MUST NOT crear un `Usuario` nuevo a partir de este
flujo (sin auto-provisión).

#### Scenario: Correo institucional válido pero sin `Usuario` previo
- GIVEN un ID token de Google válido, de dominio permitido, cuyo correo no corresponde a ningún
  `Usuario` existente
- WHEN se intenta login OAuth con ese token
- THEN el login se rechaza y no se crea ningún `Usuario` nuevo
- AND se registra un evento `LOGIN_OAUTH_FALLIDO`

### Requirement: Vinculación de cuenta exige confirmación de contraseña actual
El sistema MUST exigir la confirmación de la contraseña actual antes de completar `google_id` en un
`Usuario` que ya tiene `password_hash` y aún no tiene `google_id`. El sistema MUST NOT vincular
`google_id` únicamente en base a la posesión de un ID token válido cuando el `Usuario` ya tiene
credencial de contraseña.

#### Scenario: Primer login OAuth de una cuenta con contraseña exige confirmarla
- GIVEN un `Usuario` existente con `password_hash` y `google_id` nulo
- WHEN llega un login OAuth con ID token válido cuyo correo coincide con ese `Usuario`, sin
  confirmación de contraseña actual
- THEN el login OAuth no vincula `google_id` ni crea sesión
- AND se solicita confirmación de la contraseña actual para completar la vinculación

#### Scenario: Vinculación exitosa con contraseña actual confirmada
- GIVEN el mismo `Usuario` con `password_hash` y `google_id` nulo
- WHEN se confirma la contraseña actual correcta junto con el login OAuth
- THEN `Usuario.google_id` queda completado con el `sub`/id de Google del token
- AND se crea una sesión igual que el login por contraseña

#### Scenario: Login OAuth de cuenta ya vinculada no requiere contraseña
- GIVEN un `Usuario` con `google_id` ya completado
- WHEN llega un login OAuth con ID token válido de ese mismo `google_id`
- THEN se crea sesión sin exigir confirmación de contraseña

### Requirement: Login OAuth exitoso crea sesión igual que login por contraseña
El sistema MUST, ante un login OAuth exitoso (dominio permitido, correo vinculado o recién
vinculado), crear una sesión en Redis y devolver la cookie `seei_session`, con el mismo
`SessionService` usado por el login por contraseña.

#### Scenario: Sesión creada tras login OAuth exitoso
- GIVEN un `Usuario` con `google_id` vinculado y `estado` distinto de `bloqueado`
- WHEN se hace login OAuth con un ID token válido de ese `google_id`
- THEN existe una clave `session:{id}` en Redis con el `userId` correspondiente
- AND la respuesta incluye la cookie `seei_session`
- AND se registra un evento `LOGIN_OAUTH_EXITOSO`

### Requirement: Solicitud de recuperación no revela existencia del correo
El sistema MUST responder de forma idéntica (mismo cuerpo y código de estado observables) a una
solicitud de recuperación tanto si el correo corresponde a un `Usuario` existente como si no, para
prevenir enumeración de usuarios.

#### Scenario: Correo existente genera token y envío
- GIVEN un `Usuario` existente con ese correo
- WHEN se solicita recuperación con ese correo
- THEN se genera un token de un solo uso guardado en Redis como `recovery:{token}` → `userId` con
  TTL corto
- AND el token se envía vía `EmailSender`
- AND la respuesta observable es la respuesta uniforme de "solicitud recibida"
- AND se registra un evento `RECUPERACION_SOLICITADA`

#### Scenario: Correo inexistente responde igual sin generar token
- GIVEN que ningún `Usuario` tiene ese correo
- WHEN se solicita recuperación con ese correo
- THEN la respuesta observable es idéntica en cuerpo y código de estado a la del correo existente
- AND no se crea ninguna clave `recovery:{token}` en Redis

### Requirement: El mismo endpoint de recuperación establece la primera contraseña de cuentas solo-OAuth
El sistema MUST permitir que el mismo endpoint de confirmación de recuperación establezca
`password_hash` por primera vez en un `Usuario` sin `password_hash` previo (cuenta creada solo con
`google_id`), sin exponer un endpoint ni contrato separado para "primera contraseña".

#### Scenario: Confirmación establece contraseña en cuenta solo-OAuth
- GIVEN un `Usuario` con `google_id` vinculado y `password_hash` nulo
- AND un token de recuperación válido y no usado emitido para ese `Usuario`
- WHEN se confirma la recuperación con ese token y una contraseña nueva
- THEN `Usuario.password_hash` queda establecido con el hash de la contraseña nueva
- AND el resultado observable es indistinguible del caso de reseteo de una cuenta que ya tenía
  `password_hash`

### Requirement: Confirmación de recuperación es de un solo uso
El sistema MUST validar el token de recuperación contra Redis, actualizar `password_hash`, eliminar
el token de Redis (`DEL`) y revocar todas las sesiones activas del usuario vía
`SessionService.revokeAllForUser(userId)` al confirmar exitosamente. El sistema MUST rechazar la
confirmación si el token no existe en Redis (ya usado o expirado).

#### Scenario: Confirmación exitosa invalida el token y revoca sesiones
- GIVEN un token de recuperación válido en `recovery:{token}` → `userId`
- WHEN se confirma la recuperación con ese token y una contraseña nueva válida
- THEN `Usuario.password_hash` se actualiza
- AND la clave `recovery:{token}` ya no existe en Redis
- AND ninguna clave `session:{id}` de ese usuario permanece en Redis
- AND se registra un evento `RECUPERACION_COMPLETADA`

#### Scenario: Confirmación con token ya usado es rechazada
- GIVEN un token de recuperación que ya fue consumido en una confirmación previa
- WHEN se intenta confirmar la recuperación nuevamente con ese mismo token
- THEN la confirmación se rechaza
- AND `password_hash` no cambia

#### Scenario: Confirmación con token expirado es rechazada
- GIVEN un token de recuperación cuyo TTL en Redis ya venció
- WHEN se intenta confirmar la recuperación con ese token
- THEN la confirmación se rechaza

### Requirement: Auditoría transaccional de OAuth y recuperación
El sistema MUST registrar cada login OAuth exitoso, login OAuth fallido/rechazado, solicitud de
recuperación y confirmación de recuperación vía `AuditoriaService.log(tx, ...)`, cada uno dentro de
su propio `prisma.$transaction()`, respetando el orden crítico D7 (auditoría antes de tocar
Redis/cookies) establecido por `auth-server-sessions`.

#### Scenario: Fallo de la escritura de auditoría aborta el login OAuth
- GIVEN un login OAuth exitoso cuyo registro de auditoría falla dentro de la misma transacción
- WHEN la transacción hace rollback
- THEN no queda sesión creada en Redis ni cookie válida emitida para ese intento

#### Scenario: Fallo de la escritura de auditoría aborta la confirmación de recuperación
- GIVEN una confirmación de recuperación válida cuyo registro de auditoría falla dentro de la misma
  transacción
- WHEN la transacción hace rollback
- THEN el token de recuperación no se elimina de Redis
- AND `password_hash` no cambia
- AND las sesiones del usuario no se revocan

### Requirement: `EmailSender` mínimo sin outbox
El sistema MUST proveer un `EmailSender` con interfaz `send(destinatario, asunto, cuerpo)`, sin
persistencia ni reintentos ni cola, usado exclusivamente por el flujo de recuperación. El sistema
MUST NOT escribir en las tablas `JobCorreo`/`Notificacion` ni leer configuración SMTP desde
`Configuracion`.

#### Scenario: Envío usa la implementación configurada sin persistir el correo
- GIVEN una solicitud de recuperación para un correo existente
- WHEN el token se envía vía `EmailSender`
- THEN no se crea ninguna fila en `JobCorreo` ni en `Notificacion`
- AND no se lee ni escribe el modelo `Configuracion`

### Requirement: Eventos de auditoría nuevos son aditivos
El sistema MUST agregar `LOGIN_OAUTH_EXITOSO`, `LOGIN_OAUTH_FALLIDO`, `RECUPERACION_SOLICITADA` y
`RECUPERACION_COMPLETADA` a `AUDIT_EVENT_TYPES` de forma aditiva, sin modificar la cláusula `WHEN`
del trigger de ADR-0016 (que sigue cubriendo únicamente `VOTO`/`RECHAZO`).

#### Scenario: El trigger de ADR-0016 no se ve afectado
- GIVEN los cuatro `event_type` nuevos agregados a `AUDIT_EVENT_TYPES`
- WHEN se inspecciona la cláusula `WHEN` del trigger de auditoría de ADR-0016
- THEN la cláusula sigue restringida a `VOTO`/`RECHAZO`, sin mención de los eventos nuevos
