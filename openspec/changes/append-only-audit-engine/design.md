# Diseño: append-only-audit-engine (Backlog #3 — Motor de auditoría append-only)

Este documento cierra lo que la propuesta y la spec dejaron abierto: la forma exacta de los tres
triggers y por qué son de sentencia y no de fila, con qué rol se prueba cada capa de imposición
(porque `seei_app` **nunca** llega al trigger), dónde vive `AuditoriaService` en un backend que
todavía no tiene módulos de dominio, cómo se registra el trigger de claves prohibidas en el registro
de ADR, y el corte de PR encadenados.

**Bloqueo levantado.** El Backlog #1 (`system-scaffolding`) y el #2 (`base-schema-and-migrations`)
están implementados y archivados (`openspec/changes/archive/2026-08-06-system-scaffolding/`,
`openspec/changes/archive/2026-08-07-base-schema-and-migrations/`). Existen `apps/backend`, Prisma
`^5.22`, las cinco migraciones aplicadas, los roles `seei_migrator`/`seei_app` de ADR-0015 y el arnés
`test:schema`. El bloqueo duro que la propuesta y la exploración declaraban **ya no aplica**; este
change puede llegar a `sdd-apply`.

## Enfoque técnico

Igual precedente que #2 (su design.md, D2): primero el DSL de Prisma, y el SQL que Prisma no expresa
—funciones, triggers, `CHECK`, `REVOKE`— **anexado a mano al final del mismo `migration.sql`** que
crea la tabla, generado con `prisma migrate dev --create-only --name append_only_audit`. Una sola
migración: tabla, `CHECK`, tres triggers y `REVOKE` nacen juntos o no nacen, y `prisma migrate deploy`
sigue siendo atómico por tabla.

La coherencia entre intención y base real no descansa en comentarios: descansa en `check:drift` (lado
DSL, ya en CI), en aserciones de catálogo por nombre sobre `pg_trigger`/`pg_constraint`/`relacl`
(lado SQL raw) y en los tests de rechazo contra códigos SQLSTATE literales.

Nombres: `EventoAuditoria` sin diacríticos (precedente literal de ADR-0015 y del inventario de #2),
columnas `snake_case` declaradas así en el DSL, PK `uuid`, triggers y restricciones con nombre
explícito porque los tests los asertan por nombre.

## Resumen de decisiones

| # | Decisión | Alternativas descartadas | Fundamento |
|---|---|---|---|
| D1 | `EventoAuditoria` como modelo Prisma normal (PK `uuid`, `entity_id TEXT`, `payload Json @db.JsonB`), sin índices adicionales | `bigserial`; `entity_id UUID`; índices de lectura por `occurred_at`/`event_type` | Uniformidad con las 19 tablas de #2; `entity_id` direcciona entidades heterogéneas y ninguna FK es posible, un tipo `UUID` daría falsa integridad; la forma de consulta la define #21 (camino de lectura), indexar sin consulta conocida es especulativo y la tabla nace vacía |
| D2 | Tres triggers **`FOR EACH STATEMENT`** (`no_update`, `no_delete`, `no_truncate`) sobre una función compartida, con `ERRCODE = 'AU001'` | Triggers `FOR EACH ROW`; un único trigger `BEFORE UPDATE OR DELETE OR TRUNCATE`; `RULE`s | De sentencia rechaza incluso un `UPDATE` que no toca filas y permite cubrir `TRUNCATE` (que **solo** admite triggers de sentencia) — el `REVOKE` no protege del propietario. Tres objetos separados porque la spec exige un trigger por operación y los tests los asertan por nombre |
| D3 | Trigger `BEFORE INSERT ... FOR EACH ROW WHEN (NEW.event_type IN ('VOTO','RECHAZO'))` con verificación **recursiva** de claves (`?|` en la raíz **más** `jsonb_path_exists($.**.<clave>)`), `ERRCODE = 'AU002'` | Verificación solo de claves de primer nivel; validación en el DTO; columnas tipadas | Una verificación de primer nivel se evade con `{"detalle":{"candidato_id":...}}` — exactamente el hueco C1 que ADR-0010 quiso cerrar. El costo es despreciable: los payloads de auditoría son pequeños y de bajo volumen |
| D4 | Registrar el trigger de D3 como **ADR-0016 nuevo**, sin editar el ADR-0010 | Enmendar el texto de ADR-0010 (Aceptado) | Precedente literal del propio proyecto: la división de roles no enmendó ADR-0003, produjo ADR-0015. El trigger es un mecanismo con alternativas y riesgo residual propios; reescribir un ADR aceptado borra la trazabilidad de cuándo se decidió |
| D5 | La capa de trigger se prueba con **`seei_migrator`**; la capa de permisos con **`seei_app`** | Probar ambas con `seei_app` | PostgreSQL verifica privilegios **antes** de disparar el trigger: con `seei_app` todo `UPDATE` da `42501` y el trigger nunca corre. Sin un cliente `seei_migrator` la capa de trigger queda sin prueba y un `DROP TRIGGER` accidental pasaría verde |
| D6 | `AuditoriaService` en `src/auditoria/`, módulo propio `AuditoriaModule` que exporta el provider, importado por `AppModule`; `log(tx, ...)` recibe `tx: Prisma.TransactionClient` explícito | Provider suelto sin módulo; `@Global()`; unidad de trabajo con `AsyncLocalStorage` | El servicio no inyecta nada (la conexión llega por `tx`), así que entra al grafo de DI sin abrir Postgres al arrancar — no rompe el gotcha D1 de #1 (`openapi.ts` instancia `AppModule` sin base viva). `@Global()` esconde el acoplamiento; `AsyncLocalStorage` es comodidad opcional y no es la fuente de la atomicidad |
| D7 | `AuditEventType` en `src/auditoria/audit-event-types.ts`, sembrado **solo** con `VOTO` y `RECHAZO` | `packages/contracts`; enumerar tipos de #4–#20; `ENUM` de Postgres | `packages/contracts` es salida generada desde OpenAPI; mezclar un registro escrito a mano allí rompe `check:drift` de contratos. `VOTO`/`RECHAZO` son los dos únicos tipos que este change posee estructuralmente (son la cláusula `WHEN` del trigger de D3) |
| D8 | `occurred_at` se garantiza por **ausencia en la firma** de `log()` + `DEFAULT now()`, sin trigger que lo reescriba | Trigger `BEFORE INSERT` que fuerce `NEW.occurred_at := now()` | El escenario de la spec dice "a través de `AuditoriaService`": si el parámetro no existe, ningún llamador puede proveerlo. Un trigger de reescritura además sabotearía en silencio un backfill legítimo de DBA (ADR-0010 §5) |
| D9 | Dos PR encadenados (garantía de base de datos → camino de escritura), con corte de contingencia predeclarado | Un solo PR; los cinco PR estilo #2 | PR1 ≈ 300–330 y PR2 ≈ 200–230 líneas autoradas: ambos por debajo de 400 sin inventar un PR de arnés (el arnés `test:schema` ya existe y solo gana dos helpers) |

## D1 — Modelo Prisma y DDL

```prisma
model EventoAuditoria {
  id               String   @id @default(uuid()) @db.Uuid
  actor_usuario_id String?  @db.Uuid
  event_type       String
  entity_type      String
  entity_id        String?
  occurred_at      DateTime @default(now()) @db.Timestamptz(3)
  ip_address       String?  @db.Inet
  user_agent       String?
  payload          Json     @db.JsonB

  actor Usuario? @relation(fields: [actor_usuario_id], references: [id], onDelete: Restrict)
}
```

`onDelete: Restrict` explícito (anula el `SetNull` por omisión de Prisma en relaciones opcionales —
mismo gotcha que D1 de #2): un `DELETE` sobre `Usuario` no puede vaciar en silencio la autoría de un
evento. `Usuario` gana el campo inverso `eventosAuditoria EventoAuditoria[]`.

SQL raw anexado a mano al final del `migration.sql` generado:

```sql
ALTER TABLE "EventoAuditoria"
  ADD CONSTRAINT "eventoauditoria_event_type_convencion_chk"
  CHECK ("event_type" ~ '^[A-Z_]+$');

REVOKE UPDATE, DELETE, TRUNCATE ON "EventoAuditoria" FROM seei_app;
```

El `REVOKE` funciona porque `ALTER DEFAULT PRIVILEGES FOR ROLE seei_migrator` (ADR-0015) otorga
`SELECT/INSERT/UPDATE/DELETE` a `seei_app` **en el momento del `CREATE TABLE`**: revocar en el mismo
archivo, después del `CREATE TABLE`, es el único orden correcto. `TRUNCATE` nunca se otorgó por
privilegios por defecto — se revoca igual, de forma defensiva y documental.

## D2/D3 — Los tres triggers, forma exacta

```sql
CREATE OR REPLACE FUNCTION auditoria_rechazar_mutacion() RETURNS TRIGGER
LANGUAGE plpgsql AS $auditoria$
BEGIN
  RAISE EXCEPTION 'EventoAuditoria es append-only (ADR-0003): % rechazado', TG_OP
    USING ERRCODE = 'AU001';
END;
$auditoria$;

CREATE TRIGGER "eventoauditoria_no_update_trg"   BEFORE UPDATE   ON "EventoAuditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_rechazar_mutacion();
CREATE TRIGGER "eventoauditoria_no_delete_trg"   BEFORE DELETE   ON "EventoAuditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_rechazar_mutacion();
CREATE TRIGGER "eventoauditoria_no_truncate_trg" BEFORE TRUNCATE ON "EventoAuditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_rechazar_mutacion();

CREATE OR REPLACE FUNCTION auditoria_rechazar_claves_eleccion() RETURNS TRIGGER
LANGUAGE plpgsql AS $auditoria$
DECLARE clave text;
BEGIN
  FOREACH clave IN ARRAY ARRAY['candidato_id','lista_id','opcion_id','blanco','eleccion'] LOOP
    IF NEW.payload ? clave
       OR jsonb_path_exists(NEW.payload, ('$.**.' || clave)::jsonpath) THEN
      RAISE EXCEPTION 'ADR-0010: el payload de % no puede contener la clave %', NEW.event_type, clave
        USING ERRCODE = 'AU002';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$auditoria$;

CREATE TRIGGER "eventoauditoria_claves_eleccion_trg" BEFORE INSERT ON "EventoAuditoria"
  FOR EACH ROW WHEN (NEW.event_type IN ('VOTO','RECHAZO'))
  EXECUTE FUNCTION auditoria_rechazar_claves_eleccion();
```

**SQLSTATE propios.** `AU001` (mutación) y `AU002` (clave de elección) son clases libres — PostgreSQL
no usa la clase `AU` — y permiten que los tests distingan las tres capas sin leer el mensaje:
`AU001` trigger, `AU002` secreto del voto, `42501` permisos, `23514` convención de `event_type`.

**Los triggers son ordinarios, no `ENABLE ALWAYS`** (decisión deliberada): la anonimización
administrativa de ADR-0010 §5 es un `UPDATE` de DBA que debe seguir siendo posible. Con triggers
ordinarios un superusuario puede ejecutarla bajo `SET session_replication_role = 'replica'` sin tocar
DDL de la tabla. `ENABLE ALWAYS` obligaría a `DROP TRIGGER`, dejando la tabla desprotegida entre la
baja y el alta del trigger — peor postura, no mejor.

**Gotcha de autoría.** El cuerpo `plpgsql` va con etiqueta `$auditoria$` (no `$$` pelado) para que
ningún futuro anidado de `$$` rompa el archivo, y el operador `?` de JSONB vive **dentro** de la
función: nunca viaja por `$queryRaw`/`pg`, que lo interpretarían como placeholder.

## D5 — Con qué rol se prueba cada capa

| Capa | Rol del cliente | Variable | Resultado esperado |
|---|---|---|---|
| Trigger anti-`UPDATE`/`DELETE`/`TRUNCATE` | `seei_migrator` (propietario, sí tiene el privilegio) | `MIGRATION_DATABASE_URL` | `AU001` |
| Trigger de claves de elección | `seei_app` (tiene `INSERT`) | `DATABASE_URL` | `AU002` |
| `CHECK` de `event_type` | `seei_app` | `DATABASE_URL` | `23514` |
| `REVOKE` | `seei_app` | `DATABASE_URL` | `42501` |

`turbo.json` ya declara `MIGRATION_DATABASE_URL` en el `env` de `test:schema` y CI ya la exporta en el
job `e2e-backend`: **no hay cambios de CI ni de Turborepo en este change**. Solo se agrega
`createMigratorPgClient()` a `test/schema/helpers/pg-client.ts`.

## D6 — `AuditoriaService` y flujo de datos

```
src/auditoria/
├── auditoria.module.ts        AuditoriaModule (providers + exports: AuditoriaService)
├── auditoria.service.ts       log(tx, eventType, actorId, entityType, entityId, payload)
└── audit-event-types.ts       AUDIT_EVENT_TYPES + type AuditEventType
```

```ts
async log(
  tx: Prisma.TransactionClient,
  eventType: AuditEventType,
  actorId: string | null,
  entityType: string,
  entityId: string | null,
  payload: Prisma.InputJsonValue,
): Promise<void>
```

Sin `occurred_at`, sin `ip_address`/`user_agent` en la firma mínima (columnas nulables que #21 y los
módulos con contexto HTTP poblarán cuando exista un interceptor; agregarlos hoy sería plomería sin
llamador). Diagrama de secuencia del flujo que la spec exige:

```
Módulo de negocio        PrismaClient           AuditoriaService        PostgreSQL
      │                       │                        │                    │
      │ $transaction(async tx)│                        │                    │
      ├──────────────────────►│ BEGIN ────────────────────────────────────► │
      │ tx.<negocio>.create() │                        │                    │
      ├──────────────────────►├───────────────────────────────────────────► │ INSERT negocio
      │ log(tx, ...)          │                        │                    │
      ├───────────────────────┼───────────────────────►│ tx.eventoAuditoria │
      │                       │                        ├───────────────────►│ INSERT auditoría
      │                       │                        │                    │  └─ trg claves (AU002)
      │◄──────────────────────┤ COMMIT ◄──────────────────────────────────  │
      │                                                                     │
      │ (si CUALQUIER paso lanza) ──────────────────────────────────────────► ROLLBACK: 0 filas
```

La atomicidad **no** viene del servicio: viene de que ambos `INSERT` ocurren en el mismo callback de
`$transaction` sobre la misma conexión. Por eso `log()` no abre transacción propia y no acepta un
`PrismaClient` completo — recibir `Prisma.TransactionClient` hace que "escribir auditoría fuera de una
transacción" ni siquiera compile.

## D7 — Registro aditivo de tipos de evento

```ts
export const AUDIT_EVENT_TYPES = { VOTO: 'VOTO', RECHAZO: 'RECHAZO' } as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];
```

Un ítem posterior agrega su clave a este objeto y nada más: ni migración (el `CHECK` es de convención,
no de lista), ni cambio en `AuditoriaService`, ni en los triggers — **salvo** que su evento toque la
elección de un voto, caso en el que ADR-0016 le obliga a agregarse a la cláusula `WHEN` del trigger de
claves (ver TM4).

## Estrategia de testing

TDD estricto, RED→GREEN contra Postgres real. Los seis casos de la propuesta se reparten por arnés
según la herramienta que expone el SQLSTATE literal (precedente D3 de #2: `pg` crudo para SQL raw,
Prisma Client para lo que atraviesa el ORM).

| Arnés | Archivo | Cubre |
|---|---|---|
| `test:schema` (`pg` crudo) | `test/schema/auditoria.spec.ts` | Columnas presentes; `AU001` en `UPDATE`/`DELETE`/`TRUNCATE` con `seei_migrator` + fila intacta después; `42501` con `seei_app`; `AU002` con clave prohibida en raíz, anidada y en `RECHAZO`; payload legal aceptado; `23514` con `event_type` vacío y en minúsculas; `event_type` nuevo aceptado; catálogo (`pg_trigger` presente y `tgenabled='O'`, `pg_get_triggerdef` contiene la cláusula `WHEN`, `relacl` sin `UPDATE`/`DELETE` para ningún rol distinto del propietario) |
| `test:e2e` (Prisma Client) | `test/auditoria-transaccional.e2e-spec.ts` | Rollback deja 0 filas de negocio y 0 de auditoría; commit deja exactamente 1 y 1 con `entity_id` correlacionado; payload `VOTO` malformado aborta también la escritura de negocio |
| `test:schema` (existente, **modificado**) | `test/schema/migration-inventory.spec.ts` | Agregar `'EventoAuditoria'` al inventario esperado — sin este cambio, la suite de #2 se pone roja al aplicar esta migración |

**Fixture de negocio:** `AnioEscolar` (única tabla sin FK salientes), de modo que los tests de
atomicidad no necesiten construir un grafo `Usuario→Aula→Proceso→DerechoVoto`. El par
`event_type`/`entity_type` del fixture es eso —un fixture—, no una afirmación de dominio: lo que se
prueba es la composición transaccional.

## Matriz de amenazas

| # | Amenaza | Aplicabilidad | Comportamiento esperado / prueba |
|---|---|---|---|
| TM1 | Evasión por superusuario o propietario (`DISABLE TRIGGER`, `DROP TRIGGER`, `psql` directo) | **Aplicable**, riesgo residual **aceptado** (ADR-0003 "Consecuencias", mitigado organizacionalmente por ADR-0007) | Ninguna capa de esquema puede cerrarlo y este change no lo intenta. Sí se cierra el subcaso *accidental*: el test de catálogo aserta que los tres triggers existen y están habilitados (`tgenabled = 'O'`), así una migración futura que los deshabilite pone CI en rojo |
| TM2 | El `REVOKE` no cubre a algún rol (rol nuevo de reportes, `PUBLIC`, otorgamiento accidental) | **Aplicable** | `ALTER DEFAULT PRIVILEGES` de ADR-0015 solo alcanza a `seei_app`, pero un `GRANT` posterior podría reabrir el hueco. Test de catálogo sobre `aclexplode(relacl)`: ningún grantee distinto del propietario tiene `UPDATE`, `DELETE` o `TRUNCATE`; más el test conductual `42501` con `seei_app` |
| TM3 | Huecos del trigger de claves: anidamiento, elementos de arreglo, sinónimos, valores libres | **Aplicable, cierre parcial y declarado** | `?` en la raíz + `jsonb_path_exists('$.**.<clave>')` cubren raíz, anidados y objetos dentro de arreglos (RED por cada forma). **No cierra** un nombre de clave sinónimo (`opcion`, `elegido`) ni la elección escrita en texto libre dentro de un valor: el trigger impone los nombres canónicos, no la semántica. Declarado como residual en ADR-0016, no simulado como resuelto |
| TM4 | La cláusula `WHEN (event_type IN ('VOTO','RECHAZO'))` deja fuera un tipo futuro que toque la elección (p. ej. `VOTO_ANULADO`) | **Aplicable** | El test de catálogo aserta el contenido literal de la cláusula `WHEN` vía `pg_get_triggerdef`, de modo que su alcance es visible y versionado; ADR-0016 registra la obligación para quien agregue un tipo que toque `Voto`. Alternativa descartada: aplicar el trigger a **todos** los tipos —convertiría cualquier evento legítimo sobre `Candidato`/`Lista` (#12, #13) en un falso positivo permanente |
| TM5 | Deriva entre `schema.prisma` y el SQL raw anexado a mano | **Aplicable** | Doble verificación heredada de #2: `check:drift` en CI (lado DSL) + aserciones de catálogo por nombre (lado SQL raw). Supuesto a confirmar en el primer RED: Prisma ignora funciones/triggers/privilegios en su diff, así que `check:drift` debe seguir devolviendo SQL vacío |
| TM6 | Enrutamiento, comandos de shell, subprocesos, automatización de VCS/PR, clasificación de archivos ejecutables | **N/A** | Este change no agrega ni modifica ningún script, entrypoint, comando ni integración de proceso: solo una migración SQL, un provider de NestJS y tests dentro de arneses ya existentes |

## Cambios de archivos

| Archivo | Acción | Descripción | PR |
|---|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | Modelo `EventoAuditoria` + campo inverso en `Usuario` | 1 |
| `apps/backend/prisma/migrations/<ts>_append_only_audit/migration.sql` | Crear | DDL generado + `CHECK`, dos funciones, tres triggers y `REVOKE` anexados a mano | 1 |
| `apps/backend/test/schema/helpers/pg-client.ts` | Modificar | `createMigratorPgClient()` (`MIGRATION_DATABASE_URL`) | 1 |
| `apps/backend/test/schema/helpers/catalog.ts` | Modificar | `getTriggerDef()` y `getTablePrivileges()` (`pg_trigger`, `aclexplode`) | 1 |
| `apps/backend/test/schema/auditoria.spec.ts` | Crear | Suite RED/GREEN de las cuatro capas + catálogo | 1 |
| `apps/backend/test/schema/migration-inventory.spec.ts` | Modificar | Agregar `'EventoAuditoria'` al inventario esperado | 1 |
| `adrs/0016-bloqueo-estructural-identidad-eleccion-auditoria.md` | Crear | Registra el trigger de claves (borrador en el apéndice) | 1 |
| `apps/backend/src/auditoria/audit-event-types.ts` | Crear | `AUDIT_EVENT_TYPES` + `AuditEventType` | 2 |
| `apps/backend/src/auditoria/auditoria.service.ts` | Crear | `log(tx, ...)` | 2 |
| `apps/backend/src/auditoria/auditoria.module.ts` | Crear | `AuditoriaModule` (exporta el servicio) | 2 |
| `apps/backend/src/app.module.ts` | Modificar | Importar `AuditoriaModule` | 2 |
| `apps/backend/test/auditoria-transaccional.e2e-spec.ts` | Crear | Rollback / commit / payload malformado | 2 |

Sin cambios en `.github/workflows/ci.yml`, `turbo.json`, `infra/docker/**` ni `packages/contracts`.

## División en PR (cadena de rama de feature)

| PR | Contenido | Estimado | Depende de |
|---|---|---|---|
| PR1 — la garantía de base de datos | Modelo + migración + `CHECK` + tres triggers + `REVOKE` + ADR-0016 + helpers + suite de esquema + inventario | ~300–330 | rama de feature |
| PR2 — el camino de escritura | `AuditEventType` + `AuditoriaService` + `AuditoriaModule` + `AppModule` + suite de atomicidad | ~200–230 | PR1 |

PR1 lleva la promesa central de ADR-0003/ADR-0010 y es completamente probable sin que exista ningún
servicio de aplicación; PR2 no puede existir sin la tabla de PR1. PR1 apunta a la rama de feature,
PR2 apunta a la rama de PR1.

`Decision needed before apply: No` · `Chained PRs recommended: Yes` · `400-line budget risk: Medium`
(riesgo en PR1: los cinco PR de #2 superaron su estimación 2–3×). **Corte de contingencia
predeclarado**, a ejecutar solo si el diff real de PR1 supera 400 líneas autoradas: PR1a = tabla +
`CHECK` + `REVOKE` + helpers + tests de esquema/permisos; PR1b = las dos funciones, los tres triggers,
ADR-0016 y los tests de rechazo. No se adopta por defecto porque partiría la garantía append-only
entre dos PR fusionables por separado.

## Migración / rollout

Una sola migración aditiva apilada tras `20260807042718_support_tables`. Sin datos de producción, sin
feature flag, sin backfill. `pnpm --filter @seei/backend exec prisma migrate deploy` la aplica con
`seei_migrator` (vía `directUrl`), exactamente igual que las cinco migraciones ya existentes.

**Rollback.** `git revert` del o los PR. Si la migración ya se aplicó a una base compartida de
dev/CI: una migración pequeña hacia adelante que haga `DROP TRIGGER`×3, `DROP FUNCTION`×2 y
`DROP TABLE "EventoAuditoria"` — sin migraciones de bajada mantenidas a mano, precedente de #1 y #2.
Ninguna otra tabla referencia `EventoAuditoria` por FK, así que el rollback no arrastra el esquema de
#2. Este plan deja de ser válido en cuanto existan eventos reales en producción: a partir de ahí el
rollback es el mismo procedimiento de DBA documentado que ADR-0010 §5 anticipa para la anonimización.

## Preguntas abiertas

- [ ] Confirmar en el primer RED que `check:drift` sigue devolviendo SQL vacío con funciones y
      triggers presentes en la base (supuesto de TM5; si Prisma emitiera `DROP`, la contingencia es
      excluir la migración del `--create-only` de prueba, no debilitar el trigger).
- [ ] ¿Se agrega una referencia cruzada a ADR-0016 en la sección "Consecuencias" del ADR-0010? Por
      omisión **no** se toca un ADR aceptado (D4); es una decisión de quien sea dueño del registro.
- [ ] Sigue sin dueño el runbook de anonimización de ADR-0010 §5 (riesgo heredado de la propuesta,
      fuera de alcance de este change) — pendiente de asignación en el backlog.

## Apéndice — Borrador de ADR-0016

> Se materializa en `adrs/0016-bloqueo-estructural-identidad-eleccion-auditoria.md` durante PR1.

```markdown
# ADR 0016: Bloqueo estructural identidad↔elección en el payload de auditoría

## Estado

Aceptado

## Contexto

El [ADR-0010] §1 decide que "el evento `VOTO` de auditoría no contiene la elección [...] nunca la
lista u opción elegida", pero no fija **cómo** se impone. El hallazgo C1 de REVISION-ADVERSARIAL.md
—el hallazgo que originó el ADR-0010— ya mostró que confiar en que cada DTO futuro omita el campo es
insuficiente: `EventoAuditoria.payload` es `JSONB` y quien implemente los backlog #14/#16/#18 puede
violar la regla agregando una clave, sin que ninguna restricción de columna lo note. El [ADR-0003]
impone las demás garantías de auditoría en el motor, no en el código de aplicación; esta quedó como
la única garantía de auditoría sostenida solo por convención de revisión.

## Decisión

Un trigger `BEFORE INSERT ... FOR EACH ROW` sobre `EventoAuditoria`, activo cuando
`event_type IN ('VOTO','RECHAZO')`, que rechaza el insert con SQLSTATE `AU002` si el `payload`
contiene, **en cualquier nivel de anidamiento**, alguna de las claves `candidato_id`, `lista_id`,
`opcion_id`, `blanco` o `eleccion`.

1. **Alcance `VOTO` + `RECHAZO`.** Un rechazo nunca necesita transportar la elección —el voto jamás
   se emitió—, pero un implementador podría volcar el estado del formulario en su payload y filtrar
   intención de voto, tan sensible como la elección misma en un entorno escolar.
2. **Verificación recursiva, no solo de primer nivel.** Una verificación de raíz se evade con
   `{"detalle": {"candidato_id": "..."}}`, que es exactamente la clase de error que este trigger
   existe para detener.
3. **Obligación para tipos de evento futuros.** Todo tipo de evento nuevo que toque un `Voto` DEBE
   agregarse a la cláusula `WHEN` de este trigger en su propia migración. El trigger no se aplica a
   todos los tipos porque eventos legítimos sobre `Candidato`/`Lista` (backlog #12, #13) llevan
   `candidato_id`/`lista_id` con toda propiedad.

## Alternativas consideradas

- **Disciplina de DTO y revisión de código** — costo cero; no se eligió porque es exactamente lo que
  el hallazgo C1 declaró insuficiente, y la garantía quedaría dependiendo de que cada contribuyente
  futuro conozca el ADR-0010.
- **Columnas tipadas en vez de `JSONB`** — el motor impondría la forma; no se eligió porque los tipos
  de evento son heterogéneos (un `VOTO` no se parece a un `CORREO_FALLIDO`) y el propio [ADR-0003] ya
  se comprometió con "columna JSONB para el detalle del evento".
- **Verificación solo de claves de primer nivel** (`payload ?| array[...]`) — más simple y barata; no
  se eligió porque se evade anidando una clave un nivel más abajo.
- **Aplicar el trigger a todos los tipos de evento** — máxima cobertura; no se eligió porque
  convertiría en falso positivo permanente cualquier evento legítimo de gestión de candidatos.

## Consecuencias

- La garantía identidad↔elección del [ADR-0010] pasa de convención a imposición del motor: se dispara
  sin importar qué módulo del backend escriba el evento.
- Como el insert de auditoría comparte transacción con la escritura de negocio, un payload malformado
  **aborta la operación de negocio completa**. Es deliberado y coherente con el precedente de outbox
  del [ADR-0012]: una operación que no puede auditarse de forma durable no ocurrió.
- **Costo real:** el trigger impone **nombres de clave canónicos, no semántica**. Un payload que
  escriba la elección bajo un nombre sinónimo (`opcion`, `elegido`) o dentro de un valor de texto
  libre pasa. Cierra la filtración accidental y descuidada —el caso realista—, no a un implementador
  determinado a codificar la elección; ese límite se mitiga en revisión de código, no aquí.
- **Costo real:** la cláusula `WHEN` es una lista que hay que mantener. Un tipo de evento futuro que
  toque un `Voto` y no se agregue a ella queda fuera de la garantía. El test de catálogo del backlog
  #3 aserta el contenido literal de la cláusula para que su alcance sea visible y versionado.
```
