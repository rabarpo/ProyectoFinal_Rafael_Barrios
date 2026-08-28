# SEEI — andamiaje del sistema

Monorepo pnpm + Turborepo: `apps/backend` (NestJS), `apps/frontend` (Vite + React),
`apps/worker` (Node.js + BullMQ), `packages/contracts` (contrato OpenAPI generado
y versionado). Ver `openspec/changes/system-scaffolding/design.md` para el diseño
completo del walking skeleton, y `docs/onboarding.md` para los pasos de arranque
local.

Ver [`adrs/0014-monorepo-pnpm-turborepo.md`](adrs/0014-monorepo-pnpm-turborepo.md) para la
decisión de herramental de monorepo y contrato OpenAPI versionado, y
[`adrs/0015-roles-postgresql-migrador-app.md`](adrs/0015-roles-postgresql-migrador-app.md) para
la decisión de los dos roles de PostgreSQL (`seei_migrator`/`seei_app`).

## HTTPS local

`infra/docker/Caddyfile` usa `tls internal`: Caddy emite certificados desde una CA local propia,
persistida en el volumen `caddy_data`. El navegador no confía en esa CA por defecto — hasta que se
confía explícitamente, la SPA no puede llamar a `https://seei.localhost/api/*` (el navegador
bloquea la petición) y las cookies `Secure` se comportan de forma anómala, un síntoma fácil de
diagnosticar erróneamente como un bug de la aplicación.

Paso único de onboarding, ya encapsulado en el script raíz `pnpm caddy:trust` (requiere que
`caddy` esté corriendo vía `pnpm compose:dev`):

```bash
pnpm caddy:trust
# equivalente a:
# docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml \
#   cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-local-root.crt
```

Después de generar `caddy-local-root.crt`, hay que confiarlo en el almacén de certificados del
sistema operativo:

| Sistema | Comando |
|---|---|
| Windows | `certutil -addstore -f "ROOT" caddy-local-root.crt` (consola con privilegios de administrador) |
| macOS | `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-local-root.crt` |
| Linux | copiar a `/usr/local/share/ca-certificates/` y ejecutar `sudo update-ca-certificates` |

**Firefox no usa el almacén del sistema operativo** — mantiene su propio almacén de confianza y
requiere importar `caddy-local-root.crt` por separado (`about:preferences#privacy` → Certificados →
Ver certificados → Autoridades → Importar).

`seei.localhost` resuelve a `127.0.0.1` en los navegadores y sistemas modernos (RFC 6761); si el
resolutor DNS del sistema no lo hace, agregar la entrada manualmente al archivo `hosts`.

### Gotcha: `docker-entrypoint-initdb.d` solo corre una vez

`infra/docker/postgres/init/01-roles.sql` (aprovisiona los roles `seei_migrator`/`seei_app`, ver
[`adrs/0015-roles-postgresql-migrador-app.md`](adrs/0015-roles-postgresql-migrador-app.md)) es
ejecutado por el entrypoint oficial de la imagen de Postgres **solo cuando el volumen `pgdata` está
vacío**. Si se modifica `01-roles.sql` con el volumen ya inicializado, el cambio **no** se aplica —
Postgres no vuelve a correr los scripts de `docker-entrypoint-initdb.d` sobre una base de datos
existente. Para que el cambio surta efecto:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml down -v
```

`down -v` borra el volumen `pgdata` (y `caddy_data`/`redis_data` si existieran) — solo seguro en
desarrollo local o en el compose de test efímero (`docker-compose.test.yml`, ya usa `tmpfs`), nunca
en un entorno con datos reales.

## Worker — `system.ping`

`apps/worker` corre un `Worker` de BullMQ (`bullmq`) escuchando la cola `system`
de Redis. El único job que procesa hoy es `system.ping`
(`apps/worker/src/processors/system-ping.processor.ts`): al recibirlo, escribe
la marca de tiempo actual en formato ISO 8601 en la clave de Redis
`system:ping:heartbeat`. `GET /api/health` del backend lee esa misma clave para
reportar `worker.ultimoPing`.

Este processor **no toca PostgreSQL** — es, a propósito, el andamiaje mínimo del
walking skeleton (`[R6]`) y **no es reutilizable como base para el patrón outbox
del ADR-0012** (issues #12/#15). El outbox exige que la fuente de verdad viva en
una tabla de PostgreSQL escrita en la misma transacción que el hecho notificado;
este heartbeat vive únicamente en Redis, sin esquema. Ver el doc-comment en el
propio archivo del processor y el diagrama de secuencia en `design.md`.

Ejecutar en local (requiere Redis accesible en `REDIS_URL`, por defecto
`redis://localhost:6379`):

```bash
pnpm --filter @seei/worker start
```

Pruebas del worker:

```bash
pnpm --filter @seei/worker test
```

## Worker — outbox de correo (`correo.comprobante`)

Backlog #15 (`openspec/changes/outbox-correo-comprobante-autenticado/design.md`) agrega una
segunda cola BullMQ, `correo`, escuchada por un `Worker` separado del de `system.ping` — la cola
`system` queda intacta. A diferencia de `system-ping.processor.ts`, este processor
(`apps/worker/src/processors/outbox-correo.processor.ts`) **sí** habla con PostgreSQL: la tabla
`JobCorreo` es la fuente de verdad del outbox ([ADR-0012]), BullMQ sólo ejecuta el envío y
gestiona los reintentos (`attempts`/`backoff` exponencial).

Un despachador (`apps/worker/src/outbox/outbox-dispatcher.ts`) hace *polling* de
`JobCorreo` (`estado='pendiente'`) cada `OUTBOX_POLL_MS` y encola por lotes de `OUTBOX_BATCH`
filas con `jobId` determinista (`jobcorreo:<id>`), para que una reentrega de BullMQ nunca duplique
el envío. El worker requiere `DATABASE_URL` (mismo rol `seei_app` que `backend`, mismo esquema
Prisma — sin segundo `schema.prisma`) y, si `Configuracion.smtp_host` está definido, `SMTP_USER`/
`SMTP_PASSWORD` para componer `SmtpEmailSender` (ver la tabla de variables en
`docs/onboarding.md`).

El [ADR-0018](adrs/0018-ventana-temporal-jobcorreo-diferido.md) — la ventana temporal en la que
`#14` emitía votos sin insertar su `JobCorreo` — queda **superado** por este backlog: la fila nace
en la misma transacción del voto (`VotosService.emitir()`), verificado por
`apps/backend/test/votos/outbox-atomicidad.e2e-spec.ts`. `apps/backend/scripts/
reconciliar-outbox.ts` es una utilidad de diagnóstico de **sólo lectura** (`pnpm --filter
@seei/backend exec tsx scripts/reconciliar-outbox.ts`): identifica votos sin `JobCorreo`
asociado; nunca inserta filas — insertar ahí reconstruiría el despachador desacoplado que el
ADR-0018 veta de forma permanente.

## Backend — resultados en vivo (`GET /procesos/:id/resultados`)

Backlog #16 (`openspec/changes/resultados-en-vivo/design.md`) agrega un endpoint autenticado
(`AuthGuard` sin `@Roles()`, cualquier votante con `DerechoVoto` en el proceso) que expone
participación y, si `ocultar_resultados = false`, el desglose por candidato/lista/opción. Las
lecturas se sirven detrás de una caché corta en Redis (`SETEX resultados:{proceso_id}
RESULTADOS_CACHE_TTL_SECONDS`, por defecto 8 s — ver la tabla de variables en
`docs/onboarding.md`) para amortiguar la ráfaga de sondeo del frontend (`useResultadosEnVivo`,
`refetchInterval` de 15 s). El frontend elige el tipo de gráfico (`recharts`) según el campo
`dimension` que manda el servidor: pastel para `opcion`, barras horizontales para `lista`/
`candidato` — nunca decidido en el cliente.

## Worker — actas de escrutinio (`acta.pdf`)

Backlog #17 (`openspec/changes/cierre-escrutinio-actas/design.md`) agrega una tercera cola BullMQ,
`actas`, separada de `correo` para que un SMTP caído nunca encole el cierre detrás de los
reintentos del outbox de correo. `POST /procesos/:id/cerrar` (backend) crea las 4 filas `Acta` en
`estado='borrador'` dentro de la misma transacción del cierre; el backend **nunca** encola nada
(ADR-0018/ADR-0012) — un despachador de *polling* (`apps/worker/src/actas/actas-dispatcher.ts`)
descubre esas filas cada `ACTAS_POLL_MS` y las encola por lotes de `ACTAS_BATCH` con `jobId`
determinista (`acta:<id>`).

El processor puro (`apps/worker/src/processors/actas.processor.ts`) sólo conoce dos puertos
(`ActasRepo`, `RendererActa`), nunca Prisma ni BullMQ. El render corre con `pdfkit`
(`apps/worker/src/actas/pdfkit-renderer.ts`, único archivo que la importa), sólo fuentes estándar,
sin recursos externos. La transacción terminal (`apps/worker/src/actas/actas.repo.ts`) hace, por
acta: `SELECT … FOR UPDATE` sobre `ProcesoElectoral` (obligatorio para evitar que el proceso quede
atascado entre `cerrado` y `acta_emitida` si dos workers cierran la 3ª y la 4ª acta en paralelo),
CAS `UPDATE … WHERE estado='borrador'`, un evento `ACTA_GENERADA` de auditoría (`actor_usuario_id
IS NULL` — el worker no tiene sesión) y, si las 4 actas del proceso quedan `emitida`, la transición
`cerrado → acta_emitida`. `estado='fallido'` lo escribe sólo el listener `actasWorker.on('failed')`
cuando la cola agota los `attempts` configurados, nunca el processor ni el repo.

## Worker — reportes y exportaciones (`reporte.generar`)

Backlog #18 (`openspec/changes/reportes-y-exportaciones/design.md`) agrega una cuarta cola BullMQ,
`reportes`, propia y separada de `actas`/`correo`: un export de 2000 filas en Excel es lento y con
`attempts: 5` puede ocupar un worker minutos, y encolarlo detrás del cierre de actas retrasaría esa
operación crítica. `POST /reportes` (backend) congela el `ModeloReporte` completo en
`Reporte.contenido` dentro de la transacción de la solicitud y deja la fila en `estado='borrador'`
— el backend **nunca** encola nada (ADR-0012) — un despachador de *polling*
(`apps/worker/src/reportes/reportes-dispatcher.ts`) descubre esas filas cada `REPORTES_POLL_MS` y
las encola por lotes de `REPORTES_BATCH` con `jobId` determinista (`reporte:<id>`).

El processor puro (`apps/worker/src/processors/reportes.processor.ts`) sólo conoce dos puertos
(`ReportesRepo`, un `RendererReporte` por formato), nunca Prisma ni BullMQ. Antes de renderizar
relee `ProcesoElectoral.ocultar_resultados` VIGENTE (nunca el congelado en la solicitud) y poda toda
sección `sensible: true` con la misma regla genérica de `modelo-reporte.ts` — la visibilidad es una
política, no un dato, y se evalúa de nuevo en cada capa (gate de tres capas: solicitud, generación,
descarga). Tres renderizadores separados, un adaptador por formato, ninguno conoce a los otros:
`apps/worker/src/reportes/exceljs-renderer.ts` (`exceljs`, hoja por sección + `Metadatos`),
`apps/worker/src/reportes/pdfkit-renderer-reporte.ts` (`pdfkit`, mismas decisiones de determinismo
que el renderizador de actas) y `apps/worker/src/reportes/csv-renderer.ts` (función pura, sólo
`secciones[0]`, con `apps/worker/src/reportes/csv.ts` reimplementando a propósito el escaping RFC
4180 y la neutralización anti-fórmula de `apps/backend/src/importacion/padron-csv.ts` — el worker
no puede importar ese módulo del backend, `rootDir` de `apps/worker/tsconfig.json`). La transacción
terminal (`apps/worker/src/reportes/reportes.repo.ts`) hace, por reporte: CAS
`UPDATE … WHERE estado='borrador'` (sin `SELECT … FOR UPDATE` — a diferencia de actas, no hay
ninguna agregación entre filas que proteger) y un evento `REPORTE_GENERADO` de auditoría con
`actor_usuario_id` leído de `Reporte.solicitado_por` **dentro** de la transacción, nunca del
payload de BullMQ (volátil). `estado='fallido'` lo escribe sólo el listener
`reportesWorker.on('failed')` cuando la cola agota los `attempts` configurados.

## Worker — notificaciones (`notificacion.correo`) y sweep

Backlog #19 (`openspec/changes/notificaciones/design.md`) agrega una quinta cola BullMQ,
`notificaciones`, propia y separada de `correo`/`actas`/`reportes` (corrige C5 — antes de este
change, `pendientes()` de la cola `correo` no filtraba por `origen` y un `JobCorreo` de
notificación calificaba también ahí). El processor se **reusa tal cual**
(`apps/worker/src/processors/outbox-correo.processor.ts`, el mismo de `correo`): es agnóstico del
contenido y ya tiene la barrera CAS real, sólo cambia el repo
(`apps/worker/src/notificaciones/notificaciones.repo.ts`, `pendientes()` propio con
`origen:'notificacion'`). Un despachador de *polling*
(`apps/worker/src/notificaciones/notificaciones-dispatcher.ts`) descubre esas filas cada
`NOTIFICACIONES_POLL_MS` y las encola por lotes de `NOTIFICACIONES_BATCH` con `jobId` determinista
(`notificacion:<id>`).

Además de la cola, un **sweep periódico** (`apps/worker/src/notificaciones/sweep-notificaciones.ts`,
`barrerNotificaciones`, función pura con `ahora` inyectado) recorre cada `NOTIFICACIONES_SWEEP_MS`
los procesos `abierto` y decide, independientemente para cada uno, si emitir `recordatorio`
(`NOTIFICACIONES_RECORDATORIO_HORAS`) y/o `cierre_proximo` (`NOTIFICACIONES_CIERRE_PROXIMO_HORAS`)
según las horas restantes hasta `fecha_cierre_prevista` — los dos umbrales no se cancelan entre sí.
El adaptador (`apps/worker/src/notificaciones/sweep.repo.ts`) corta antes de tocar el padrón
completo si ya existe una `Notificacion` para ese `(proceso, evento)` [threat: denegación por
barrido/transacción larga], y reusa `emitirNotificaciones()` de `@seei/backend` (mismo emisor que
los hooks de apertura/cierre del backend) para la deduplicación real vía `ON CONFLICT` sobre
`(proceso_id, evento, usuario_id)` — el atajo del repo es una optimización, no la garantía de
correctitud bajo concurrencia.
