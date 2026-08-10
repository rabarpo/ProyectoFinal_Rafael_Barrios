# Proposal: Configuración general de la institución

## Intent

Hoy la tabla `Configuracion` existe como singleton reservado (`clave='institucional'`)
pero nada la lee ni la escribe: el dominio Google Workspace permitido vive en
`GOOGLE_HOSTED_DOMAINS` (env var) y los datos SMTP (host/puerto/remitente) viven en
`process.env.SMTP_*`. Esto impide que administrador/director gestionen la identidad
institucional (nombre, logo, director, colores, zona horaria) sin un deploy, y deja el
control de acceso por dominio Google fuera de auditoría y fuera del alcance del comité.
Este change cierra esa brecha: persiste la configuración institucional en DB, migra
dominio Google y SMTP de env vars a `Configuracion`, y expone un endpoint administrado
para gestionarla.

## Scope

### In Scope
- Extender `Configuracion` (migración aditiva) con: nombre, logo (`bytea`), director,
  colores, zona horaria, dominio(s) Google Workspace permitido(s).
- `ConfiguracionModule`/`ConfiguracionService`/`ConfiguracionController`: `GET`/`PUT`
  (o `PATCH`) de la única fila `clave='institucional'`, `@UseGuards(AuthGuard,
  RolesGuard)` + `@Roles('administrador','director')`.
- Endpoint de solo lectura que liste usuarios con `Usuario.rol='comite'` (reutiliza
  modelo existente de #7, sin tabla nueva).
- `GoogleOauthService.dominiosPermitidos()` lee de `Configuracion` vía Prisma en vez de
  `process.env.GOOGLE_HOSTED_DOMAINS`, preservando fail-closed y sin abrir conexión en
  el constructor (patrón perezoso de `googleOauthClientProvider`/`EmailModule`).
- `EmailModule`/`emailSenderProvider` lee `smtp_host`/`smtp_puerto`/`smtp_remitente` de
  `Configuracion` en vez de `process.env.SMTP_HOST/PORT/FROM`; la contraseña SMTP sigue
  viniendo de env var/secret manager (sin cambios).
- Subida de logo vía `multipart/form-data` (`FileInterceptor`, allowlist de extensión,
  límite de tamaño), reutilizando el patrón de `importacion.controller.ts`.
- Auditoría: cada mutación de `Configuracion` se registra con `AuditoriaService.log()`
  en la misma transacción, con énfasis en el cambio de dominio Google Workspace.

### Out of Scope
- CRUD completo (`Configuracion` sigue siendo singleton: solo GET/PUT).
- Gestión de roles de comité (alta/baja de `Usuario.rol='comite'`) — eso pertenece a #7,
  ya archivado; aquí solo se lista.
- Storage externo (S3/MinIO) o volúmenes Docker para el logo — se usa `bytea`.
- Tabla `Institucion` separada — decisión descartada explícitamente por el usuario.

## Capabilities

### New Capabilities
- `configuracion-institucional`: gestión (lectura/actualización) de identidad
  institucional, colores, zona horaria y logo; lectura de integrantes del comité.

### Modified Capabilities
- `google-oauth`: `dominiosPermitidos()` pasa de leer env var a leer `Configuracion`.
- `envio-correo` (SMTP): host/puerto/remitente pasan de env var a `Configuracion`.

## Approach

Migración Prisma aditiva sobre `Configuracion` (columnas nuevas nullable o con default
para no romper el seed existente). `ConfiguracionService` centraliza lectura/escritura
del singleton; `GoogleOauthService` y `emailSenderProvider` lo consumen vía DI perezosa
(no rompe `src/openapi.ts`). Mismo patrón de guards/DTOs/`$transaction`+auditoría que
`anios-escolares`.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/prisma/schema.prisma` | Modified | Columnas nuevas en `Configuracion` |
| `apps/backend/src/configuracion/` | New | Module/Service/Controller/DTOs |
| `apps/backend/src/auth/google-oauth.service.ts` | Modified | Lee dominio desde DB |
| `apps/backend/src/email/email.module.ts` | Modified | Lee SMTP host/puerto/remitente desde DB |
| `apps/backend/prisma/seed.ts` | Modified | Ajustar fila semilla a columnas nuevas |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Acoplar `GoogleOauthService` a Prisma rompe extracción OpenAPI sin BD viva | Med | Reusar patrón perezoso de `EmailModule`/`googleOauthClientProvider` |
| Cambio de dominio Google mal auditado bloquea logins legítimos | Med | Auditoría obligatoria en la misma transacción + validación de formato |
| Migración incompatible con fila semilla existente | Low | Columnas nuevas nullable/default; migración probada contra seed |
| Logo grande satura la tabla | Low | Límite de tamaño (2 MB, ajustado del precedente de `importacion`) |

## Rollback Plan

Revertir la migración Prisma (`down`) elimina las columnas nuevas sin afectar
`smtp_host/puerto/remitente` existentes. Restaurar temporalmente
`GOOGLE_HOSTED_DOMAINS`/`SMTP_*` como fallback de env var si el rollback de código se
hace antes que el de DB.

## Dependencies

- #4 Autenticación con sesión (guards `AuthGuard`/`RolesGuard`) — ya archivado.
- #7 Administración de usuarios (`Usuario.rol='comite'`) — ya archivado.

## Success Criteria

- [ ] `GET/PUT` de configuración institucional funcional y auditado.
- [ ] Login Google Workspace valida dominio desde DB, no desde env var.
- [ ] Envío de correo usa host/puerto/remitente de DB.
- [ ] Migración no rompe la fila semilla `clave='institucional'`.

## Proposal question round

Preguntas para afinar la propuesta (no bloquean; asunciones documentadas abajo si no se
responden):

1. **Colores**: ¿cuántos campos de color (¿primario/secundario únicamente, o paleta
   extendida)? Asunción: dos columnas (`color_primario`, `color_secundario`), formato
   hex string.
2. **Dominio Google**: ¿uno solo o múltiples dominios permitidos simultáneamente (el
   env var actual soporta lista separada por comas)? Asunción: columna tipo array
   (`String[]`) para preservar el comportamiento actual de multi-dominio.
3. **Zona horaria**: ¿string IANA (`America/Lima`) u offset fijo? Asunción: string IANA,
   validado contra una lista conocida.
4. **Logo**: ¿límite de tamaño y formatos aceptados? Asunción: 2 MB, PNG/JPG/SVG
   (mismo criterio que `importacion-excel` adaptado a imágenes).
5. **Endpoint de comité**: ¿debe incluir contacto (correo) o solo nombre/DNI? Asunción:
   reutilizar el DTO de listado de usuarios ya existente, filtrado por rol.
