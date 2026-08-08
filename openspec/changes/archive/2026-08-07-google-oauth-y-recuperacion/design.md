# Diseño: google-oauth-y-recuperacion (Backlog #5)

## Enfoque técnico

Enfoques 2 + 3 de la exploración, ya decididos y **no reabiertos**: verificación manual del ID token
de Google con `google-auth-library` (`verifyIdToken`) y token de recuperación de un solo uso en Redis
con el patrón exacto de `SessionService`. Tres piezas nuevas dentro de `AuthModule`
(`GoogleOauthService`, `RecoveryService`, más los métodos de `AuthController`) y un `EmailModule`
propio y desechable. `SessionService`, `PasswordService`, `AuditoriaService` y `AuthGuard` se
consumen tal cual. Ningún provider abre conexión en su constructor, así que `lazyConnect: true` y el
gotcha de `src/openapi.ts` (extraer el contrato en CI sin Postgres/Redis/SMTP/Google vivos) quedan
intactos — ver D2 y D8.

## Decisiones de arquitectura

### D1 — Se propone **ADR-0017** para la política de acceso por Google

**Elección**: crear `adrs/0017-acceso-google-dominio-institucional.md` (Aceptado) que fije: (a)
verificación manual del ID token en vez de `passport-google-oauth20`, (b) restricción por claim `hd`
contra una lista permitida, (c) sin auto-provisión de cuentas, (d) vinculación de una cuenta con
contraseña exige confirmarla, (e) la lista de dominios vive en variable de entorno hasta que #10 la
persista en `Configuracion`.
**Alternativas**: no crear ADR (precedente de #4, que descartó Passport para credenciales sin ADR);
enmendar TECH-DESIGN.md.
**Fundamento**: #4 no creó ADR porque solo eligió una librería y ninguna decisión de acceso; acá hay
una **política de acceso** con riesgo residual propio (un dominio mal configurado abre el sistema a
Google entero) y obligaciones para changes futuros (#7/#9 deben pre-cargar usuarios; #10 debe migrar
la variable). Es el mismo criterio con el que #3 produjo ADR-0016 en vez de enmendar ADR-0010: un
mecanismo con alternativas y consecuencias propias merece su propio registro versionado. No
contradice ningún ADR-0001..0016; ADR-0004 (sesión en servidor) se cumple igual porque OAuth termina
en la misma cookie `seei_session`.

### D2 — Verificación del ID token y política de dominio, fallando en cerrado

**Elección**: `GoogleOauthService` recibe un `OAuth2Client` inyectado (token `GOOGLE_OAUTH_CLIENT`) y
ejecuta `verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`. Aceptación exige las cuatro
condiciones: firma/`iss` válidos (los verifica la librería), `aud === GOOGLE_CLIENT_ID`,
`payload.email_verified === true`, y `payload.hd` **presente** y contenido en
`GOOGLE_HOSTED_DOMAINS` (lista separada por comas, normalizada con `trim().toLowerCase()`).
`GOOGLE_CLIENT_ID` o `GOOGLE_HOSTED_DOMAINS` ausentes o vacíos ⇒ **se rechaza todo login OAuth en
tiempo de request**, nunca una excepción en `onModuleInit`.
**Alternativas**: exigir además que el dominio de `email` coincida con `hd` (rompe dominios
secundarios legítimos del mismo tenant de Workspace); aceptar `hd` ausente (una cuenta personal
`@gmail.com` no lo trae — aceptarlo abriría el login a Google entero); validar la configuración al
arrancar (rompería `pnpm openapi:extract` en CI, que corre sin secretos).
**Fundamento**: `hd` es la única señal de tenancy que Google firma; el correo por sí solo es
falsificable en cuentas de consumidor. La coincidencia `email`↔`hd` no hace falta porque la búsqueda
posterior es por `Usuario.correo` exacto, que es una restricción más fuerte (el correo ya debe estar
pre-cargado). Inyectar el `OAuth2Client` es lo que hace testeable el flujo sin red: los e2e lo
sustituyen con `overrideProvider(GOOGLE_OAUTH_CLIENT)`.

### D3 — Máquina de estados de `POST /auth/google`

Tras verificar el token: `correo = payload.email.trim().toLowerCase()`, `sub = payload.sub`;
`usuario = findUnique({ correo })`.

| # | Estado | Resultado | Auditoría |
|---|---|---|---|
| 1 | No existe `Usuario` con ese correo | `401` uniforme | `LOGIN_OAUTH_FALLIDO` `{ correo, motivo: 'usuario_inexistente' }` |
| 2 | `estado === 'bloqueado'` | `401` uniforme | `LOGIN_OAUTH_FALLIDO` `motivo: 'usuario_bloqueado'` |
| 3 | `google_id === sub` | sesión + cookie | `LOGIN_OAUTH_EXITOSO` `{ session_id, rol, vinculacion: 'ya_vinculada' }` |
| 4 | `google_id === null` y `password_hash === null` | vincula (TOFU) + sesión | `…_EXITOSO` `vinculacion: 'primer_uso'` |
| 5 | `google_id === null`, `password_hash` presente, **sin** `password` en el body | `409 { codigo: 'VINCULACION_REQUERIDA' }`, sin sesión, sin vincular | `LOGIN_OAUTH_FALLIDO` `motivo: 'vinculacion_requerida'` |
| 6 | Igual que 5, con `password` correcta | vincula + sesión | `…_EXITOSO` `vinculacion: 'password_confirmada'` |
| 7 | Igual que 5, con `password` incorrecta | `401` uniforme | `LOGIN_OAUTH_FALLIDO` `motivo: 'password_incorrecta'` |
| 8 | `google_id !== null && !== sub`, o `sub` ya vinculado a **otro** `Usuario` | `401` uniforme | `LOGIN_OAUTH_FALLIDO` `motivo: 'google_id_conflicto'` |

**Caso 4 (TOFU)**: una cuenta recién cargada por administración no tiene contraseña que confirmar;
exigir primero el flujo de recuperación no agrega seguridad —el correo de recuperación llega al mismo
buzón que el ID token ya demostró controlar— y solo agrega fricción. Queda fuera del requisito de la
spec, que solo obliga a confirmar cuando **ya existe** `password_hash`.
**Caso 8**: el chequeo explícito de `google_id` en uso evita que una `P2002` del índice único se
escape como `500` y filtre la existencia de otra cuenta.
**Caso 5 — por qué un `409` distinguible y no el `401` uniforme de D3/#4**: quien recibe el `409` ya
probó, con un token firmado por Google, que controla ese buzón institucional; decirle "esta cuenta
existe y tiene contraseña" no le revela nada que no pudiera obtener pidiendo recuperación con ese
mismo correo. La anti-enumeración de #4 protege al que **no** controla el buzón, y ese caso sigue
cubierto: sin ID token válido no hay `409` posible.

### D4 — TTL del token de recuperación: **30 minutos**

**Elección**: `RECOVERY_TTL_SECONDS`, por defecto `1800`.
**Alternativas**: 15 min (menor ventana, pero un padre al que se le dice "revisá tu correo" suele
llegar a una computadora varios minutos después; cada expiración fuerza una nueva solicitud, y cada
solicitud es **otro** correo con capacidad de reseteo en el buzón — el enlace corto de más no reduce
la exposición total, la fragmenta); 1 h (duplica la ventana en la que un buzón compartido o
supervisado —escenario explícito de ADR-0009/ADR-0011 en cuentas de menores— alcanza para tomar la
cuenta).
**Fundamento**: 30 min es exactamente `SESSION_TTL_SECONDS` (1800) que #4 ya fijó: un solo horizonte
de "abandonado en una PC del laboratorio", un solo número que revisar, ajustable por env sin tocar
código.

### D5 — Forma del token, clave de Redis y consumo atómico con compensación

**Elección**: `randomBytes(32).toString('base64url')` (256 bits, 43 caracteres URL-safe), idéntico al
`sessionId`. Clave `recovery:{token}`, valor el `userId` en texto plano, `SET ... EX
RECOVERY_TTL_SECONDS`. El `userId` **nunca** viaja dentro del token ni en el correo: el token es
opaco y la única forma de resolverlo es leyendo Redis (mismo criterio anti-enumeración de #4).
Consumo en la confirmación: `multi().ttl(k).getdel(k).exec()` —lectura y borrado atómicos, más el TTL
restante— y, si la transacción posterior falla, **compensación** `SET k userId EX max(ttlRestante,1)`.
Además, `recovery:cooldown:{userId}` con `SET NX EX 60` limita a una emisión por minuto y por usuario.
**Alternativas**: guardar `sha256(token)` como clave (defensa extra si alguien lee Redis; no se eligió
porque la spec fija literalmente `recovery:{token}` y porque quien lee Redis ya puede secuestrar
cualquier `session:{id}` — no cambia la postura real); `GET` + `DEL` no atómicos (dos confirmaciones
simultáneas consumirían el mismo token); `GETDEL` sin compensación (contradice el escenario "fallo de
auditoría ⇒ el token **no** se elimina de Redis").
**Fundamento**: la compensación satisface a la vez el uso único frente a carreras y el escenario de
rollback de la spec. Si la propia compensación falla, el token queda muerto: dirección segura, el
usuario vuelve a solicitar.

### D6 — Correo de confirmación al cambiar la contraseña: **sí, best-effort**

**Elección**: tras confirmar la recuperación se envía un segundo correo, **sin token y sin
contraseña**: código de evento, hora del servidor y la instrucción de contactar a administración si no
fue el usuario. Se despacha después de revocar sesiones, sin `await` bloqueante y con `.catch()`; su
fallo no revierte nada ni cambia la respuesta.
**Alternativas**: no enviarlo (el `EmailSender` es un stub y toda notificación "pertenece" a #15).
**Fundamento**: el costo real es una llamada más a la interfaz que ya existe y una constante de texto
— cero interfaz nueva, cero persistencia, cero plantilla. A cambio, es la **única** señal fuera de
banda que recibe la víctima cuando el ataque consistió justamente en leer su buzón, que es el
escenario que ADR-0009 ya registró como realista en cuentas supervisadas o compartidas.

### D7 — Orden de escritura: auditoría transaccional antes de todo efecto en Redis/SMTP

Se replica D7 de #4, con una diferencia: en la **confirmación** el efecto principal es una escritura
en Postgres, así que `UPDATE password_hash` y `AuditoriaService.log` van en **la misma**
`prisma.$transaction()`; Redis y el correo quedan después del commit.

- **Solicitud**: hash no aplica → `$transaction(log RECUPERACION_SOLICITADA)` **siempre**, exista o no
  el correo (`usuario_id: null` y `{ correo, emitido: false }` cuando no existe o hay cooldown) →
  commit → `SET recovery:{token}` → despacho del correo sin `await`.
- **Confirmación**: `multi().ttl().getdel()` → `PasswordService.hash()` **fuera** de la transacción
  (argon2id es caro y no debe alargarla) → `$transaction(update + log RECUPERACION_COMPLETADA)` →
  `revokeAllForUser(userId)` → correo de D6.
- **Login OAuth**: verificación → `$transaction(log + UPDATE google_id` cuando corresponde vincular`)`
  → `SessionService.crear(userId, rol, sessionId)` con el `sessionId` generado antes del commit.

Auditar **siempre** la solicitud, además de dejar rastro de sondeo, iguala el camino de escritura en
ambas ramas y quita la diferencia de tiempo entre correo existente e inexistente. El payload de
auditoría **nunca** contiene el token de recuperación (la auditoría es legible por administración; el
token es una capacidad de toma de cuenta), igual que #4 nunca audita la contraseña enviada.
Modos de falla residuales aceptados, en la dirección segura (sobre-reportar): `RECUPERACION_SOLICITADA`
sin token si Redis falla tras el commit; `RECUPERACION_COMPLETADA` con el token aún vivo si el `DEL`
falla tras el commit.

### D8 — `EmailSender`: módulo propio, implementación por variable de entorno

```ts
// src/email/email-sender.ts
export const EMAIL_SENDER = 'EMAIL_SENDER';
export interface EmailSender { send(destinatario: string, asunto: string, cuerpo: string): Promise<void>; }
```

**Elección**: `EmailModule` propio (no dentro de `auth/`) que exporta `EMAIL_SENDER` mediante una
factory: si `SMTP_HOST` está definido, `SmtpEmailSender` (nodemailer, `createTransport` sin `pool` y
**sin** `verify()` al arrancar — no abre socket hasta el primer `sendMail`); si no,
`ConsoleEmailSender`, que loguea **solo** destinatario y asunto, nunca el cuerpo (lleva el token).
Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, más `APP_BASE_URL`
para armar el enlace `${APP_BASE_URL}/recuperar?token=...`.
**Alternativas**: colocarlo en `auth/` (la propuesta lo permitía); encolar en `JobCorreo` (es #15,
fuera de alcance).
**Fundamento**: el límite de módulo es precisamente lo que hace que #15 reemplace la implementación
sin tocar `auth/`. La factory perezosa preserva el gotcha de `src/openapi.ts`: `EmailModule`,
`GoogleOauthService` y `redisProvider` se instancian sin abrir ninguna conexión.

## Flujo de datos — recuperación

    Cliente     AuthController   RecoveryService   Prisma        Redis        EmailSender
      │ POST /auth/recovery │          │             │             │              │
      │────────────────────>│─solicitar()─────────> │             │              │
      │                     │          │─findUnique(correo)──────> │              │
      │                     │          │─$transaction(log SOLICITADA)──────────>  │
      │                     │          │<─ commit ─────────────────│              │
      │                     │          │─SET recovery:{tok} EX 1800 ────────────> │
      │                     │          │─ send(enlace) sin await ───────────────> │
      │<── 202 respuesta uniforme ─────│          │                │              │
      │                     │          │          │                │              │
      │ POST /auth/recovery/confirm    │          │                │              │
      │────────────────────>│─confirmar(token,pwd)─>│               │              │
      │                     │          │─MULTI TTL+GETDEL recovery:{tok} ───────> │
      │                     │          │  (nulo ⇒ 400 uniforme, fin)              │
      │                     │          │─PasswordService.hash()  (fuera de la tx) │
      │                     │          │─$transaction(UPDATE + log COMPLETADA) ─> │
      │                     │          │  (falla ⇒ SET de compensación, 500)      │
      │                     │          │─revokeAllForUser(userId) ──────────────> │
      │                     │          │─ send(aviso de cambio) best-effort ────> │
      │<── 204 ─────────────│          │          │                │              │

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `adrs/0017-acceso-google-dominio-institucional.md` | Crear | ADR de D1 |
| `apps/backend/prisma/schema.prisma` | Modificar | `google_id String? @unique` en `Usuario` |
| `apps/backend/prisma/migrations/<ts>_google_id_usuario/migration.sql` | Crear | Aditiva, apilada tras `auth-server-sessions` |
| `apps/backend/src/auth/google-oauth.service.ts` | Crear | `verificar(idToken)` → payload validado (D2) |
| `apps/backend/src/auth/google-oauth.provider.ts` | Crear | `GOOGLE_OAUTH_CLIENT` (`OAuth2Client`), sustituible en tests |
| `apps/backend/src/auth/recovery.service.ts` | Crear | `solicitar()` / `confirmar()` (D5/D7) |
| `apps/backend/src/auth/auth.service.ts` | Modificar | `loginConGoogle()` con la máquina de estados de D3 |
| `apps/backend/src/auth/auth.controller.ts` | Modificar | `POST auth/google`, `POST auth/recovery`, `POST auth/recovery/confirm` |
| `apps/backend/src/auth/dto/{google-login,recovery-request,recovery-confirm}.dto.ts` | Crear | DTOs con `@ApiProperty` (no hay `class-validator` instalado; validación manual) |
| `apps/backend/src/email/{email-sender,console-email-sender,smtp-email-sender,email.module}.ts` | Crear | D8 |
| `apps/backend/src/auth/auth.module.ts` | Modificar | Importa `EmailModule`; providers nuevos |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | Aditivo: 4 claves nuevas, sin tocar el `WHEN` del trigger de ADR-0016 |
| `apps/backend/package.json` | Modificar | `+google-auth-library`, `+nodemailer`; dev: `+@types/nodemailer` |
| `turbo.json` | Modificar | `test:e2e.env` += `GOOGLE_CLIENT_ID`, `GOOGLE_HOSTED_DOMAINS`, `RECOVERY_TTL_SECONDS`, `SMTP_*`, `APP_BASE_URL` |
| `README.md` / `docs/onboarding.md` | Modificar | Documentar las variables nuevas junto a `REDIS_URL`/`DATABASE_URL` |
| `apps/backend/test/auth/*.e2e-spec.ts`, `src/auth/*.spec.ts` | Crear | Ver estrategia de pruebas |

## Contratos

| Método | Ruta (bajo el prefijo global `api`) | Body | Respuestas |
|---|---|---|---|
| POST | `auth/google` | `{ idToken: string, password?: string }` | `200` + cookie `seei_session` / `401 { message: 'Credenciales inválidas' }` / `409 { codigo: 'VINCULACION_REQUERIDA' }` |
| POST | `auth/recovery` | `{ correo: string }` | `202 { mensaje: 'Si el correo corresponde a una cuenta, se envió un enlace' }` (uniforme) |
| POST | `auth/recovery/confirm` | `{ token: string, password: string }` | `204` / `400 { message: 'Enlace inválido o expirado' }` |

Rutas en inglés por coherencia con `auth/login`/`auth/logout`/`auth/whoami` de #4. La contraseña
nueva exige un mínimo de 8 caracteres, verificado a mano en `RecoveryService` (no hay `ValidationPipe`
ni `class-validator` en el proyecto; instalarlos es fuera de alcance) y rechazado con el mismo `400`
uniforme. Payloads de auditoría: los de la tabla de D3, más `RECUPERACION_SOLICITADA`
`{ correo, emitido }` y `RECUPERACION_COMPLETADA` `{ sesiones_revocadas: true }` — **nunca** el token
ni la contraseña.

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Schema | `google_id` existe, es nulable y único | `test/schema/*.spec.ts` con `pg-client` (patrón de #2) |
| Unit | `GoogleOauthService`: `hd` no permitido, `hd` ausente, `email_verified:false`, `aud` incorrecta, `GOOGLE_HOSTED_DOMAINS` vacío ⇒ rechazo | Jest con `OAuth2Client` simulado, sin red |
| Integración | `RecoveryService` sobre Redis real: TTL, `GETDEL` atómico, compensación tras fallo de tx, cooldown | Redis de `docker-compose.test.yml` |
| E2E | Los 8 estados de D3; recuperación con correo existente/inexistente (respuesta y código idénticos); token válido/usado/expirado; primera contraseña de cuenta solo-OAuth; revocación de sesiones; una fila de auditoría por camino | `supertest` + `Test.createTestingModule` con `overrideProvider(GOOGLE_OAUTH_CLIENT)` y `EMAIL_SENDER` en memoria |
| CI | `pnpm openapi:extract` sin Postgres/Redis/SMTP/`GOOGLE_CLIENT_ID` | Job existente |

Casos adversarios con RED obligatorio antes del código: dos confirmaciones concurrentes con el mismo
token ⇒ exactamente una `RECUPERACION_COMPLETADA`; ninguna respuesta, log ni fila de auditoría
contiene el token de recuperación ni la contraseña; `sub` ya vinculado a otro `Usuario` ⇒ `401`, no
`500` por `P2002`; un login OAuth con correo no registrado no crea ningún `Usuario`.

## Matriz de amenazas

N/A — este change no toca enrutamiento de comandos, shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos. Agrega dos clientes de red
(Google, SMTP) invocados desde código de aplicación ya existente; sus casos adversarios están en
"Estrategia de pruebas" y en D2/D5.

## Migración / rollout

Migración aditiva y nulable (`google_id`): sin backfill, sin romper filas existentes. El seed puede
dejar `google_id` nulo — cualquier usuario sembrado entra por el caso 4 o 5 de D3. Sin feature flag:
sin `GOOGLE_CLIENT_ID`/`GOOGLE_HOSTED_DOMAINS` configurados, `POST auth/google` rechaza todo y el
resto del sistema queda igual; sin `SMTP_HOST`, la recuperación funciona y el enlace sale por consola
(entorno de desarrollo). Rollback según la propuesta: `git revert`; migración hacia adelante si
`google_id` ya se aplicó. Los tokens viven solo en Redis y expiran solos.

## Preguntas abiertas

- [ ] **Sin `RECUPERACION_FALLIDA`**: la spec aprobada fija exactamente cuatro claves nuevas, así que
      una confirmación con token inválido o expirado **no** deja fila de auditoría. Es un hueco de
      observabilidad conocido; agregar la quinta clave excede esta spec y queda para #6 (bloqueo por
      intentos), que ya necesita contar fallos.
- [ ] **Normalización de `correo`**: el diseño asume que `Usuario.correo` se persiste en minúsculas
      (el seed actual lo hace) y normaliza la entrada con `trim().toLowerCase()`. Confirmar en
      `sdd-apply`; si la carga administrativa de #7/#9 no lo garantiza, hará falta un índice funcional
      o `mode: 'insensitive'`.
- [ ] **CSRF**: sigue abierta desde #4. `POST auth/google` y `auth/recovery/confirm` cambian estado y
      no requieren cookie previa, así que `sameSite: 'lax'` sigue siendo la única defensa; se decide
      junto con la primera ruta autenticada de negocio (#7 en adelante).
- [ ] **El token en la query string** del enlace (`?token=`) queda en historial y `Referer` del
      navegador. Se acota con el TTL de 30 min y el uso único; revisarlo cuando exista la página de
      recuperación en `apps/frontend`.
