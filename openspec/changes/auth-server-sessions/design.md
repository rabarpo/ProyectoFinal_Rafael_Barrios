# Diseño: auth-server-sessions (Backlog #4)

## Enfoque técnico

Enfoque 3 de la exploración, ya decidido y no reabierto: capa de sesión artesanal sobre Redis. Un
`SessionService` delgado escribe claves Redis directamente, `AuthGuard`/`RolesGuard` propios leen la
cookie, y no entra `express-session`/`connect-redis`/Passport. `AuthModule` sigue el precedente exacto
de `HealthModule`: declara `PrismaService` y `redisProvider` en sus propios `providers` e importa
`AuditoriaModule`. Ningún constructor abre conexión, así que `lazyConnect: true` y el gotcha de
`src/openapi.ts` quedan intactos.

## Decisiones de arquitectura

### D1 — TTL de sesión: 30 min de inactividad, techo absoluto de 8 h

**Elección**: TTL deslizante de 1800 s renovado en cada solicitud autenticada, más un techo absoluto de
28800 s desde `creadoEn`, verificado en `SessionService.obtener()`. Ambos por env
(`SESSION_TTL_SECONDS`, `SESSION_ABSOLUTE_TTL_SECONDS`) para ser revisables sin cambiar código.
**Alternativas**: TTL fijo de 2 h sin deslizamiento (expulsa al comité en plena jornada); jornada
completa sin techo (una sesión olvidada en un laboratorio escolar queda expuesta todo el día).
**Fundamento**: 30 min mata una sesión abandonada en una PC compartida dentro de una hora de clase; el
deslizamiento evita re-login al comité/administrador activo; el techo de 8 h acota una cookie robada y
cubre una jornada electoral completa.

### D2 — El rol viene de `Usuario.rol` (`RolUsuario`), fotografiado en la sesión

**Elección**: `RolesGuard` consume el enum `RolUsuario` de `@prisma/client`
(`estudiante|docente|comite|administrador|director`). No hay tabla de permisos ni unión de strings
paralela. El rol se copia al JSON de sesión en el login, así que el guard no consulta Postgres.
**Alternativas**: releer `Usuario.rol` en cada solicitud (siempre fresco, pero una consulta por request
y acopla toda ruta protegida a la disponibilidad de Postgres); tabla de roles/permisos (sin requisito
que la justifique).
**Fundamento**: el schema ya define los cinco roles; el guard queda O(1) sobre Redis. Contrapartida
aceptada: un cambio de rol no se refleja hasta re-loguear — quien cambie el rol debe llamar
`revokeAllForUser(userId)`, el mismo gancho que #6 usa para el bloqueo.
`AuthGuard` tampoco relee `estado` por solicitud: ADR-0008 se satisface por revocación, que es
precisamente el motivo por el que ADR-0004 eligió sesión en servidor sobre JWT.

### D3 — Error de login unificado, con trabajo constante

**Elección**: `401` con cuerpo fijo `{ "message": "Credenciales inválidas" }` para las cuatro causas
(usuario inexistente, `password_hash` nulo, contraseña incorrecta, `estado='bloqueado'`). Cuando el
usuario no existe, se verifica igual contra un hash señuelo fijo para no abrir un oráculo de tiempo.
El motivo real se registra solo en el payload de auditoría (`motivo`), nunca en la respuesta HTTP.
**Alternativas**: distinguir "cuenta bloqueada" en la respuesta (útil para el usuario, pero confirma la
existencia de la cuenta igual que un mensaje explícito de usuario inexistente).
**Fundamento**: estándar contra enumeración de usuarios. La notificación de bloqueo pertenece a un
canal fuera de banda (correo, #6/#10), no a la respuesta de login. #6 obtiene el motivo desde la
auditoría, que es donde lo necesita.

### D4 — Sesiones concurrentes permitidas; índice como Set de Redis

**Elección**: un login nuevo NO invalida sesiones previas. Claves:
`session:{sessionId}` (STRING JSON, `EX` = TTL de inactividad) y `session:user:{userId}` (SET de
sessionIds, `EXPIRE` = techo absoluto, renovado en cada login).
**Alternativas**: sesión única por usuario (invalidar la previa).
**Fundamento**: el escenario `revokeAllForUser` de la spec dice literalmente "GIVEN un usuario con dos
o más sesiones activas" — la política de sesión única lo volvería inalcanzable. Además, invalidar la
previa convierte cualquier login en una expulsión silenciosa del usuario legítimo. La exigencia de
ADR-0008 la cubre `revokeAllForUser`, no la política de concurrencia.
Miembros huérfanos (sesiones ya expiradas) se auto-sanan: `revokeAllForUser` hace `DEL` de cada
`session:{id}` (inocuo si ya no existe) y luego `DEL` del set — idempotente. El logout hace `SREM`.

### D5 — Hashing: argon2id vía `@node-rs/argon2`

**Elección**: `@node-rs/argon2` (dependencia nueva de `apps/backend`), parámetros explícitos
`memoryCost=19456, timeCost=2, parallelism=1` (mínimos OWASP), salt y parámetros embebidos en la
cadena PHC guardada en `password_hash`.
**Alternativas**: `bcrypt`/`bcryptjs` (trunca a 72 bytes, sin dureza de memoria); paquete `argon2`
(usa node-gyp y no publica binario musl, obligaría a instalar python3/make/g++ en
`backend.Dockerfile`, que es `node:22-alpine`); `crypto.scrypt` de Node (cero dependencias, pero
obliga a escribir a mano la codificación PHC y la comparación en tiempo constante, justo en el camino
más sensible del change).
**Fundamento**: primera opción de OWASP; napi-rs publica `linux-x64-musl` precompilado, compatible con
`node:22-alpine` sin toolchain; la cadena PHC es autodescriptiva, así que subir parámetros después no
requiere columna extra ni migración.
**A verificar en `sdd-apply`**: que `pnpm install --frozen-lockfile` dentro de `node:22-alpine`
resuelva el binario musl sin compilar.

### D6 — Cookie `seei_session` y `cookie-parser` como middleware de `AuthModule`

**Elección**: nombre `seei_session`; `httpOnly: true`; `secure: NODE_ENV === 'production'`;
`sameSite: 'lax'`; `path: '/'`; **sin** `maxAge`/`expires` (cookie de sesión de navegador); sin firmar.
Escritura con `@Res({ passthrough: true })` y `res.cookie()` (API de Express, sin dependencia). Lectura:
`cookie-parser` (+ `@types/cookie-parser` en devDependencies) registrado como middleware del propio
`AuthModule` (`configure(consumer)`), no en `main.ts`.
**Alternativas**: `sameSite: 'strict'` (rompería el enlace autenticado por correo de ADR-0009 y el
retorno de OAuth de #5); prefijo `__Host-` (exige `Secure`, complica dev/e2e sobre http); parsear a
mano el header `Cookie` (5 líneas, pero valores citados y `%`-encoding son fuente clásica de bugs);
cookie firmada (el sessionId ya son 256 bits de CSPRNG y es una clave opaca que además debe existir en
Redis: firmar agrega un secreto a gestionar sin ganancia).
**Fundamento**: registrar el middleware en `AuthModule` hace que funcione igual bajo `main.ts` y bajo
`Test.createTestingModule` de los e2e; registrar middleware no abre ninguna conexión, así que
`src/openapi.ts` sigue extrayendo el contrato sin Redis vivo. Cookie de sesión de navegador: cerrar el
navegador en una PC del laboratorio no debe dejar cookie usable; el TTL del servidor sigue siendo la
autoridad.

### D7 — La auditoría se confirma ANTES de escribir en Redis

**Elección**: generar el `sessionId`, ejecutar `prisma.$transaction()` con el `AuditoriaService.log()`
y, solo si confirma, escribir la sesión en Redis y emitir la cookie.
**Alternativas**: crear la sesión primero y compensar con `DEL` si la transacción falla (Redis no tiene
rollback; la compensación puede fallar a su vez).
**Fundamento**: satisface directamente el escenario "fallo de la escritura de auditoría aborta el
login" — si la transacción lanza, nunca se alcanza el `SET`. Modo de falla residual aceptado: si Redis
falla después del commit, queda una fila `LOGIN_EXITOSO` sin sesión y el cliente recibe `500` sin
cookie; la auditoría sobre-reporta en vez de sub-reportar, que es la dirección segura.

### D8 — Estructura de `AuthModule`

`AuthGuard` (401) y `RolesGuard` (403) son guards separados y se componen en ese orden:
`@UseGuards(AuthGuard, RolesGuard)`. `RolesGuard` sin metadata `@Roles()` deja pasar; con metadata y
sin `req.usuario` lanza 401. Se registran a nivel de ruta, **no** como guards globales, para no
proteger `GET /health` ni `POST /system/ping`.

## Flujo de datos — login

    Cliente        AuthController      AuthService         Prisma            Redis
      │  POST /auth/login  │                │                │                │
      │───────────────────>│                │                │                │
      │                    │─ login(dto) ──>│                │                │
      │                    │                │─ usuario.findUnique(codigo) ─>  │
      │                    │                │<── Usuario | null ──────────────│
      │                    │                │ PasswordService.verificar()     │
      │                    │                │   (hash señuelo si no existe)   │
      │                    │                │─ $transaction(log LOGIN_*) ──>  │
      │                    │                │<── commit ──────────────────────│
      │                    │                │  (si falla → 401/500, sin Redis)│
      │                    │                │─ MULTI SET session:{id} EX 1800 │
      │                    │                │        SADD session:user:{u}    │
      │                    │                │        EXPIRE ... 28800 ───────>│
      │                    │<── SesionUsuario + sessionId ─── │                │
      │<── 200 + Set-Cookie: seei_session ──│                │                │

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | `password_hash String?` en `Usuario` (nulable = sin credencial local; compatible con OAuth de #5) |
| `apps/backend/prisma/migrations/<ts>_credencial_usuario/migration.sql` | Crear | Migración aditiva, apilada tras `append-only-audit-engine` |
| `apps/backend/src/auth/auth.module.ts` | Crear | `NestModule`; providers `PrismaService`, `redisProvider`, `SessionService`, `PasswordService`, `AuthService`; importa `AuditoriaModule`; `configure()` aplica `cookieParser()` |
| `apps/backend/src/auth/auth.controller.ts` | Crear | `POST auth/login` (200 + cookie), `POST auth/logout` (204), anotados con `@ApiOperation`/`@ApiResponse` (ADR-0004) |
| `apps/backend/src/auth/auth.service.ts` | Crear | Orquesta verificación, auditoría transaccional (D7) y creación de sesión |
| `apps/backend/src/auth/session.service.ts` | Crear | `SessionService` sobre `REDIS_CLIENT` |
| `apps/backend/src/auth/password.service.ts` | Crear | argon2id hash/verificar + hash señuelo (D3/D5) |
| `apps/backend/src/auth/auth.guard.ts` | Crear | Valida cookie → sesión → adjunta `req.usuario`; renueva TTL |
| `apps/backend/src/auth/roles.guard.ts` | Crear | Autorización por `RolUsuario` |
| `apps/backend/src/auth/roles.decorator.ts` | Crear | `ROLES_KEY` + `@Roles(...)` |
| `apps/backend/src/auth/sesion-usuario.ts` | Crear | Tipo `SesionUsuario` + augmentación de `Express.Request` |
| `apps/backend/src/auth/dto/login.dto.ts` | Crear | `LoginDto` con `@ApiProperty` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | Aditivo: `LOGIN_EXITOSO`, `LOGIN_FALLIDO`, `LOGOUT` (no tocan el `WHEN` del trigger de ADR-0016, que solo cubre `VOTO`/`RECHAZO`) |
| `apps/backend/src/app.module.ts` | Modificar | Registrar `AuthModule` |
| `apps/backend/package.json` | Modificar | `+@node-rs/argon2`, `+cookie-parser`; dev: `+@types/cookie-parser` |
| `apps/backend/prisma/seed.ts` | Modificar | Sembrar `password_hash` de los 5 usuarios desde `SEED_PASSWORD` (guard de producción ya existente) |
| `apps/backend/test/auth/*.e2e-spec.ts` | Crear | Specs de login/logout/guards/revocación |

## Contratos

```ts
// sesion-usuario.ts
export interface SesionUsuario { userId: string; rol: RolUsuario; creadoEn: number }

// session.service.ts — `revokeAllForUser` conserva el nombre en inglés porque la spec lo fija.
crear(userId: string, rol: RolUsuario): Promise<string>        // sessionId, 32 bytes base64url
obtener(sessionId: string): Promise<SesionUsuario | null>       // aplica techo absoluto + renueva TTL
revocar(sessionId: string): Promise<void>
revokeAllForUser(userId: string): Promise<void>                 // idempotente
```

```ts
// Patrón obligatorio: una transacción propia por cada registro de auditoría (D7).
await this.prisma.$transaction(async (tx) => {
  await this.auditoria.log(tx, AUDIT_EVENT_TYPES.LOGIN_FALLIDO, usuario?.id ?? null,
    'Usuario', usuario?.id ?? null,
    { identificador: dto.codigo, motivo });   // nunca la contraseña enviada
});
```

Payloads: `LOGIN_EXITOSO` `{ session_id, rol }`; `LOGIN_FALLIDO`
`{ identificador, motivo: 'usuario_inexistente'|'password_ausente'|'password_incorrecta'|'usuario_bloqueado' }`;
`LOGOUT` `{ session_id }`. Identificador de login: `Usuario.codigo` (único e institucional); aceptar
`correo` queda para un change posterior.

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Schema | `password_hash` existe y es nulable | `test/schema/*.spec.ts` con `pg-client` (patrón de #2) |
| Unit | `RolesGuard` (rol permitido/denegado/sin metadata), `AuthGuard` sin cookie, techo absoluto | Jest sobre `ExecutionContext` simulado, sin Redis |
| Integración | `SessionService`: crear/obtener/revocar, TTL deslizante, `revokeAllForUser` con 2+ sesiones | Redis del `docker-compose.test.yml` |
| E2E | Login OK (cookie + clave Redis), contraseña incorrecta, usuario inexistente, `estado='bloqueado'`, logout, ruta protegida sin cookie y con sesión eliminada, una fila de auditoría por camino | `supertest` sobre `Test.createTestingModule`, patrón de `test/*.e2e-spec.ts` |
| CI | `pnpm openapi:extract` sin Redis/Postgres vivos | Job existente de CI |

Casos adversarios que deben tener test RED antes del código: respuesta idéntica (código y cuerpo) para
las cuatro causas de fallo; ninguna respuesta ni fila de auditoría contiene la contraseña enviada;
`revokeAllForUser` invocado dos veces no falla.

## Matriz de amenazas

N/A — este change no toca enrutamiento de comandos, shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos. Las filas de la matriz de referencia
(rutas tipo documentación, selección de repositorio Git, estado de commit/push, comandos de PR) no
tienen contraparte aquí. Los casos adversarios propios de auth están en "Estrategia de pruebas".

## Migración / rollout

Migración aditiva y nulable: no rompe filas existentes ni requiere backfill. El seed rellena
`password_hash` de los 5 usuarios de prueba de forma idempotente. Sin feature flag: `AuthModule` no
modifica ninguna ruta existente y los guards se aplican por ruta, no globalmente. Rollback per el plan
de la propuesta (`git revert`; migración hacia adelante si ya se aplicó).

## Preguntas abiertas

- [ ] **CSRF**: `sameSite: 'lax'` es la única defensa en este change. Un token CSRF debe decidirse junto
      con la primera ruta autenticada que cambie estado de negocio (#7 en adelante); `logout` es
      idempotente, así que no lo exige hoy.
- [ ] **Ninguna decisión de este diseño contradice ADR-0001..0016**, así que no se propone ADR nuevo;
      ADR-0004 ya fija la sesión en servidor. Si #6 cambia la política de TTL o de concurrencia, debe
      revisar D1/D4 aquí.
