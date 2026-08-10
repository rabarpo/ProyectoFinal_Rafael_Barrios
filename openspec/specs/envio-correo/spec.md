# Especificación: envio-correo

## Purpose

Define cómo `EmailModule`/`emailSenderProvider` resuelve la implementación de envío de correo
(`SmtpEmailSender` vs `ConsoleEmailSender`) y sus parámetros de conexión, migrando la fuente de
host/puerto/remitente de variables de entorno a `Configuracion`. Capacidad modificada respecto al
comportamiento implícito de `email.module.ts` introducido en `google-oauth-y-recuperacion`
(donde ese módulo tenía prohibido leer `Configuracion`); ver también el delta de
`google-oauth-y-recuperacion` para el cambio del requirement `EmailSender mínimo sin outbox`.
Fuera de alcance: contraseña SMTP (sigue en env var/secret manager), tablas
`JobCorreo`/`Notificacion`, worker de outbox.

## Requirements

### Requirement: Resolución perezosa de host/puerto/remitente SMTP desde `Configuracion`
El sistema MUST resolver `smtp_host`, `smtp_puerto` y `smtp_remitente` desde la fila
`Configuracion` (`clave='institucional'`) al momento de construir el `EmailSender`, sin abrir
conexión a la base de datos ni al servidor SMTP durante el arranque del módulo (mismo patrón
perezoso que `googleOauthClientProvider`), para no romper la extracción de OpenAPI sin BD viva en
`src/openapi.ts`.

#### Scenario: `Configuracion` con SMTP configurado produce `SmtpEmailSender`
- GIVEN `Configuracion.smtp_host` no nulo
- WHEN se resuelve `EMAIL_SENDER`
- THEN se instancia `SmtpEmailSender` usando `smtp_host`/`smtp_puerto`/`smtp_remitente` de
  `Configuracion` y la contraseña de variable de entorno

#### Scenario: `Configuracion` sin SMTP configurado usa el fallback de consola
- GIVEN `Configuracion.smtp_host` nulo o vacío
- WHEN se resuelve `EMAIL_SENDER`
- THEN se instancia `ConsoleEmailSender` como fallback de desarrollo, igual que hoy con env var
  ausente

### Requirement: La contraseña SMTP nunca se persiste en `Configuracion`
El sistema MUST obtener la contraseña SMTP exclusivamente de variable de entorno/secret manager
en tiempo de envío, y MUST NOT agregar ninguna columna de contraseña a `Configuracion` ni leerla
de esa tabla.

#### Scenario: Envío exitoso combina host de DB y contraseña de env var
- GIVEN `Configuracion.smtp_host/puerto/remitente` configurados y `SMTP_PASSWORD` en variable de
  entorno
- WHEN se envía un correo
- THEN la conexión SMTP se establece con host/puerto/remitente de `Configuracion` y contraseña de
  la variable de entorno

### Requirement: Cambio de configuración SMTP no requiere redeploy
El sistema MUST leer `smtp_host`/`smtp_puerto`/`smtp_remitente` en cada resolución de
`EmailSender` (no cacheados desde el arranque del proceso más allá de la vida de la request/uso
puntual), de modo que una actualización vía `PUT /configuracion` tome efecto sin reiniciar el
proceso.

#### Scenario: Actualizar el host SMTP vía `PUT /configuracion` afecta el próximo envío
- GIVEN un envío previo usando `smtp_host = "smtp.viejo.test"`
- WHEN un administrador actualiza `Configuracion.smtp_host` a `"smtp.nuevo.test"` vía
  `PUT /configuracion`
- THEN el siguiente envío de correo usa `"smtp.nuevo.test"` sin reiniciar el backend
