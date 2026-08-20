# Especificación: bloqueo-desbloqueo-cuentas

## Purpose

Define el bloqueo automático de cuentas por fuerza bruta contra contraseña (ADR-0008), su
desbloqueo por doble vía (expiración automática corta + desbloqueo manual del comité, ambos
auditados), y el listado mínimo de cuentas bloqueadas para el panel del comité. Capacidad nueva —
extiende el punto de extensión ya dejado por `auth-server-sessions`. Fuera de alcance:
administración general de usuarios (#7), cambios al 401 uniforme de login, columna
`intentos_fallidos` persistida en Postgres, notificación por correo, y cualquier UI en
`apps/frontend`.

## Requirements

### Requirement: Columna `bloqueado_hasta` en `Usuario`
El sistema MUST agregar `bloqueado_hasta` (`DateTime?`, nulable) a `Usuario` mediante una migración
de Prisma aditiva, apilada después de la migración de `google-oauth-y-recuperacion`.

#### Scenario: La columna existe tras la migración
- GIVEN la migración de este change aplicada
- WHEN se inspecciona `Usuario` en el esquema
- THEN existe `bloqueado_hasta` como columna `DateTime?` nulable

### Requirement: Contador de intentos fallidos de contraseña en Redis
El sistema MUST llevar, por usuario, un contador de intentos fallidos consecutivos de login por
contraseña en Redis (`INCR` + `EXPIRE`), con **umbral de 5 intentos** y **ventana de 15 minutos**
(TTL del contador = 15 min). El sistema MUST NOT persistir este conteo en Postgres. El sistema MUST
resetear el contador (`DEL`) ante un login por contraseña exitoso del mismo usuario.

#### Scenario: Un intento fallido incrementa el contador
- GIVEN un `Usuario` sin intentos fallidos previos vigentes
- WHEN el login con contraseña incorrecta se rechaza
- THEN el contador de intentos fallidos de ese usuario en Redis vale 1 con TTL de 15 minutos

#### Scenario: Un login exitoso resetea el contador
- GIVEN un `Usuario` con 4 intentos fallidos consecutivos vigentes
- WHEN el mismo usuario hace login exitoso con la contraseña correcta
- THEN el contador de intentos fallidos de ese usuario ya no existe en Redis

#### Scenario: Intentos fallidos posteriores a un reseteo no arrastran el conteo previo
- GIVEN un `Usuario` con 4 intentos fallidos seguidos de 1 login exitoso
- WHEN ocurren 4 intentos fallidos más inmediatamente después
- THEN la cuenta no se bloquea, porque el contador partió de cero tras el login exitoso

### Requirement: Login OAuth rechazado no suma al contador de intentos fallidos
El sistema MUST restringir el umbral de bloqueo al flujo usuario/contraseña. Un login OAuth
rechazado (dominio no permitido, correo no vinculado, vinculación pendiente) MUST NOT incrementar
el contador de intentos fallidos de ningún usuario.

#### Scenario: Rechazo OAuth no afecta el contador de contraseña
- GIVEN un `Usuario` sin intentos fallidos de contraseña vigentes
- WHEN un login OAuth para ese mismo usuario se rechaza (p. ej. dominio no permitido)
- THEN el contador de intentos fallidos de contraseña de ese usuario sigue en cero o inexistente

### Requirement: Transición automática a `bloqueado` al alcanzar el umbral
El sistema MUST, cuando el contador de intentos fallidos de un usuario alcanza 5, ejecutar una
transacción de Prisma que actualiza `Usuario.estado = 'bloqueado'` y
`Usuario.bloqueado_hasta = now() + 15min`, **solo si el estado previo de la fila no era ya
`bloqueado`**, y auditar `CUENTA_BLOQUEADA` (`AuditoriaService.log(tx, ...)`) dentro de la misma
transacción **solo cuando el `update` afectó efectivamente una fila**. El sistema MUST, después de
confirmada la transacción, invocar `SessionService.revokeAllForUser(userId)`.

#### Scenario: El quinto intento fallido bloquea la cuenta
- GIVEN un `Usuario` con 4 intentos fallidos de contraseña vigentes y `estado = 'activo'`
- WHEN ocurre un quinto intento fallido consecutivo dentro de la ventana de 15 minutos
- THEN `Usuario.estado` pasa a `'bloqueado'` y `Usuario.bloqueado_hasta` queda fijado a `now() + 15min`
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'CUENTA_BLOQUEADA'`
- AND ninguna clave `session:{id}` de ese usuario permanece en Redis

#### Scenario: Dos intentos concurrentes que superan el umbral no duplican la auditoría
- GIVEN un `Usuario` con 4 intentos fallidos vigentes
- WHEN dos requests concurrentes generan, cada uno, el quinto intento fallido casi simultáneamente
- THEN `Usuario.estado` queda en `'bloqueado'` una sola vez
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'CUENTA_BLOQUEADA'` para ese usuario, no dos

### Requirement: Expiración automática del bloqueo por chequeo perezoso en login
El sistema MUST, en `AuthService.login()`, comparar `bloqueado_hasta` contra `now()` cuando
`estado = 'bloqueado'`. Si `bloqueado_hasta` ya venció, el sistema MUST NOT rechazar el login por
causa de bloqueo y MUST continuar evaluando la contraseña normalmente. El sistema MUST corregir
`estado = 'activo'` y `bloqueado_hasta = null` de forma perezosa, dentro de la misma transacción que
audita el login exitoso posterior, cuando ese login resulta exitoso.

#### Scenario: Login con bloqueo ya vencido continúa evaluando la contraseña
- GIVEN un `Usuario` con `estado = 'bloqueado'` y `bloqueado_hasta` en el pasado
- WHEN se intenta el login con la contraseña correcta
- THEN el login no se rechaza por causa de bloqueo
- AND se crea sesión igual que un login exitoso normal
- AND `Usuario.estado` queda en `'activo'` con `bloqueado_hasta = null`

#### Scenario: Login con bloqueo ya vencido pero contraseña incorrecta sigue rechazando por contraseña
- GIVEN un `Usuario` con `estado = 'bloqueado'` y `bloqueado_hasta` en el pasado
- WHEN se intenta el login con la contraseña incorrecta
- THEN el login se rechaza por contraseña incorrecta, no por bloqueo
- AND el contador de intentos fallidos de ese usuario se incrementa

#### Scenario: Login con bloqueo vigente sigue rechazado
- GIVEN un `Usuario` con `estado = 'bloqueado'` y `bloqueado_hasta` aún en el futuro
- WHEN se intenta el login, con contraseña correcta o incorrecta
- THEN el login se rechaza por causa de bloqueo, sin crear sesión

### Requirement: Desbloqueo manual por el comité
El sistema MUST proveer un endpoint `POST` protegido con `@Roles('comite')` que, dentro de una
transacción de Prisma, resetea `Usuario.estado = 'activo'` y `Usuario.bloqueado_hasta = null`, y
audita `CUENTA_DESBLOQUEADA` (`AuditoriaService.log(tx, ...)`) usando el usuario del comité que
ejecuta la acción como actor. El sistema MUST, después de confirmada la transacción, invocar
`SessionService.revokeAllForUser(userId)`.

#### Scenario: Desbloqueo manual exitoso
- GIVEN un `Usuario` con `estado = 'bloqueado'` y un usuario del comité autenticado
- WHEN el usuario del comité invoca el endpoint de desbloqueo manual sobre ese `Usuario`
- THEN `Usuario.estado` pasa a `'activo'` y `Usuario.bloqueado_hasta` queda en `null`
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'CUENTA_DESBLOQUEADA'` y
  `actor_usuario_id` igual al id del usuario del comité
- AND ninguna clave `session:{id}` del usuario desbloqueado permanece en Redis

#### Scenario: Un rol distinto de `comite` no puede desbloquear
- GIVEN una sesión válida cuyo rol no es `comite`
- WHEN se invoca el endpoint de desbloqueo manual
- THEN la solicitud se rechaza sin ejecutar el handler y sin cambiar `estado` ni `bloqueado_hasta`

### Requirement: Listado mínimo de cuentas bloqueadas
El sistema MUST proveer un endpoint `GET` protegido con `@Roles('comite')` que devuelve únicamente
las filas de `Usuario` con `estado = 'bloqueado'`, exponiendo solo los campos `id`, `nombres`,
`dni`, `codigo` y `bloqueado_hasta`, sin filtros ni paginación. El sistema MUST incluir en la
respuesta las cuentas cuyo `bloqueado_hasta` ya venció pero cuyo `estado` sigue en `'bloqueado'`
(expiración perezosa).

#### Scenario: El listado devuelve solo cuentas bloqueadas con los campos mínimos
- GIVEN dos `Usuario` con `estado = 'bloqueado'` y uno con `estado = 'activo'`
- WHEN un usuario del comité solicita el listado de cuentas bloqueadas
- THEN la respuesta contiene exactamente las dos cuentas con `estado = 'bloqueado'`
- AND cada elemento expone solo `id`, `nombres`, `dni`, `codigo` y `bloqueado_hasta`

#### Scenario: Una cuenta con bloqueo ya vencido sigue apareciendo en el listado
- GIVEN un `Usuario` con `estado = 'bloqueado'` y `bloqueado_hasta` en el pasado, que no volvió a
  intentar loguearse
- WHEN un usuario del comité solicita el listado de cuentas bloqueadas
- THEN esa cuenta aparece en el listado

#### Scenario: Un rol distinto de `comite` no puede listar cuentas bloqueadas
- GIVEN una sesión válida cuyo rol no es `comite`
- WHEN se invoca el endpoint de listado de cuentas bloqueadas
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: UI de listado de cuentas bloqueadas reservada al rol `comite`

El sistema MUST proveer una vista que consuma `GET /auth/usuarios/bloqueados` y liste únicamente
las cuentas con `estado === 'bloqueado'`, con los campos `id`, `nombres`, `dni`, `codigo` y
`bloqueado_hasta`. Esta vista MUST ser alcanzable solo por una sesión con `rol === 'comite'`,
porque el endpoint del backend está protegido con `@Roles('comite')` — ningún otro rol, incluidos
`administrador`/`director`, puede invocarlo.

(Nota de discrepancia contra el borrador original de `proposal.md`, ya corregida: el borrador
describía esta acción como un panel contextual dentro de la ficha de `Usuario` de
`administracion-usuarios-apoderados`, alcanzable por `administrador`/`director`. El backend real
(`AuthController.listarBloqueados`/`desbloquear`, `@Roles('comite')`) y
`administracion-usuarios-apoderados` ("Aislamiento de rol comite": comite rechazado en todo
`UsersModule`, incluida `GET /usuarios/:id`) hacen esa combinación imposible: el rol que puede
invocar estos endpoints, `comite`, no puede abrir la ficha de `Usuario` donde se había propuesto
anidarlas. Decisión confirmada por el usuario (2026-08-20): **pantalla propia "Cuentas
bloqueadas"**, con su propio item de menú visible sólo para `comite`, independiente de `/usuarios`
— no un panel dentro de la ficha. `sdd-design` fija la ruta y el nombre de archivo exactos.)

#### Scenario: Comité ve el listado de cuentas bloqueadas

- GIVEN una sesión con `rol = 'comite'` y al menos una cuenta con `estado = 'bloqueado'`
- WHEN accede a la vista de cuentas bloqueadas
- THEN la vista muestra esa cuenta con `id`, `nombres`, `dni`, `codigo` y `bloqueado_hasta`

#### Scenario: Un rol distinto de comité no puede alcanzar la vista

- GIVEN una sesión con `rol = 'administrador'`
- WHEN intenta acceder a la vista de cuentas bloqueadas
- THEN la UI no la ofrece como opción alcanzable (el backend rechazaría la llamada con 403 si se
  invocara igual)

### Requirement: Desbloqueo manual con confirmación explícita auditada

El sistema MUST proveer, dentro de la vista de cuentas bloqueadas, un botón de desbloqueo por cada
cuenta con `estado === 'bloqueado'`, que consume `POST /auth/usuarios/:id/desbloquear` solo tras
una confirmación explícita. El diálogo de confirmación MUST mencionar que la acción queda
registrada en auditoría, para que la UI no transmita la sensación de un botón silencioso
(ADR-0008).

#### Scenario: Desbloquear una cuenta pide confirmación con mención de auditoría

- GIVEN una sesión con `rol = 'comite'` viendo una cuenta bloqueada
- WHEN hace click en "Desbloquear"
- THEN se abre un diálogo de confirmación cuyo texto menciona explícitamente que la acción queda
  auditada
- AND solo tras confirmar se invoca `POST /auth/usuarios/:id/desbloquear`

#### Scenario: Cancelar el diálogo no desbloquea la cuenta

- GIVEN el diálogo de confirmación de desbloqueo abierto
- WHEN el usuario del comité lo cancela
- THEN no se invoca `POST /auth/usuarios/:id/desbloquear` y la cuenta sigue bloqueada en la vista

#### Scenario: Cuenta desbloqueada exitosamente desaparece del listado

- GIVEN una cuenta bloqueada y la confirmación de desbloqueo aceptada
- WHEN `POST /auth/usuarios/:id/desbloquear` responde exitosamente
- THEN la cuenta ya no aparece en el listado de cuentas bloqueadas tras refrescar la vista

### Requirement: Botón de desbloqueo visible solo cuando `estado === 'bloqueado'`

El sistema MUST mostrar el botón de desbloqueo únicamente para cuentas con
`estado === 'bloqueado'`. El sistema MUST NOT mostrar ese botón para cuentas con cualquier otro
`estado`, incluidas las que ya se recuperaron por expiración perezosa.

#### Scenario: Cuenta ya recuperada no ofrece botón de desbloqueo

- GIVEN una cuenta cuyo `estado` volvió a `'activo'` por expiración perezosa
- WHEN se renderiza el listado
- THEN esa cuenta ya no aparece en la vista de cuentas bloqueadas (el listado solo trae
  `estado = 'bloqueado'`)
