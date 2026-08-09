# Exploración: configuracion-general (Backlog #10)

## 1. ¿Existe ya una entidad "Institución" o tabla de configuración global?

**Sí, parcialmente.** `apps/backend/prisma/schema.prisma` ya define:

```prisma
model Configuracion {
  id              String   @id @default(uuid()) @db.Uuid
  clave           String   @unique
  anio_escolar_id String   @db.Uuid
  smtp_host       String?
  smtp_puerto     Int?
  smtp_remitente  String?
  actualizado_en  DateTime @default(now()) @db.Timestamptz(3)

  anioEscolar AnioEscolar @relation(fields: [anio_escolar_id], references: [id], onDelete: Restrict)
}
```

Esto fue creado deliberadamente en `base-schema-and-migrations` (design.md, decisión D7) como **singleton institucional** — sin ninguna columna de secreto SMTP a propósito. `apps/backend/prisma/seed.ts` (líneas 102-115) ya siembra la única fila esperada: `clave: 'institucional'`, con `smtp_host/puerto/remitente` de marcador de posición, comentando explícitamente "decisión de #10, nunca de una fila de esta tabla" para la contraseña SMTP.

**Lo que falta crear para #10:**
- Columnas de institución: nombre, logo (URL o referencia a archivo), director, integrantes del comité (probablemente relación o JSON), colores (paleta), zona horaria.
- Columna(s) para el dominio Google Workspace permitido (reemplazando `GOOGLE_HOSTED_DOMAINS` de env var).
- Un `ConfiguracionModule`/`ConfiguracionService`/`ConfiguracionController` real — hoy la tabla existe pero **nada la lee ni la escribe** salvo el seed y una comprobación de FK al borrar `AnioEscolar` (`anios-escolares.service.ts:243-248`, guarda de integridad referencial).

**Tensión de diseño a resolver en `design.md` de la propuesta:** `anio_escolar_id` es `NOT NULL` con `onDelete: Restrict`, lo cual ata el singleton institucional a un año escolar específico — conceptualmente estos datos (nombre, logo, colores, zona horaria, dominio Google) no deberían depender del año escolar activo. Opciones: (a) mantenerlo apuntando siempre al año activo aunque sea semánticamente raro, (b) hacer la FK nullable, (c) separar una tabla `Institucion` sin FK a `AnioEscolar` y dejar `Configuracion` solo para lo ligado a SMTP/año. Debe decidirse explícitamente, no dejarse implícito.

## 2. ¿Cómo se valida/restringe hoy el dominio Google Workspace?

**Hardcoded en variable de entorno**, no en base de datos. `apps/backend/src/auth/google-oauth.service.ts`:

```typescript
private dominiosPermitidos(): string[] {
  const raw = process.env.GOOGLE_HOSTED_DOMAINS ?? '';
  return raw.split(',').map(d => d.trim().toLowerCase()).filter(d => d.length > 0);
}
```

`GOOGLE_CLIENT_ID`/`GOOGLE_HOSTED_DOMAINS` ausentes o vacíos rechazan **todo** login OAuth (fail-closed). El `design.md` archivado de `google-oauth-y-recuperacion` lo declara explícitamente como deuda intencional:

> "(e) la lista de dominios vive en variable de entorno hasta que #10 la persista en `Configuracion`... #10 debe migrar [el mecanismo de restricción de dominio Google entero]."

Esto confirma que **#10 es responsable de mover esta validación de env var a base de datos**, probablemente leyendo desde el `Configuracion`/`Institucion` singleton en `GoogleOauthService.dominiosPermitidos()`. Impacto: `GoogleOauthService` pasaría de ser puro/sin dependencias de infraestructura (hoy solo depende del `OAuth2Client` inyectado) a depender de `PrismaService` o de un servicio de configuración inyectado — hay que revisar el gotcha de `src/openapi.ts` (extracción de OpenAPI sin BD viva) que varios módulos ya resuelven con providers perezosos (`redisProvider`, `EmailModule`, `googleOauthClientProvider`).

## 3. ¿Ya existe mecanismo de envío de correo (SMTP)?

**Sí, ya existe y funciona, pero 100% vía variables de entorno**, no vía DB. `apps/backend/src/email/`:
- `email-sender.ts` — interfaz `EmailSender` + token DI `EMAIL_SENDER`.
- `smtp-email-sender.ts` — implementación real con `nodemailer`, construcción perezosa (no abre socket hasta `send()`).
- `console-email-sender.ts` — fallback para desarrollo/tests.
- `email.module.ts` — factory que decide `SmtpEmailSender` vs `ConsoleEmailSender` según `process.env.SMTP_HOST`, leyendo `SMTP_HOST/PORT/USER/PASSWORD/FROM` directamente de env.

Comentario explícito en `email.module.ts`: "El sistema MUST NOT escribir en `JobCorreo`/`Notificacion` ni leer `Configuracion`" — eso fue una restricción **intencional de PR1 de google-oauth-y-recuperacion**, para no anticipar el trabajo de #10/#15. **#10 es quien debe introducir la lectura de `smtp_host`/`smtp_puerto`/`smtp_remitente` desde `Configuracion`** (la contraseña sigue viniendo de env var/secret manager — eso ya está decidido y no debe cambiar). Esto implica modificar `emailSenderProvider` en `email.module.ts` para inyectar `PrismaService` (o un `ConfiguracionService`) y resolver host/puerto/remitente desde DB en vez de env, manteniendo el fallback perezoso.

## 4. Patrón de autorización para módulos administrativos

Consistente en todo el código ya archivado: guard compuesto a **nivel de clase** del controller:

```typescript
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class XController { ... }
```

Visto en `users.controller.ts`, `apoderados.controller.ts`, `importacion.controller.ts`, y los 6 controllers de `academico/` (`anios-escolares`, `niveles`, `grados`, `secciones`, `aulas`, `matriculas`). `RolesGuard` (apps/backend/src/auth/roles.guard.ts) exige que corra después de `AuthGuard`; sin `@Roles()` deja pasar cualquier rol autenticado, con `@Roles()` y sesión ausente lanza 401 (no 403). El patrón para #10 sería idéntico: `@Roles('administrador', 'director')` a nivel de clase en el nuevo `ConfiguracionController`.

CRUD típico observado en `anios-escolares.controller.ts` + `anios-escolares.service.ts`: `ParseUUIDPipe` en params, DTOs `Crear*Dto`/`Actualizar*Dto`/`*RespuestaDto`/`Listar*Query`, servicio inyecta `PrismaService` + `AuditoriaService`, cada mutación se envuelve en `$transaction` con `auditoria.log(...)` en el mismo callback (para atomicidad), errores de dominio centralizados en un archivo `*.errors.ts` con códigos.

## 5. Precedente de subida de archivos (para el logo)

**Sí hay un precedente único**: `apps/backend/src/importacion/importacion.controller.ts`, introducido en `importacion-excel` (comentario propio del código: "primer endpoint de subida de archivos del proyecto"). Patrón reusable:

```typescript
@UseInterceptors(FileInterceptor('archivo', { fileFilter: filtroArchivo, limits: { fileSize: TAMANIO_MAXIMO_BYTES } }))
async importar(@UploadedFile() archivo: ArchivoMulter | undefined, ...)
```

- Interfaz local `ArchivoMulter { originalname, mimetype, buffer }` en vez de `Express.Multer.File` (el proyecto evita depender de `@types/express`).
- `fileFilter` con allowlist de extensión explícita (regex) que rechaza con `BadRequestException` antes de tocar la base.
- Límite de tamaño vía `limits.fileSize` (5 MB fue el precedente).

**Lo que NO existe todavía:** ningún mecanismo de **persistencia** de archivos — `importacion-excel` procesa el Excel en memoria (`buffer`) y nunca lo guarda en disco/storage; solo persiste un CSV de errores en Redis con TTL. Para el logo de la institución, #10 sería el **primer caso que necesita almacenar un archivo binario de forma duradera** (servir la imagen después). No hay decisión previa sobre dónde: disco local del contenedor (no sobrevive redeploy salvo volumen), objeto en base de datos (`bytea`), o storage externo (S3-compatible). Esto debe ser una decisión explícita en el `design.md` de la propuesta — no hay ADR que lo cubra.

## Comparación de enfoques para el modelo de datos

| Enfoque | Pros | Contras | Esfuerzo |
|---|---|---|---|
| **A. Extender `Configuracion` existente** con columnas nuevas (nombre, logo_url, director, colores, zona horaria, dominio_google) | Reutiliza tabla ya reservada por #2/#5 para este propósito; migración aditiva simple; seed ya tiene el singleton `clave='institucional'` | `anio_escolar_id` NOT NULL sigue siendo semánticamente incorrecto para datos que no dependen del año escolar; mezcla responsabilidades (SMTP operacional + identidad institucional) en una tabla | Bajo |
| **B. Nueva tabla `Institucion` (singleton sin FK a AnioEscolar) + dejar `Configuracion` solo para SMTP** | Separación de responsabilidades limpia; sin FK espuria | Dos tablas singleton en vez de una; migración un poco mayor; hay que decidir qué pasa con `Configuracion.anio_escolar_id` | Medio |
| **C. Hacer `anio_escolar_id` nullable en `Configuracion` y extenderla ahí mismo** | Un solo lugar, corrige la tensión de diseño sin tabla nueva | Cambia una decisión ya tomada en #2 (columna NOT NULL); requiere migración que altere una columna existente con dato ya sembrado | Bajo-medio |

## Riesgos y puntos abiertos para `sdd-propose`

1. **Acoplamiento a `GoogleOauthService`**: migrar el dominio de env var a DB introduce una dependencia de infraestructura (Prisma) en un servicio hoy puro — hay que preservar el patrón "fail-closed sin abrir conexión en el constructor" que otros providers (`EmailModule`, `googleOauthClientProvider`) ya establecieron para no romper `src/openapi.ts`.
2. **Storage del logo**: sin precedente, es una decisión nueva a tomar explícitamente (disco/bytea/S3-compatible), con implicaciones de despliegue (Docker Compose, volúmenes).
3. **Modelo de "integrantes del comité"**: el backlog dice "integrantes del comité" en plural — ¿es una lista libre de texto en la config, o referencias a `Usuario` con `rol='comite'` ya existentes? Esto último ya tiene modelo (`Usuario.rol`), así que probablemente no requiera nueva tabla, solo una vista/endpoint que liste usuarios con rol comité.
4. **Migración del dato semilla**: el seed ya escribió una fila `Configuracion` con `clave='institucional'`; cualquier migración de schema debe ser compatible con ese dato existente (columnas nuevas nullable o con default).
5. **Auditoría**: cambios de configuración institucional (especialmente dominio Google Workspace, que afecta quién puede loguearse) deben registrarse en `EventoAuditoria` vía `AuditoriaService.log()` dentro de la misma transacción — mismo patrón que `anios-escolares.service.ts`.

## Result contract

- status: `done`
- executive_summary: La tabla `Configuracion` ya existe como singleton reservado explícitamente para #10 (SMTP host/puerto/remitente y guarda de integridad), pero el dominio Google Workspace y el envío SMTP siguen 100% en variables de entorno — #10 debe migrarlos a DB, agregar campos nuevos de institución (nombre/logo/director/comité/colores/zona horaria), resolver la tensión de `anio_escolar_id` NOT NULL en un dato conceptualmente atemporal, y decidir el mecanismo de storage del logo (sin precedente en el proyecto).
- next_recommended: `sdd-propose`
- risks: (1) acoplar `GoogleOauthService` a Prisma sin romper el patrón fail-closed/perezoso de `src/openapi.ts`; (2) decisión de storage del logo sin precedente; (3) definición del modelo de "integrantes del comité" (¿tabla nueva o reutilizar `Usuario.rol='comite'`?); (4) compatibilidad de migración con la fila semilla `clave='institucional'` ya existente.
