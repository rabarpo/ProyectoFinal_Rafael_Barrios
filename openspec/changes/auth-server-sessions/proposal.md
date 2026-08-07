# Propuesta: auth-server-sessions (Backlog #4 — Autenticación con sesión en servidor)

## Intención

Hoy no existe ningún código de autenticación en el repositorio: `apps/backend/src/` solo tiene
`health/`, `system-ping/`, `auditoria/`, `prisma/`, `redis/`, y `Usuario` no tiene columna de
credencial (`base-schema-and-migrations` la difirió explícitamente a este change). Sin
autenticación no hay forma de saber quién actúa, así que todo ítem posterior que requiera "quién
hizo esto" (votación, gestión de procesos electorales, panel de auditoría) queda bloqueado.
ADR-0004 fija la decisión de arquitectura: cookie httpOnly con sesión en servidor respaldada por
Redis — no JWT — precisamente porque ADR-0008 exige que bloquear una cuenta revoque su sesión
activa de inmediato, algo que un token sin estado no permite. Este change entrega esa capa de
sesión, el guard de autorización por rol que #6-#22 reutilizarán, y el registro de auditoría
obligatorio de cada login exitoso/fallido/logout.

**Decisión de alcance confirmada por el usuario:** este change es exclusivamente de backend. No
incluye página ni formulario de login en `apps/frontend` — el frontend no tiene hoy router ni
cliente HTTP, y añadir esa infraestructura junto con la sesión de backend en el mismo change
arriesgaba exceder el presupuesto de revisión de 400 líneas sin necesidad. La UI de login queda
diferida a un change posterior que consumirá los endpoints que aquí se entregan.

## Alcance

### Dentro de alcance

- Migración de Prisma que agrega `password_hash` (y cualquier columna de credencial estrictamente
  necesaria) a `Usuario`, apilada después de la migración de `append-only-audit-engine`
- `AuthModule` nuevo (`apps/backend/src/auth/`): endpoint de login (usuario/contraseña →
  verificación de hash → creación de sesión en Redis → cookie httpOnly), endpoint de logout
  (invalidación de la sesión en Redis + expiración de la cookie)
- `SessionService` artesanal: sesión como clave Redis (`session:{id}` → JSON con `userId`/`rol`,
  TTL), sin `express-session`/passport, reutilizando `redisProvider` existente y preservando
  `lazyConnect: true`
- `AuthGuard` (exige sesión válida) y `RolesGuard`/`@Roles()` (autorización por rol) como
  convención reutilizable para #6-#22
- Punto de extensión para el bloqueo de cuenta de #6: verificación de `Usuario.estado ===
  'bloqueado'` en el flujo de login (rechaza el intento) y un gancho de revocación de sesión
  (`SessionService.revokeAllForUser(userId)`) que #6 invocará cuando implemente el conteo de
  intentos fallidos — **sin implementar aquí el conteo ni la expiración automática del bloqueo**
- Registro de auditoría de cada login exitoso, login fallido y logout vía
  `AuditoriaService.log(tx, ...)`, cada uno envuelto en su propio `prisma.$transaction()` (la
  API de `AuditoriaService` solo acepta `TransactionClient`)
- Claves nuevas en `AUDIT_EVENT_TYPES` (`audit-event-types.ts`): `LOGIN_EXITOSO`,
  `LOGIN_FALLIDO`, `LOGOUT` — de forma aditiva, sin tocar las claves de `append-only-audit-engine`
- Actualización de `apps/backend/prisma/seed.ts` para sembrar credenciales de prueba junto con la
  identidad de `Usuario`
- Registro de `AuthModule` en `app.module.ts`
- Dependencias nuevas de backend estrictamente necesarias (hashing de contraseña; cookie parsing
  si no se resuelve con la API de respuesta de Nest)

### Fuera de alcance

- **Google OAuth** (Backlog #5) — el flujo de usuario/contraseña de este change no incluye ningún
  proveedor externo
- **Recuperación/cambio de contraseña** (Backlog #5)
- **Conteo y expiración automática del bloqueo de cuenta** (Backlog #6) — de #4 solo se entrega el
  punto de extensión (verificación de `estado=bloqueado` + gancho de revocación de sesión), no la
  lógica de contar intentos fallidos ni de expirar el bloqueo con el tiempo
- **Página/formulario de login en `apps/frontend`** — diferido a un change posterior; ver
  "Decisión de alcance confirmada" arriba
- Cualquier UI de administración de usuarios/roles — no existe hoy y no es parte de este change

## Capacidades

### Capacidades nuevas
- `auth-server-sessions`: migración de credencial en `Usuario`, `AuthModule` (login/logout),
  `SessionService` respaldado por Redis, `AuthGuard`/`RolesGuard`, punto de extensión de bloqueo
  de cuenta, y registro de auditoría de login/logout

### Capacidades modificadas
Ninguna — no hay requisitos de spec existentes que cambien. `append-only-audit-engine` se consume
tal cual (se le agregan claves de tipo de evento de forma aditiva, sin alterar su contrato).

## Enfoque

Capa de sesión artesanal mínima sobre Redis (Enfoque 3 de la exploración), no
`express-session`/`connect-redis` ni Passport. Razones: sigue la convención ya establecida en
este repositorio de providers delgados y hechos a mano (`AuditoriaService`, `redisProvider`) en
vez de adoptar middleware de framework; hace trivial preservar `lazyConnect: true` (gotcha crítico
de `src/openapi.ts` en CI, que instancia `AppModule` sin Redis/Postgres vivos); y da control
explícito sobre la invalidación de sesión que ADR-0008 exige (un `DEL` por id de sesión, indexado
también por `session:user:{userId}` para poder revocar todas las sesiones de un usuario cuando
#6 lo requiera). `sdd-design` puede reconsiderar `express-session` si decide que la corrección de
CSRF/expiración móvil justifica la dependencia adicional; Passport se descarta por ceremonia
excesiva para un flujo de solo usuario/contraseña cuyo valor principal (OAuth) queda fuera de
alcance.

Cada escritura de auditoría de auth ocurre dentro de su propio `prisma.$transaction()`, siguiendo
el patrón obligatorio que `append-only-audit-engine` estableció: si la transacción falla, no
queda fila de auditoría huérfana de un evento que no ocurrió.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `apps/backend/prisma/migrations/*` | Nueva | Migración que agrega `password_hash` a `Usuario`, apilada después de `append-only-audit-engine` |
| `apps/backend/src/auth/` | Nueva | `AuthModule`, controlador login/logout, `SessionService`, `AuthGuard`, `RolesGuard` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificada (aditivo) | Claves `LOGIN_EXITOSO`/`LOGIN_FALLIDO`/`LOGOUT` |
| `apps/backend/src/redis/redis.provider.ts` | Consumida, no modificada | Cliente Redis reutilizado como almacén de sesión; `lazyConnect: true` debe preservarse |
| `apps/backend/src/app.module.ts` | Modificada | Registro de `AuthModule` |
| `apps/backend/package.json` | Modificada | Dependencia de hashing de contraseña (y cookie parsing si aplica) |
| `apps/backend/prisma/seed.ts` | Modificada | Siembra de credenciales de prueba |
| `apps/backend/test/auth/*` | Nueva | Tests de login/logout/guards siguiendo los patrones de `test/*.e2e-spec.ts` |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Middleware/provider de sesión conecta Redis de forma temprana y rompe `src/openapi.ts` en CI | Media | Preservar `lazyConnect: true`; `SessionService` no debe forzar conexión en el constructor del módulo |
| `AuditoriaService.log()` exige `TransactionClient` — fácil olvidar envolver login/logout en `$transaction` | Media | Convención explícita en este documento y en el diseño; test de integración que verifique la fila de auditoría en cada camino (éxito, fallo, logout) |
| Ambigüedad de alcance sobre login de frontend reabierta durante `sdd-design`/`sdd-tasks` | Baja | Ya resuelta explícitamente por el usuario en esta propuesta: backend únicamente |
| Elección de algoritmo de hashing y política de sesión (TTL, nombre/flags de cookie, alcance exacto de `RolesGuard`) no decidida aquí | Media | Diferida deliberadamente a `sdd-design`; ver "Ronda de preguntas de propuesta" abajo |
| Migración de credencial y siembra podrían chocar con datos de seed existentes de `base-schema-and-migrations` | Baja | Revisar `seed.ts` actual antes de extenderlo; la migración es aditiva (nueva columna nulable o con default seguro) |

## Plan de rollback

Greenfield, sin datos de producción en el momento de este change. Si un slice resulta inviable:
`git revert` del PR correspondiente. Si la migración de `password_hash` ya se aplicó a una base
compartida de dev/CI, aplicar una migración hacia adelante que elimine la columna — sin
migraciones de bajada mantenidas a mano, consistente con el precedente de #1-#3. Las sesiones
viven solo en Redis (TTL, sin persistencia permanente), así que revertir el código de
`AuthModule` no deja estado huérfano relevante más allá de claves de sesión que expiran solas.

## Dependencias

- **Backlog #2 (`base-schema-and-migrations`)** — provee el modelo `Usuario` base sobre el que se
  apila la columna de credencial
- **Backlog #3 (`append-only-audit-engine`)** — provee `AuditoriaService.log()` y
  `AUDIT_EVENT_TYPES`, consumidos aquí de forma aditiva; la migración de este change se apila
  después de la de #3

## Ronda de preguntas de propuesta

Preguntas de producto/negocio que conviene resolver antes o durante `sdd-design`, para no
sobre-construir ni dejar ambigüedad de seguridad implícita. El usuario puede responder, saltar,
corregir el encuadre o pedir una segunda ronda:

1. **TTL de sesión**: ¿cuánto debe durar una sesión inactiva antes de expirar (p. ej. 30 minutos,
   2 horas, jornada electoral completa)? Afecta directamente cuánto tiempo queda expuesta una
   sesión olvidada en un dispositivo compartido de colegio.
2. **Granularidad de `RolesGuard`**: ¿los roles del sistema (según PRD/TECH-DESIGN) ya están
   definidos en un ADR o hay que inferirlos de `EstadoUsuario`/`rol` en el schema actual? Sin
   esto, `RolesGuard` puede quedar subdimensionado para #6-#22.
3. **Comportamiento de login fallido más allá del hash**: ¿debe distinguir en el mensaje de error
   entre "usuario no existe" y "contraseña incorrecta", o unificarse por razones de seguridad
   (evitar enumeración de usuarios)? Esto es una decisión de UX/seguridad, no solo técnica.
4. **Múltiples sesiones simultáneas**: ¿un mismo usuario puede tener varias sesiones activas a la
   vez (varios dispositivos) o el login debe invalidar sesiones previas? Impacta directamente el
   diseño de la clave de índice `session:user:{userId}`.

## Criterios de éxito

- [ ] `Usuario` tiene columna de credencial de contraseña, migrada de forma aditiva después de
      `append-only-audit-engine`
- [ ] Login con usuario/contraseña válidos crea una sesión en Redis y devuelve una cookie httpOnly
- [ ] Login con credenciales inválidas no crea sesión y registra un evento `LOGIN_FALLIDO`
- [ ] Login contra un usuario con `estado='bloqueado'` es rechazado sin crear sesión
- [ ] Logout invalida la sesión en Redis y expira la cookie
- [ ] `AuthGuard` rechaza solicitudes sin sesión válida; `RolesGuard` rechaza solicitudes de un rol
      no autorizado
- [ ] Cada login exitoso, login fallido y logout deja exactamente una fila de auditoría con el
      `event_type` correspondiente, escrita dentro de su propio `prisma.$transaction()`
- [ ] `SessionService.revokeAllForUser(userId)` existe y es invocable, aunque #6 sea quien decida
      cuándo llamarlo
- [ ] `src/openapi.ts` sigue extrayendo el contrato OpenAPI en CI sin Redis/Postgres vivos
      (`lazyConnect: true` preservado)
- [ ] No se agregó ninguna página ni formulario de login en `apps/frontend`
