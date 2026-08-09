# Design: Configuración general de la institución

## Technical Approach

Se extiende el singleton `Configuracion` (`clave='institucional'`) con columnas aditivas y se
introduce un módulo dividido en dos capas para evitar un ciclo de DI: `ConfiguracionLecturaModule`
(solo `PrismaService` + `ConfiguracionLecturaService`, sin controlador, sin importar `AuthModule`)
y `ConfiguracionModule` (controlador + escritura auditada). `AuthModule` y `EmailModule` importan
únicamente el módulo de lectura, así que el grafo queda acíclico y ningún provider abre Postgres,
SMTP ni red al instanciarse: `pnpm openapi:extract` sigue corriendo sin infraestructura viva.

```
        ConfiguracionLecturaModule        (PrismaService + ConfiguracionLecturaService)
         ▲              ▲              ▲
    EmailModule    AuthModule    ConfiguracionModule
   (EMAIL_SENDER) (GoogleOauth)  (controller + AuditoriaModule + AuthModule + UsersModule)
```

## Architecture Decisions

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Modelo de datos | Extender `Configuracion` con los nombres de columna literales del spec (`nombre`, `director`, `logo`, `logo_mime`, `color_primario`, `color_secundario`, `zona_horaria`, `dominios_google`); `anio_escolar_id` sigue `NOT NULL` apuntando al año activo | Tabla `Institucion` separada (vetada por el usuario); FK nullable; renombrar a `nombre_institucion`/`director_nombre` | Migración aditiva pura; la FK ya existe y `AniosEscolaresService.eliminar()` depende de esa guarda de integridad. Los nombres del spec no colisionan con las columnas vigentes de `Configuracion` (`id`, `clave`, `anio_escolar_id`, `smtp_*`, `actualizado_en`), así que un prefijo desambiguador no aporta nada y desalinearía spec, schema, DTOs y contrato OpenAPI |
| D2 | Acoplamiento de `GoogleOauthService` | Inyecta `ConfiguracionLecturaService`; `dominiosPermitidos()` pasa a `async` y consulta en tiempo de request | Inyectar `PrismaService` directo; leer en `onModuleInit` | Mantiene fail-closed y construcción perezosa (patrón `googleOauthClientProvider`/`PrismaService`). Un error de DB o lista vacía ⇒ `UnauthorizedException`, nunca 500 ni excepción de arranque |
| D3 | Selección de transporte de correo | `ConfiguracionEmailSender` implementa `EmailSender` y decide `Smtp` vs `Console` **dentro de `send()`**, leyendo `smtp_host/puerto/remitente` de DB | Mantener la decisión en la `useFactory` de `emailSenderProvider` | La factory corre al instanciar el módulo; consultar DB ahí rompería `src/openapi.ts`. Mover la rama a `send()` preserva el patrón perezoso y no cambia la interfaz `EMAIL_SENDER` |
| D4 | Secreto SMTP | `SMTP_PASSWORD`/`SMTP_USER` siguen en env var | Columna en `Configuracion` | Restricción heredada del seed de #2; la tabla nunca almacena secretos |
| D5 | Storage del logo | `Bytes` (`bytea`) en `Configuracion.logo` + `logo_mime` + `logo_actualizado_en` | Volumen Docker; S3/MinIO | Sin infraestructura nueva; ≤2 MB no presiona la tabla; el backup de Postgres ya cubre el archivo |
| D6 | Sin caché de configuración | Una consulta por verificación OAuth y por envío de correo | Caché TTL en memoria/Redis | Revocar un dominio Google debe surtir efecto inmediato; una ventana de staleness en una allowlist de acceso es un riesgo de seguridad. El volumen (logins/correos) no justifica la caché |
| D7 | `director` | Columna de texto `director` (`String?`) | FK a `Usuario` con `rol='director'` | El dato se imprime en actas/reportes; el rol de aplicación puede estar en varios usuarios o en ninguno. Migrar a FK después es aditivo |
| D8 | Fuente única | Tras la migración, DB es la única fuente de dominios/SMTP; sin fallback silencioso a env | Fallback `env ?? DB` | Un fallback invisible dejaría el control de acceso fuera de auditoría, que es el objetivo del change. El rollback es revertir el commit de código |
| D9 | Auditoría | Tres claves aditivas en `audit-event-types.ts`, emitidas con `auditoria.log(tx, ...)` dentro de la misma `$transaction` | Un solo evento genérico | El cambio de dominios Google necesita payload `antes`/`después` completo; el resto solo `campos: [...]` (patrón `anios-escolares`). Ninguna toca `Voto`, así que no activan la obligación de ADR-0016 |

## Data Flow

```
PUT /configuracion ─→ AuthGuard ─→ RolesGuard(@Roles administrador,director)
   └→ ConfiguracionService.actualizar(dto, actorId)
        └─ prisma.$transaction(tx):
             1. tx.configuracion.findUnique({ clave:'institucional' })
             2. validar (hex, IANA, dominios) y calcular camposModificados
             3. tx.configuracion.update(...)
             4. auditoria.log(tx, CONFIGURACION_*, actorId, 'Configuracion', id, payload)
```

```
POST /auth/google ─→ AuthService ─→ GoogleOauthService.verificar(idToken)
        └→ ConfiguracionLecturaService.dominiosGooglePermitidos()  (findUnique)
             └─ [] o error de DB ──→ UnauthorizedException (fail-closed)
             └─ hd ∈ dominios ────→ payload validado
```

```
RecoveryService ─→ EMAIL_SENDER.send() ─→ ConfiguracionEmailSender
        └→ ConfiguracionLecturaService.smtp()  (findUnique, en send(), no al arrancar)
             └─ smtp_host null ──→ ConsoleEmailSender
             └─ smtp_host set ───→ new SmtpEmailSender({ ...db, password: env })
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modify | Columnas aditivas en `Configuracion` |
| `apps/backend/prisma/migrations/*_configuracion_institucional/migration.sql` | Create | `ALTER TABLE` aditivo + limpieza del placeholder `smtp_host` |
| `apps/backend/prisma/seed.ts` | Modify | `smtp_host: null` en `create`; valores institucionales por defecto |
| `apps/backend/src/configuracion/configuracion-lectura.service.ts` | Create | Lectura del singleton: `obtener()`, `smtp()`, `dominiosGooglePermitidos()` |
| `apps/backend/src/configuracion/configuracion-lectura.module.ts` | Create | Módulo sin controlador; `providers: [PrismaService, ConfiguracionLecturaService]`, exporta el servicio |
| `apps/backend/src/configuracion/configuracion.service.ts` | Create | Escritura transaccional + auditoría |
| `apps/backend/src/configuracion/configuracion.controller.ts` | Create | GET/PUT, logo, comité; guards a nivel de clase |
| `apps/backend/src/configuracion/configuracion.module.ts` | Create | `imports: [AuthModule, AuditoriaModule, UsersModule, ConfiguracionLecturaModule]` |
| `apps/backend/src/configuracion/configuracion.errors.ts` | Create | Códigos de error del módulo |
| `apps/backend/src/configuracion/dto/*.ts` | Create | `ActualizarConfiguracionDto`, `ConfiguracionRespuestaDto`, `LogoRespuestaDto` |
| `apps/backend/src/auth/google-oauth.service.ts` | Modify | `dominiosPermitidos()` async desde DB |
| `apps/backend/src/auth/auth.module.ts` | Modify | `imports: [..., ConfiguracionLecturaModule]` |
| `apps/backend/src/email/configuracion-email-sender.ts` | Create | `EmailSender` que resuelve config en `send()` |
| `apps/backend/src/email/email.module.ts` | Modify | `emailSenderProvider` devuelve `ConfiguracionEmailSender`; importa `ConfiguracionLecturaModule` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modify | 3 claves aditivas |
| `apps/backend/src/app.module.ts` | Modify | Registrar `ConfiguracionModule` al final |
| `packages/contracts/openapi.json` | Modify | Regenerar contrato |

## Interfaces / Contracts

```prisma
model Configuracion {
  // ... columnas existentes sin cambios
  nombre              String?
  director            String?
  color_primario      String?   // #RRGGBB o #RGB
  color_secundario    String?   // #RRGGBB o #RGB
  zona_horaria        String?   // IANA, p. ej. America/Lima
  dominios_google     String[]  @default([])   // text[] NOT NULL DEFAULT '{}'
  logo                Bytes?    // bytea
  logo_mime           String?
  logo_actualizado_en DateTime? @db.Timestamptz(3)
}
```

```typescript
export interface ConfiguracionSmtp { host: string; puerto: number; remitente: string }

@Injectable()
export class ConfiguracionLecturaService {
  constructor(private readonly prisma: PrismaService) {}       // sin conexión al construir
  obtener(): Promise<Configuracion | null>;
  smtp(): Promise<ConfiguracionSmtp | null>;                    // null ⇒ ConsoleEmailSender
  dominiosGooglePermitidos(): Promise<string[]>;                // [] ⇒ fail-closed
}
```

| Ruta | Guards | Respuesta |
|---|---|---|
| `GET /configuracion` | `AuthGuard`+`RolesGuard` `@Roles('administrador','director')` | `ConfiguracionRespuestaDto` (sin bytes del logo: `logo_presente`, `logo_mime`) |
| `PUT /configuracion` | idem | `ConfiguracionRespuestaDto`; body con todos los campos opcionales (merge parcial, sin cambio ⇒ sin auditoría) |
| `POST /configuracion/logo` | idem, `multipart/form-data` | `LogoRespuestaDto` |
| `GET /configuracion/logo` | idem | `StreamableFile` con `logo_mime`, `nosniff`, CSP restrictiva; `404` si no hay logo |
| `GET /configuracion/comite` | idem, solo lectura | `UsuarioRespuestaDto[]` — delega en `UsersService.listar({ rol: 'comite' })` |

Validaciones (manuales, sin `class-validator`, patrón vigente): color
`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$` — el spec acepta forma corta `#RGB` **y** larga `#RRGGBB`, y se
persiste el literal recibido sin expandir `#RGB` a 6 dígitos; zona horaria
contra `Intl.supportedValuesOf('timeZone')` (sin dependencia nueva); dominios normalizados
`trim().toLowerCase()`, deduplicados y validados por regex de hostname. Fallo ⇒ `400 CAMPO_INVALIDO`.

Logo: `FileInterceptor('logo', { fileFilter, limits: { fileSize: 2*1024*1024 } })`, interfaz local
`ArchivoMulter` (nunca `Express.Multer.File`), allowlist de extensión `/\.(png|jpe?g|svg)$/i` **y**
de MIME (`image/png`, `image/jpeg`, `image/svg+xml`) — patrón de `importacion.controller.ts`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `ConfiguracionLecturaService` (fila ausente ⇒ `null`/`[]`); `GoogleOauthService` fail-closed con DB caída, `[]` y `hd` fuera de lista; `ConfiguracionEmailSender` elige Console/Smtp según DB; validadores de color (`#1A2B3C` y `#abc` aceptados; `azul`, `#12345`, `#1A2B3G` rechazados), IANA y dominio; `filtroArchivoLogo` | Jest con `PrismaService` y `ConfiguracionLecturaService` mockeados; `overrideProvider` para `GOOGLE_OAUTH_CLIENT` |
| Integration | `ConfiguracionService.actualizar()` audita en la misma `$transaction` (rollback ⇒ sin fila de auditoría); logo round-trip `bytea`; migración compatible con la fila semilla | Suite Postgres existente + `test/auditoria-transaccional.e2e-spec.ts` |
| E2E | `401` sin cookie, `403` con rol `comite`/`docente`/`estudiante`, `200` con `administrador`/`director` en las 5 rutas; upload `>2 MB` ⇒ `400`; `.exe`/`.gif` ⇒ `400`; `GET /configuracion/comite` solo devuelve `rol='comite'` | `Test.createTestingModule(AppModule)` + supertest, patrón de los e2e vigentes |
| Contract | `pnpm openapi:extract` corre **sin Postgres ni Redis** tras el cambio | Job de CI existente — guarda de regresión de D2/D3 |

## Threat Matrix

| Boundary | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Clasificación de archivo activo (fila "documentation-like paths" adaptada) | SVG con `<script>`/`onload`; `logo.png.svg`; MIME `image/png` con bytes SVG; archivo de 0 bytes; `>2 MB` | **Applicable** — el logo acepta SVG, contenido activo servido desde el mismo origen | Allowlist doble (extensión + MIME) evaluada en `fileFilter` antes de tocar la DB; `GET /configuracion/logo` responde con `X-Content-Type-Options: nosniff`, `Content-Type` exacto persistido y `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, de modo que un SVG malicioso no ejecuta script en el origen de la app; rechazo ⇒ `400`, nunca `500` | Un test por clase: SVG con script (aceptado como archivo pero servido con CSP verificada en la respuesta), doble extensión, MIME/contenido discrepantes, tamaño excedido, archivo ausente |
| Selección de repositorio Git | — | N/A: el change no ejecuta Git | — | — |
| Estado de commit | — | N/A: sin automatización de commits | — | — |
| Estado de push | — | N/A: sin automatización de push | — | — |
| Comandos de PR | — | N/A: sin automatización de PR | — | — |

Sin shell, subprocesos ni integración de procesos: el único límite adversarial nuevo es la subida
y el servido del logo.

## Migration / Rollout

### Contenido de la migración

1. `ALTER TABLE "Configuracion"` aditivo: todas las columnas nuevas nullable salvo
   `dominios_google text[] NOT NULL DEFAULT '{}'`. La fila semilla `clave='institucional'`
   sobrevive sin tocarse (verificado por test de integración).
2. Paso de datos acotado en la misma migración:
   `UPDATE "Configuracion" SET smtp_host = NULL WHERE clave = 'institucional' AND smtp_host = 'smtp.seei.local';`
   — sin él, los entornos ya sembrados intentarían SMTP contra un host de marcador de posición en
   vez de caer a `ConsoleEmailSender`.

### Runbook de despliegue (orden OBLIGATORIO — `sdd-tasks` MUST emitir esto como tarea explícita)

El orden no es negociable: `dominios_google` arranca en `'{}'` y D2 es fail-closed, así que
desplegar el código antes del backfill **bloquea TODO login Google Workspace** (incluido el del
administrador que debería arreglarlo). Cada paso es verificable antes de pasar al siguiente.

| # | Paso | Comando / acción | Verificación de salida |
|---|---|---|---|
| R1 | Migrar | `pnpm prisma migrate deploy` | Columnas nuevas presentes; fila `clave='institucional'` intacta |
| R2 | Backfill de `dominios_google` **y** SMTP | `UPDATE "Configuracion" SET dominios_google = string_to_array(current_setting('...'), ','), smtp_host = ..., smtp_puerto = ..., smtp_remitente = ... WHERE clave = 'institucional';` con los valores vigentes de `GOOGLE_HOSTED_DOMAINS`/`SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` | `SELECT dominios_google, smtp_host FROM "Configuracion" WHERE clave='institucional';` devuelve un arreglo **no vacío** y el host real. Si `dominios_google` sale vacío, DETENERSE — no continuar a R3 |
| R3 | Desplegar código | Deploy del backend con `GoogleOauthService`/`EmailModule` leyendo de DB | Smoke test: un login Google Workspace real tiene éxito; un envío de recuperación usa el host de DB |
| R4 | Retirar env vars | Eliminar `GOOGLE_HOSTED_DOMAINS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` del entorno. `SMTP_USER`/`SMTP_PASSWORD` **permanecen** (D4) | Reinicio del proceso sin esas vars: login y correo siguen funcionando (prueba de que D8 no dejó fallback oculto) |

Ejecutar R4 antes de R3 no rompe nada (el código nuevo ya no las lee), pero ejecutar R3 antes de
R2 es el modo de fallo crítico de este change.

### Rollback y corte de entrega

1. Rollback: revertir el commit de código restaura la lectura de env var (por eso R4 se ejecuta
   último y las env vars se conservan documentadas hasta cerrar el change); la migración `down`
   elimina solo columnas nuevas y no toca `smtp_host/puerto/remitente`.
2. Corte de PR sugerido para `sdd-tasks`: (PR1) migración + seed + `ConfiguracionLecturaModule`;
   (PR2) `ConfiguracionModule` GET/PUT + auditoría + comité; (PR3) logo; (PR4) corte de
   `GoogleOauthService` y `EmailModule` — **PR4 no se despliega sin R2 ejecutado** (es el paso R3
   del runbook). Cada slice supera con holgura el presupuesto de 400 líneas si se entrega junto.

## Open Questions

- [ ] Branding previo al login: `GET /configuracion/logo` queda tras `AuthGuard`. Post-login
      `<img src="/configuracion/logo">` funciona (cookie same-origin), pero la pantalla de login
      no puede mostrar logo/colores. ¿Se requiere un `GET /configuracion/publica` sin guards
      (expondría solo nombre, colores y logo, nunca SMTP ni dominios)? Fuera del alcance de la
      propuesta aprobada; decidir antes de la UI.
- [ ] `director` como texto libre (D7): confirmar que ningún flujo posterior necesita la
      identidad del `Usuario` director (firma de actas, notificaciones).
