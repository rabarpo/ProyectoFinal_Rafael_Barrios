# Delta for auth-server-sessions

## MODIFIED Requirements

### Requirement: Login exitoso crea sesión y cookie
El sistema MUST, ante credenciales usuario/contraseña válidas, crear una sesión en Redis
(`session:{id}` con `userId`/`rol` y TTL) y devolver una cookie httpOnly que referencia esa sesión.
El sistema MUST resetear el contador de intentos fallidos de contraseña de ese usuario en Redis
(`DEL`) como parte del mismo flujo exitoso.
(Previously: no reseteaba ningún contador de intentos fallidos, porque el contador no existía antes
de `bloqueo-desbloqueo-cuentas`.)

#### Scenario: Credenciales válidas crean sesión y cookie
- GIVEN un `Usuario` existente con `estado` distinto de `bloqueado` y contraseña conocida
- WHEN se hace login con usuario/contraseña correctos
- THEN existe una clave `session:{id}` en Redis con el `userId` correspondiente
- AND la respuesta incluye una cookie httpOnly referenciando esa sesión

#### Scenario: Login exitoso resetea el contador de intentos fallidos
- GIVEN un `Usuario` con intentos fallidos de contraseña vigentes en Redis
- WHEN ese mismo usuario hace login exitoso con la contraseña correcta
- THEN el contador de intentos fallidos de ese usuario ya no existe en Redis

### Requirement: Login fallido no crea sesión
El sistema MUST rechazar el login con credenciales inválidas sin crear ninguna sesión en Redis ni
emitir cookie, y MUST registrar un evento `LOGIN_FALLIDO`. El sistema MUST incrementar el contador
de intentos fallidos de contraseña de ese usuario en Redis como parte de la misma rama de rechazo
por contraseña incorrecta.
(Previously: no incrementaba ningún contador de intentos fallidos, porque el contador no existía
antes de `bloqueo-desbloqueo-cuentas`.)

#### Scenario: Contraseña incorrecta no crea sesión
- GIVEN un `Usuario` existente
- WHEN se hace login con la contraseña incorrecta
- THEN no se crea ninguna clave de sesión en Redis para ese intento
- AND no se emite cookie de sesión

#### Scenario: Login fallido queda auditado
- GIVEN el mismo intento con contraseña incorrecta
- WHEN el login se rechaza
- THEN existe exactamente una fila `EventoAuditoría` con `event_type = 'LOGIN_FALLIDO'`

#### Scenario: Contraseña incorrecta incrementa el contador de intentos fallidos
- GIVEN un `Usuario` sin intentos fallidos previos vigentes
- WHEN se hace login con la contraseña incorrecta
- THEN el contador de intentos fallidos de contraseña de ese usuario en Redis vale 1

### Requirement: Login contra usuario bloqueado es rechazado
El sistema MUST rechazar el login cuando `Usuario.estado === 'bloqueado'` **y**
`Usuario.bloqueado_hasta` aún no venció, sin crear sesión, independientemente de si la contraseña
provista es correcta. El sistema MUST NOT rechazar por causa de bloqueo cuando
`Usuario.bloqueado_hasta` ya venció; en ese caso MUST continuar evaluando la contraseña
normalmente (ver `bloqueo-desbloqueo-cuentas`).
(Previously: rechazaba de forma incondicional ante `estado === 'bloqueado'`, sin considerar
`bloqueado_hasta`, porque esa columna no existía antes de `bloqueo-desbloqueo-cuentas`.)

#### Scenario: Usuario bloqueado con contraseña correcta es rechazado
- GIVEN un `Usuario` con `estado = 'bloqueado'`, `bloqueado_hasta` en el futuro, y contraseña
  correcta provista
- WHEN se intenta el login
- THEN el login se rechaza y no se crea sesión en Redis

#### Scenario: Usuario con bloqueo ya vencido no es rechazado por causa de bloqueo
- GIVEN un `Usuario` con `estado = 'bloqueado'` y `bloqueado_hasta` en el pasado
- WHEN se intenta el login con la contraseña correcta
- THEN el login no se rechaza por causa de bloqueo y se crea sesión igual que un login exitoso normal
