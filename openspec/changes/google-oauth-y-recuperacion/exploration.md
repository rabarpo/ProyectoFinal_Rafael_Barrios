# Exploración: google-oauth-y-recuperacion (Backlog #5 — Google OAuth de dominio y recuperación)

## Estado actual

`auth-server-sessions` (#4, archivado — `openspec/specs/auth-server-sessions/spec.md`) dejó
explícitamente fuera de alcance Google OAuth y la recuperación de contraseña. Expone primitivas
reutilizables:

- `apps/backend/src/auth/session.service.ts` — `session:{id}` en Redis (TTL deslizante 1800s /
  techo absoluto 28800s) e índice `session:user:{userId}` (SET); el token de sesión es
  `randomBytes(32).toString('base64url')`.
- `apps/backend/src/auth/auth.guard.ts`, `roles.guard.ts` — cookie `seei_session`, guards
  reutilizables.
- `apps/backend/src/auth/auth.service.ts` — audita vía `AuditoriaService.log(tx, ...)` dentro de
  `prisma.$transaction()` **antes** de tocar Redis (orden crítico D7).
- `apps/backend/src/auditoria/audit-event-types.ts` — registro aditivo (`LOGIN_EXITOSO`,
  `LOGIN_FALLIDO`, `LOGOUT`); solo `VOTO`/`RECHAZO` están cableados en la cláusula `WHEN` del
  trigger de ADR-0016, así que las claves nuevas de OAuth/recuperación no requieren tocar el
  trigger.
- `apps/backend/prisma/schema.prisma`: `Usuario.password_hash` ya es nullable con un comentario
  que anticipa usuarios solo-OAuth ("provisto solo para OAuth de #5"). No existe columna
  `google_id` todavía.
- El modelo `Configuracion` solo tiene `smtp_host`/`smtp_puerto`/`smtp_remitente`, con un
  comentario explícito que difiere la decisión de secretos SMTP a #10; **no existe columna de
  dominio de Google Workspace**.
- Las tablas `JobCorreo`/`Notificacion` existen estructuralmente (patrón outbox, ADR-0012), pero
  el dispatcher/worker (Backlog #15) que efectivamente enviaría correo **no está implementado en
  ningún lugar del repo**.
- `apps/backend/package.json` solo tiene `@node-rs/argon2`; no hay `passport`,
  `passport-google-oauth20`, `google-auth-library` ni `nodemailer` instalados.
- TECH-DESIGN.md planeaba originalmente Passport para OAuth, pero `auth-server-sessions`
  implementó el login por credenciales con guards a medida en su lugar — solo la mitad de OAuth
  de ese plan sigue abierta.
- No existe todavía un ADR que formalice "Google OAuth restringido al dominio institucional";
  solo hay prosa en PRD.md/TECH-DESIGN.md (PRD.md:42,100; TECH-DESIGN.md:203-204).

## Áreas afectadas

- `apps/backend/prisma/schema.prisma` / migración nueva — agregar `google_id` (nullable, único) a
  `Usuario`.
- `apps/backend/src/auth/` — métodos nuevos de `AuthService`, DTOs, rutas de controller para
  callback de OAuth + solicitud/confirmación de recuperación.
- `apps/backend/src/auditoria/audit-event-types.ts` — claves aditivas (p. ej.
  `LOGIN_OAUTH_EXITOSO`, `RECUPERACION_SOLICITADA`, `RECUPERACION_COMPLETADA`).
- `apps/backend/src/redis/` — reutilizar `REDIS_CLIENT` para un patrón `recovery:{token}`.
- `apps/backend/package.json` — nueva dependencia de verificación OAuth.
- Backlog #10 (config SMTP/dominio) y #15 (worker de outbox) — dependencia de secuenciación, ver
  Riesgos.

## Enfoques

1. **`passport-google-oauth20`** (coincide con el plan original de TECH-DESIGN) — Pros: flujo de
   redirect/callback probado. Cons: reintroduce Passport en un código que deliberadamente lo evitó
   para credenciales. Esfuerzo: Medio.
2. **`google-auth-library` con `verifyIdToken` manual** (el frontend obtiene el ID token, el
   backend verifica firma/audiencia/claim `hd`) — Pros: consistente con el estilo de guards a
   medida ya establecido, más simple de testear, la verificación de dominio es un chequeo directo
   de claim. Cons: se aparta de la elección de librería original de TECH-DESIGN (amerita nota de
   ADR). Esfuerzo: Bajo-Medio.
3. **Token de recuperación en Redis** (mismo patrón que `SessionService`, TTL corto, un solo uso)
   — Pros: reutiliza código ya probado, sin migración. Cons: efímero por naturaleza (aceptable).
   Esfuerzo: Bajo.
4. **Token de recuperación en tabla nueva de Postgres** — Pros: durable/auditable vía SQL. Cons:
   migración nueva + job de limpieza, redundante con el patrón de Redis. Esfuerzo: Medio.

## Recomendación

Enfoque 2 (verificación manual de ID token) + Enfoque 3 (token de recuperación de un solo uso en
Redis), ambos canalizando hacia las primitivas ya existentes `SessionService`/`AuditoriaService`.

## Riesgos

- **Riesgo de secuenciación/bloqueo — no asumir resuelto**: la recuperación de contraseña necesita
  enviar un correo, pero el Backlog #15 (dispatcher/worker de outbox) y #10 (credenciales SMTP +
  config de dominio de Google Workspace) están ambos sin implementar y son posteriores en el
  backlog a #5. `sdd-propose` debe decidir explícitamente: (a) un stub de correo mínimo acotado a
  este change, (b) emitir solo tokens y dejar la entrega como stub, o (c) adelantar una porción
  mínima de #10/#15.
- No existe todavía un campo de configuración persistido para el dominio permitido de Google
  Workspace (variable de entorno vs. esperar a #10).
- No hay un ADR aceptado para "Google OAuth restringido al dominio institucional"; `sdd-design`
  podría querer un ADR nuevo dado el apartamiento de Passport respecto a TECH-DESIGN.

## Listo para propuesta

Sí — proceder a `sdd-propose`. El orquestador debe plantearle al usuario que el camino de entrega
del correo de recuperación (#10/#15) no está implementado y necesita una decisión de alcance
explícita antes de fijar el alcance de #5.
