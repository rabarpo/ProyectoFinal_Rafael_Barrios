---
title: "SEEI — Reporte de Security Pass"
fecha: 2026-08-31
alcance: Revisión de seguridad adaptada al contexto (análisis, no modificación)
---

# SEEI — Reporte de Security Pass

## Resumen ejecutivo

SEEI es un sistema de elecciones electrónicas para una institución educativa
(una instancia por institución). Backend NestJS + Prisma/PostgreSQL + Redis +
worker de correo, frontend React/Vite, todo detrás de un único Caddy como
reverse proxy, desplegado en un VPS con Docker Compose. Los activos sensibles
son: el voto y su secreto, el padrón congelado, la auditoría inmutable, las
credenciales de los votantes (muchos menores de edad) y los datos personales
(DNI, correo, fotografía).

**El proyecto llega a esta revisión con una postura de seguridad claramente por
encima del promedio.** Cada feature trae su propia "threat matrix" en el design,
el núcleo de votación es transaccional y a prueba de condiciones de carrera, la
autenticación tiene defensas anti-enumeración y anti-timing reales, y el
despliegue está endurecido (solo Caddy expone puertos, rol de base de datos sin
DDL en runtime, revisor obligatorio para el deploy). No se encontró ninguna
vulnerabilidad crítica ni ninguna vía directa de fraude electoral, doble voto o
ruptura del secreto del voto.

Los hallazgos se concentran en **controles transversales que faltan a nivel de
aplicación** (validación de entrada global, límites de tasa, encabezados de
seguridad del SPA) y en la **degradación silenciosa del valor forense de la
auditoría** (nunca se registra IP ni user-agent). Ninguno permite por sí solo
alterar un resultado electoral, pero varios debilitan la capacidad de
*detectar, contener y demostrar* un abuso durante la jornada — que es
exactamente lo que un sistema de elecciones necesita.

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL  | 0 |
| HIGH      | 1 |
| MEDIUM    | 4 |
| LOW       | 3 |
| INFO      | 2 |

### Capas revisadas

- **Producto / requisitos** (PRD.md, ADRs) — revisado.
- **Arquitectura / diseño** (TECH-DESIGN.md, threat matrices por change) — revisado.
- **Código backend** — revisado en profundidad: `auth/*` (guards, sesiones, login,
  OAuth, bloqueo, recuperación), `votos/*` (emisión, comprobante, papeleta,
  archivos), `auditoria/*`, `importacion/*`, `configuracion/*`, `candidatos/archivos.ts`,
  `main.ts`, `app.module.ts`, `prisma/schema.prisma`.
- **Infraestructura / despliegue** — revisado: `infra/docker/docker-compose.prod.yml`,
  `Caddyfile.prod`, `env.prod.example`, `infra/scripts/deploy.sh`,
  `.github/workflows/{ci,deploy}.yml`, `postgres/init/01-roles.sql`.
- **Tests** — revisado a nivel de inventario (cada módulo trae `.spec.ts` y hay
  suite e2e + suite de rechazo de constraints contra Postgres real).

### Capas NO revisadas en profundidad (por límite de esta pasada, no por ausencia)

- Código del **frontend** (`apps/frontend/src/**`) — manejo de tokens en cliente,
  render de contenido de candidatos, XSS del lado del SPA.
- Módulos backend `panel-jornada`, `procesos/escrutinio`, `procesos/actas`,
  `reportes`, `notificaciones`.
- Internals del **worker** y del envío SMTP (`email/smtp-email-sender.ts`).
- `google-oauth.service.ts` — se revisó el flujo que lo consume (`auth.service.ts`),
  no la verificación criptográfica del ID token en sí (firma, `aud`, `iss`,
  `hd`/hosted domain, expiración). **Recomendación: verificar explícitamente ese
  archivo** antes de producción; es el único punto de confianza del login OAuth.

---

## Fortalezas de seguridad (confirmadas en código)

Estas se documentan para que no se pierdan en una refactorización futura:

1. **Núcleo de votación transaccional e idempotente.** `VotosService.emitir()`
   hace bloqueo `FOR UPDATE OF dv`, valida ventana horaria con el `now()`
   transaccional (no el reloj del cliente), idempotencia por clave, e inserción
   de `Voto` + evento de auditoría en una sola `$transaction`. Doble clic / doble
   pestaña / reintento resuelven al mismo comprobante. Constraints `@@unique` en
   `Voto` como red final. SQL crudo parametrizado.
2. **Secreto del voto por diseño.** El payload de auditoría del evento `VOTO`
   nunca contiene la elección (`schema.prisma` y `votos.service.ts` D11). El
   correo de comprobante lleva solo código + hora + enlace autenticado
   (ADR-0009). El comprobante se direcciona por `votoId`, no por
   `codigo_comprobante`, para no filtrarlo a logs/Referer.
3. **Autenticación endurecida.** Respuestas 401 uniformes sin cuerpo
   distinguible; `PasswordService.verificar()` corre siempre contra un hash
   señuelo (anti-timing); claves señuelo hasheadas en Redis para intentos sin
   usuario contable (anti-enumeración, cardinalidad acotada); recuperación con
   respuesta 202 uniforme y token opaco sin `userId`; argon2id.
4. **Bloqueo por fuerza bruta con ventana fija** y revocación de todas las
   sesiones al bloquear / cambiar contraseña / desbloquear.
5. **Autorización por pertenencia, no por secreto de URL,** en todas las rutas de
   `votos/*`; `403` con mismo cuerpo para "ajeno" e "inexistente" (sin oráculo de
   enumeración); `ParseUUIDPipe` antes del handler.
6. **Subida de archivos:** allowlist doble (extensión + MIME), rechazo de doble
   extensión (`x.pdf.exe`), límite de tamaño en `multer`, y servido con
   `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff` +
   `Content-Security-Policy: default-src 'none'`. Sin almacenamiento en sistema
   de archivos (todo `bytea` en Postgres).
7. **CSV injection neutralizada** en el reporte de errores de importación
   (`padron-csv.ts`, prefijo `'` sobre `= + - @`, escape RFC 4180).
8. **Despliegue endurecido:** solo Caddy publica puertos; Postgres/Redis solo en
   red interna; rol `seei_app` sin privilegios DDL en runtime, `seei_migrator`
   solo en el servicio `migrate`; `REVOKE ALL ON SCHEMA public FROM PUBLIC`;
   HSTS + `X-Frame-Options: DENY` + `nosniff` + `Referrer-Policy`; `-Server`.
9. **Gate de despliegue:** `workflow_dispatch` manual + verificación de CI verde +
   GitHub Environment con revisor obligatorio + `deploy.sh` aborta si hay una
   jornada `abierto` (salvo `--force`) + backup previo bloqueante + rollback
   automático. Secretos en GitHub Environment, nunca en el repo.
10. **Sin secretos en el repositorio.** `.env` está en `.gitignore`;
    `env.prod.example` y `.env.example` solo traen placeholders `CAMBIAR_*`. CI
    usa credenciales efímeras descartables contra una base efímera.

---

## Hallazgos

### F-01 — No hay `ValidationPipe` global: los DTOs con `class-validator` son inertes

- **Severidad:** HIGH
- **Confianza:** MEDIA-ALTA
- **Categoría:** validación de entrada / superficie de ataque
- **Artefacto afectado:** `apps/backend/src/main.ts`; todos los controladores que
  reciben `@Body()`
- **Ubicación:** `apps/backend/src/main.ts:5-9` (bootstrap sin
  `app.useGlobalPipes(...)`)
- **Descripción:** `main.ts` arranca la aplicación sin registrar
  `ValidationPipe` (ni global ni por ruta — `grep` de `useGlobalPipes` /
  `ValidationPipe` / `@UsePipes` no encuentra ningún registro efectivo). Sin
  embargo, ~20 DTOs sí declaran decoradores de `class-validator`
  (`emitir-voto.dto.ts`, `crear-usuario.dto.ts`, `actualizar-configuracion.dto.ts`,
  las `*.query.ts`, etc.). Sin el pipe, **esos decoradores no se ejecutan nunca**:
  no hay validación de tipo, ni `whitelist`, ni `forbidNonWhitelisted`, ni
  transformación. Varios controladores pasan `@Body() dto` directo al servicio
  (`ListasController.crear`, `ConfiguracionController.actualizar`,
  `ProcesosController`, `CandidatosController`). Los caminos calientes
  (`votos`, `auth`) compensan con validación a mano en el controlador, pero la
  cobertura es inconsistente y depende de que cada autor lo recuerde.
- **Evidencia:**
  - `auth.controller.ts:205` — comentario explícito del propio equipo: *"no hay
    body — no hay nada que validar (no existe `ValidationPipe` en el proyecto)"*.
  - `votos.controller.ts:52-55` y `:91-93` — el formato de `derecho_voto_id` se
    valida con un regex a mano *"porque no hay `ParseUUIDPipe` de parámetro de
    ruta"* y no hay pipe de body.
  - DTOs con decoradores: `apps/backend/src/votos/dto/emitir-voto.dto.ts`,
    `apps/backend/src/users/dto/crear-usuario.dto.ts` (2 ocurrencias de
    `class-validator` cada uno), etc.
- **Escenario de ataque:** un usuario autenticado con rol de gestión envía a
  `PUT /api/configuracion` o `POST /api/listas` un cuerpo con campos extra,
  tipos inesperados (arrays donde se espera string, objetos anidados) o strings
  de megabytes. Prisma recibe datos no saneados; según el campo, esto produce
  desde filas basura persistidas hasta `500` no controlados o consumo de memoria.
  Un votante envía a `POST /api/votos` un `clave_idempotencia` de 10 MB (el
  string entra en el SQL crudo parametrizado y se persiste).
- **Impacto potencial:** integridad de datos de configuración/candidatos/procesos;
  DoS por payloads grandes sin límite (agravado por F-02 y por la ausencia de
  límite de body explícito); mass assignment donde un servicio haga
  `data: { ...dto }`.
- **Mitigación existente:** validación manual puntual en `votos` y `auth`;
  `ParseUUIDPipe` en parámetros de ruta; tipado TypeScript en compilación (no
  aplica en runtime).
- **Remediación recomendada:** registrar en `main.ts`
  `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))`.
  Auditar los DTOs para que todos los campos tengan decoradores explícitos
  (`@IsString`, `@MaxLength`, `@IsUUID`, `@IsInt`, etc.). Añadir límite de tamaño
  de body en el `bodyParser` de Nest para las rutas no-multipart.
- **Verificación sugerida:** test e2e que envíe un campo no declarado a un
  endpoint y espere `400`; test que envíe un string sobre `@MaxLength` y espere
  `400`.
- **Tipo de cambio requerido:** `CODE FIX`

---

### F-02 — Sin límite de tasa (rate limiting) en ninguna capa

- **Severidad:** MEDIUM
- **Confianza:** ALTA
- **Categoría:** disponibilidad / abuso / fuerza bruta
- **Artefacto afectado:** `apps/backend` (sin `@nestjs/throttler`),
  `infra/docker/Caddyfile.prod` (sin `rate_limit`)
- **Ubicación:** ausencia global — `grep` de `throttler` / `Throttle` /
  `rate_limit` / `rateLimit` en todo el repo (excluyendo `node_modules`) no
  encuentra nada.
- **Descripción:** El único freno a peticiones repetidas es el bloqueo de cuenta
  por intentos fallidos de login, que es **por usuario** (`login:intentos:{userId}`
  o clave señuelo por `codigo`). No hay límite por IP, ni límite en endpoints no
  autenticados (`POST /api/auth/recovery` — solo cooldown de 60 s por usuario
  existente), ni límite en `POST /api/votos`, ni límite en las rutas de descarga
  de binarios (`/api/configuracion/logo`, fotos, planes de trabajo).
- **Evidencia:** `bloqueo.service.ts` (contador por `userId`);
  `recovery.service.ts:14` (`COOLDOWN_SECONDS = 60`, por usuario);
  `Caddyfile.prod` (sin directiva `rate_limit`); `main.ts` (sin middleware).
- **Escenario de ataque:**
  1. **Lockout dirigido durante la jornada.** El sistema se diseña para 1.000
     votantes concurrentes. Un atacante que conozca (o adivine) el `codigo` de un
     votante — son códigos institucionales, no secretos — le envía 5 logins
     fallidos y lo deja bloqueado 15 min. Repetido en bucle sobre una lista de
     códigos, niega el voto a un segmento del padrón. El desbloqueo manual del
     comité no escala a cientos de cuentas.
  2. **Credential stuffing distribuido.** Sin freno por IP, un atacante prueba 4
     contraseñas por cuenta sobre miles de cuentas sin disparar ningún bloqueo
     (el contable exige `password_incorrecta` y el 5º intento bloquea, pero 4
     intentos × N cuentas es mucho margen).
  3. **Agotamiento de recursos.** Ráfaga de `POST /api/votos` o de descargas de
     binarios de 5 MB desde una IP satura CPU/memoria/ancho de banda del VPS
     durante la ventana crítica.
- **Impacto potencial:** denegación de servicio parcial del acto electoral;
  facilita el abuso de F-01 (payloads grandes sin freno).
- **Mitigación existente:** bloqueo por usuario; `maxmemory` en Redis; límites de
  memoria por contenedor en `docker-compose.prod.yml` (contienen el daño, no lo
  evitan).
- **Remediación recomendada:** `rate_limit` en `Caddyfile.prod` por IP para
  `/api/auth/*` y un límite global más laxo; adicionalmente `@nestjs/throttler`
  con perfiles por endpoint (login/recovery estrictos, voto moderado).
  Considerar un límite de intentos por IP además del límite por cuenta.
- **Verificación sugerida:** test de carga que confirme `429` tras N peticiones
  desde una IP a `/api/auth/login`.
- **Tipo de cambio requerido:** `DESIGN / ADR CHANGE` (definir la política) +
  `CODE FIX` (implementarla)

---

### F-03 — La auditoría nunca registra IP ni user-agent

- **Severidad:** MEDIUM
- **Confianza:** ALTA
- **Categoría:** integridad de la auditoría / forense
- **Artefacto afectado:** `apps/backend/src/auditoria/auditoria.service.ts`;
  `apps/backend/src/main.ts`
- **Ubicación:** `auditoria.service.ts:21-38` — la firma de `log()` es
  `(tx, eventType, actorId, entityType, entityId, payload)`. No recibe ni escribe
  `ip_address` ni `user_agent`.
- **Descripción:** El modelo `EventoAuditoria` (`schema.prisma:522-534`) define
  las columnas `ip_address @db.Inet` y `user_agent`, pero **ningún llamador las
  puebla** — todos los `auditoria.log(...)` del código (`auth.service.ts`,
  `votos.service.ts`, `bloqueo.service.ts`, `recovery.service.ts`,
  `importacion.service.ts`) omiten esos datos. Todo evento — `LOGIN_EXITOSO`,
  `LOGIN_FALLIDO`, `VOTO`, `CUENTA_BLOQUEADA` — queda con `ip_address = NULL` y
  `user_agent = NULL`. Además, `main.ts` no configura `trust proxy` en Express,
  así que aunque se pasara la IP, `request.ip` sería la IP de la red Docker de
  Caddy, no la del votante (Caddy sí reenvía `X-Forwarded-For` por defecto).
- **Evidencia:** `schema.prisma:529-530` (columnas definidas);
  `auditoria.service.ts:21-38` (firma sin esos parámetros); PRD.md módulo 13
  (*"registro completo e inmutable de sesiones... emisión de votos"*) y
  Supuestos (*"mitigar con... registro de accesos y auditoría"* como defensa
  anti-suplantación).
- **Escenario de ataque:** No es una vía de ataque directa; es una **pérdida de
  capacidad defensiva**. Ante una denuncia de suplantación ("alguien votó con mi
  cuenta"), o un lockout dirigido masivo (F-02), o un patrón de fraude, el comité
  electoral no puede correlacionar eventos por origen: no hay IP, no hay
  dispositivo. La auditoría inmutable — pilar del sistema según ADR-0010 —
  responde "quién (cuenta) y cuándo" pero no "desde dónde", que es justo lo que
  distingue al titular legítimo de un suplantador.
- **Impacto potencial:** investigaciones de incidentes electorales sin evidencia
  de origen; imposibilidad de demostrar o descartar acceso no autorizado;
  cumplimiento débil del requisito de "registro de accesos" del PRD.
- **Mitigación existente:** los logs de acceso JSON de Caddy
  (`/var/log/caddy/access.log`) sí tienen la IP, pero no están correlacionados
  con el evento de negocio ni son inmutables ni retenidos con el mismo criterio.
- **Remediación recomendada:** añadir `ipAddress`/`userAgent` a la firma de
  `log()` (o pasar el `Request` y extraerlos), configurar
  `NestFactory.create<NestExpressApplication>` + `app.set('trust proxy', 1)` (o
  el número de proxies real), y poblar los campos en al menos los eventos de
  sesión y de voto.
- **Verificación sugerida:** test e2e que emita un voto con un `X-Forwarded-For`
  conocido y verifique que la fila de `EventoAuditoria` lo persiste.
- **Tipo de cambio requerido:** `CODE FIX`

---

### F-04 — Inyección en encabezado `Content-Disposition` vía nombre de archivo sin sanear

- **Severidad:** MEDIUM
- **Confianza:** ALTA
- **Categoría:** manejo inseguro de salida / inyección de encabezados
- **Artefacto afectado:** `apps/backend/src/candidatos/listas.controller.ts`
- **Ubicación:** `listas.controller.ts:164` —
  `'Content-Disposition': \`attachment; filename="${planTrabajo.nombre}"\``
- **Descripción:** `planTrabajo.nombre` proviene del `originalname` de `multer`
  al subir el plan de trabajo (`PUT /api/listas/:id/plan-trabajo`), es decir, es
  controlado por el usuario que sube el archivo (rol `administrador` / `director`
  / `comite`), y se interpola **crudo** dentro del valor del encabezado. El
  propio equipo ya lo identificó como hallazgo pendiente:
  `votos.controller.ts:41-44` dice *"a diferencia de
  `ListasController.obtenerPlanTrabajo()`, que lo interpola crudo desde
  `originalname` de multer... queda como hallazgo para backlog"*.
- **Evidencia:** `listas.controller.ts:164` (interpolación cruda) vs.
  `votos.controller.ts:45-47` + `:197` (misma operación **con**
  `sanearNombreArchivo()`).
- **Escenario de ataque:** un integrante del comité sube un PDF cuyo nombre
  contiene `"` (rompe el valor entrecomillado y puede inyectar parámetros como
  `filename=...; download=...`) o secuencias CR/LF. Node rechaza CR/LF en valores
  de encabezado con `ERR_INVALID_HTTP_TOKEN`/`ERR_INVALID_CHAR` → excepción no
  controlada → `500` cada vez que **cualquier** usuario descargue ese plan de
  trabajo (DoS persistente sobre ese recurso hasta que se corrija la fila).
- **Impacto potencial:** denegación de servicio del recurso; `Content-Disposition`
  malformado (nombre de descarga manipulado). No hay ejecución de código.
- **Mitigación existente:** ninguna en esta ruta. Las rutas equivalentes de
  `votos/*` sí sanean.
- **Remediación recomendada:** reutilizar `sanearNombreArchivo()` (o
  `content-disposition` de npm, que codifica según RFC 6266) en
  `listas.controller.ts` y en cualquier otra ruta que sirva binarios subidos.
  Revisar también `candidatos.controller.ts` (foto) por el mismo patrón.
- **Verificación sugerida:** test que suba un archivo con `"` y CRLF en el nombre
  y verifique que la descarga responde `200` con un `filename` saneado.
- **Tipo de cambio requerido:** `CODE FIX`

---

### F-05 — El SPA se sirve sin `Content-Security-Policy`

- **Severidad:** MEDIUM
- **Confianza:** MEDIA
- **Categoría:** configuración de seguridad / defensa en profundidad contra XSS
- **Artefacto afectado:** `infra/docker/Caddyfile.prod`
- **Ubicación:** `Caddyfile.prod:24-33` — el bloque `header` define HSTS,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `-Server`,
  pero **no** `Content-Security-Policy` ni `Permissions-Policy`.
- **Descripción:** Las respuestas HTML del frontend (ruta `handle { reverse_proxy
  frontend:8080 }`) no llevan CSP. En una aplicación que maneja votos y muestra
  contenido cargado por el comité (nombres de candidatos, lemas, propuestas,
  símbolos), la ausencia de CSP significa que cualquier XSS —almacenado en un
  campo de candidato o reflejado— se ejecuta sin contención: robo de la cookie no
  es posible (`httpOnly`), pero sí la emisión de un voto en nombre de la víctima
  desde su propia sesión, o la exfiltración del comprobante.
- **Evidencia:** `Caddyfile.prod:24-33`; el contenido de candidatos es texto
  libre editable por el comité (`schema.prisma:242-279`, campos `nombre`, `lema`,
  `propuesta`, `plan_trabajo`).
- **Escenario de ataque:** depende de que exista un sink de XSS en el frontend
  (no verificado en esta pasada — ver "capas no revisadas"). Si existe, sin CSP
  el impacto es total sobre la sesión del votante.
- **Impacto potencial:** amplificación de cualquier XSS del frontend a
  voto-en-nombre-de / exfiltración de comprobante.
- **Mitigación existente:** cookie `httpOnly` (limita robo de sesión);
  `X-Frame-Options: DENY` (anti-clickjacking); las rutas de binarios de la API sí
  tienen CSP propia.
- **Remediación recomendada:** añadir una CSP restrictiva a las respuestas del
  frontend en `Caddyfile.prod` (`default-src 'self'`; `script-src 'self'`;
  `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`), ajustada a
  lo que el build de Vite realmente necesita. Añadir `Permissions-Policy` para
  desactivar APIs no usadas (cámara, micrófono, geolocalización).
- **Verificación sugerida:** revisar la respuesta de `/` en producción con
  `curl -I` y validar la CSP con un evaluador; smoke test que confirme que el SPA
  sigue cargando.
- **Tipo de cambio requerido:** `CODE FIX` (config de infraestructura)

---

### F-06 — Archivos subidos se validan por extensión + MIME declarado, no por contenido; se acepta SVG

- **Severidad:** LOW
- **Confianza:** MEDIA
- **Categoría:** manejo inseguro de archivos
- **Artefacto afectado:** `apps/backend/src/candidatos/archivos.ts`,
  `apps/backend/src/importacion/importacion.controller.ts`,
  `apps/backend/src/configuracion/configuracion.controller.ts`
- **Ubicación:** `archivos.ts:25-95` (`filtroPlanTrabajo`, `filtroFoto`);
  `configuracion.controller.ts:54-97` (`filtroArchivoLogo`, acepta `svg`).
- **Descripción:** Los filtros comprueban la extensión del nombre y el
  `mimetype` **declarado por el cliente** (`multer` lo toma del multipart, no lo
  deduce del contenido). No hay verificación de *magic bytes* ni de estructura.
  Un usuario con rol de gestión puede almacenar bytes arbitrarios (por ejemplo
  un políglota HTML/imagen, o un PDF con JavaScript embebido) bajo un nombre
  `.png`/`.pdf`/`.svg` y un `Content-Type` válido. Para el logo se acepta además
  `image/svg+xml`, que es contenido activo (puede contener `<script>`, `onload`).
- **Evidencia:** `archivos.ts:38` (`archivo.mimetype !== 'application/pdf'` —
  confía en el valor declarado); `configuracion.controller.ts:54`
  (`/\.(png|jpe?g|svg)$/i`).
- **Escenario de ataque:** limitado. El servido de vuelta está bien defendido:
  `Content-Disposition: attachment` + `nosniff` + `Content-Security-Policy:
  default-src 'none'` en fotos/planes, y `default-src 'none'; style-src
  'unsafe-inline'` en el logo. Una navegación directa al binario no ejecuta
  script. El riesgo real requiere que el frontend renderice el SVG del logo
  *inline* (`<svg>` en el DOM en vez de `<img src>`) — no verificado en esta
  pasada.
- **Impacto potencial:** XSS almacenado si el frontend inserta el SVG del logo
  inline; almacenamiento de contenido malicioso servible desde el origen de la
  app.
- **Mitigación existente:** encabezados de descarga endurecidos; roles de subida
  restringidos a `administrador`/`director`/`comite`; sin almacenamiento en FS.
- **Remediación recomendada:** validar *magic bytes* (`file-type` de npm o
  chequeo manual de la firma) tras recibir el buffer; para el logo, o bien
  eliminar SVG de la allowlist, o bien sanearlo con DOMPurify/`svgo` en modo
  seguro antes de persistir; confirmar que el frontend usa `<img>` y no render
  inline.
- **Verificación sugerida:** test que suba un `.png` cuyo contenido sea HTML y
  espere rechazo.
- **Tipo de cambio requerido:** `CODE FIX` (o `ACCEPT RISK` documentado si se
  confirma que el frontend nunca renderiza SVG inline y los roles de subida se
  consideran de confianza plena)

---

### F-07 — `exceljs` parsea el archivo completo en memoria antes de aplicar el tope de filas

- **Severidad:** LOW
- **Confianza:** MEDIA
- **Categoría:** agotamiento de recursos / DoS
- **Artefacto afectado:** `apps/backend/src/importacion/importacion.service.ts`
- **Ubicación:** `importacion.service.ts:273-299` (`parsearArchivo`) — el
  `workbook.xlsx.load(buffer)` / `workbook.csv.read(...)` corre y materializa
  todas las filas **antes** de que `importar()` verifique
  `filasDatos.length > LIMITE_FILAS` (`:77`).
- **Descripción:** El límite de multipart es 5 MB (`importacion.controller.ts:44`).
  Un `.xlsx` es un ZIP: 5 MB comprimidos pueden descomprimir a mucho más (celdas
  repetidas, shared strings), y `exceljs` construye el árbol de filas en memoria
  en el event loop antes de cualquier chequeo de tope. El tope de 2000 filas se
  aplica después.
- **Evidencia:** `importacion.service.ts:69-82` (orden: parsear → validar
  cabecera → validar tope); comentario en `:27-30` reconoce el "bloqueo del event
  loop del enfoque síncrono".
- **Escenario de ataque:** un `administrador`/`director` sube un `.xlsx`
  artesanal de 5 MB que expande a cientos de MB / millones de celdas → pico de
  memoria y stall del event loop del backend durante segundos (todo el backend,
  no solo la petición). Rol restringido, así que el vector es un insider o una
  cuenta de gestión comprometida.
- **Impacto potencial:** degradación temporal del backend durante una
  importación maliciosa.
- **Mitigación existente:** límite de 5 MB; rol restringido; límite de memoria
  del contenedor `backend` (1 GB) contiene el peor caso.
- **Remediación recomendada:** usar la API de streaming de `exceljs`
  (`WorkbookReader`) con corte temprano al superar el tope de filas; o mover la
  importación al `worker` (fuera del proceso que atiende votos). Reducir el
  límite de multipart a algo más cercano al tamaño real de un padrón de 2000
  filas.
- **Verificación sugerida:** test con un `.xlsx` de muchas filas que verifique
  corte antes de materializar todo.
- **Tipo de cambio requerido:** `CODE FIX` (o `ACCEPT RISK` dado el rol
  restringido y el aislamiento de memoria)

---

### F-08 — Cookie de sesión sin prefijo `__Host-` y sin defensa CSRF explícita

- **Severidad:** INFO
- **Confianza:** ALTA
- **Categoría:** manejo de sesión / CSRF
- **Artefacto afectado:** `apps/backend/src/auth/auth.controller.ts`
- **Ubicación:** `auth.controller.ts:30` (`COOKIE_NAME = 'seei_session'`),
  `:72-77` y `:105-110` (opciones de la cookie).
- **Descripción:** La cookie es `httpOnly`, `sameSite: 'lax'`, `secure` en
  producción, `path: '/'`, sin `maxAge` (cookie de navegador). No usa el prefijo
  `__Host-` (que ataría la cookie al host exacto y a `Secure`+`path=/` sin
  `Domain`). No hay token anti-CSRF; la protección descansa en `SameSite=Lax` +
  API del mismo origen que el SPA.
- **Evidencia:** `auth.controller.ts:72-77`.
- **Escenario de ataque:** `SameSite=Lax` bloquea el envío de la cookie en
  POST cross-site, que es la forma de las operaciones sensibles (voto, login,
  configuración), por lo que el riesgo CSRF real es bajo. El GET top-level
  cross-site sí lleva la cookie, pero los GET del sistema no mutan estado.
- **Impacto potencial:** bajo, dada la arquitectura de un solo origen.
- **Mitigación existente:** `SameSite=Lax`, mismo origen, `httpOnly`.
- **Remediación recomendada:** renombrar la cookie a `__Host-seei_session`
  (cumple los requisitos: `Secure`, `path=/`, sin `Domain`); considerar
  `SameSite=Strict` para esta cookie ya que no hay flujo de retorno cross-site
  legítimo (el login OAuth usa ID token por POST, no redirect). Documentar la
  decisión de no usar token CSRF.
- **Verificación sugerida:** revisión de encabezados `Set-Cookie` en producción.
- **Tipo de cambio requerido:** `ACCEPT RISK` (con endurecimiento opcional de
  bajo costo)

---

### F-09 — Política de contraseñas mínima (solo longitud ≥ 8)

- **Severidad:** INFO
- **Confianza:** ALTA
- **Categoría:** autenticación
- **Artefacto afectado:** `apps/backend/src/auth/recovery.service.ts`
- **Ubicación:** `recovery.service.ts:15` (`PASSWORD_MIN_LENGTH = 8`), `:105-107`.
- **Descripción:** La única regla es longitud mínima 8 en la confirmación de
  recuperación. No hay chequeo de contraseñas comunes/filtradas, ni longitud
  máxima explícita (argon2id acota el costo, pero conviene un tope, p. ej. 128),
  ni bloqueo de la contraseña igual al `codigo`/DNI/correo. Para una población
  grande de usuarios (muchos menores), esto tiende a contraseñas débiles; el
  bloqueo por fuerza bruta (F-02, por usuario) es la principal compensación.
- **Evidencia:** `recovery.service.ts:105`.
- **Impacto potencial:** cuentas con contraseñas adivinables; interactúa con
  F-02 (credential stuffing sin freno por IP).
- **Mitigación existente:** argon2id; bloqueo por 5 intentos; Google OAuth es la
  vía principal de acceso según el PRD (contraseña como alternativa).
- **Remediación recomendada:** longitud máxima; lista de denegación (top-N
  comunes o `zxcvbn`); prohibir coincidencia con `codigo`/DNI/correo. Aplicar la
  misma política en creación de usuario y en `recovery/confirm`.
- **Tipo de cambio requerido:** `CODE FIX` (baja prioridad)

---

## Prioridad recomendada

| Orden | Hallazgo | Severidad | Esfuerzo | Por qué ahora |
|-------|----------|-----------|----------|---------------|
| 1 | F-01 `ValidationPipe` global | HIGH | Bajo | Una línea en `main.ts` + auditoría de DTOs; cierra una clase entera de entrada no saneada. |
| 2 | F-02 Rate limiting | MEDIUM | Medio | Riesgo directo de DoS del acto electoral (lockout dirigido). Al menos `rate_limit` en Caddy para `/api/auth/*` antes de la próxima jornada. |
| 3 | F-03 IP/user-agent en auditoría | MEDIUM | Bajo-Medio | Sin esto, un incidente durante la jornada es no investigable. |
| 4 | F-04 `Content-Disposition` | MEDIUM | Bajo | Fix trivial (reusar helper existente); evita un `500` persistente. |
| 5 | F-05 CSP del SPA | MEDIUM | Bajo | Depende de confirmar el frontend, pero el encabezado es barato de añadir. |
| 6 | F-06 / F-07 archivos | LOW | Medio | Roles restringidos acotan el riesgo; abordar tras 1-5. |
| 7 | F-08 / F-09 | INFO | Bajo | Endurecimiento oportunista. |

---

## Gobernanza / decisiones requeridas (humano)

Los siguientes puntos **no** los puede resolver esta revisión — requieren una
decisión explícita del comité electoral / dirección / arquitectura:

1. **F-02 — Política de límite de tasa (`DESIGN / ADR CHANGE`).** Definir umbrales
   por endpoint e IP, y cómo se concilia el "lockout por usuario" con un
   "throttle por IP" sin que un NAT institucional (toda la escuela detrás de una
   IP el día de la votación) se auto-bloquee. Esta tensión es real y debe
   diseñarse, no solo codificarse. Candidato a nuevo ADR.

2. **F-06 — Aceptación de SVG para el logo (`DESIGN / ADR CHANGE` o `ACCEPT
   RISK`).** Decidir si SVG se mantiene en la allowlist. Si se mantiene, hay que
   sanearlo; si no, es un cambio de contrato de la feature de configuración.

3. **Riesgos ya aceptados en el PRD/ADRs que esta revisión confirma vigentes**
   (no hay acción nueva, se listan para trazabilidad):
   - **Cuenta compartida familia (ADR-0011).** El padre vota desde la cuenta del
     estudiante; los comprobantes son mutuamente visibles; el sistema no
     distingue quién de la familia votó. Aceptado y a declarar en las bases del
     proceso.
   - **Coacción presencial / "muéstrame tu pantalla" (ADR-0009).** No evitable por
     diseño; el comprobante autenticado es visible para quien tenga la credencial.
   - **Sin biometría (PRD).** Un voto vale lo que la custodia de la credencial;
     mitigado con bloqueo + auditoría (ver F-03: la auditoría hoy no registra
     origen, lo que debilita esta mitigación declarada).
   - **Anonimización post-jornada de datos personales de menores (ADR-0010).**
     Verificar que el procedimiento de anonimización administrativa auditada
     realmente existe y se ejecuta (no revisado: no se encontró código de
     anonimización en esta pasada — puede ser un procedimiento manual).

4. **`deploy.sh --force` durante una jornada abierta (`PROCESS / HARNESS`).**
   Está diseñado como escape de emergencia con doble gate humano (revisor de
   GitHub Environment + flag explícito). La estrategia "recreate" implica
   downtime en medio de la votación. Confirmar que el runbook de contingencia
   (ADR-0013) cubre "qué le decimos a los votantes durante ese downtime".

---

## Nota de método

Esta pasada construyó primero un modelo del sistema (producto → arquitectura →
datos → actores → fronteras de confianza → despliegue) y luego buscó riesgo
dentro de ese modelo. No se ejecutó ninguna herramienta de análisis dinámico ni
se modificó ningún archivo del proyecto salvo la creación de este reporte. Los
hallazgos se basan en evidencia concreta (archivo:línea); donde la confianza es
media se indica explícitamente qué falta verificar. Las capas listadas como "no
revisadas en profundidad" merecen una segunda pasada antes de producción,
especialmente el frontend y `google-oauth.service.ts`.
