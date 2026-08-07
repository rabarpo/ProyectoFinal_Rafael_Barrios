# Exploración: auth-server-sessions (Backlog #4 — Autenticación con sesión en servidor)

## Estado actual

No existe código de autenticación en ninguna parte del repositorio. `apps/backend/src/` solo tiene
`health/`, `system-ping/`, `auditoria/`, `prisma/`, `redis/`. El modelo `Usuario`
(`apps/backend/prisma/schema.prisma`) tiene `nombres/dni/codigo/correo/rol/estado` — **sin columna
de credencial**; el `design.md` de `base-schema-and-migrations` lo dice explícitamente: "las
columnas de credencial no existen en este change" (diferidas a #4). El enum `EstadoUsuario` ya
tiene `activo|inactivo|bloqueado` (preparado para el bloqueo de #6, no implementado aún).

`redisProvider` (`apps/backend/src/redis/redis.provider.ts`) expone un cliente ioredis con
`lazyConnect: true` — gotcha crítico: `src/openapi.ts` instancia `AppModule` sin Postgres/Redis
vivos para la extracción del contrato OpenAPI en CI; cualquier cableado de almacén de sesión debe
preservar esa conexión perezosa o rompe CI.

`AuditoriaService.log(tx, eventType, actorId, entityType, entityId, payload)`
(`apps/backend/src/auditoria/auditoria.service.ts`) **solo acepta `Prisma.TransactionClient`** —
no admite llamada standalone por diseño, así que cada registro de acceso (login exitoso/fallido/
logout) debe ocurrir dentro de un `prisma.$transaction()` aunque no haya otra escritura de
negocio. `AUDIT_EVENT_TYPES` (`audit-event-types.ts`) solo tiene `VOTO`/`RECHAZO` hoy; el trabajo
de auth agrega claves nuevas (p. ej. `LOGIN_EXITOSO`/`LOGIN_FALLIDO`/`LOGOUT`) de forma aditiva,
según la convención del diseño de #3. El trigger de claves prohibidas de ADR-0016 solo dispara
para `event_type IN ('VOTO','RECHAZO')`, así que los eventos de auth no se ven afectados.

No existe ningún patrón de guard/RBAC todavía — este change lo establece. El `package.json` del
backend no tiene ninguna dependencia de auth: sin passport, sin argon2/bcrypt, sin
express-session/connect-redis/cookie-parser. El frontend (`apps/frontend/src/`) solo tiene
`HealthPage`, sin router, sin formulario de login, sin abstracción de cliente HTTP — `main.tsx`
renderiza `HealthPage` directamente.

ADR-0004 (`adrs/0004-api-rest-openapi.md`), pese a su título centrado en OpenAPI, tiene en el
último párrafo de "Decisión" la fuente real del requisito de #4: *"Autenticación por cookie de
sesión httpOnly con la sesión en el servidor (Redis, ya presente en la infraestructura): bloquear
una cuenta (ADR-0008) revoca su sesión activa de inmediato, cosa que un JWT sin estado no permite;
autorización por rol en guards de NestJS."* PRD.md (módulo 1) y el Flujo 5 de TECH-DESIGN.md
(líneas 201-212) exigen: usuario/contraseña + Google OAuth (OAuth es #5, **fuera de alcance
aquí**), recuperación/cambio de contraseña (también #5), bloqueo por intentos fallidos (#6,
depende explícitamente de #4 — **no implementar aquí el conteo/expiración**, solo el punto de
extensión), cierre seguro de sesión, y eventos de auditoría obligatorios en cada login
exitoso/fallido/logout.

## Áreas afectadas

- `apps/backend/prisma/schema.prisma` — nuevo grupo de migración que agrega columnas de credencial
  a `Usuario` (p. ej. `password_hash`), diferidas explícitamente por #2
- `apps/backend/src/auth/` (módulo nuevo) — controladores login/logout, guard de sesión, guard de
  roles, servicio de hashing
- `apps/backend/src/auditoria/audit-event-types.ts` — aditivo: claves nuevas `LOGIN_*`/`LOGOUT`
- `apps/backend/src/redis/redis.provider.ts` — reutilizado como almacén de sesión; debe preservar
  `lazyConnect: true` (gotcha de `openapi.ts`/CI)
- `apps/backend/src/app.module.ts` — registrar `AuthModule`
- `apps/backend/package.json` — nuevas dependencias de sesión/cookie/hashing
- `apps/backend/prisma/seed.ts` — hoy crea `Usuario` solo con identidad; podría necesitar sembrar
  credenciales
- `apps/frontend/src/` — sin router/login/cliente HTTP hoy; decisión de alcance pendiente
- `apps/backend/test/` — nuevos specs de auth siguiendo los patrones de `test/schema/*.spec.ts` y
  `test/*.e2e-spec.ts`

## Enfoques

1. **Sesión nativa de Nest (`express-session` + `connect-redis`) + guards propios** — middleware de
   sesión respaldado por Redis vía el cliente ioredis existente; `AuthGuard`/`RolesGuard` propios
   leyendo `req.session.userId`/`req.session.rol`.
   - Pros: librería probada; flags httpOnly/secure centralizadas; invalidar sesión para #6 es un
     `DEL` de la clave en Redis
   - Cons: agrega dependencias nuevas; hay que verificar con cuidado que no conecte Redis de forma
     temprana (rompería el gotcha de `openapi.ts`)
   - Esfuerzo: Medio

2. **Passport.js (`passport-local` + `@nestjs/passport`) con sesión** — patrón idiomático de la
   documentación de Nest.
   - Pros: bien documentado, integración de primera clase con guards de Nest
   - Cons: más dependencias y ceremonia para una necesidad pequeña (solo usuario/contraseña, OAuth
     es #5); el callback de `serializeUser` encaja mal con el requisito de envolver el login en
     `prisma.$transaction` para llamar a `AuditoriaService.log`
   - Esfuerzo: Medio-Alto

3. **Capa de sesión artesanal mínima** — sin `express-session`/passport; un `SessionService`
   delgado que escribe/lee sesión directamente como claves Redis (`session:{id}` → JSON, TTL),
   cookie manual (`cookie-parser` o API de respuesta de Nest) y `AuthGuard`/`RolesGuard` propios.
   - Pros: control total sobre lo almacenado; superficie de dependencias mínima; invalidar sesión
     para #6 es un `redis.del` sin abstracción de librería de por medio; sigue la convención ya
     establecida en el repo de providers delgados y hechos a mano (`AuditoriaService`,
     `redisProvider`) en vez de adoptar un framework grande; más fácil preservar `lazyConnect`
   - Cons: reimplementa plomería de cookie de sesión (CSRF, firma de cookie, expiración móvil) que
     `express-session` ya resuelve; más superficie para bugs sutiles (fijación de sesión,
     condiciones de carrera) si no se prueba con cuidado
   - Esfuerzo: Medio

## Recomendación

El enfoque 3 (capa de sesión artesanal mínima) es el mejor ajuste: sigue la convención ya
establecida en este repositorio de providers pequeños y hechos a mano en lugar de middleware de
framework (refleja `AuditoriaService`/`redisProvider`), facilita preservar el gotcha de
`lazyConnect` para la extracción de OpenAPI en CI, y da control explícito sobre el requisito de
ADR-0008 de que bloquear una cuenta debe invalidar su sesión activa de inmediato (un `DEL` por id
de sesión, o un índice `session:user:{userId}`). El enfoque 1 es un respaldo aceptable si
`sdd-design` decide que la corrección de CSRF/expiración móvil justifica la dependencia adicional.
El enfoque 2 (Passport) no se recomienda — demasiada ceremonia para solo usuario/contraseña, y
OAuth (el valor principal de Passport) queda fuera de alcance hasta #5.

El alcance debe excluir explícitamente: Google OAuth (#5), recuperación/cambio de contraseña (#5),
conteo/expiración automática de bloqueo de cuenta (#6) — de #4 solo debe considerarse la
verificación `estado=bloqueado` + el gancho de revocación de sesión como el punto de extensión que
#6 usará, no la lógica de conteo en sí. La migración que agrega `password_hash` (y demás columnas
de credencial) a `Usuario` pertenece a este change, ya que `base-schema-and-migrations` la difirió
explícitamente.

**Pregunta abierta para `sdd-propose`**: ¿incluye #4 una página/formulario de login mínimo en el
frontend, o es un change solo de backend (guards + cookie + sesión en Redis + registro de
accesos), dejando el login del frontend para más adelante? La columna "Alcance" del backlog para
#4 solo lista aspectos de backend; el Flujo 5 del PRD asume que existe una UI. Necesita una
decisión de alcance explícita.

## Riesgos

- `password_hash` no existe todavía — requiere una migración de Prisma nueva apilada después del
  grupo de migración de `append-only-audit-engine`
- `src/openapi.ts` instancia `AppModule` sin Redis/Postgres vivos en CI — cualquier middleware o
  provider de sesión que toque Redis debe preservar `lazyConnect: true` o rompe CI
- `AuditoriaService.log()` exige `Prisma.TransactionClient` — cada escritura de auditoría de
  login/logout/intento fallido necesita su propio `$transaction()` aunque no haya otra escritura
  de DB, un patrón fácil de olvidar
- El frontend no tiene routing/infraestructura de auth — la ambigüedad de alcance (ver
  Recomendación) podría exceder el presupuesto de revisión de 400 líneas si el login de UI se
  incluye sin un plan de slices explícito
- No existe convención de guard/RBAC en este código todavía — este change sienta el precedente de
  `@Roles()`/`RolesGuard` que seguirán los ítems #6-#22
- La decisión de sesión/cookie de ADR-0004 vive dentro de un documento titulado "API REST con
  contrato OpenAPI" — fácil de pasar por alto; debe citarse con precisión en la propuesta

## Listo para propuesta

Sí. Hay entendimiento suficiente del estado actual (sin código de auth, sin columna
`password_hash`, sin convenciones de sesión/RBAC), de los requisitos explícitos de
ADR-0004/PRD/TECH-DESIGN (solo usuario/contraseña — OAuth y recuperación diferidos a #5, bloqueo
diferido a #6), y de la restricción transaccional de `AuditoriaService`. El orquestador debe
plantear una pregunta de alcance al usuario antes o durante `sdd-propose`: si una página de login
mínima en frontend está en alcance de #4 o se difiere.
