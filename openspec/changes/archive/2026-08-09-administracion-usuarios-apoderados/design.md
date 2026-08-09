# Diseño: administracion-usuarios-apoderados (Backlog #7)

## Enfoque técnico

Módulo nuevo `UsersModule` (`apps/backend/src/users/`) con dos controladores —`/usuarios` y el
sub-recurso anidado `/usuarios/:id/apoderados`— sobre `PrismaService`, `AuthGuard`/`RolesGuard`/
`@Roles()` de #4 y `AuditoriaService.log(tx, ...)` de #3. Sin migración de Prisma: el esquema de
#2/#5/#6 cubre `Usuario` y `Apoderado` completos. Sin `ValidationPipe`, sin `class-validator` y sin
filtro global de excepciones: el proyecto no tiene ninguno de los tres y este change **no** los
introduce (D2). Toda validación es manual en el servicio y todo error de negocio es una
`HttpException` de `@nestjs/common` lanzada en el punto exacto de la regla, igual que #4/#5/#6.

## Decisiones de arquitectura

### D1 — Cambio de estado: `PATCH /usuarios/:id/estado`, endpoint propio con estado destino

**Elección**: `PATCH api/usuarios/:id/estado`, body `{ estado: 'activo' | 'inactivo' }`. El DTO de
`PATCH api/usuarios/:id` **no declara el campo `estado`**, así que "editar datos básicos no puede
mover el estado" deja de ser una validación en tiempo de ejecución y pasa a ser una propiedad del
tipo (mismo idioma que `AuditoriaService.log()` recibiendo `Prisma.TransactionClient`: lo prohibido
ni siquiera compila).

| Opción | Veredicto |
|---|---|
| `PATCH /usuarios/:id` con `estado` y validación especial | El campo existe en el DTO: cada editor futuro debe recordar la guarda, y un mismo request podría mezclar `USUARIO_ACTUALIZADO` con `USUARIO_DESACTIVADO`. **Descartada** (además la spec exige "operación propia, no un campo libre de `PATCH` genérico") |
| `POST /usuarios/:id/desactivar` + `/reactivar` (estilo #6) | Duplica la guarda de `bloqueado` en dos handlers y verbo de acción, no de estado destino. **Descartada** |
| `PATCH /usuarios/:id/estado` con estado destino | **Elegida** |

**Fundamento**: un único handler concentra la tabla de transiciones permitidas (`activo⇄inactivo`
sí, cualquier par que toque `bloqueado` no), y expresar el **destino** —no la acción— hace el
request idempotente: repetirlo deja el mismo estado y, cuando no hubo cambio, no escribe fila de
auditoría (criterio "sin cambio de estado, sin efecto" de D2/#6). `PATCH` sobre un sub-recurso de
campo es una modificación parcial de `Usuario`, semántica correcta para un verbo idempotente.

**Desviación declarada frente a #6**: `POST auth/usuarios/:id/desbloquear` es una acción sin body
de otro subsistema; aquí el destino es un dato que viaja en el body y debe validarse. La divergencia
de verbo es deliberada, no una inconsistencia.

### D2 — Formato de error 4xx: `HttpException` con body estructurado y clave `codigo`

**Elección**: se mantiene el patrón existente (sin filtro global) y se adopta el idioma ya
introducido por #5, `throw new ConflictException({ codigo: 'VINCULACION_REQUERIDA' })`: cuando el
cliente necesita **discriminar** el error, el argumento es un objeto y Nest lo devuelve como body
literal; cuando no, se mantiene la cadena y el body por defecto de Nest
(`{ statusCode, message, error }`), como en `NotFoundException('Usuario no encontrado')` de #6.

| Caso | HTTP | Body |
|---|---|---|
| DNI / código / correo duplicado | `409` | `{ codigo: 'CAMPO_DUPLICADO', campo: 'dni' \| 'codigo' \| 'correo' }` |
| `estado` destino fuera de `{activo, inactivo}` (incluye `bloqueado`) | `400` | `{ codigo: 'ESTADO_DESTINO_NO_PERMITIDO', valor_recibido }` |
| Fila con `estado='bloqueado'` (transición **desde** bloqueado) | `409` | `{ codigo: 'TRANSICION_DESDE_BLOQUEADO', estado_actual: 'bloqueado' }` |
| Formato/longitud/campo requerido (`dni` > 20, correo inválido, rol o filtro desconocido) | `400` | `{ codigo: 'CAMPO_INVALIDO', campo, motivo: 'requerido' \| 'formato' \| 'longitud_maxima' }` |
| `:id` existe pero `rol ≠ estudiante` en `/apoderados` | `409` | `{ codigo: 'USUARIO_NO_ES_ESTUDIANTE', rol_actual }` |
| `Usuario`/`Apoderado` inexistente | `404` | `'Usuario no encontrado'` / `'Apoderado no encontrado'` (body por defecto de Nest) |
| `:id` con UUID malformado | `400` | `ParseUUIDPipe` (precedente #6) |
| Sin cookie / rol no autorizado | `401` / `403` | `AuthGuard` / `RolesGuard`, sin cambios |

**Fundamento del reparto 400 vs 409**: `400` cuando el valor es inaceptable **por sí mismo**, sin
mirar la fila (`bloqueado` nunca es un destino válido de este módulo); `409` cuando el request está
bien formado y lo que lo impide es el **estado actual del recurso** (ya existe un DNI igual, la fila
está bloqueada, el usuario no es estudiante). `422` queda descartado: el proyecto no lo usa en
ninguna ruta y no aporta nada sobre `400` sin un validador declarativo detrás.

**P2002 residual**: la precomprobación de unicidad no elimina la carrera entre el `SELECT` y el
`INSERT`. El `create` va dentro de un `try/catch` que traduce `P2002` al **mismo** `409
CAMPO_DUPLICADO`, derivando `campo` de `error.meta.target` — precedente literal del `catch` de
`crearSesionOAuth()` en #5. Ninguna violación de constraint escapa como `500`.

Las claves `codigo` viven en `apps/backend/src/users/users.errors.ts` (constante `as const` +
union type), local al módulo: no se refactoriza `auth` ni se crea un catálogo global de errores.

### D3 — Estructura de `UsersModule`: dos controladores, un servicio por agregado

```
apps/backend/src/users/
├── users.module.ts            imports: [AuthModule, AuditoriaModule]; providers: [PrismaService, …]
├── users.controller.ts        @Controller('usuarios')
├── apoderados.controller.ts   @Controller('usuarios/:usuarioId/apoderados')
├── users.service.ts           validación + escritura + auditoría de Usuario
├── apoderados.service.ts      idem Apoderado, incluida la guarda rol='estudiante'
├── users.errors.ts            claves `codigo` de D2
└── dto/  crear-usuario.dto.ts · actualizar-usuario.dto.ts · cambiar-estado-usuario.dto.ts
       listar-usuarios.query.ts · usuario-respuesta.dto.ts
       crear-apoderado.dto.ts · actualizar-apoderado.dto.ts · apoderado-respuesta.dto.ts
```

DTO como clases con `@ApiProperty` únicamente (sin `class-validator`), igual que los DTO de #5/#6.

**Dos controladores, no uno**: `@Controller('usuarios/:usuarioId/apoderados')` deja el anidamiento
en el decorador en vez de repetir el prefijo en cuatro handlers, y evita que el CRUD de `Usuario`
quede sepultado bajo ocho rutas en un solo archivo. Ambos se registran en el mismo `UsersModule`
(un solo `@Roles('administrador','director')` + `@UseGuards(AuthGuard, RolesGuard)` a nivel de
clase en cada uno), lo que satisface el aislamiento de `comite` por construcción.

**Dos ajustes de wiring, ambos aditivos y obligatorios**:

1. `AuthModule` gana `exports: [SessionService]`. `AuthGuard` se instancia en el contexto del módulo
   que declara el controlador, así que sin ese export `UsersModule` no puede resolverlo. La
   alternativa —redeclarar `SessionService` + `redisProvider` en `UsersModule`— crearía un segundo
   cliente Redis y una segunda instancia de sesiones. Descartada.
2. `UsersModule implements NestModule` y aplica `cookieParser()` a sus dos controladores. `AuthModule`
   lo aplica con `.forRoutes(AuthController)` (D6 de #4: middleware de módulo, nunca en `main.ts`);
   sin esta línea `request.cookies` sería `undefined` y **toda** ruta de este módulo respondería
   `401`. Dos instancias de `cookie-parser` sobre rutas disjuntas no interfieren.

`AppModule.imports` += `UsersModule`. Ningún provider abre conexión al instanciarse, así que
`src/openapi.ts` sigue extrayendo el contrato sin Postgres ni Redis vivos (gotcha D1 de #1).

### D4 — Claves de auditoría: siete, aditivas, fuera del `WHEN` de ADR-0016

**Elección** (aditivas en `apps/backend/src/auditoria/audit-event-types.ts`):

| Evento | actor | entity_type / entity_id | payload |
|---|---|---|---|
| `USUARIO_CREADO` | `userId` admin/director | `Usuario` / `usuario.id` | `{ rol, origen: 'manual' \| 'idempotente' }` |
| `USUARIO_ACTUALIZADO` | idem | `Usuario` / `usuario.id` | `{ campos: ['nombres','correo', …] }` |
| `USUARIO_DESACTIVADO` | idem | `Usuario` / `usuario.id` | `{ estado_anterior: 'activo' }` |
| `USUARIO_REACTIVADO` | idem | `Usuario` / `usuario.id` | `{ estado_anterior: 'inactivo' }` |
| `APODERADO_CREADO` | idem | `Apoderado` / `apoderado.id` | `{ usuario_id }` |
| `APODERADO_ACTUALIZADO` | idem | `Apoderado` / `apoderado.id` | `{ usuario_id, campos: [...] }` |
| `APODERADO_ELIMINADO` | idem | `Apoderado` / `apoderado.id` | `{ usuario_id, nombres, dni }` |

**Verificación de no-ruptura**: la cláusula versionada de ADR-0016 es
`FOR EACH ROW WHEN (NEW.event_type IN ('VOTO','RECHAZO'))`
(`prisma/migrations/20260807052206_append_only_audit/migration.sql:81`). Ninguno de los siete
eventos toca un `Voto`, así que la obligación de ADR-0016 no se activa: el cambio es un objeto
`as const` más grande y **cero SQL**. Sin migración nueva.

**`DESACTIVADO`/`REACTIVADO` como dos claves** (y no una `USUARIO_ESTADO_CAMBIADO` con `motivo` en
el payload, como sí hizo #6 con `CUENTA_DESBLOQUEADA`): #6 unificó dos **vías** de la *misma*
transición; aquí son transiciones **opuestas**, y el precedente para direcciones contrarias ya es
dos claves (`CUENTA_BLOQUEADA`/`CUENTA_DESBLOQUEADA`).

**Payload sin valores personales, salvo en el borrado físico**: `USUARIO_ACTUALIZADO` registra los
**nombres de campo** modificados, no sus valores. El stream de ADR-0010 es append-only: copiar DNI y
correo dentro de él crea una réplica de datos personales que nunca se puede corregir ni borrar, y la
fila `Usuario` sigue siendo consultable. La excepción es `APODERADO_ELIMINADO`: el `DELETE` es
físico y destruye la única copia, así que sin `nombres`/`dni` el evento sería inauditable.

### D5 — Gancho para #9: un clasificador de colisión, dos políticas

**Elección**: `UsersService` expone dos entradas sobre **una sola** implementación de validación.

```ts
// Núcleo compartido: única fuente de verdad de la unicidad. No lanza; clasifica.
type Colision =
  | { tipo: 'sin_colision' }
  | { tipo: 'coincidencia_exacta'; usuario: Usuario }   // misma fila para dni Y codigo
  | { tipo: 'conflicto'; campo: 'dni' | 'codigo' | 'correo' };

private async clasificarColision(
  tx: Prisma.TransactionClient, datos: DatosUsuario, excluirId?: string,
): Promise<Colision>;

// Camino HTTP (POST /usuarios): cualquier colisión, incluida la exacta, es 409 CAMPO_DUPLICADO.
async crear(datos: DatosUsuario, actorId: string): Promise<UsuarioRespuesta>;

// Gancho de #9 (importación de Excel, fila a fila). Sin HTTP, sin archivos.
async crearIdempotente(
  datos: DatosUsuario, actorId: string, tx?: Prisma.TransactionClient,
): Promise<{ usuario: UsuarioRespuesta; creado: boolean }>;
```

**Dónde vive**: `apps/backend/src/users/users.service.ts`, público en la clase (no en el
controlador), sin dependencia de `Request`, `Express` ni de ningún artefacto HTTP. `tx` opcional:
si llega, la escritura y su `AuditoriaService.log(tx, ...)` corren dentro de la transacción del
llamador (#9 podrá agrupar N filas o una por fila); si no llega, el método abre su propio
`this.prisma.$transaction`, como `desbloquearManual()` de #6.

**Qué garantiza**:

1. **Idempotencia por el par (`dni`, `codigo`)**: si ambos apuntan a la *misma* fila existente,
   devuelve `{ creado: false }` sin escribir ni auditar. Repetir la importación no duplica.
2. **Nunca reasigna identidad**: si `dni` y `codigo` apuntan a filas *distintas*, o solo uno
   coincide, o el `correo` pertenece a otra fila, lanza `409 CAMPO_DUPLICADO` con el campo exacto.
   Un upsert ciego —actualizar la fila hallada por `dni`— podría reescribir el `codigo` de un
   usuario real desde una celda de Excel mal tipeada; por eso el método **no actualiza jamás**.
3. **Cero duplicación de validación**: `crear()` y `crearIdempotente()` difieren únicamente en cómo
   mapean `coincidencia_exacta` (409 vs. no-op). Toda la unicidad, el formato de correo y el máximo
   de 20 caracteres de `dni` viven una sola vez.
4. **Convergencia bajo carrera**: si un `P2002` escapa igual, se reclasifica; `coincidencia_exacta`
   ⇒ `{ creado: false }`, cualquier otra ⇒ `409`. Nunca `500`.

### D7 — Login rechaza `estado = 'inactivo'`, simétrico a `bloqueoVigente()`

**Elección**: en `AuthService.login()` y `AuthService.loginConGoogle()`
(`apps/backend/src/auth/auth.service.ts`), se agrega la guarda `usuario.estado === 'inactivo'` en
el mismo punto donde hoy se evalúa `bloqueoVigente(usuario)`, con el mismo resultado
(`401 UnauthorizedException('Credenciales inválidas')`, sin distinguir causa en el body).

```ts
// login(): línea 71, guarda combinada existente
if (!usuario || !usuario.password_hash || !passwordValida || bloqueoVigente(usuario)
    || usuario.estado === 'inactivo') { … }

// determinarMotivoFallo(): nueva rama antes del fallback 'usuario_bloqueado'
if (usuario.estado === 'inactivo') return 'usuario_inactivo';

// loginConGoogle(): nuevo bloque, mismo lugar que el chequeo de bloqueoVigente (línea ~137)
if (usuario.estado === 'inactivo') {
  await this.auditarLoginOAuthFallido(correo, usuario.id, 'usuario_inactivo');
  throw new UnauthorizedException('Credenciales inválidas');
}
```

**Por qué reutilizar el evento de auditoría existente en vez de una clave nueva**: `LOGIN_FALLIDO`
y `LOGIN_OAUTH_FALLIDO` (de #4/#5) ya llevan `motivo` como campo del payload — agregar
`'usuario_inactivo'` a `MotivoLoginFallido`/`MotivoLoginOAuthFallido` es aditivo al tipo, sin tocar
`AUDIT_EVENT_TYPES` ni el trigger de ADR-0016 (D4 de este mismo diseño).

**Por qué no contabiliza para el bloqueo por fuerza bruta**: `contable` en `login()` ya exige
`motivo === 'password_incorrecta'`; con `motivo = 'usuario_inactivo'` la condición es `false` sin
tocar esa línea, así que `registrarFallo()` recibe `null` — mismo comportamiento que hoy tiene un
`usuario_bloqueado`. Contar reintentos contra una cuenta que un administrador ya dio de baja
mezclaría dos ejes de estado distintos (`bloqueado` de `#6` vs. `inactivo` de `#7`).

**Orden de las guardas**: `estado === 'inactivo'` se evalúa junto a `bloqueoVigente()`, nunca antes
del chequeo de contraseña — se preserva el argumento anti-oráculo de D3/#4 (`PasswordService.verificar()`
corre siempre, incluso contra el hash señuelo).

**Alcance**: esta guarda cubre `login()` y `loginConGoogle()`. No revoca sesiones ya abiertas por sí
sola — eso ya lo cubre D6 al desactivar. La combinación de D6 (revocar al desactivar) + D7 (rechazar
en el próximo intento de login) cierra el hueco que #6 le dejó explícitamente a #7.

### D6 — La desactivación revoca las sesiones activas

`PATCH /usuarios/:id/estado` con destino `inactivo` llama a `sessionService.revokeAllForUser(id)`
**después** del commit, solo si la fila cambió — patrón D7 de #4 y #6, literal. Sin esto una baja
administrativa no interrumpiría la sesión abierta del usuario dado de baja. `SessionService` ya
queda accesible por el `exports` de D3. Ver la primera pregunta abierta: la revocación sola no
cierra el hueco completo.

## Flujo de datos — alta de usuario

    Cliente   UsersController(AuthGuard,RolesGuard,@Roles(admin,director))   UsersService   Prisma
      │ POST api/usuarios {nombres,dni,codigo,correo,rol}   │                    │            │
      │────────────────────────────────────────────────────>│──crear(datos, actorId)────────>│
      │                                                     │  validar formato/longitud ⇒ 400 CAMPO_INVALIDO
      │                                                     │  $transaction:      │            │
      │                                                     │    clasificarColision(tx) ⇒ 409 CAMPO_DUPLICADO
      │                                                     │    create(password_hash:null, estado:'activo') ─>│
      │                                                     │    log(tx, USUARIO_CREADO, actorId, 'Usuario', id)
      │                                                     │    catch P2002 ⇒ 409 CAMPO_DUPLICADO (mismo body)
      │<────────────── 201 UsuarioRespuestaDto ─────────────│                    │            │

## Flujo de datos — cambio de estado

    Cliente   UsersController   UsersService                     Prisma        SessionService
      │ PATCH api/usuarios/{id}/estado {estado:'inactivo'}│           │              │
      │─────────────────────────>│──cambiarEstado(id, destino, actorId)─>│           │
      │                          │  destino ∉ {activo,inactivo} ⇒ 400 ESTADO_DESTINO_NO_PERMITIDO
      │                          │  $transaction:            │           │              │
      │                          │    findUnique ⇒ null ⇒ 404 │           │              │
      │                          │    estado==='bloqueado' ⇒ 409 TRANSICION_DESDE_BLOQUEADO
      │                          │    updateMany({id, estado:{in:['activo','inactivo']}} → destino)>│
      │                          │    count===1 ⇒ log USUARIO_DESACTIVADO | USUARIO_REACTIVADO
      │                          │  commit → destino==='inactivo' && count===1 ⇒ revokeAllForUser ─>│
      │<── 200 {id, estado} ─────│                           │           │              │

El `where` del `updateMany` reevalúa `estado` en la escritura (READ COMMITTED, mismo argumento que
D2 de #6): un bloqueo de #6 que ocurra entre la lectura y el `UPDATE` gana, y este módulo devuelve
`count = 0` sin auditar ni revocar en vez de pisarlo.

## Contratos HTTP

Todas bajo el prefijo global `api`, todas con `@UseGuards(AuthGuard, RolesGuard)` y
`@Roles('administrador','director')`; `:id`/`:apoderadoId` vía `ParseUUIDPipe`.

| Método | Ruta | Entrada | Respuestas |
|---|---|---|---|
| POST | `usuarios` | `CrearUsuarioDto` | `201 UsuarioRespuestaDto` / `400` / `409` / `401` / `403` |
| GET | `usuarios` | query `rol?`, `estado?` | `200 UsuarioRespuestaDto[]` (arreglo desnudo, `orderBy codigo asc`) / `400` filtro inválido |
| GET | `usuarios/:id` | — | `200 UsuarioRespuestaDto` / `404` |
| PATCH | `usuarios/:id` | `ActualizarUsuarioDto` (**sin** `estado`) | `200 UsuarioRespuestaDto` / `400` / `409` / `404` |
| PATCH | `usuarios/:id/estado` | `{ estado: 'activo' \| 'inactivo' }` | `200 { id, estado }` / `400` / `409` / `404` |
| POST | `usuarios/:usuarioId/apoderados` | `CrearApoderadoDto` | `201 ApoderadoRespuestaDto` / `409 USUARIO_NO_ES_ESTUDIANTE` / `404` |
| GET | `usuarios/:usuarioId/apoderados` | — | `200 ApoderadoRespuestaDto[]` (vacío es válido) |
| PATCH | `usuarios/:usuarioId/apoderados/:apoderadoId` | `ActualizarApoderadoDto` | `200` / `404` / `409` |
| DELETE | `usuarios/:usuarioId/apoderados/:apoderadoId` | — | `204` (borrado físico) / `404` / `409` |

```ts
class UsuarioRespuestaDto {
  id: string; nombres: string; dni: string; codigo: string; correo: string;
  rol: RolUsuario; estado: EstadoUsuario; creado_en: string; // ISO 8601
}                        // nunca password_hash ni google_id: material de credencial
class ApoderadoRespuestaDto { id: string; nombres: string; dni: string; correo: string | null; }
```

No hay `DELETE` sobre `usuarios/:id` en ninguna forma: la baja lógica es D1.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/src/users/**` (13 archivos de D3) | Crear | Módulo, 2 controladores, 2 servicios, catálogo de errores, 8 DTO |
| `apps/backend/src/app.module.ts` | Modificar | `UsersModule` en `imports` |
| `apps/backend/src/auth/auth.module.ts` | Modificar | `exports: [SessionService]` (aditivo, D3) |
| `apps/backend/src/auth/auth.service.ts` | Modificar | Guarda `estado==='inactivo'` en `login()`/`loginConGoogle()`, nueva rama en `determinarMotivoFallo()`, `'usuario_inactivo'` en ambos tipos `Motivo*` (D7) |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | Aditivo: las 7 claves de D4 + comentario de trazabilidad, como #4/#5/#6 |
| `apps/backend/test/users/*.e2e-spec.ts`, `src/users/*.spec.ts` | Crear | Ver estrategia de pruebas |
| `packages/contracts/openapi.json` + tipos | Regenerar | `pnpm generate:contracts` tras cerrar los controladores |

Sin cambios en `schema.prisma` ni migraciones nuevas.

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit | `clasificarColision()`: sin colisión, exacta, parcial por `dni`, por `codigo`, por `correo`, con `excluirId` en edición; validadores de `dni` (20 vs 21 chars, no numérico) y de formato de correo; mapeo `P2002 → campo` | Jest puro, sin base |
| Integración | `crear()` vs `crearIdempotente()` sobre el mismo core: la exacta da `409` en una y `{creado:false}` en la otra; `crearIdempotente` con `tx` externo participa de la transacción del llamador y no audita si no creó | Postgres de `docker-compose.test.yml` |
| E2E | Alta con los 5 roles (`password_hash=null`, `estado='activo'`, 1 fila `USUARIO_CREADO`); listado filtrado por `rol`+`estado`; `PATCH` de datos básicos; `PATCH /estado` desactiva/reactiva y revoca sesiones; CRUD de apoderados sobre estudiante; `DELETE` físico verificado por consulta directa; `403` para `comite` en las 9 rutas; `director` ≡ `administrador`; `POST /auth/login` y login por Google OAuth contra un `Usuario` `estado='inactivo'` devuelven `401` sin crear sesión y sin incrementar el contador de bloqueo (D7) | `supertest` + `Test.createTestingModule` |
| Adversarial (RED obligatorio) | `estado='bloqueado'` en el body ⇒ `400`, fila `bloqueado` ⇒ `409`, y en ambos casos `Usuario.estado` **no cambia**; `PATCH /usuarios/:id` con `estado` en el body lo ignora (no está en el DTO) y no altera el estado; dos altas concurrentes con el mismo DNI ⇒ exactamente una fila y un `409`, nunca `500`; `/apoderados` sobre un `docente` ⇒ `409` sin escritura; `:id` inexistente ⇒ `404`, malformado ⇒ `400`; ningún response incluye `password_hash` ni `google_id` | `Promise.all` sobre supertest / Prisma |
| Contrato | El `WHEN` del trigger de ADR-0016 sigue siendo `IN ('VOTO','RECHAZO')` tras agregar las 7 claves | `test/schema/auditoria.spec.ts` (patrón de #2/#3) |

## Matriz de amenazas

N/A — este change no toca enrutamiento de comandos, shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos. Sus casos adversarios (escalada de
privilegio vía `estado`, fuga de material de credencial en las respuestas, carrera de unicidad,
apoderado sobre no-estudiante) están en D1/D2/D5 y en la fila "Adversarial" de la tabla anterior.

## Migración / rollout

Sin migración de datos, sin backfill y sin feature flag: el módulo es puramente aditivo y ninguna
ruta existente cambia de comportamiento. Los dos únicos toques fuera de `src/users/` —el `exports`
de `AuthModule` y las claves de `AUDIT_EVENT_TYPES`— son aditivos y no alteran ninguna ruta actual.
Rollback: `git revert` del merge; no queda estado persistido que deshacer más allá de las filas de
`Usuario`/`Apoderado` creadas, que sobreviven al revert sin romper nada (`AUDIT_EVENT_TYPES` es solo
tipado en TypeScript, no una restricción en la base). Regenerar `packages/contracts` es obligatorio
en el mismo PR que cierra los controladores.

## Preguntas abiertas

- [x] **`estado='inactivo'` sigue pudiendo iniciar sesión** — resuelto: ver D7. `login()` y
      `loginConGoogle()` ahora rechazan `estado='inactivo'` igual que `bloqueoVigente()`, con
      requisito y escenarios agregados a la spec. D6 (revocar sesiones) + D7 (rechazar el próximo
      login) cierran el hueco que #6 le había dejado explícitamente a #7.
- [ ] **CSRF** — abierta desde #4/#5/#6. Este change agrega siete rutas autenticadas que mutan
      estado de negocio; `sameSite: 'lax'` sigue siendo la única defensa.
- [ ] **Sin paginación en `GET /usuarios`** — arreglo desnudo, coherente con el listado de #6. A
      escala de padrón institucional completo (#13) puede requerir revisión.
- [ ] **`Apoderado.dni` no es único en el esquema** — dos apoderados del mismo estudiante podrían
      registrarse con el mismo DNI. Ni la propuesta ni la spec lo prohíben; el diseño no inventa la
      restricción. Si se decidiera prohibirlo, sería una validación de aplicación (no una migración)
      para no romper filas ya existentes.
