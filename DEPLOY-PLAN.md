# Deploy Plan — SEEI (Sistema de Elecciones Electrónicas para Instituciones Educativas)

Fecha: 2026-08-31
Estado: GENERADO

## Resumen del proyecto

Monorepo pnpm + Turborepo, todo TypeScript. Tres componentes desplegables:

- **`apps/backend`** — NestJS, monolito modular. Escucha en `:3000`, prefijo global `/api`.
  Prisma + PostgreSQL 16. Única escritura sobre la base de negocio.
- **`apps/frontend`** — SPA Vite/React. Se compila a estático (`dist/`) y se sirve con `serve` en `:8080`.
- **`apps/worker`** — Node + BullMQ, 5 colas (`system`, `correo`, `actas`, `reportes`, `notificaciones`).
  Sin superficie HTTP. Corre TypeScript directo con `tsx`.
- **`packages/contracts`** — cliente OpenAPI generado y versionado.

Servicios de infraestructura: PostgreSQL 16, Redis 7, Caddy (único entrypoint TLS).
Servicios externos: SMTP saliente (Google Workspace), OAuth Google restringido al dominio institucional (ADR-0017).

**Ya construido:**

- Stack Docker Compose local completo (`infra/docker/docker-compose.yml` + `.dev.yml` + `.test.yml`).
- Dockerfiles multi-stage `runtime` para backend / frontend / worker.
- Servicio `migrate` de un solo uso: `prisma migrate deploy` con el rol `seei_migrator`, encadenado
  por `depends_on … condition: service_completed_successfully` antes de backend y worker.
- Dos roles de PostgreSQL (`seei_migrator` propietario del esquema, `seei_app` runtime) provisionados
  por `infra/docker/postgres/init/01-roles.sql` (solo corre con el volumen `pgdata` vacío).
- CI (`.github/workflows/ci.yml`): deriva OpenAPI → deriva de migraciones → lint/typecheck/build/test
  → suite e2e del backend contra compose efímero. Corre en push a `main` y en PRs.
- `GET /api/health` agrega estado real de Postgres + Redis + último heartbeat del worker. **Devuelve
  siempre HTTP 200**; el campo `estado` vale `"ok"` o `"degradado"` — el smoke test debe leer el body.
- 20 migraciones Prisma aplicadas, forward-only, con `migration_lock.toml`.

**Objetivo (ADR-0007):** VPS en la nube (~4 vCPU / 8 GB) con Docker Compose tras Caddy con HTTPS
automático; respaldos programados de Postgres y del volumen de archivos copiados fuera del VPS a
object storage; firewall exponiendo solo 80/443; admin por SSH con llave.

**Decisiones tomadas para este Deploy Pass:**

- No hay VPS todavía — el plan se diseña desde cero, incluyendo aprovisionamiento.
- Imágenes construidas **en el servidor** (`git pull` + `docker compose build`), no en CI con registry.
- No hay dominio todavía — hay que registrar uno y apuntar un registro A al VPS antes del primer deploy.
- Alcance de esta corrida: DISCOVER → DESIGN → GENERATE. El EXECUTE real queda para cuando exista el VPS.

## Sistema de deployment propuesto

### Build

Construcción en el propio VPS, disparada por el script de deploy:

```
git fetch --tags  →  git checkout <tag>  →  docker compose … build  →  docker compose … up -d --wait
```

Determinismo:

- `pnpm install --frozen-lockfile` en todas las etapas de los tres Dockerfiles → dependencias fijadas
  por `pnpm-lock.yaml`.
- Imágenes base ancladas: `node:22-alpine`, `postgres:16-alpine`, `redis:7-alpine`, `caddy:2-alpine`.
  Se recomienda migrar a digests (`node:22-alpine@sha256:…`) en un cambio posterior para determinismo pleno.
- El contrato OpenAPI ya viene generado y versionado en el repo; el build no lo regenera (CI ya verificó
  que no hay deriva sobre ese commit).
- El deploy siempre parte de un **tag de git**, nunca de `main` móvil.

Contrapartida asumida: construir en el VPS consume CPU/RAM del mismo servidor que corre producción.
En una máquina de 4 vCPU / 8 GB el build de los tres paquetes es tolerable fuera de jornada; **nunca
se despliega durante una jornada electoral** (ver Estrategia de release). Si el build llegara a competir
con la carga real, el siguiente paso es mover el build a CI + GitHub Container Registry (queda como
evolución documentada, no se implementa ahora).

### Artifact

Lo que se despliega es el **conjunto de imágenes Docker locales** construidas en el VPS a partir de un
tag de git:

- `seei-backend`, `seei-frontend`, `seei-worker` (build local, `pull_policy: build`).
- `postgres:16-alpine`, `redis:7-alpine`, `caddy:2-alpine` (imágenes públicas ancladas).

Trazabilidad: cada deploy queda atado a un tag `deploy/AAAA-MM-DD-NN` (o `vX.Y.Z` si se adopta
versionado semántico). El script de deploy escribe un registro local en el VPS
(`/opt/seei/deploys.log`: fecha, tag, commit SHA, usuario, resultado del smoke test) y deja el tag
anterior anotado para el rollback. `docker image ls` conserva la imagen previa hasta el siguiente
`prune`, de modo que un rollback inmediato no necesita reconstruir.

### Config & Secrets

Un único archivo `/opt/seei/.env` en el VPS, propiedad de `root`, `chmod 600`, **nunca** en git
(`.env` ya está en `.gitignore` y `.dockerignore`). Docker Compose lo carga automáticamente por estar
en el directorio del proyecto. Se genera una sola vez durante el aprovisionamiento a partir de
`infra/docker/.env.prod.example` (se genera en GENERATE).

| Tipo | Variables | Dónde vive |
|---|---|---|
| **Secret** | `POSTGRES_PASSWORD`, `SEEI_MIGRATOR_PASSWORD`, `SEEI_APP_PASSWORD`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `GOOGLE_CLIENT_ID` (+ secret si aplica el flujo server-side), `SMTP_USER`, `SMTP_PASSWORD` | `/opt/seei/.env` (600, root) |
| **Config** | `APP_BASE_URL`, `GOOGLE_HOSTED_DOMAINS`, `RESULTADOS_CACHE_TTL_SECONDS`, `OUTBOX_POLL_MS`/`OUTBOX_BATCH`, `ACTAS_*`, `REPORTES_*`, `NOTIFICACIONES_*`, `LOGIN_INTENTOS_*`, `RECOVERY_TTL_SECONDS` | mismo `.env` (no son secretos, pero conviven ahí por simplicidad) |
| **Config de despliegue** | dominio en el `Caddyfile.prod`, credenciales de object storage para el backup (`rclone.conf` en `/opt/seei/`, 600) | VPS |

Reglas:

- Contraseñas generadas con `openssl rand -base64 32` durante el aprovisionamiento, nunca reusadas
  de `.dev`/`.test`.
- La contraseña SMTP **nunca** se lee de la tabla `Configuracion` (regla ya vigente en el código:
  `ConfiguracionEmailSender`); viaja solo por `.env`.
- Ningún secreto en logs: Caddy no loguea bodies; el backend no imprime `DATABASE_URL`.
- Secretos de CI para el workflow de deploy (llave SSH, host, usuario) van en **GitHub Environments →
  `production`**, no en secrets de repo sueltos, para poder exigir revisores.

### Infraestructura

**Un VPS único** con Docker Compose, según ADR-0007. Topología (ya definida en `docker-compose.yml`):
Caddy es el único que publica puertos (`80`, `443`, `443/udp`); backend, frontend, worker, Postgres y
Redis viven solo en la red interna `seei`. Postgres y Redis nunca accesibles desde Internet.

**Proveedor — a decidir en el aprovisionamiento, no por defecto acá.** Dos candidatos con una
contrapartida real:

| Proveedor | Instancia ref. | Costo aprox. | Nota |
|---|---|---|---|
| Hetzner Cloud | CPX32 (4 vCPU / 8 GB) | ~14 €/mes | Más barato; datacenters solo en UE/EEUU. |
| AWS Lightsail | 4 vCPU / 8 GB, región `sa-east-1` (São Paulo) | ~40 US$/mes | Datacenter en Sudamérica — relevante para el riesgo legal de datos de menores (Ley de Protección de Datos Personales del Perú, riesgo abierto en TECH-DESIGN y ADR-0007: región del datacenter, cifrado en reposo). |

**Recomendación:** decidir junto con la revisión legal de backlog #21. Si esa revisión exige región
sudamericana o cláusulas específicas, Lightsail São Paulo; si no hay restricción dura, Hetzner por costo.
La topología Docker Compose es idéntica en cualquiera de los dos.

**DNS:** registrar un dominio (p. ej. `seei.<colegio>.edu.pe`) y crear un registro A → IP del VPS
**antes** del primer deploy — Caddy no puede emitir el certificado Let's Encrypt sin DNS resuelto.

**Almacenamiento de archivos — corrección respecto a ADR-0007:** ADR-0007 asumía un volumen Docker de
archivos separado. El código real **no lo usa**: fotos de candidatos (`Candidato.foto`), planes de
trabajo (`Lista.plan_trabajo`), logo institucional (`Configuracion.logo`), actas (`Acta.pdf`) y
reportes (`Reporte.archivo`) se guardan como columnas `Bytes` en PostgreSQL y se sirven vía
`StreamableFile`. Por lo tanto **`pg_dump` es el respaldo completo** — datos y archivos en un solo
artefacto. No se agrega ningún volumen `seei_uploads`. El único volumen con estado además de `pgdata`
es `caddy_data` (certificados TLS; se regeneran solos si se pierden) y `redisdata` (colas BullMQ en
vuelo; pérdida tolerable — los despachadores de outbox reencolan desde Postgres).

**Object storage para respaldos:** bucket del proveedor (Hetzner Storage Box / S3 Lightsail / Backblaze B2),
accedido con `rclone` desde el cron de backup.

### Entornos

| Entorno | Dónde | Compose | TLS | Datos |
|---|---|---|---|---|
| **dev** | local | `docker-compose.yml` + `docker-compose.dev.yml` | `tls internal` (`seei.localhost`) | volumen local, `down -v` libre |
| **prod** | VPS | `docker-compose.yml` + `docker-compose.prod.yml` | Let's Encrypt, dominio real | volúmenes persistentes + respaldo offsite |

Lo único que cambia entre entornos es **configuración y secretos**, no código: overlay de compose,
Caddyfile, y `.env`. Las mismas imágenes `runtime` de los Dockerfiles corren en ambos.

**Sin staging al inicio.** Antes de la primera jornada real se recomienda un entorno de staging
(segundo VPS chico, o el mismo VPS con un proyecto compose `seei-staging` en otros puertos internos)
para ejecutar la prueba de carga de 1.000 concurrentes (backlog #23) y el ensayo de restauración
(ADR-0013) sin tocar producción. Queda anotado como prerequisito de la primera elección, no de este deploy.

### Estrategia de release

**Recreate con ventana de indisponibilidad corta**, fuera de jornada electoral.

Razón: un solo nodo. Blue/green o rolling exigirían un segundo backend detrás de un balanceador y
sesiones compartidas — sobredimensionado para la carga (jornadas puntuales, resto del año mínimo) y
para el presupuesto de ADR-0007. La carga real ocurre en ventanas conocidas y programadas.

Secuencia (`infra/scripts/deploy.sh`):

1. Verifica que el árbol esté limpio y que exista el tag objetivo.
2. **Backup previo** (`backup.sh`) — obligatorio, aborta el deploy si falla.
3. `docker compose … build`.
4. `docker compose … up -d --wait` — Compose recrea solo los servicios cuya imagen cambió. El servicio
   `migrate` corre primero (`prisma migrate deploy`) y backend/worker esperan su
   `service_completed_successfully`. Caddy espera los healthchecks de backend y frontend.
5. **Smoke test** (`smoke.sh`). Si falla → rollback automático al tag anterior + `up -d` + smoke test
   de nuevo, y se reporta.
6. Registra el resultado en `/opt/seei/deploys.log`.

Ventana de indisponibilidad esperada: segundos a pocos minutos (recreación de contenedores + migración).
**Regla dura:** no se despliega con una jornada `abierta`. El script consulta
`GET /api/panel-jornada` (o la tabla de procesos) y aborta si hay un proceso en estado `abierto`,
salvo `--force` explícito para una corrección de emergencia autorizada.

### Data & Migrations

- Migraciones **forward-only** con Prisma (`prisma migrate deploy`, rol `seei_migrator`). Ya está
  encadenado en el compose vía el servicio `migrate`.
- El esquema lo posee `seei_migrator`; el runtime usa `seei_app` (sin DDL). No cambia en producción.
- **Un rollback de código NO es un rollback de datos.** Si un deploy incluye una migración destructiva
  o incompatible y hay que volver atrás:
  - Rollback de código al tag anterior → **solo seguro si la migración nueva es retrocompatible**
    (columna agregada nullable, índice, tabla nueva). El código viejo ignora lo nuevo.
  - Si la migración no es retrocompatible (columna renombrada/eliminada, constraint que rechaza datos
    del código viejo) → la vuelta atrás real es **restaurar el backup previo al deploy** y perder lo
    escrito entre el backup y el rollback. Por eso el backup previo es obligatorio y bloqueante.
- Convención para futuras specs: preferir migraciones expand/contract (agregar → migrar datos →
  desplegar código nuevo → en un deploy posterior, eliminar lo viejo) para que el rollback de código
  nunca dependa de restaurar datos. El CI ya bloquea deriva silenciosa entre `schema.prisma` y las migraciones.

### Deploy gates

Como el deploy es una acción SSH scriptada (no hay auto-deploy-on-push de ningún PaaS), el gate es real
y no meramente informativo:

1. **CI verde sobre el commit tageado.** El workflow de deploy (`workflow_dispatch`) empieza verificando
   con `gh` que el run de `ci.yml` para ese SHA terminó en `success`; aborta si no.
2. **GitHub Environment `production` con revisores requeridos.** El job de deploy queda pausado hasta
   que un revisor autorizado lo aprueba en la UI de GitHub. Esta es la autorización humana explícita
   por deploy que exige tanto ADR-0007 como este skill.
3. **Backup previo exitoso** (gate dentro de `deploy.sh`).
4. **Sin jornada abierta** (gate dentro de `deploy.sh`, salvo `--force` autorizado).

Alternativa si no se quiere el workflow de GitHub: correr `deploy.sh` a mano por SSH. El gate 1 pasa a
ser una verificación manual del check de CI; los gates 3 y 4 siguen embebidos en el script.

### Verify & Observe

**Verify (post-deploy, `smoke.sh`):**

- `curl https://<dominio>/api/health` → HTTP 200 **y** body con `estado == "ok"` (no `"degradado"`),
  `db.estado == "ok"`, `redis.estado == "ok"`, `worker.ultimoPing` reciente (< 60 s).
- `curl https://<dominio>/` → HTTP 200 y HTML de la SPA.
- Certificado TLS válido y emitido por Let's Encrypt (no la CA interna).
- `docker compose ps` → todos los servicios `running`/`healthy`, `migrate` en `exited (0)`.
- Un job de prueba encolado en la cola `system` (`system.ping`) procesado por el worker.

**Observe (después):**

- Logs: driver `json-file` con `max-size: 10m`, `max-file: 5` por servicio (se agrega en el overlay de
  prod). Consulta con `docker compose logs -f <servicio>`.
- Access logs de Caddy a archivo en un volumen.
- `docker stats` / `docker compose top` para CPU/RAM durante jornada.
- **Uptime externo:** monitor gratuito (UptimeRobot / BetterStack) golpeando `/api/health` cada
  1–5 min y alertando por correo. Es el único chequeo que sobrevive a una caída total del VPS.
- Evolución recomendada (no en este deploy): agente de métricas (Netdata local, o Grafana Cloud /
  Prometheus node-exporter) antes de la prueba de carga de #23, para tener percentiles de latencia y
  saturación durante la ráfaga de votos.

### Recovery

| Escenario | Respuesta | RPO / RTO objetivo |
|---|---|---|
| Deploy falla el smoke test | `deploy.sh` hace rollback automático al tag anterior (imagen previa aún en `docker image ls`, no reconstruye) + `up -d` + smoke test | RTO minutos |
| Migración incompatible ya aplicada | Restaurar el backup previo al deploy (`restore.sh`), checkout del tag anterior, `up -d`. Se pierde lo escrito entre backup y restauración | RPO = momento del backup previo |
| Corrupción / borrado de datos en operación normal | Restaurar del último backup horario/diario en object storage | RPO ≤ 1 h en jornada, ≤ 24 h fuera |
| Pérdida total del VPS | Reaprovisionar (runbook) + restaurar último backup offsite + re-apuntar DNS | RTO horas; RPO = último backup offsite |
| Caída a mitad de jornada | **Procedimiento operativo, no redundancia** — ADR-0013: restauración durante votación, anulación de códigos, revotos, extensión de cierre, acta de incidencias. Backlog #22 (pendiente) | — |

Prerequisitos antes de la primera elección real (heredados de ADR-0007 / TECH-DESIGN, fuera del
alcance de este deploy pero bloqueantes para producción):

- Ensayo de restauración completo que ejecute el procedimiento de contingencia de ADR-0013 (backlog #23).
- Prueba de carga de 1.000 concurrentes contra el tamaño de VPS elegido (backlog #23).
- Revisión legal de datos de menores en la nube: región, cifrado en reposo, consentimiento de familias
  (ligado a backlog #21).

## Artefactos a generar (GENERATE)

1. `infra/docker/docker-compose.prod.yml` — overlay: `restart: unless-stopped`, `pull_policy: build`,
   logging `json-file` rotado, montaje de `Caddyfile.prod`, sin puertos de host salvo Caddy, límites de
   recursos. Sin volumen `seei_uploads` (los binarios viven en Postgres).
2. `infra/docker/Caddyfile.prod` — dominio real, HTTPS automático Let's Encrypt, `encode gzip`,
   cabeceras de seguridad (HSTS, `X-Content-Type-Options`, `Referrer-Policy`), access log a archivo.
3. `infra/docker/env.prod.example` — plantilla completa de `/opt/seei/.env` (nombre sin punto
   inicial para que sea versionable) con todas las claves y comentarios de cuáles son secretas.
4. `infra/scripts/deploy.sh` — secuencia de release con gates de backup y jornada, y rollback automático.
5. `infra/scripts/backup.sh` — `pg_dump -Fc` (cubre datos y binarios) + push con `rclone` a object
   storage + política de retención.
6. `infra/scripts/restore.sh` — restauración documentada (base + archivos), con confirmación interactiva.
7. `infra/scripts/smoke.sh` — verificación post-deploy descrita en Verify.
8. `infra/PROVISIONING.md` — runbook del VPS: creación de usuario no-root, endurecimiento SSH, `ufw`
   (solo 22 desde IP admin + 80/443), instalación de Docker, clonado del repo en `/opt/seei`, generación
   de `.env` y `rclone.conf`, registro de dominio + registro A, primer deploy, alta de crons de backup,
   alta del monitor de uptime.
9. `.github/workflows/deploy.yml` — `workflow_dispatch`, verificación de CI verde sobre el SHA,
   Environment `production` con revisores, deploy por SSH ejecutando `deploy.sh`.
10. Crontab de ejemplo (`infra/scripts/seei-cron`) — backup diario + horario condicionado a jornada.

## Autorizaciones pendientes

Ninguna acción EXECUTE puede correr hasta que exista el VPS. Cuando llegue ese momento, cada una de
estas requiere autorización explícita y puntual (no un "sí" único que las cubra a todas):

- [ ] Registrar el dominio y crear el registro A.
- [ ] Crear y aprovisionar el VPS con el proveedor elegido.
- [ ] Endurecer SSH / configurar el firewall.
- [ ] Generar `/opt/seei/.env` con secretos de producción reales.
- [ ] Configurar `rclone` contra el bucket de respaldos.
- [ ] Primer `deploy.sh` (build + migrate + up + smoke).
- [ ] Alta de los crons de backup.
- [ ] Cualquier `restore.sh` o rollback sobre datos reales.
- [ ] Cualquier redimensionamiento del VPS.

## Artefactos generados (GENERATE — 2026-08-31)

| Archivo | Rol |
|---|---|
| `infra/docker/docker-compose.prod.yml` | Overlay de producción: restart, Caddyfile.prod, rotación de logs, límites de memoria, `pull_policy: build`. |
| `infra/docker/Caddyfile.prod` | Dominio real + Let's Encrypt, gzip/zstd, HSTS y cabeceras de seguridad, access log JSON rotado. Placeholders `seei.ejemplo.edu.pe` / `admin@ejemplo.edu.pe`. |
| `infra/docker/env.prod.example` | Plantilla de `/opt/seei/.env`. Secretos marcados; incluye todas las claves de `turbo.json`/compose. |
| `infra/scripts/deploy.sh` | Release recreate: valida repo/tag → gate jornada abierta → backup previo bloqueante → checkout+build+`up -d --wait` → `smoke.sh` → rollback automático al tag anterior si algo falla. `--force` omite el gate de jornada. |
| `infra/scripts/backup.sh` | `pg_dump -Fc` (respaldo completo, blobs incluidos) + `rclone copy` offsite + retención local/remota. `--tag` para el backup previo al deploy. |
| `infra/scripts/restore.sh` | Restauración destructiva con confirmación: stop escritores → DROP/CREATE `seei` → `pg_restore` → `up -d` → smoke. `--from-remote` baja del bucket. |
| `infra/scripts/smoke.sh` | Verificación post-deploy: frontend 200, emisor TLS público, `/api/health` con `estado==ok` (lee el body, no solo el HTTP 200), antigüedad del `worker.ultimoPing`. Requiere `jq`. |
| `infra/scripts/seei-cron` | Crontab: backup diario 03:15 UTC + horario en ventana de jornada + prune de imágenes semanal. |
| `infra/PROVISIONING.md` | Runbook del VPS de 0 a producción, con cada paso marcado `[AUTORIZAR]`. |
| `.github/workflows/deploy.yml` | Gate real de release: `workflow_dispatch` + verificación de CI verde + Environment `production` con revisores requeridos + `deploy.sh` por SSH. |

Pendiente de aplicar tras generar: `chmod +x infra/scripts/*.sh`.

Sustituciones necesarias antes del primer deploy: `seei.ejemplo.edu.pe` y `admin@ejemplo.edu.pe`
en `Caddyfile.prod`, `deploy.sh`, `smoke.sh`, `restore.sh` (o exportar `SEEI_HEALTH_URL`/`SEEI_SITE_URL`).

## Registro de ejecución y verificación

_(Se completa después de EXECUTE y VERIFY. Vacío por ahora: no hay infraestructura que tocar.)_
