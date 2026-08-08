# Diseño: bloqueo-desbloqueo-cuentas (Backlog #6)

## Enfoque técnico

Enfoque 1 de la exploración, ya decidido y **no reabierto**: contador de intentos fallidos
consecutivos en Redis (`SET NX` + `INCR`, TTL 15 min), transición transaccional a
`estado='bloqueado'` + `bloqueado_hasta` en Postgres al llegar a 5, y `revokeAllForUser()` después
del commit (patrón D7 de #4/#5). Una pieza nueva dentro de `AuthModule` (`BloqueoService`) más dos
rutas en el `AuthController` existente. `SessionService`, `AuditoriaService`, `RolesGuard`,
`AuthGuard` y `redisProvider` se consumen tal cual, sin cambio estructural. `login()` cambia en tres
puntos acotados; `determinarMotivoFallo()` **no** cambia de firma ni de cuerpo. Sin ADR nuevo:
ADR-0008 ya fija la política de doble vía y 5 intentos / 15 min cae dentro de su rango declarado.

## Decisiones de arquitectura

### D1 — Clave de Redis y señuelo anti-enumeración

**Elección**: `login:intentos:{userId}` para un `Usuario` real; `login:intentos:anon:{h}` cuando no
hay usuario contable, con `h = sha256(codigo.trim().toLowerCase()).slice(0, 32)`. `BloqueoService.
registrarFallo()` ejecuta **siempre** el mismo par de comandos, sobre la clave real o la señuelo,
así que las cuatro ramas de rechazo de D3/#4 hacen exactamente el mismo trabajo en Redis.
Incremento version-agnóstico, mismo idioma `SET NX` que `recovery:cooldown`:

```ts
const r = await this.redis.multi()
  .set(key, '0', 'EX', INTENTOS_VENTANA_SEGUNDOS, 'NX')  // crea con TTL solo si no existe
  .incr(key)                                             // preserva el TTL existente
  .exec();
const intentos = (r?.[1]?.[1] as number | undefined) ?? 0;
```

**Alternativas**: indexar por `codigo` siempre (la clave la controla el atacante ⇒ cardinalidad no
acotada en Redis, e identificadores de usuario en el keyspace); indexar solo por `userId` y no tocar
Redis cuando el usuario no existe (reintroduce la asimetría de rama que el `DECOY_HASH` de
`PasswordService` eliminó a propósito); `EXPIRE key ttl NX` (requiere Redis ≥ 7.0);
`INCR` + `EXPIRE` incondicional (haría la ventana **deslizante**: 5 fallos espaciados 14 min
bloquearían tras 56 min, contradiciendo "dentro de una ventana de 15 minutos").

**Fundamento**: el contador nunca se devuelve al cliente, así que el único canal observable es
tiempo/forma de respuesta; ejecutar los mismos dos comandos en toda rama fallida lo cierra por
construcción, al costo de una clave señuelo que expira sola y nunca dispara ningún bloqueo (no hay
fila que actualizar). El `SET NX` fija el TTL una sola vez ⇒ ventana fija desde el primer fallo.

### D2 — Chequeo atómico de estado previo: `updateMany` con condición `estado: 'activo'`

**Elección**: la transición corre como **una sola sentencia** dentro de `$transaction`, y solo se
audita/revoca si afectó una fila:

```ts
const { count } = await tx.usuario.updateMany({
  where: { id: usuario.id, estado: 'activo' },
  data: { estado: 'bloqueado', bloqueado_hasta: new Date(Date.now() + BLOQUEO_SEGUNDOS * 1000) },
});
if (count === 1) await this.auditoria.log(tx, AUDIT_EVENT_TYPES.CUENTA_BLOQUEADA, /* … */);
```

| Opción | Veredicto |
|---|---|
| `SELECT … FOR UPDATE` | Exige `$queryRaw`: no hay SQL crudo en código de aplicación (solo en migraciones). Descartada |
| Leer y después `update` (optimista, sin condición) | Ventana de lectura-escritura ⇒ dos `CUENTA_BLOQUEADA`. Descartada |
| `updateMany` con `estado: { not: 'bloqueado' }` (redacción ilustrativa de la propuesta) | Correcta contra concurrencia, pero **pisa `estado='inactivo'** |
| `updateMany` con `estado: 'activo'` | **Elegida** |

**Fundamento**: en READ COMMITTED (default de Postgres y de Prisma) el segundo `UPDATE` concurrente
se bloquea en el lock de fila y, tras el commit del primero, **reevalúa el `WHERE` contra la versión
nueva**; encuentra `estado='bloqueado'` y devuelve `count = 0`. Exactamente una fila
`CUENTA_BLOQUEADA`, sin lock explícito ni SQL crudo. Endurecer `not: 'bloqueado'` a `'activo'` es
estrictamente más fuerte para el mismo objetivo y evita un fallo real: un `Usuario` `inactivo`
auto-bloqueado perdería su marca, y el desbloqueo manual —que por criterio aprobado escribe
`estado='activo'`— lo **reactivaría**, convirtiendo la fuerza bruta en un camino de reactivación.

### D3 — El listado refleja el estado real de la fila; **no** filtra bloqueos vencidos

**Elección**: `where: { estado: 'bloqueado' }`, sin condición sobre `bloqueado_hasta`.
**Alternativas**: filtrar `bloqueado_hasta > now() OR IS NULL` (bloqueo "efectivo"); agregar un campo
derivado `vencido`.
**Fundamento**: (a) `estado` es la verdad durable que **otras** capas consumen (#7, reportes,
exportaciones); si el panel del comité ocultara filas que esas capas siguen viendo como bloqueadas,
la única superficie capaz de corregirlas quedaría ciega — y la expiración perezosa solo sana la fila
ante un login **exitoso**, así que una cuenta nunca reintentada queda `bloqueado` indefinidamente y
el desbloqueo manual es su único cierre; (b) `bloqueado_hasta` ya viaja en la respuesta justamente
para que el cliente derive "vencido" sin un campo extra que violaría el contrato de campos aprobado;
(c) un filtro `bloqueado_hasta > now()` excluiría por descuido los bloqueos indefinidos
(`bloqueado_hasta IS NULL`, p. ej. administrativos de #7), que son los que **más** necesitan acción
manual; (d) coherente con "sin filtros" del alcance confirmado.

### D4 — El `LOGIN_FALLIDO` que dispara el bloqueo conserva `motivo: 'password_incorrecta'`

**Elección**: dos eventos independientes. `MotivoLoginFallido` no gana valores nuevos;
`CUENTA_BLOQUEADA` es la fila que explica la transición y lleva el detalle en su payload.
**Alternativas**: `motivo: 'password_incorrecta_bloqueo_disparado'`; un flag `disparo_bloqueo` en el
payload de `LOGIN_FALLIDO`.
**Fundamento**: los dos eventos responden preguntas de ejes distintos — `LOGIN_FALLIDO` es "por qué
se rechazó **este request**", `CUENTA_BLOQUEADA` es "cuándo cambió de estado **la cuenta**". Mezclar
el segundo eje dentro del motivo rompe el conteo: cualquier consulta que agregue
`motivo='password_incorrecta'` perdería exactamente el intento más relevante (el 5.º). La
correlación no necesita codificarse: ambas filas comparten `entity_id` y quedan contiguas por
`occurred_at` en el mismo stream append-only. Además el union es cerrado y lo consume
`determinarMotivoFallo()`, que no tiene forma de saber si el bloqueo se disparó.

### D5 — El contador degrada en silencio; nunca altera la respuesta

**Elección**: `registrarFallo()` **no propaga excepciones** (Redis y la transacción de transición
van con `.catch(() => undefined)` interno). La comparación de umbral es `intentos >= INTENTOS_MAX`,
no `===`.
**Fundamento**: el `401` uniforme de D3/#4 es un invariante de seguridad; un subsistema que solo
cuenta no puede convertirlo en `500`. El modo de falla ya aceptado en la propuesta es "se pierde el
contador y el atacante gana una ventana nueva". El `>=` es lo que hace que un fallo de la transición
se recupere solo: el intento siguiente incrementa a 6 y reintenta la transición.

### D6 — La expiración perezosa se audita como `CUENTA_DESBLOQUEADA` con actor `null`

**Elección**: dentro de la `$transaction` que ya audita `LOGIN_EXITOSO`, si la fila venía
`bloqueado`, se sana con una sentencia condicionada y, solo si afectó fila, se audita:

```ts
const { count } = await tx.usuario.updateMany({
  where: { id: usuario.id, estado: 'bloqueado', bloqueado_hasta: { lt: new Date() } },
  data: { estado: 'activo', bloqueado_hasta: null },
});
// count === 1 ⇒ log CUENTA_DESBLOQUEADA, actor null, { motivo: 'expiracion_automatica' }
```

**Alternativas**: no auditar la expiración (la propuesta no la exigía).
**Fundamento**: sin esta fila el rastro queda asimétrico — un auditor que lee el stream ve
`CUENTA_BLOQUEADA` sin cierre y concluye que la cuenta sigue bloqueada. `actor_usuario_id = null`
(mismo criterio que `LOGIN_OAUTH_FALLIDO` sin usuario) porque no hay actor humano: el sistema
materializó un vencimiento. `motivo: 'expiracion_automatica'` vs `'manual_comite'` discrimina las
dos vías de ADR-0008 sin dos claves de evento. Extensión aditiva: no contradice ningún criterio
aprobado. La condición `bloqueado_hasta: { lt: new Date() }` se reevalúa en la escritura, así que un
re-bloqueo ocurrido entre la lectura y la transacción no se pisa.

### D7 — El chequeo de vencimiento vive en un helper puro y aplica a **ambos** caminos de login

**Elección**: `bloqueoVigente(u): boolean` = `u.estado === 'bloqueado' && (u.bloqueado_hasta === null
|| u.bloqueado_hasta > new Date())`. `login()` reemplaza `usuario.estado === 'bloqueado'` por
`bloqueoVigente(usuario)`; `loginConGoogle()` hace lo mismo en su guarda de línea 116, y la sanación
de D6 se replica en la transacción de `crearSesionOAuth()`.
**Fundamento**: el criterio aprobado ("un login contra una cuenta con bloqueo vencido no es
rechazado por causa de bloqueo") no distingue camino. Dejar el chequeo solo en `login()` haría que un
bloqueo vencido siguiera rechazando OAuth **para siempre** — el peor de los dos mundos. Que sea puro
y síncrono lo mantiene dentro del `if` existente sin `await` extra ni roundtrip.

### D8 — Contador y reseteo: puntos exactos en `auth.service.ts`

| Punto | Acción |
|---|---|
| Rama de rechazo, **después** de `auditarLoginFallido()` y **antes** del `throw` | `await this.bloqueoService.registrarFallo(usuario, dto.codigo, motivo)` |
| Rama exitosa, **después** del `$transaction(LOGIN_EXITOSO)` y **antes** de `sessionService.crear()` | `await this.bloqueoService.resetearIntentos(usuario.id)` (`DEL login:intentos:{id}`) |

`contable = motivo === 'password_incorrecta' && usuario !== null && !bloqueoVigente(usuario)`;
si no es contable, se incrementa la clave señuelo. Nota: `motivo === 'password_incorrecta'` **no**
implica no-bloqueado (`determinarMotivoFallo` devuelve `'usuario_bloqueado'` solo cuando la
contraseña es correcta), por eso la conjunción explícita. El reseteo va antes de `crear()` para que
`crear()` siga siendo el último efecto de Redis, conservando literal el modo de falla residual que
D7 de #4 documenta. **Un login OAuth exitoso no resetea el contador**: mide fuerza bruta contra la
credencial de contraseña, y el TTL de 15 min lo limpia solo.

## Flujo de datos — fallo que alcanza el umbral

    Cliente      AuthController   AuthService    BloqueoService   Redis      Prisma    SessionService
      │ POST auth/login (pwd mala)  │                  │            │           │            │
      │────────────────────────────>│──login(dto)─────>│            │           │            │
      │                             │  findUnique(codigo) ──────────────────────>│            │
      │                             │  verificar(pwd | DECOY_HASH)  │           │            │
      │                             │  $transaction(log LOGIN_FALLIDO motivo=password_incorrecta) ─>│
      │                             │──registrarFallo(usuario, codigo, motivo)──>│            │
      │                             │                  │  MULTI SET NX + INCR ─>│            │
      │                             │                  │  intentos < 5 ⇒ fin (nada más)      │
      │                             │                  │  intentos >= 5:        │            │
      │                             │                  │  $transaction(updateMany estado activo→bloqueado
      │                             │                  │      + log CUENTA_BLOQUEADA si count===1) ─>│
      │                             │                  │  revokeAllForUser(id)  solo si count===1 ──>│
      │<────── 401 uniforme ────────│                  │            │           │            │

## Flujo de datos — desbloqueo manual del comité

    Comité   AuthController(AuthGuard,RolesGuard,@Roles('comite'))   BloqueoService   Prisma   SessionService
      │ POST auth/usuarios/{id}/desbloquear │                              │            │            │
      │────────────────────────────────────>│──desbloquearManual(id, req.usuario.userId)>│           │
      │                                     │   $transaction:              │            │            │
      │                                     │     findUnique(id) ⇒ null ⇒ 404 NotFound  │            │
      │                                     │     updateMany({id, estado:'bloqueado'} → activo, null)>│
      │                                     │     count===1 ⇒ log CUENTA_DESBLOQUEADA (actor=comité) │
      │                                     │   commit → revokeAllForUser(id) solo si count===1 ─────>│
      │<── 200 { desbloqueado: true|false } │                              │            │            │

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | `bloqueado_hasta DateTime? @db.Timestamptz(3)` en `Usuario` (mismo tipo que `creado_en`) |
| `apps/backend/prisma/migrations/<ts>_bloqueado_hasta_usuario/migration.sql` | Crear | Aditiva y nulable, apilada tras `<ts>_google_id_usuario` |
| `apps/backend/src/auth/bloqueo.service.ts` | Crear | `registrarFallo`, `resetearIntentos`, `desbloquearManual`, `listarBloqueados`, más `bloqueoVigente` y `sanarBloqueoVencido(tx, usuario)` exportados como funciones puras/helpers |
| `apps/backend/src/auth/auth.service.ts` | Modificar | D7 en `login()` y `loginConGoogle()`; D8 (dos llamadas); sanación de D6 en las dos transacciones de éxito; inyecta `BloqueoService`. `determinarMotivoFallo()` sin cambios |
| `apps/backend/src/auth/auth.controller.ts` | Modificar | `GET auth/usuarios/bloqueados` y `POST auth/usuarios/:id/desbloquear` |
| `apps/backend/src/auth/dto/usuario-bloqueado.dto.ts` | Crear | Clase con `@ApiProperty` (sin `class-validator`, igual que los DTO de #5) |
| `apps/backend/src/auth/auth.module.ts` | Modificar | `BloqueoService` en `providers` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | Aditivo: `CUENTA_BLOQUEADA`, `CUENTA_DESBLOQUEADA`; sin tocar el `WHEN` del trigger de ADR-0016 |
| `turbo.json` | Modificar | `test:e2e.env` += `LOGIN_INTENTOS_MAX`, `LOGIN_INTENTOS_VENTANA_SEGUNDOS`, `LOGIN_BLOQUEO_SEGUNDOS` |
| `README.md` / `docs/onboarding.md` | Modificar | Documentar las tres variables junto a `SESSION_TTL_SECONDS`/`RECOVERY_TTL_SECONDS` |
| `apps/backend/test/auth/*`, `apps/backend/src/auth/*.spec.ts` | Crear | Ver estrategia de pruebas |

Sin índice sobre `estado`: la tabla es del tamaño de una institución y la consulta corre solo desde
el panel del comité; el índice útil sería **parcial** (`WHERE estado='bloqueado'`), que Prisma no
expresa en el DSL y obligaría a SQL crudo en la migración (precedente de `AnioEscolar` en #2).
Revisar si `Usuario` supera el orden de 10⁵ filas.

## Contratos

Constantes con el idioma env-con-default ya establecido por `SESSION_TTL_SECONDS`:

```ts
const INTENTOS_MAX = Number(process.env.LOGIN_INTENTOS_MAX ?? 5);
const INTENTOS_VENTANA_SEGUNDOS = Number(process.env.LOGIN_INTENTOS_VENTANA_SEGUNDOS ?? 900);
const BLOQUEO_SEGUNDOS = Number(process.env.LOGIN_BLOQUEO_SEGUNDOS ?? 900);
```

Ventana de conteo y duración del bloqueo son knobs separados aunque hoy valgan lo mismo: ADR-0008
restringe la **expiración del bloqueo** (10-15 min), no el período de conteo, y separarlos permite
fijar valores chicos en los e2e sin distorsionar el otro.

| Método | Ruta (bajo el prefijo global `api`) | Guards | Entrada | Respuestas |
|---|---|---|---|---|
| GET | `auth/usuarios/bloqueados` | `AuthGuard`, `RolesGuard`, `@Roles('comite')` | — | `200 UsuarioBloqueadoDto[]` / `401` sin cookie / `403` otro rol |
| POST | `auth/usuarios/:id/desbloquear` | idem | `:id` vía `ParseUUIDPipe`, **sin body** | `200 { desbloqueado: boolean }` / `400` uuid malformado / `401` / `403` / `404 'Usuario no encontrado'` |

```ts
class UsuarioBloqueadoDto {
  id: string; nombres: string; dni: string; codigo: string;
  bloqueado_hasta: string | null;   // ISO 8601 o null (bloqueo indefinido)
}
```

Listado: `findMany({ where: { estado: 'bloqueado' }, select: { id, nombres, dni, codigo,
bloqueado_hasta }, orderBy: [{ bloqueado_hasta: 'desc' }, { codigo: 'asc' }] })`. Arreglo desnudo,
sin envoltorio de metadatos (no hay paginación que describir); `orderBy` no es un filtro, es lo que
hace el listado determinista y testeable — `desc` deja arriba los bloqueos indefinidos (`NULLS
FIRST` por defecto en Postgres), que son los que exigen acción manual.

Desbloqueo: sin body porque no hay nada que validar (no existe `ValidationPipe` en el proyecto) y
ADR-0008 se satisface con actor + timestamp; `ParseUUIDPipe` (regex interno de Nest, sin dependencia
nueva) evita que un `:id` malformado escape como `500` por `P2023` de Prisma. `desbloqueado: false`
cuando el usuario existe pero ya no estaba bloqueado: idempotente, sin fila de auditoría y sin
revocar sesiones — "sin cambio de estado, sin efecto", el mismo criterio que D2.

Payloads de auditoría — nunca la contraseña, nunca el contador señuelo:

| Evento | actor | entity_id | payload |
|---|---|---|---|
| `CUENTA_BLOQUEADA` | `null` (sistema) | `usuario.id` | `{ motivo: 'intentos_fallidos', intentos, ventana_segundos, bloqueado_hasta }` |
| `CUENTA_DESBLOQUEADA` (manual) | `userId` del comité | `usuario.id` | `{ motivo: 'manual_comite' }` |
| `CUENTA_DESBLOQUEADA` (expiración) | `null` | `usuario.id` | `{ motivo: 'expiracion_automatica' }` |

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Schema | `bloqueado_hasta` existe, es nulable, `timestamptz(3)` | `test/schema/*.spec.ts` con `pg-client` (patrón de #2) |
| Unit | `bloqueoVigente()`: `null`, futuro, pasado, `estado` no bloqueado; `determinarMotivoFallo()` sin regresión | Jest puro |
| Integración | Contador sobre Redis real: TTL fijo (no deslizante), clave señuelo cuando el usuario no existe, `DEL` en login exitoso, `registrarFallo` no lanza con Redis caído | Redis de `docker-compose.test.yml` |
| E2E | 4 fallos + 1 éxito + 4 fallos ⇒ **no** bloquea; 5.º fallo ⇒ `estado='bloqueado'`, `bloqueado_hasta≈now+15m`, una `CUENTA_BLOQUEADA`, sesiones revocadas; login con bloqueo vencido pasa (contraseña **y** Google) y deja `CUENTA_DESBLOQUEADA` de expiración; desbloqueo manual y `403` para rol ≠ comité; listado con campos exactos | `supertest` + `Test.createTestingModule` |
| Adversarial (RED obligatorio) | Dos fallos concurrentes que cruzan el umbral ⇒ **exactamente una** `CUENTA_BLOQUEADA`; dos desbloqueos concurrentes ⇒ **exactamente una** `CUENTA_DESBLOQUEADA`; un `Usuario` `inactivo` con 5 fallos **no** pasa a `bloqueado`; 5 fallos OAuth **no** bloquean; `:id` inexistente ⇒ `404`, malformado ⇒ `400`, nunca `500` | `Promise.all` sobre supertest / Prisma |

## Matriz de amenazas

N/A — este change no toca enrutamiento de comandos, shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos. Sus casos adversarios (oráculo de
enumeración, concurrencia del umbral, escalada vía `inactivo`) están en D1/D2 y en la fila
"Adversarial" de la estrategia de pruebas.

## Migración / rollout

Migración aditiva y nulable, sin backfill: toda fila existente queda con `bloqueado_hasta = NULL`,
que `bloqueoVigente()` interpreta como bloqueo indefinido **solo** si `estado='bloqueado'` (hoy no
hay ninguna). Sin feature flag: con Redis caído el login ya está roto por `SessionService`, y el
contador degrada en silencio (D5). Rollback según la propuesta: `git revert`; migración hacia
adelante si la columna ya se aplicó. Las claves `login:intentos:*` expiran solas.

## Preguntas abiertas

- [ ] **`estado='inactivo'` puede loguearse**: hueco preexistente de #4 (`login()` solo rechaza
      `bloqueado`). D2 lo contiene para que la fuerza bruta no lo reactive, pero cerrarlo es de #7.
- [ ] **Sin notificación al usuario** al bloquearse/desbloquearse: fuera de alcance confirmado;
      reutilizaría el `EmailSender` de #5 sin tocar este contrato.
- [ ] **CSRF**: sigue abierta desde #4/#5. `POST auth/usuarios/:id/desbloquear` es la primera ruta
      autenticada que **muta** estado de negocio; `sameSite: 'lax'` es hoy la única defensa.
- [ ] **Bloqueos indefinidos** (`estado='bloqueado'`, `bloqueado_hasta IS NULL`) no los produce este
      change; el listado y el desbloqueo manual ya los soportan por si #7 los introduce.
