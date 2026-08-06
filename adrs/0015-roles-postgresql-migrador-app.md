# ADR 0015: Dos roles de PostgreSQL — `seei_migrator` y `seei_app`

## Estado

Aceptado

## Contexto

El [ADR-0003] fija PostgreSQL con auditoría append-only (`EventoAuditoria`, ver también
[ADR-0010]). Ese diseño de auditoría exige que el rol con el que el backend se conecta en runtime
**no pueda** alterar ni borrar filas de auditoría — una garantía que un único rol con propiedad
completa del esquema no puede sostener, porque el propietario de una tabla siempre tiene
`UPDATE`/`DELETE` sobre ella salvo que se le revoquen explícitamente, y revocarle privilegios al
mismo rol que ejecuta `prisma migrate` (que sí necesita DDL completo) es contradictorio. La
propuesta original de `system-scaffolding` (backlog #1) aprovisionaba un único rol de PostgreSQL;
la exploración del backlog #3 (motor de auditoría append-only) detectó esta contradicción y el
usuario decidió enmendar #1 en lugar de que #3 absorbiera un cambio de infraestructura — retroadaptar
una división de roles después de que el backend ya corre como propietario del esquema es
disruptivo, no aditivo (ver "Registro de enmiendas" en `proposal.md`).

## Decisión

**Dos roles de PostgreSQL, aprovisionados en `infra/docker/postgres/init/01-roles.sql`** (ejecutado
por el entrypoint oficial de la imagen, `/docker-entrypoint-initdb.d`, contra `POSTGRES_DB=seei`,
con el superusuario de bootstrap `postgres` que ninguna aplicación usa jamás):

- **`seei_migrator`**: propietario de la base `seei` y del esquema `public`, con DDL completo.
  Único consumidor: `prisma migrate deploy`/`dev`, el servicio `migrate` (one-shot) de Docker
  Compose, y el job de CI equivalente. Nunca se conecta desde el backend ni el worker en runtime.
- **`seei_app`**: `CONNECT` + `USAGE` en `public`, sin `CREATE`. Recibe `SELECT/INSERT/UPDATE/DELETE`
  sobre tablas y `USAGE/SELECT` sobre secuencias **vía `ALTER DEFAULT PRIVILEGES FOR ROLE
  seei_migrator`**, no vía `GRANT` manual tabla por tabla:

  ```sql
  ALTER DEFAULT PRIVILEGES FOR ROLE seei_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seei_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE seei_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO seei_app;
  ```

  El mecanismo de privilegios por defecto es la pieza clave: cualquier tabla que `seei_migrator`
  cree en el futuro (vía una migración de Prisma) queda automáticamente accesible para `seei_app`
  sin tocar `01-roles.sql` de nuevo ni recordar un `GRANT` adicional por cada modelo de dominio
  nuevo.
- Dos cadenas de conexión separadas y cableadas explícitamente: `DATABASE_URL` (rol `seei_app`,
  usado por Prisma Client en backend/worker) y `MIGRATION_DATABASE_URL` (rol `seei_migrator`, usado
  por Prisma Migrate vía el campo `directUrl` del `datasource` de `schema.prisma`). Ambas
  disponibles en `.env.example`, en desarrollo local y en CI.

**Explícitamente fuera de alcance de este ítem:** la revocación de `UPDATE`/`DELETE` sobre la tabla
de auditoría (`EventoAuditoria`) al rol `seei_app`, y los triggers de solo-append del [ADR-0003],
son trabajo del backlog #3
(`openspec/changes/append-only-audit-engine`). Este ADR deja el terreno preparado: como `seei_app`
recibe DML por privilegios por defecto y no por propiedad del esquema, esa revocación futura es una
migración aditiva de una línea (`REVOKE UPDATE, DELETE ON "EventoAuditoria" FROM seei_app;`) más los
triggers correspondientes — no un cambio de infraestructura. El schema de dominio (`Usuario`,
`ProcesoElectoral`, `Voto`, `EventoAuditoria`, etc.) tampoco es parte de este ítem: la única
migración que este change aplica es una baseline vacía de Prisma, sin modelos.

Nota de implementación verificada (PR7, tarea 5.7): la versión fijada de Prisma (`^5.22.x`) sí
respeta `directUrl` para `migrate deploy` sin necesitar la contingencia de sustituir
`DATABASE_URL=$MIGRATION_DATABASE_URL` contemplada en `design.md` — ver esa sección para el detalle
de la comprobación real contra Postgres 16.

## Alternativas consideradas

- **Un único rol de aplicación con propiedad del esquema** (diseño original de la propuesta) — más
  simple de aprovisionar; no se eligió porque contradice directamente la garantía de auditoría
  append-only del [ADR-0003]: el propietario de una tabla siempre puede `UPDATE`/`DELETE` sobre
  ella, así que revocarle esos privilegios a `EventoAuditoria` más adelante habría exigido separar
  los roles de todos modos, después de que el backend ya dependiera de correr como propietario —
  una migración de infraestructura disruptiva en producción, no un cambio aditivo.
- **`GRANT` manual por tabla en lugar de `ALTER DEFAULT PRIVILEGES`** — funcionalmente equivalente
  para el estado actual (sin modelos de dominio); no se eligió porque cada migración de Prisma que
  agregue una tabla nueva exigiría recordar agregar también su `GRANT` a `seei_app` en un script
  aparte, un paso manual fácil de olvidar que los privilegios por defecto eliminan estructuralmente.
- **Roles gestionados fuera de Docker Compose (aprovisionamiento manual o vía Terraform/Ansible)** —
  más cercano a cómo se gestionaría en un Postgres gestionado de producción; no se eligió para este
  ítem porque el [ADR-0007] fija despliegue en VPS con Docker Compose, y el mecanismo de
  `/docker-entrypoint-initdb.d` de la imagen oficial ya provee un punto de aprovisionamiento
  determinista y versionado en el propio repositorio, sin herramienta adicional.

## Consecuencias

- El backend y el worker nunca pueden ejecutar DDL en runtime — un `CREATE TABLE` o `DROP TABLE`
  emitido por error o por una vulnerabilidad de inyección queda rechazado por PostgreSQL con
  `permission denied`, no solo prevenido por disciplina de código de la aplicación. Verificado
  contra Postgres 16 real en PR7 (`postgres-roles.e2e-spec.ts`).
- La revocación de auditoría del backlog #3 se reduce a una línea de SQL más triggers, sin tocar
  `01-roles.sql` ni el aprovisionamiento de roles — el costo de la división de roles se paga una
  sola vez, aquí.
- **Costo real:** dos cadenas de conexión que mantener sincronizadas en `.env.example`, Docker
  Compose y CI en vez de una; y `docker-entrypoint-initdb.d` solo corre cuando el volumen `pgdata`
  está vacío, así que cualquier cambio futuro a `01-roles.sql` exige `docker compose down -v` para
  que se re-ejecute — gotcha documentado en `README.md` (sección "HTTPS local" y nota de roles) para
  evitar que alguien lo diagnostique como un bug de permisos.
