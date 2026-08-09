# Tasks: Configuración general de la institución

Convenciones: Strict TDD (test primero, en rojo, luego implementación mínima para ponerlo en
verde, luego refactor si aplica). Cada tarea indica de qué requirement(s) del spec depende y si es
paralelizable (`[P]`) o secuencial (`[S]`, depende de una tarea anterior de la misma cadena).

Los slices siguen el corte de PR sugerido por `design.md` (sección "Rollback y corte de entrega"):
PR1 → PR2 → PR3 → PR4, secuenciales entre sí porque PR2 depende de `ConfiguracionLecturaModule`
(PR1), PR3 depende del controller de PR2, y PR4 es el corte real de `GoogleOauthService`/
`EmailModule` que solo puede desplegarse tras el runbook de backfill (R2).

---

## PR1 — Migración + seed + `ConfiguracionLecturaModule`

Requirement: "Extensión aditiva del modelo `Configuracion`" (configuracion-institucional).

- [x] **1.1 [S]** Test de integración RED: aplicar la migración pendiente sobre una copia de la
  DB ya sembrada por `seed.ts` y verificar que la fila `clave='institucional'` sobrevive con el
  mismo `id`, y que las columnas nuevas quedan en su valor nulo/default (`test/` suite Postgres
  existente, patrón `anios-escolares`). Debe fallar porque la migración aún no existe.
  Cubre: Scenario "La fila semilla `clave='institucional'` sobrevive la migración".
  DESVIACIÓN: escrita en `test/configuracion/configuracion-institucional.e2e-spec.ts` y
  type-checkeada (`pnpm typecheck` en verde); no pudo ejecutarse contra Postgres real en esta
  sesión (`docker ps` sin daemon disponible), mismo patrón documentado en
  `anios-escolares.e2e-spec.ts`. Pendiente de CI/entorno con `docker-compose.test.yml`.
- [x] **1.2 [S]** Extender `apps/backend/prisma/schema.prisma`: agregar `nombre`, `logo`,
  `logo_mime`, `director`, `color_primario`, `color_secundario`, `zona_horaria`
  (todas `String?`/`Bytes?`), `dominios_google String[] @default([])`, `logo_actualizado_en
  DateTime? @db.Timestamptz(3)` al modelo `Configuracion`, según D1/Interfaces del diseño.
  DESVIACIÓN (alcance de PR1 ajustado por el orquestador al lanzar `sdd-apply`): solo se agregaron
  `nombre`, `director`, `color_primario`, `color_secundario`, `zona_horaria`,
  `dominios_google String[] @default([])`. `logo`/`logo_mime`/`logo_actualizado_en` (`Bytes?`)
  quedan diferidas a PR3 (subida/servido del logo), en su propia migración — así la migración de
  PR1 queda acotada al alcance real de `ConfiguracionLecturaModule` (sin bytea). Esto difiere de
  design.md "Interfaces/Contracts" (que agrupa las 8 columnas en un solo bloque) y de esta misma
  tarea tal como estaba redactada; PR3 deberá generar su propia migración aditiva para las 3
  columnas de logo antes de implementar sus tareas.
- [x] **1.3 [S]** Generar la migración Prisma (`prisma migrate dev`) con el `ALTER TABLE` aditivo
  descrito en design.md, incluyendo el `UPDATE ... SET smtp_host = NULL WHERE clave =
  'institucional' AND smtp_host = 'smtp.seei.local'` (limpieza del placeholder). Confirmar que
  1.1 pasa en verde.
  DESVIACIÓN: `prisma migrate dev` requiere una shadow DB viva (`docker ps` sin daemon disponible
  en este entorno); la migración SQL se escribió a mano en
  `prisma/migrations/20260809010000_configuracion_institucional_lectura/migration.sql` siguiendo
  el formato exacto que Prisma genera (mismo criterio que las migraciones previas del repo),
  limitada a las 6 columnas de 1.2. 1.1 no pudo confirmarse en verde contra Postgres real (ver
  desviación de 1.1); `prisma generate` sí corrió en verde y `pnpm typecheck` pasa contra el
  cliente regenerado.
- [x] **1.4 [P]** Test RED: re-ejecutar `seed.ts` sobre una DB ya migrada y sembrada, y verificar
  que sigue existiendo exactamente una fila `clave='institucional'` y que `smtp_host/puerto/
  remitente` con valores reales no se sobrescriben con datos de marcador de posición.
  Cubre: Scenario "Re-ejecutar el seed no duplica ni rompe la fila".
  DESVIACIÓN: misma que 1.1 — escrita en el mismo archivo e2e-spec, no ejecutada contra Postgres
  real en esta sesión.
- [x] **1.5 [S]** Ajustar `apps/backend/prisma/seed.ts` para que el `create` use `smtp_host: null`
  (o el placeholder documentado) y valores institucionales por defecto razonables, sin sobrescribir
  columnas existentes en un `upsert`/`update` condicional. Confirmar que 1.4 pasa en verde.
  Implementado: `create` usa `smtp_host: null`/`smtp_puerto: null`/`smtp_remitente: null` (en vez
  del placeholder `smtp.seei.local`) más `nombre: 'SEEI'`/`zona_horaria: 'America/Lima'` como
  valores institucionales razonables; `update: {}` se mantiene sin cambios (ya no sobrescribe
  columnas existentes). 1.4 no pudo confirmarse en verde contra Postgres real (ver desviación de
  1.1).
- [x] **1.6 [P]** Test unitario RED: `ConfiguracionLecturaService` — fila ausente ⇒ `obtener()`
  retorna `null`, `smtp()` retorna `null`, `dominiosGooglePermitidos()` retorna `[]`; fila presente
  con datos ⇒ retorna los valores tal cual (sin transformación). Mock de `PrismaService`.
  RED confirmado (`Cannot find module './configuracion-lectura.service'`) antes de 1.7.
- [x] **1.7 [S]** Crear `apps/backend/src/configuracion/configuracion-lectura.service.ts`
  (`obtener()`, `smtp(): Promise<ConfiguracionSmtp | null>`,
  `dominiosGooglePermitidos(): Promise<string[]>`, constructor solo con `PrismaService`, sin
  conexión al construir — D2/D3). Confirmar que 1.6 pasa en verde.
  GREEN confirmado: 8/8 tests en `configuracion-lectura.service.spec.ts`.
- [x] **1.8 [S]** Crear `apps/backend/src/configuracion/configuracion-lectura.module.ts`:
  `providers: [PrismaService, ConfiguracionLecturaService]`, `exports: [ConfiguracionLecturaService]`,
  sin controller, sin importar `AuthModule` ni `AuditoriaModule` (rompe el ciclo de DI).
- [x] **1.9 [P]** Test de contrato RED→verde: `pnpm openapi:extract` corre sin Postgres ni Redis
  levantados, tras registrar el módulo de lectura en `app.module.ts` (guarda de regresión D2/D3;
  puede quedar en verde de inmediato si el módulo no abre conexión, documentar como test de
  regresión permanente en CI).
  Verde confirmado: `pnpm openapi:extract` sale con código 0, sin diff en
  `packages/contracts/openapi.json` (el módulo no agrega controller/rutas).

## PR2 — `ConfiguracionModule` (GET/PUT auditado) + listado de comité

Requirements: "Lectura de la configuración institucional", "Actualización auditada de la
configuración institucional", "Validación de zona horaria IANA", "Validación de formato
hexadecimal de colores", "Validación de dominios Google Workspace permitidos", "Listado de
integrantes del comité" (configuracion-institucional). Depende de PR1.

- [ ] **2.1 [P]** Test unitario RED: validador de color hex — `#1A2B3C` y `#abc` aceptados;
  `azul`, `#12345`, `#1A2B3G` rechazados (regex `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`, sin expandir
  `#RGB` a 6 dígitos). Cubre: Scenarios "Color hex válido se acepta" / "...formato inválido se
  rechaza".
- [ ] **2.2 [P]** Test unitario RED: validador de zona horaria IANA contra
  `Intl.supportedValuesOf('timeZone')` — `America/Lima` aceptado, `No/Existe` rechazado. Cubre:
  Scenarios de "Validación de zona horaria IANA".
- [ ] **2.3 [P]** Test unitario RED: validador de `dominios_google` — normalización
  (`trim().toLowerCase()`, deduplicado), regex de hostname; arreglo con un elemento inválido
  rechaza todo el arreglo; arreglo vacío es válido. Cubre: los 3 scenarios de "Validación de
  dominios Google Workspace permitidos".
- [ ] **2.4 [S]** Implementar los 3 validadores manuales (sin `class-validator`, patrón vigente) en
  `apps/backend/src/configuracion/configuracion.errors.ts` o helper dedicado. Confirmar 2.1–2.3 en
  verde.
- [ ] **2.5 [P]** Test de integración RED: `ConfiguracionService.actualizar()` persiste campos
  válidos y crea un `EventoAuditoria` en la misma `$transaction`; si el registro de auditoría falla
  dentro de la transacción, ningún campo de `Configuracion` queda modificado (rollback). Cubre:
  Scenarios "Actualización exitosa se audita" / "Fallo de auditoría revierte la actualización".
- [ ] **2.6 [S]** Crear `apps/backend/src/configuracion/dto/actualizar-configuracion.dto.ts` y
  `configuracion-respuesta.dto.ts` (campos opcionales para merge parcial; respuesta sin bytes del
  logo: `logo_presente`, `logo_mime`).
- [ ] **2.7 [S]** Crear `apps/backend/src/configuracion/configuracion.service.ts`: `obtener()`
  delega en `ConfiguracionLecturaService`; `actualizar(dto, actorId)` corre en
  `prisma.$transaction()` — `findUnique` → validar (2.4) y calcular `camposModificados` → `update`
  → `auditoria.log(tx, CONFIGURACION_*, actorId, 'Configuracion', id, payload)`, con payload
  `antes`/`después` completo cuando cambia `dominios_google` (D9). Confirmar 2.5 en verde.
- [ ] **2.8 [P]** Agregar las 3 claves aditivas de auditoría en
  `apps/backend/src/auditoria/audit-event-types.ts` (D9).
- [ ] **2.9 [P]** Test e2e RED: `GET /configuracion` y `PUT /configuracion` — `401` sin cookie,
  `403` con rol `comite`/`docente`/`estudiante`, `200` con `administrador`/`director`. Cubre:
  Scenarios "Administrador consulta la configuración" / "Rol no autorizado no accede a la
  configuración".
- [ ] **2.10 [P]** Test e2e RED: `GET /configuracion/comite` — devuelve únicamente usuarios con
  `rol='comite'`; `403` con rol no autorizado. Cubre: los 2 scenarios de "Listado de integrantes
  del comité".
- [ ] **2.11 [S]** Crear `apps/backend/src/configuracion/configuracion.controller.ts`: guards de
  clase `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('administrador','director')`; `GET
  /configuracion`, `PUT /configuracion`; `GET /configuracion/comite` delega en
  `UsersService.listar({ rol: 'comite' })` (reusa DTO existente). Confirmar 2.9–2.10 en verde.
- [ ] **2.12 [S]** Crear `apps/backend/src/configuracion/configuracion.module.ts`: `imports:
  [AuthModule, AuditoriaModule, UsersModule, ConfiguracionLecturaModule]`. Registrar en
  `apps/backend/src/app.module.ts` al final.
- [ ] **2.13 [S]** Regenerar `packages/contracts/openapi.json` (`pnpm openapi:extract`) tras
  cerrar el controller y los DTOs; confirmar que sigue corriendo sin Postgres/Redis.

## PR3 — Subida y servido del logo institucional

Requirement: "Subida de logo institucional" (configuracion-institucional). Depende de PR2 (mismo
controller/módulo).

- [ ] **3.0 [S]** Migración Prisma aditiva propia de este PR: agregar `logo Bytes?`,
  `logo_mime String?`, `logo_actualizado_en DateTime? @db.Timestamptz(3)` al modelo `Configuracion`
  (columnas diferidas de PR1 — ver desviación documentada en la tarea 1.2). Confirmar que la fila
  semilla `clave='institucional'` sobrevive con estos campos en `null`, mismo patrón de test que
  1.1.
- [ ] **3.1 [P]** Test unitario RED: `fileFilter`/allowlist del logo — PNG/JPG/SVG de extensión y
  MIME correctos aceptados; `.pdf`, doble extensión (`logo.png.svg`), MIME/contenido discrepantes
  rechazados antes de tocar la DB. Cubre: Scenario "Formato de logo no permitido se rechaza" +
  threat matrix (clasificación de archivo activo).
- [ ] **3.2 [P]** Test unitario RED: límite de tamaño — archivo de 1 MB aceptado, archivo de 3 MB
  rechazado con `BadRequestException` antes de persistir. Cubre: Scenarios "Logo válido se acepta y
  persiste" / "Logo que excede el tamaño máximo se rechaza".
- [ ] **3.3 [S]** Implementar `fileFilter`/allowlist doble (extensión `/\.(png|jpe?g|svg)$/i` + MIME
  `image/png|image/jpeg|image/svg+xml`) y `limits: { fileSize: 2*1024*1024 }` en el
  `FileInterceptor('logo', ...)`, reusando el patrón de `importacion.controller.ts`; interfaz local
  `ArchivoMulter` (nunca `Express.Multer.File`). Confirmar 3.1–3.2 en verde.
- [ ] **3.4 [P]** Test de integración RED: round-trip del logo en `bytea` — subir PNG válido,
  verificar que `logo`/`logo_mime`/`logo_actualizado_en` quedan persistidos correctamente.
- [ ] **3.5 [S]** Crear `apps/backend/src/configuracion/dto/logo-respuesta.dto.ts` y extender
  `configuracion.service.ts`/`configuracion.controller.ts` con `POST /configuracion/logo`
  (`multipart/form-data`) y `GET /configuracion/logo` (`StreamableFile`, `Content-Type` exacto
  persistido, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none';
  style-src 'unsafe-inline'`, `404` si no hay logo). Confirmar 3.4 en verde.
- [ ] **3.6 [P]** Test e2e RED (threat matrix): SVG con `<script>`/`onload` — se acepta como
  archivo (cumple allowlist) pero `GET /configuracion/logo` responde con la CSP restrictiva
  verificada en la respuesta (no ejecuta script en el origen); archivo de 0 bytes rechazado;
  `>2 MB` ⇒ `400`; `.exe`/`.gif` ⇒ `400`.
- [ ] **3.7 [S]** Confirmar 3.6 en verde con la implementación de 3.5; regenerar
  `packages/contracts/openapi.json`.

## PR4 — Corte de `GoogleOauthService` y `EmailModule` a `Configuracion` (con runbook)

Requirements: "Verificación del ID token de Google" (google-oauth-y-recuperacion, MODIFIED),
"`EmailSender` mínimo sin outbox" (google-oauth-y-recuperacion, MODIFIED), los 3 requirements de
`envio-correo`. Depende de PR1 (`ConfiguracionLecturaModule`). **No se despliega sin ejecutar antes
la tarea 4.R2 de este PR (backfill) en el entorno destino — fail-closed: sin backfill, todo login
Google Workspace queda bloqueado tras el deploy de código.**

- [ ] **4.1 [P]** Test unitario RED: `GoogleOauthService.dominiosPermitidos()` — DB caída ⇒
  `UnauthorizedException` (nunca 500 ni excepción de arranque); `Configuracion.dominios_google =
  []` ⇒ rechazo fail-closed; `hd` fuera de la lista ⇒ rechazo con evento `LOGIN_OAUTH_FALLIDO`;
  `hd` dentro de la lista ⇒ payload validado. Mock de `ConfiguracionLecturaService`. Cubre los 3
  scenarios del requirement "Verificación del ID token de Google".
- [ ] **4.2 [S]** Modificar `apps/backend/src/auth/google-oauth.service.ts`: inyectar
  `ConfiguracionLecturaService`, `dominiosPermitidos()` pasa a `async` y consulta
  `dominiosGooglePermitidos()` en tiempo de request (D2). Confirmar 4.1 en verde.
- [ ] **4.3 [S]** Modificar `apps/backend/src/auth/auth.module.ts`: `imports: [...,
  ConfiguracionLecturaModule]`.
- [ ] **4.4 [P]** Test unitario RED: `ConfiguracionEmailSender.send()` — `smtp_host` no nulo ⇒
  arma `SmtpEmailSender` con host/puerto/remitente de DB y contraseña de env var; `smtp_host` nulo/
  vacío ⇒ usa `ConsoleEmailSender` como fallback. Ningún campo de contraseña se lee de
  `Configuracion`. Cubre: los 2 scenarios de "Resolución perezosa..." + "Envío exitoso combina host
  de DB y contraseña de env var" + "La contraseña SMTP nunca se lee de `Configuracion`".
- [ ] **4.5 [S]** Crear `apps/backend/src/email/configuracion-email-sender.ts`: implementa
  `EmailSender`, resuelve `smtp_host/puerto/remitente` vía `ConfiguracionLecturaService.smtp()`
  **dentro de `send()`** (no en la factory del módulo — D3), combina con
  `SMTP_USER`/`SMTP_PASSWORD` de env var. Confirmar 4.4 en verde.
- [ ] **4.6 [S]** Modificar `apps/backend/src/email/email.module.ts`:
  `emailSenderProvider`/`useFactory` retorna `ConfiguracionEmailSender` en vez de decidir
  Smtp/Console en el arranque; `imports: [..., ConfiguracionLecturaModule]`.
- [ ] **4.7 [P]** Test de integración RED: actualizar `Configuracion.smtp_host` vía
  `PUT /configuracion` (de PR2) y verificar que el siguiente envío de correo usa el nuevo host sin
  reiniciar el proceso (no cacheado). Cubre: Scenario "Actualizar el host SMTP vía `PUT
  /configuracion` afecta el próximo envío".
- [ ] **4.8 [P]** Test de contrato RED→verde: `pnpm openapi:extract` sigue corriendo sin Postgres
  ni Redis tras el corte de `GoogleOauthService`/`EmailModule` (guarda de regresión final D2/D3).
- [ ] **4.9 [S]** Regenerar `packages/contracts/openapi.json`.
- [ ] **4.R1 [S] — Runbook, paso "Migrar"**: `pnpm prisma migrate deploy` en el entorno destino
  (si PR1 no se desplegó ya en un release previo). Verificación de salida: columnas nuevas
  presentes; fila `clave='institucional'` intacta.
- [ ] **4.R2 [S] — Runbook, paso "Backfill de `dominios_google` y SMTP" (OPERACIONAL, CRÍTICO,
  NO ES CÓDIGO)**: ejecutar contra el entorno destino, con los valores vigentes de
  `GOOGLE_HOSTED_DOMAINS`/`SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` de ese entorno:
  `UPDATE "Configuracion" SET dominios_google = <valor real>, smtp_host = <valor real>, smtp_puerto
  = <valor real>, smtp_remitente = <valor real> WHERE clave = 'institucional';`
  Verificación de salida (bloqueante): `SELECT dominios_google, smtp_host FROM "Configuracion"
  WHERE clave='institucional';` debe devolver un arreglo **no vacío** y el host real. **Si
  `dominios_google` sale vacío, DETENERSE — no continuar a 4.R3.** Este paso debe repetirse por
  cada entorno (staging, producción) antes de desplegar el código de ese entorno.
- [ ] **4.R3 [S] — Runbook, paso "Desplegar código"**: desplegar el backend con los cambios de
  4.2–4.6 ya mergeados, **solo después de que 4.R2 haya pasado su verificación en ese entorno**.
  Verificación de salida: smoke test de un login Google Workspace real con éxito; un envío de
  recuperación real usa el host de DB.
- [ ] **4.R4 [S] — Runbook, paso "Retirar env vars"**: eliminar `GOOGLE_HOSTED_DOMAINS`,
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` del entorno (`SMTP_USER`/`SMTP_PASSWORD` permanecen — D4).
  Verificación de salida: reinicio del proceso sin esas vars; login y correo siguen funcionando
  (prueba de que D8 no dejó ningún fallback oculto a env var).

---

## Review Workload Forecast

Presupuesto de sesión (`delivery_strategy: ask-on-risk`): **400 líneas** por unidad de entrega.

| Slice | Contenido | Estimación de líneas (código + tests + migración) | Presupuesto |
|---|---|---|---|
| PR1 | Migración SQL + `schema.prisma` + seed ajustado + `ConfiguracionLecturaService`/`Module` + tests unit/integración/contrato | ~180–220 | Dentro de 400 |
| PR2 | Controller + Service + 3 DTOs + validadores + claves de auditoría + tests unit/integración/e2e | ~280–340 | Dentro de 400, cerca del límite |
| PR3 | `FileInterceptor`/allowlist + `POST`/`GET /configuracion/logo` + DTO + tests unit/integración/e2e (incluye threat matrix SVG) | ~150–190 | Dentro de 400 |
| PR4 | Corte `GoogleOauthService` + `ConfiguracionEmailSender` + `EmailModule` + tests unit/integración/contrato + runbook (no cuenta como líneas de código, es operacional) | ~140–180 | Dentro de 400 |

**Riesgo de presupuesto**: Bajo-medio. Los 4 slices ya vienen encadenados desde `design.md`
(sección "Rollback y corte de entrega") y cada uno, por separado, queda cómodamente bajo las 400
líneas. El diseño advierte explícitamente que **entregarlos juntos superaría el presupuesto con
holgura** — se mantiene el corte en 4 PRs propuesto, sin fusionar ninguno. PR2 es el más cercano al
límite (controller + 3 DTOs + validadores + auditoría + e2e de 5 rutas); si al implementar crece
más de lo estimado, dividir en PR2a (GET/PUT + validadores) y PR2b (comité) es la partición natural
sin romper dependencias.

**¿Se recomiendan PRs encadenados?** Sí, los 4 definidos arriba, en el orden PR1→PR2→PR3→PR4. Son
secuenciales por dependencia real de módulo (PR2 necesita `ConfiguracionLecturaModule` de PR1; PR3
extiende el controller de PR2; PR4 depende de `ConfiguracionLecturaModule` de PR1 pero es
independiente de PR2/PR3 en código — podría reordenarse antes de PR2/PR3 si el negocio prioriza
cerrar el corte de env vars primero, pero el runbook R2 sigue siendo la tarea operacional crítica
sea cual sea el orden de PR2/PR3/PR4).

**¿Se necesita decisión antes de `sdd-apply`?** Sí, una: **confirmar el orden final de PR2/PR3/PR4**
(el orden por defecto de este documento es PR1→PR2→PR3→PR4, priorizando primero el endpoint
administrado antes que el corte de env vars). Si se prefiere cerrar primero el corte de
`GoogleOauthService`/`EmailModule` (PR4) para eliminar el riesgo de env var antes de exponer el
endpoint de gestión, avisar antes de iniciar `sdd-apply` — no bloquea el inicio del PR1, que es
prerrequisito de todos los demás.

**Nota fail-closed no negociable**: la tarea `4.R2` (backfill de `dominios_google` y SMTP) MUST
ejecutarse y verificarse en cada entorno destino antes de `4.R3` (deploy de código) en ese mismo
entorno. `sdd-apply` no debe marcar PR4 como "listo para desplegar" sin evidencia de que 4.R2 se
ejecutó contra el entorno de destino real (no solo en un entorno de pruebas).
