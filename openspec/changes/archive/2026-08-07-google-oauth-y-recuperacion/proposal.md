# Propuesta: google-oauth-y-recuperacion (Backlog #5 — Google OAuth de dominio y recuperación)

## Intención

`auth-server-sessions` (#4, archivado) entregó login por usuario/contraseña con sesión en Redis,
pero dejó explícitamente fuera de alcance dos flujos de acceso que el PRD exige: iniciar sesión con
la cuenta de Google institucional (dominio restringido) y recuperar el acceso cuando el usuario
olvida su contraseña. Sin OAuth, cualquier usuario cuya identidad viva en el Google Workspace del
colegio no tiene forma de entrar sin que alguien le asigne credenciales manuales. Sin recuperación,
una contraseña olvidada requiere intervención administrativa directa (reset manual en base de
datos), lo cual no escala y no queda auditado como un evento de negocio propio. Este change cierra
ambos huecos reutilizando las primitivas que #4 ya dejó listas (`SessionService`,
`AuditoriaService`, `AuthGuard`) en vez de introducir una capa de autenticación paralela.

**Decisión de alcance confirmada por el usuario:** la recuperación de contraseña usa un **stub de
envío mínimo**. Este change genera el token de recuperación de un solo uso en Redis (mismo patrón
que `SessionService`) y define un `EmailSender` mínimo propio (nodemailer directo, o log a consola
en dev si no hay SMTP configurado) exclusivamente para este flujo. No toca las tablas
`JobCorreo`/`Notificacion` del patrón outbox (ADR-0012) ni implementa su worker (Backlog #15), ni
la configuración SMTP/dominio persistida en `Configuracion` (Backlog #10). Cuando #10/#15 existan,
un change futuro migrará este `EmailSender` al outbox sin cambiar el contrato del endpoint de
recuperación.

## Alcance

### Dentro de alcance

- Migración de Prisma que agrega `google_id` (`String?`, `@unique`) a `Usuario`, apilada después de
  la migración de credencial de `auth-server-sessions`
- Endpoint de login con Google OAuth: el frontend obtiene el ID token de Google, el backend lo
  verifica con `google-auth-library` (`verifyIdToken`) — firma, audiencia (`client_id`) y claim
  `hd` (dominio hospedado) contra una variable de entorno con el/los dominio(s) institucional(es)
  permitido(s)
- Vinculación de cuenta: si el correo del token OAuth coincide con un `Usuario.correo` existente
  sin `google_id`, se vincula (`google_id` se completa); si no existe ningún `Usuario` con ese
  correo, el login OAuth es rechazado (no auto-provisiona cuentas — la gestión de identidad sigue
  siendo responsabilidad de matrícula/administración, fuera de este change)
- Login OAuth exitoso crea una sesión igual que el login por contraseña (mismo `SessionService`,
  misma cookie `seei_session`)
- Endpoint de solicitud de recuperación (`POST` con correo): genera un token de un solo uso
  (`randomBytes(32).toString('base64url')`), lo guarda en Redis como `recovery:{token}` → `userId`
  con TTL corto, y lo envía por `EmailSender` — respuesta uniforme independientemente de si el
  correo existe o no (evita enumeración de usuarios)
- Endpoint de confirmación de recuperación (`POST` con token + contraseña nueva): valida el token
  en Redis, verifica que no haya sido usado, hashea la contraseña nueva, actualiza `Usuario`, borra
  el token de Redis (`DEL`, garantiza un solo uso) y revoca todas las sesiones activas del usuario
  vía `SessionService.revokeAllForUser(userId)` (ya expuesto por #4)
- `EmailSender` mínimo (`apps/backend/src/auth/` o módulo propio): interfaz simple
  (`send(destinatario, asunto, cuerpo)`), implementación con `nodemailer` si hay SMTP configurado
  por variable de entorno, o log a consola si no — sin persistencia, sin reintentos, sin cola
- Claves nuevas en `AUDIT_EVENT_TYPES` (aditivas): `LOGIN_OAUTH_EXITOSO`, `LOGIN_OAUTH_FALLIDO`,
  `RECUPERACION_SOLICITADA`, `RECUPERACION_COMPLETADA` — registradas vía
  `AuditoriaService.log(tx, ...)` dentro de su propio `prisma.$transaction()`, siguiendo el orden
  crítico D7 (auditoría antes de tocar Redis/cookies) que #4 estableció
- Dependencias nuevas de backend: `google-auth-library`, `nodemailer`
- Variables de entorno nuevas: `GOOGLE_CLIENT_ID`, dominio(s) institucional(es) permitido(s), y
  configuración SMTP mínima para el `EmailSender` (host/puerto/remitente/credenciales) — separadas
  de `Configuracion` en base de datos, que sigue siendo terreno de #10

### Fuera de alcance

- **Tablas `JobCorreo`/`Notificacion` y su worker de outbox** (Backlog #15) — el `EmailSender` de
  este change es de usar y tirar, no encola nada en esas tablas
- **Configuración SMTP/dominio persistida en `Configuracion`** (Backlog #10) — este change usa
  variables de entorno; la migración al modelo persistido queda para cuando #10 exista
- **Auto-provisión de cuentas nuevas vía Google OAuth** — si no existe un `Usuario` previo con ese
  correo, el login OAuth se rechaza; no se crea usuario nuevo desde el flujo de OAuth
- **Página/formulario de login o recuperación en `apps/frontend`** — igual que #4, este change es
  backend únicamente; la UI queda para un change posterior
- **Conteo/expiración automática de bloqueo de cuenta** (Backlog #6) — sigue sin implementarse aquí
- **Cambio de contraseña estando autenticado** (distinto de recuperación por token) — no está en
  este change salvo que el usuario indique lo contrario

## Capacidades

### Capacidades nuevas
- `google-oauth-y-recuperacion`: login con Google OAuth restringido a dominio institucional
  (verificación manual de ID token), columna `google_id` en `Usuario`, flujo de recuperación de
  contraseña con token de un solo uso en Redis, `EmailSender` mínimo, y registro de auditoría de
  los cuatro eventos nuevos

### Capacidades modificadas
Ninguna — no hay requisitos de spec existentes que cambien. `auth-server-sessions` se consume tal
cual (`SessionService`, `AuthGuard`, `AuditoriaService`); `append-only-audit-engine` se extiende de
forma aditiva en `AUDIT_EVENT_TYPES` sin tocar la cláusula `WHEN` del trigger de ADR-0016 (solo
cubre `VOTO`/`RECHAZO`).

## Enfoque

**OAuth — verificación manual de ID token con `google-auth-library`** (Enfoque 2 de la
exploración), no `passport-google-oauth20`. Razones: consistente con el estilo de guards a medida
que #4 ya estableció para credenciales (evita reintroducir Passport, que el propio TECH-DESIGN
original contemplaba pero #4 descartó); el frontend maneja el botón/flujo de Google Identity
Services y solo envía el ID token al backend, que lo verifica de forma stateless (firma + audiencia
+ claim `hd`) sin necesitar sesión de OAuth intermedia ni callback de redirect en el backend. Esto
se aparta del plan original de TECH-DESIGN (que preveía Passport) — dado que no existe un ADR
aceptado que fije "Google OAuth restringido al dominio institucional" como decisión de
arquitectura, `sdd-design` debe evaluar si corresponde un ADR nuevo que documente este
apartamiento y la política de restricción de dominio.

**Recuperación — token de un solo uso en Redis** (Enfoque 3 de la exploración), no tabla nueva de
Postgres. Razones: reutiliza exactamente el patrón ya probado de `SessionService`
(`randomBytes(32).toString('base64url')`, TTL, `DEL` en `redisProvider`), sin migración adicional;
la naturaleza efímera del token (debe expirar rápido y usarse una sola vez) encaja mejor con Redis
que con una tabla que necesitaría su propio job de limpieza.

**Envío de correo — stub mínimo**, no adelanto de #10/#15. Razones: adelantar el outbox completo
(tablas ya existentes estructuralmente pero sin dispatcher) infla este change con trabajo que
pertenece a #15 y decisiones de configuración que pertenecen a #10; un `EmailSender` de usar y
tirar mantiene el contrato del endpoint de recuperación estable, de modo que un change futuro solo
necesita cambiar la implementación interna (de SMTP directo a encolar en `JobCorreo`) sin tocar la
API pública.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `apps/backend/prisma/migrations/*` | Nueva | Migración que agrega `google_id` (`String?`, `@unique`) a `Usuario`, apilada después de `auth-server-sessions` |
| `apps/backend/src/auth/auth.service.ts` | Modificada | Métodos de login OAuth y de recuperación (solicitud + confirmación) |
| `apps/backend/src/auth/auth.controller.ts` | Modificada | Rutas nuevas: callback/verificación OAuth, solicitud de recuperación, confirmación de recuperación |
| `apps/backend/src/auth/dto/` | Nueva | DTOs de OAuth y de recuperación |
| `apps/backend/src/auth/` (nuevo servicio) | Nueva | `EmailSender` mínimo (interfaz + implementación nodemailer/consola) |
| `apps/backend/src/auth/session.service.ts` | Consumida, no modificada | `revokeAllForUser(userId)` invocado al completar recuperación |
| `apps/backend/src/redis/redis.provider.ts` | Consumida, no modificada | Cliente Redis reutilizado para `recovery:{token}` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificada (aditivo) | Claves `LOGIN_OAUTH_EXITOSO`/`LOGIN_OAUTH_FALLIDO`/`RECUPERACION_SOLICITADA`/`RECUPERACION_COMPLETADA` |
| `apps/backend/package.json` | Modificada | `google-auth-library`, `nodemailer` |
| `apps/backend/src/app.module.ts` o `auth.module.ts` | Modificada | Configuración de variables de entorno OAuth/SMTP si aplica |
| `apps/backend/test/auth/*` | Nueva | Tests de OAuth (dominio válido/inválido, cuenta no vinculada) y de recuperación (token válido/usado/expirado) |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| No existe ADR aceptado para "Google OAuth restringido al dominio institucional"; TECH-DESIGN preveía Passport | Media | `sdd-design` evalúa si corresponde un ADR nuevo que documente el apartamiento y la política de dominio |
| Ambigüedad de secuenciación con #10/#15 podría reabrirse en `sdd-design`/`sdd-tasks` | Baja | Ya resuelta explícitamente por el usuario en esta propuesta: stub de `EmailSender` propio, sin tocar outbox ni `Configuracion` |
| `EmailSender` con credenciales SMTP en variables de entorno podría filtrarse en logs si no se maneja con cuidado | Baja | Convención explícita en diseño: nunca loguear el cuerpo del correo de recuperación (contiene el token) en producción |
| Verificación de claim `hd` mal configurada podría permitir login de dominios no institucionales | Media | Test de integración explícito que verifique rechazo de un token con `hd` distinto al configurado |
| Token de recuperación reusado por condición de carrera (dos confirmaciones simultáneas) | Baja | `DEL` atómico en Redis como parte de la validación; el segundo intento no encuentra el token |
| Auto-provisión accidental de cuentas vía OAuth si no se valida explícitamente la existencia previa del `Usuario` | Media | Requisito explícito en "Dentro de alcance": login OAuth se rechaza si no hay `Usuario` previo con ese correo |

## Plan de rollback

Greenfield, sin datos de producción en el momento de este change. Si un slice resulta inviable:
`git revert` del PR correspondiente. Si la migración de `google_id` ya se aplicó a una base
compartida de dev/CI, aplicar una migración hacia adelante que elimine la columna — sin migraciones
de bajada mantenidas a mano, consistente con el precedente de #1-#4. Los tokens de recuperación
viven solo en Redis con TTL corto, así que revertir el código no deja estado huérfano relevante más
allá de claves que expiran solas.

## Dependencias

- **Backlog #4 (`auth-server-sessions`)** — provee `SessionService`, `AuthGuard`, `RolesGuard`,
  `AuditoriaService` integrado al flujo de auth, y la columna `password_hash` sobre la que se apila
  `google_id`
- **Backlog #3 (`append-only-audit-engine`)** — provee `AUDIT_EVENT_TYPES` y
  `AuditoriaService.log()`, extendidos aquí de forma aditiva
- **Backlog #10 (config SMTP/dominio) y #15 (worker de outbox)** — NO son dependencias de bloqueo
  para este change; se consumen mediante variables de entorno y un `EmailSender` propio que un
  change futuro migrará cuando #10/#15 existan

## Ronda de preguntas de propuesta

Preguntas de producto/negocio resueltas por el usuario antes de `sdd-design`, más las que quedan
deliberadamente abiertas para que `sdd-design` las resuelva con criterio propio y las documente.

**Resueltas por el usuario:**

1. **Auto-provisión vs. rechazo en OAuth** — **Rechazar**. Un login OAuth con correo institucional
   no registrado se rechaza; no crea usuario nuevo. Administración debe pre-cargar el usuario
   (vía #7/#9) antes de que pueda entrar por OAuth.
2. **Vinculación de cuenta existente por contraseña** — **Confirmar contraseña actual**. Si un
   usuario ya tiene `password_hash` y hace login por primera vez con Google usando el mismo
   correo, el sistema exige confirmar la contraseña actual antes de vincular `google_id`. Evita
   que el solo acceso al correo institucional (sin la contraseña) alcance para secuestrar una
   cuenta vía OAuth.
3. **Recuperación para cuentas solo-OAuth** — **Mismo flujo**. El endpoint de recuperación sirve
   tanto para resetear como para establecer la primera contraseña de una cuenta solo-OAuth (sin
   `password_hash` previo). Un solo contrato, sin endpoint separado.

**Diferidas a `sdd-design`** (con criterio propio, documentando el porqué):

4. **TTL del token de recuperación**: ¿cuánto debe durar el enlace de recuperación antes de
   expirar (p. ej. 15 minutos, 1 hora)? Un TTL muy largo aumenta la ventana de exposición si el
   correo del usuario fue comprometido; uno muy corto genera fricción si el usuario tarda en
   revisar su bandeja.
5. **Notificación de vinculación/desvinculación**: cuando el flujo de recuperación cambia la
   contraseña de una cuenta, ¿debe enviarse una notificación de confirmación al correo del usuario
   (más allá del correo con el token), como señal de seguridad ante un posible acceso no
   autorizado? Esto es opcional para el stub de este change, pero conviene decidirlo antes de
   fijar el contrato del `EmailSender`.

## Criterios de éxito

- [ ] `Usuario` tiene columna `google_id` (`String?`, `@unique`), migrada de forma aditiva después
      de `auth-server-sessions`
- [ ] Login con un ID token de Google válido, de un dominio permitido, y correo vinculado a un
      `Usuario` existente crea una sesión igual que el login por contraseña
- [ ] Login con un ID token de un dominio no permitido es rechazado sin crear sesión ni vincular
      cuenta, y registra `LOGIN_OAUTH_FALLIDO`
- [ ] Login OAuth con correo no registrado en ningún `Usuario` es rechazado (no auto-provisiona)
- [ ] Solicitud de recuperación con un correo existente genera un token en Redis y lo envía vía
      `EmailSender`; con un correo inexistente responde de forma idéntica (sin filtrar existencia)
- [ ] Confirmación de recuperación con token válido y no usado actualiza `password_hash`, borra el
      token de Redis, y revoca todas las sesiones activas del usuario
- [ ] Confirmación de recuperación con token ya usado o expirado es rechazada
- [ ] Cada login OAuth exitoso/fallido y cada solicitud/confirmación de recuperación deja
      exactamente una fila de auditoría con el `event_type` correspondiente, escrita dentro de su
      propio `prisma.$transaction()`
- [ ] `AUDIT_EVENT_TYPES` no toca la cláusula `WHEN` del trigger de ADR-0016
- [ ] No se toca ninguna tabla `JobCorreo`/`Notificacion` ni el modelo `Configuracion`
- [ ] No se agregó ninguna página ni formulario de login/recuperación en `apps/frontend`
