# Propuesta: bloqueo-desbloqueo-cuentas (Backlog #6 — Bloqueo y desbloqueo de cuentas)

## Intención

`auth-server-sessions` (#4, archivado) ya deja el punto de extensión listo: `AuthService.login()`
rechaza cualquier intento contra un `Usuario` con `estado='bloqueado'` (mismo 401 uniforme que las
otras causas de rechazo), y `SessionService.revokeAllForUser(userId)` existe, está probado, y es
idempotente. Pero nada decide todavía **cuándo** un usuario llega a `estado='bloqueado'`, ni cómo
sale de ese estado. Hoy, una cuenta con contraseña comprometida (o un votante que se equivoca
repetidamente) puede sufrir intentos de fuerza bruta indefinidos sin ninguna contención, y una
cuenta bloqueada (por cualquier vía futura) no tiene ningún camino de desbloqueo — ni automático ni
manual. ADR-0008 ya fija la política de negocio ("desbloqueo por doble vía": expiración automática
corta + desbloqueo manual del comité, ambos auditados) desde antes de que existiera el motor de
autenticación; este change es lo que la hace real.

Sin este change, el sistema no tiene ninguna respuesta a fuerza bruta contra contraseñas
(especialmente relevante porque `codigo` — el identificador de login — no es secreto), y un
votante legítimo que se bloquee por error (o por un tercero) no tiene ningún camino de vuelta más
que una intervención manual directa en la base de datos, que no es una operación de negocio
auditada ni disponible para el comité.

## Alcance

### Dentro de alcance

- Migración de Prisma que agrega `bloqueado_hasta` (`DateTime?`, nulable) a `Usuario`, apilada
  después de la migración de `google-oauth-y-recuperacion` (nombre ya fijado por
  `TECH-DESIGN.md`)
- Contador de intentos fallidos consecutivos en Redis (`INCR` + `EXPIRE`, mismo idioma que
  `SessionService`/`RecoveryService`), con **umbral de 5 intentos fallidos consecutivos** y
  **ventana de 15 minutos** (TTL del contador = ventana; extremo superior del rango 10-15 min de
  ADR-0008) — sin columna `intentos_fallidos` en Postgres: el TTL de Redis limpia el contador solo,
  y Postgres solo necesita reflejar el estado final (`bloqueado`), no el conteo intermedio
- `AuthService.login()` incrementa el contador de Redis en la rama de contraseña incorrecta
  existente (`password_incorrecta`); un login exitoso resetea el contador de ese usuario
  (`DEL` de la clave de Redis) para no arrastrar intentos fallidos previos a la próxima ventana
- Al alcanzar el umbral: una transacción de Prisma que (a) actualiza `Usuario` a
  `estado='bloqueado'` + `bloqueado_hasta = now() + 15min` **solo si el estado previo no era ya
  `bloqueado`** (protección de concurrencia, ver "Riesgos"), (b) audita `CUENTA_BLOQUEADA` dentro
  de la misma transacción vía `AuditoriaService.log(tx, ...)` — solo cuando el `update` de (a)
  efectivamente afectó una fila — y luego, fuera de la transacción (patrón D7 ya establecido por
  #4/#5), llama a `SessionService.revokeAllForUser(userId)`
- Expiración automática del bloqueo: chequeo manual de `bloqueado_hasta < now()` dentro de
  `AuthService.login()`, en el mismo punto donde hoy se rechaza `estado === 'bloqueado'` — si el
  bloqueo ya venció, el login continúa evaluando la contraseña normalmente en vez de rechazar (sin
  job de limpieza ni TTL de Postgres; mismo patrón de chequeo explícito que
  `SessionService.obtener()` ya usa para el techo absoluto de sesión). El `estado`/`bloqueado_hasta`
  en Postgres se corrigen a `activo`/`null` de forma perezosa, en el mismo momento en que ese login
  post-expiración resulta exitoso (dentro de la transacción que ya audita `LOGIN_EXITOSO`)
- Endpoint de desbloqueo manual (`POST`, p. ej. `/auth/usuarios/:id/desbloquear`), protegido con
  `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('comite')`: transacción de Prisma que resetea
  `estado='activo'` + `bloqueado_hasta=null`, audita `CUENTA_DESBLOQUEADA` con el usuario del
  comité que lo ejecuta como actor (`AuditoriaService.log(tx, ...)`, exigido por ADR-0008), y
  luego, fuera de la transacción, llama a `SessionService.revokeAllForUser(userId)` igual que el
  bloqueo automático (fuerza reautenticación aunque el usuario ya estuviera fuera de sesión)
- Endpoint mínimo de listado de cuentas bloqueadas (`GET`, p. ej. `/auth/usuarios/bloqueados`),
  protegido con `@Roles('comite')`: solo `estado='bloqueado'`, campos `id`/`nombres`/`dni`/`codigo`/
  `bloqueado_hasta`, sin filtros ni paginación — suficiente para que el panel de desbloqueo del
  comité sea usable sin depender de la administración general de usuarios (#7)
- Claves nuevas en `AUDIT_EVENT_TYPES` (aditivas): `CUENTA_BLOQUEADA`, `CUENTA_DESBLOQUEADA`
- `apps/backend/src/redis/redis.provider.ts` se reutiliza tal cual (sin cambio estructural) para
  el contador de intentos fallidos

### Fuera de alcance

- **Cualquier endpoint de administración general de usuarios** (Backlog #7) — el listado de este
  change es exclusivamente de cuentas bloqueadas, sin filtros/paginación/edición; el CRUD completo
  de usuarios queda para #7
- **Cambio al 401 uniforme de login ya establecido por #4/#5** — este change no distingue el
  motivo de rechazo expuesto al cliente; solo agrega una causa más de bloqueo y decide cuándo se
  llega a ella. `determinarMotivoFallo()` ya contempla `usuario_bloqueado`, sin cambios
- **Columna `intentos_fallidos` persistida en Postgres** — el conteo vive exclusivamente en Redis
  (ver Enfoque)
- **Notificación por correo al usuario cuando su cuenta se bloquea o desbloquea** — ni ADR-0008 ni
  el PRD lo exigen explícitamente; se puede agregar en un change posterior reutilizando el
  `EmailSender` de #5 sin tocar el contrato de este change
- **Página/panel de desbloqueo en `apps/frontend`** — igual que #4/#5, este change es backend
  únicamente

## Capacidades

### Capacidades nuevas
- `bloqueo-desbloqueo-cuentas`: columna `bloqueado_hasta` en `Usuario`, contador de intentos
  fallidos en Redis con umbral/ventana fijos (5 intentos / 15 min), bloqueo automático
  transaccional con protección de concurrencia, expiración automática por chequeo manual en login,
  desbloqueo manual por el comité, endpoint mínimo de listado de cuentas bloqueadas, y dos eventos
  de auditoría nuevos

### Capacidades modificadas
`auth-server-sessions` se extiende: `AuthService.login()` gana el incremento/reseteo del contador
de Redis y el chequeo de `bloqueado_hasta` vencido, sin alterar el contrato del 401 uniforme ni la
firma pública de `login()`. `append-only-audit-engine` se extiende de forma aditiva en
`AUDIT_EVENT_TYPES`, sin tocar la cláusula `WHEN` del trigger de ADR-0016.

## Enfoque

**Contador en Redis (`INCR`/`EXPIRE`) + estado persistido en Postgres**, umbral 5 / ventana 15 min
— adopta el enfoque recomendado por la exploración sin modificaciones. Razones: reutiliza
exactamente el idioma Redis ya establecido por `SessionService`/`RecoveryService` (contador
transitorio con TTL natural, sin job de limpieza); Postgres sigue siendo la única fuente que
`login()` lee para decidir el rechazo, así que el contador de Redis nunca necesita ser
"autoritativo" por sí mismo — solo dispara la transición de estado una vez. El umbral (5) y la
ventana (15 min, extremo superior del rango de ADR-0008) se fijan explícitos en este documento en
vez de dejarse "configurables" sin default, porque un umbral ambiguo en `sdd-design` obligaría a
inventar el número sin respaldo de negocio.

**Concurrencia de la transición a bloqueado**: dos intentos fallidos que superan el umbral casi
simultáneamente (p. ej. dos requests concurrentes del mismo atacante) no deben generar dos filas
`CUENTA_BLOQUEADA`. La transacción de bloqueo usa `updateMany({ where: { id, estado: { not:
'bloqueado' } }, data: {...} })` (o `update` con verificación de `count`/fila previa dentro de la
misma transacción) y solo audita si el `update` afectó efectivamente una fila — el segundo request
concurrente encuentra el estado ya en `bloqueado` y no vuelve a auditar ni a revocar sesiones de
más.

**Expiración automática vía chequeo manual, no TTL de Postgres** — coherente con cómo
`SessionService.obtener()` ya chequea a mano el techo absoluto de sesión. Un `bloqueado_hasta`
vencido no dispara ningún job en background; se resuelve la próxima vez que ese usuario intenta
loguearse, comparando contra `now()` en el mismo punto donde hoy se evalúa `estado === 'bloqueado'`.
Esto implica que una cuenta bloqueada y nunca vuelta a intentar loguear queda con `estado='bloqueado'`
en Postgres indefinidamente hasta el próximo intento (o un desbloqueo manual) — aceptado como
consistente con el listado de cuentas bloqueadas, que refleja el estado real de la fila en
Postgres, no un cálculo derivado de `bloqueado_hasta` contra `now()` (ver "Ronda de preguntas de
propuesta" para el matiz de si el listado debe filtrar bloqueos ya vencidos).

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificada | Columna nueva `bloqueado_hasta DateTime?` en `Usuario` |
| `apps/backend/prisma/migrations/*` | Nueva | Migración aditiva, apilada después de `google-oauth-y-recuperacion` |
| `apps/backend/src/auth/auth.service.ts` | Modificada | `login()` incrementa/resetea el contador de Redis y chequea `bloqueado_hasta` vencido; nueva lógica de transición a `bloqueado` |
| `apps/backend/src/auth/` (nuevo servicio, p. ej. `bloqueo.service.ts`) | Nueva | Conteo de intentos en Redis, transacción de bloqueo con protección de concurrencia, desbloqueo manual, listado de bloqueados |
| `apps/backend/src/auth/auth.controller.ts` (o controller nuevo dentro de `auth/`) | Modificada/Nueva | Endpoint `POST` de desbloqueo manual y `GET` de listado, ambos `@Roles('comite')` |
| `apps/backend/src/auth/session.service.ts` | Consumida, no modificada | `revokeAllForUser(userId)` invocado tras bloqueo automático y desbloqueo manual |
| `apps/backend/src/redis/redis.provider.ts` | Consumida, no modificada | Cliente Redis reutilizado para el contador de intentos fallidos |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificada (aditivo) | Claves `CUENTA_BLOQUEADA`/`CUENTA_DESBLOQUEADA` |
| `apps/backend/src/auth/dto/` | Nueva | DTO de respuesta del listado de cuentas bloqueadas (si aplica) |
| `apps/backend/test/auth/*` | Nueva | Tests de umbral/ventana, expiración automática, desbloqueo manual, concurrencia de bloqueo, y del listado |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Doble registro de auditoría `CUENTA_BLOQUEADA` por intentos fallidos concurrentes cerca del umbral | Media | `updateMany`/verificación de estado previo dentro de la transacción; solo se audita si el update afectó una fila |
| El contador de Redis y el estado de Postgres podrían divergir si Redis falla después del `INCR` pero antes de alcanzar el umbral | Baja | Modo de falla aceptado: el contador se pierde y el atacante obtiene una ventana nueva; no compromete la seguridad del bloqueo ya efectivo, solo retrasa su disparo — mismo criterio de "sobre-reportar en vez de sub-reportar" que D7 ya acepta en otros flujos |
| Ambigüedad sobre si el listado de bloqueados debe excluir bloqueos ya vencidos por `bloqueado_hasta` | Baja | Ver "Ronda de preguntas de propuesta"; queda explícita como decisión abierta para `sdd-design` |
| Migración de `bloqueado_hasta` podría chocar de orden con una migración en curso de `google-oauth-y-recuperacion` si esa no está aún mergeada | Baja | Verificar que `google-oauth-y-recuperacion` esté archivado antes de generar la migración de este change |
| Reseteo del contador de Redis en login exitoso podría omitirse si no se cablea explícitamente en el mismo `if` que hoy maneja la rama exitosa | Media | Test de integración explícito: 4 intentos fallidos + 1 exitoso + 4 fallidos más no debe bloquear (el contador se reseteó) |

## Plan de rollback

Greenfield, sin datos de producción en el momento de este change. Si un slice resulta inviable:
`git revert` del PR correspondiente. Si la migración de `bloqueado_hasta` ya se aplicó a una base
compartida de dev/CI, aplicar una migración hacia adelante que elimine la columna — sin migraciones
de bajada mantenidas a mano, consistente con el precedente de #1-#5. El contador de intentos vive
solo en Redis con TTL corto, así que revertir el código no deja estado huérfano relevante más allá
de claves que expiran solas.

## Dependencias

- **Backlog #4 (`auth-server-sessions`)** — provee `AuthService.login()` (punto de extensión ya
  preparado), `SessionService.revokeAllForUser(userId)`, `AuthGuard`/`RolesGuard`
- **Backlog #5 (`google-oauth-y-recuperacion`)** — la migración de `bloqueado_hasta` se apila
  después de la suya (`google_id`); no hay dependencia funcional además del orden de migraciones
- **Backlog #3 (`append-only-audit-engine`)** — provee `AUDIT_EVENT_TYPES` y
  `AuditoriaService.log()`, extendidos aquí de forma aditiva
- **Backlog #7 (administración de usuarios)** — NO es una dependencia de bloqueo; el listado
  mínimo de cuentas bloqueadas de este change es autosuficiente y no depende de ningún CRUD que #7
  vaya a construir

## Ronda de preguntas de propuesta

El umbral, la ventana y el alcance del listado ya fueron confirmados por el usuario y no se
repreguntan. Quedan un puñado de decisiones de negocio más finas que conviene resolver antes de
`sdd-design`, para no dejar comportamiento implícito en un área sensible a seguridad. El usuario
puede responder, saltar, corregir el encuadre o pedir una segunda ronda:

1. **Listado de bloqueados vs. bloqueos ya vencidos**: si un usuario alcanzó el umbral hace 20
   minutos y nunca volvió a intentar loguearse, su `bloqueado_hasta` ya venció pero su `estado`
   sigue en `bloqueado` en Postgres (la expiración es perezosa, se resuelve recién en el próximo
   login). ¿El listado del comité debe mostrar esa cuenta igual (estado real de la fila) o debe
   filtrar los bloqueos ya vencidos (comportamiento efectivo)? Mostrarla igual es más simple y
   consistente con "sin filtros" del alcance confirmado, pero puede confundir al comité si ve una
   cuenta "bloqueada" que en la práctica ya puede loguearse.
2. **Motivo interno de auditoría en el request que dispara el bloqueo**: cuando un login falla y
   ese mismo intento hace que el contador alcance el umbral, ¿la fila `LOGIN_FALLIDO` de ese
   request debe seguir registrando `motivo: 'password_incorrecta'` (la causa real de ese intento
   puntual) y dejar que `CUENTA_BLOQUEADA` sea el evento separado que explica la transición de
   estado, o debe el motivo cambiar a algo como `'password_incorrecta_bloqueo_disparado'`? Se
   asume la primera opción (dos eventos separados, cada uno con su semántica propia) salvo
   indicación en contrario.
3. **Intentos fallidos de OAuth (#5) frente al umbral de #6** — **Resuelto por el usuario: solo
   contraseña**. Un login OAuth rechazado (dominio no permitido, cuenta no vinculada,
   `vinculacion_requerida`) NO pasa por la rama de contraseña de `login()` y NO suma al contador de
   intentos fallidos. El umbral de bloqueo es exclusivo del flujo usuario/contraseña — es el vector
   de fuerza bruta que ADR-0008 busca contener; los rechazos de OAuth ya tienen su propia mitigación
   (verificación fail-closed del token, confirmación de contraseña para vincular) y no comparten el
   mismo umbral, evitando que un problema transitorio de Google (p. ej. sesión vencida) bloquee a un
   usuario legítimo que nunca tocó su contraseña.

## Criterios de éxito

- [ ] `Usuario` tiene columna `bloqueado_hasta` (`DateTime?`), migrada de forma aditiva después de
      `google-oauth-y-recuperacion`
- [ ] 5 intentos fallidos consecutivos de contraseña para el mismo usuario, dentro de una ventana
      de 15 minutos, transicionan `estado` a `bloqueado` y fijan `bloqueado_hasta = now() + 15min`
- [ ] Un login exitoso resetea el contador de intentos fallidos de ese usuario
- [ ] Dos intentos fallidos que superan el umbral de forma casi simultánea generan exactamente una
      fila de auditoría `CUENTA_BLOQUEADA`, no dos
- [ ] Cada transición a `bloqueado` deja exactamente una fila `CUENTA_BLOQUEADA` (auditada dentro
      de la transacción) y revoca todas las sesiones activas del usuario (`revokeAllForUser`,
      fuera de la transacción)
- [ ] Un login contra una cuenta con `estado='bloqueado'` pero `bloqueado_hasta` ya vencido no es
      rechazado por causa de bloqueo; continúa evaluando la contraseña normalmente
- [ ] El endpoint de desbloqueo manual (`@Roles('comite')`) resetea `estado='activo'` +
      `bloqueado_hasta=null`, audita `CUENTA_DESBLOQUEADA` con el usuario del comité como actor, y
      revoca todas las sesiones activas del usuario desbloqueado
- [ ] Un rol distinto de `comite` recibe 403 al intentar desbloquear o listar cuentas bloqueadas
- [ ] El endpoint de listado devuelve solo cuentas con `estado='bloqueado'`, únicamente los campos
      `id`/`nombres`/`dni`/`codigo`/`bloqueado_hasta`, sin filtros ni paginación
- [ ] `AUDIT_EVENT_TYPES` no toca la cláusula `WHEN` del trigger de ADR-0016
- [ ] No se agregó ninguna columna `intentos_fallidos` en Postgres ni ningún endpoint de
      administración general de usuarios
- [ ] No se agregó ninguna página ni panel de desbloqueo en `apps/frontend`
