# Delta for google-oauth-y-recuperacion

## MODIFIED Requirements

### Requirement: Verificación del ID token de Google
El sistema MUST verificar todo ID token de Google recibido usando `google-auth-library`
(`verifyIdToken`), validando firma, audiencia (`GOOGLE_CLIENT_ID`) y el claim `hd` contra el/los
dominio(s) institucional(es) configurados en `Configuracion.dominios_google` (leídos vía Prisma
en `GoogleOauthService.dominiosPermitidos()`), sin abrir conexión a la base de datos en el
constructor del servicio (mismo patrón perezoso de `googleOauthClientProvider`/`EmailModule`,
para no romper la extracción de OpenAPI sin BD viva en `src/openapi.ts`). Un arreglo
`dominios_google` vacío MUST comportarse igual que hoy: fail-closed, ningún dominio permitido.
(Previously: el/los dominio(s) permitido(s) se leían de la variable de entorno
`GOOGLE_HOSTED_DOMAINS`.)

#### Scenario: Token de dominio no permitido es rechazado
- GIVEN un ID token de Google válido cuyo claim `hd` no coincide con ningún dominio en
  `Configuracion.dominios_google`
- WHEN se intenta login OAuth con ese token
- THEN el login se rechaza sin crear sesión ni vincular ninguna cuenta
- AND se registra un evento `LOGIN_OAUTH_FALLIDO`

#### Scenario: Token con firma o audiencia inválida es rechazado
- GIVEN un ID token que falla la verificación de firma o de audiencia (`client_id`)
- WHEN se intenta login OAuth con ese token
- THEN el login se rechaza sin crear sesión

#### Scenario: `dominios_google` vacío rechaza todo login OAuth (fail-closed)
- GIVEN `Configuracion.dominios_google` es un arreglo vacío
- WHEN se intenta login OAuth con cualquier ID token válido
- THEN el login se rechaza sin crear sesión ni vincular ninguna cuenta

### Requirement: `EmailSender` mínimo sin outbox
El sistema MUST proveer un `EmailSender` con interfaz `send(destinatario, asunto, cuerpo)`, sin
persistencia ni reintentos ni cola, usado exclusivamente por el flujo de recuperación. La
implementación SMTP MUST resolver `host`/`puerto`/`remitente` desde `Configuracion` (columnas
`smtp_host`, `smtp_puerto`, `smtp_remitente`) en vez de las variables de entorno
`SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`, manteniendo la construcción perezosa (sin abrir socket antes
de `send()`). La contraseña SMTP MUST seguir viniendo exclusivamente de variable de
entorno/secret manager, nunca de `Configuracion`. El sistema MUST NOT escribir en las tablas
`JobCorreo`/`Notificacion`.
(Previously: no leía ninguna configuración SMTP de `Configuracion`; host/puerto/remitente venían
100% de variables de entorno.)

#### Scenario: Envío usa host/puerto/remitente de `Configuracion` sin persistir el correo
- GIVEN una solicitud de recuperación para un correo existente
- AND `Configuracion.smtp_host/smtp_puerto/smtp_remitente` configurados
- WHEN el token se envía vía `EmailSender`
- THEN la conexión SMTP usa esos valores leídos de `Configuracion`
- AND no se crea ninguna fila en `JobCorreo` ni en `Notificacion`

#### Scenario: La contraseña SMTP nunca se lee de `Configuracion`
- GIVEN `Configuracion` sin ninguna columna de contraseña SMTP
- WHEN se construye la conexión SMTP para un envío
- THEN la contraseña se obtiene de variable de entorno/secret manager
- AND ningún campo de `Configuracion` se usa como contraseña
