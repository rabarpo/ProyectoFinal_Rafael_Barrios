# Exploración: append-only-audit-engine (Backlog #3 — Motor de auditoría append-only)

## Estado: BLOQUEADO

Este change está **bloqueado** por el Backlog #1 (`system-scaffolding`) y el Backlog #2
(`base-schema-and-migrations`), ninguno de los cuales está implementado todavía. El repositorio
contiene solo documentación: no hay `apps/backend`, ni instalación de Prisma, ni fixture de Postgres,
ni CI. Esta exploración asume que la baseline vacía de Prisma de #1 y el esqueleto relacional de #2
existirán para cuando #3 llegue a `sdd-apply`. Según la propuesta de #2, `EventoAuditoría` (el DDL de
la tabla, los triggers y el servicio de registro) fue excluido deliberadamente de #2 y movido por
completo a #3 como una única migración de SQL raw atómica y autocontenida más el servicio — tratar
eso como dado, no como una decisión que #3 deba volver a discutir.

## Estado actual

No existe código ni esquema de auditoría en ninguna parte del repositorio. Los únicos artefactos
relacionados con auditoría hoy son documentación: ADR-0010 (la fuente de verdad primaria para este
change), la descripción de la entidad `EventoAuditoría` y los criterios de aceptación del Flujo 7 en
TECH-DESIGN.md, las promesas de trazabilidad del PRD.md ("todo evento queda registrado en una
auditoría inmutable", "ningún registro de auditoría puede modificarse ni eliminarse desde la
aplicación"), los ítems #3 y #21 de BACKLOG.md, y el hallazgo C1 de REVISION-ADVERSARIAL.md (resuelto
por ADR-0010).

## Q1 — Límite de alcance: #3 (motor) vs. #21 (vista de auditoría)

#3 es dueño **únicamente del camino de escritura y de sus garantías estructurales**:

- El DDL de la tabla `EventoAuditoría` (migración en SQL raw, según la admisión del ADR-0003 de que
  Prisma no puede expresar triggers)
- El par de triggers anti-UPDATE/DELETE
- La división de roles y permisos que respalda la garantía append-only a nivel de permisos
- Un servicio de registro transaccional (`AuditoriaService.log(...)`) que otros módulos del backend
  invocan desde dentro de su propia transacción de negocio

#21 es dueño del **camino de lectura**: consultas filtrables de solo lectura, exportación a CSV/PDF
que se autorregistra como evento (llama de vuelta al propio servicio de #3 — `#21 depende de #3`), la
garantía de bloqueo identidad↔elección en la capa de *consulta/serialización* (qué campos puede ver
cada rol), y la reconstrucción completa de la cadena para un proceso cerrado. El grafo de
dependencias de BACKLOG.md confirma esta división: `#21 depende de #3, #14` — #21 no puede existir
antes de que #3 entregue la tabla y las garantías de escritura; #14 (emisión de voto) es uno de
muchos futuros escritores de la tabla.

**Registrar tipos de evento futuros sin que #3 los conozca todos de antemano.** #3 NO debe enumerar
cada tipo de evento que cualquier ítem futuro (#4–#20) llegue a necesitar. El mecanismo concreto:
`event_type` es una columna `VARCHAR`/`TEXT` (no un `ENUM` de Postgres, que necesitaría una migración
por cada tipo nuevo — ver Q2), restringida solo por un `CHECK` liviano (no vacío, que coincida con una
convención de nombres como `^[A-Z_]+$`) en lugar de por una lista fija de valores. Del lado de
TypeScript, #3 entrega una unión de literales de cadena `AuditEventType` pequeña y aditiva (o un
objeto de registro) que los ítems posteriores extienden agregando su propio literal — ningún archivo
central del que #3 sea dueño necesita modificarse por cada tipo de evento nuevo más allá de que esa
unión viva en una ubicación compartida y append-only (p. ej. `packages/contracts` o un pequeño
`audit-event-types.ts` en el backend). El servicio de #3 acepta `(eventType: string, actorId: string
| null, entityType: string, entityId: string | null, payload: JsonValue)` — una interfaz estable y
mínima que todo escritor futuro puede invocar sin que #3 cambie.

## Q2 — Esquema del evento

Columnas (SQL raw, no DSL completo de Prisma, según ADR-0003):

- `id` (UUID o bigserial, PK)
- `actor_usuario_id` (FK nulable a `Usuario` — nulable porque algunos eventos no tienen actor
  autenticado, p. ej. un intento fallido de login contra una cuenta inexistente)
- `event_type` (`TEXT`, ver Q1)
- `entity_type` (`TEXT`, p. ej. `'Voto'`, `'ProcesoElectoral'`, `'Usuario'`)
- `entity_id` (`TEXT`/UUID nulable — nulable para eventos sin una única fila afectada, p. ej.
  resúmenes de importación masiva)
- `occurred_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()` — **solo hora del servidor**, nunca acepta un
  timestamp provisto por el cliente; TECH-DESIGN.md exige repetidamente "hora del servidor")
- `ip_address` (`INET`, nulable)
- `user_agent` (`TEXT`, nulable)
- `payload` (`JSONB`) para el detalle específico del evento

**JSONB vs. columnas tipadas.** JSONB para el detalle variable es la decisión correcta: los tipos de
evento son heterogéneos (el detalle de un evento `VOTO` no se parece en nada al de un evento
`CORREO_FALLIDO`), y las columnas tipadas forzarían o bien una tabla ancha y dispersa, o bien una
explosión de una tabla por tipo de evento, ninguna de las cuales piden TECH-DESIGN.md ni ADR-0003. El
propio ADR-0003 ya se compromete con una "columna JSONB para el detalle del evento". Contrapartida:
JSONB pierde la imposición de `CHECK`/FK a nivel de columna sobre los campos anidados — mitigado más
abajo para el único campo que realmente importa.

**Regla dura (ADR-0010, no negociable): la tabla de auditoría nunca debe llevar una columna, clave
JSONB anidada ni vista que vincule la identidad de un votante con su elección.** Concretamente:
ningún valor de `candidato_id`, `lista_id`, `opcion_id` ni `blanco` puede aparecer jamás asociado a un
`derecho_voto_id` o a un `actor_usuario_id` en ninguna fila de esta tabla. Imponer esto "por
convención" (confiando en que todo DTO futuro simplemente no incluya el campo) es insuficiente: quien
implemente #14, #16 o #18 en el futuro puede violarlo trivialmente pasando una clave extra al payload
JSONB.

**Recomendación de imposición estructural:** un trigger `BEFORE INSERT` sobre `EventoAuditoría` que,
específicamente para `event_type = 'VOTO'` (y cualquier otro tipo de evento que toque `Voto`), rechace
la inserción si `payload ?| array['candidato_id','lista_id','opcion_id','blanco','eleccion']`
(operador de existencia de claves JSONB de Postgres) es verdadero. Esto es imposición real a nivel de
base de datos, no una convención de revisión de código — se dispara sin importar qué módulo del
backend o qué persona futura escriba el evento, cerrando exactamente el hueco que el hallazgo C1 de
REVISION-ADVERSARIAL.md identificó antes de que existiera ADR-0010. Debe proponerse y confirmarse en
`sdd-propose`/`sdd-design`, no asumirse como ya decidido por algún ADR.

## Q3 — Imposición anti-UPDATE/DELETE: comparación de opciones

| Opción | Detiene | NO detiene |
|---|---|---|
| Trigger `BEFORE UPDATE/DELETE` con `RAISE EXCEPTION` | Que cualquier rol (incluido el propietario de la tabla) intente `UPDATE`/`DELETE` mediante SQL normal, mientras el trigger esté habilitado | A un superusuario o al propietario de la tabla que ejecute primero `ALTER TABLE ... DISABLE TRIGGER ALL` o `DROP TRIGGER` y después modifique filas |
| `RULE`s de PostgreSQL (reglas de reescritura) | Superficie similar a la de los triggers pero con semántica mucho más sorpresiva (las reglas reescriben la consulta, no se disparan después de ella) — mecanismo legado, desaconsejado por el propio proyecto Postgres | Nada extra respecto de los triggers; agrega riesgo de mantenimiento. **No recomendado.** |
| `REVOKE UPDATE, DELETE` al rol de aplicación | La conexión de runtime normal de la aplicación (bugs accidentales, una credencial de nivel de aplicación comprometida, inyección SQL usando credenciales de la aplicación) incluso si el trigger de algún modo no estuviera | Al propietario de la tabla / rol de migración / superusuario, que no está sujeto al permiso revocado (la propiedad implica privilegios salvo que se los quite explícitamente, e incluso entonces el propietario puede hacer `ALTER`/`DROP` del trigger o volver a otorgarse permisos a sí mismo) |

**Lo que ADR-0003 exige textualmente:** "triggers que rechazan UPDATE y DELETE, **y** un rol de
aplicación sin permisos de modificación sobre ella" — es decir, **ambos, como capas independientes**,
no uno u otro. Esto es defensa en profundidad: aunque una capa quede mal configurada o sea evadida
(un trigger eliminado por accidente en una migración; un permiso reotorgado por accidente), la otra
sigue en pie para el camino normal de la aplicación.

**Ser explícito sobre el límite (no exagerar la garantía):** ninguna de las dos capas detiene a un
superusuario de PostgreSQL ni al rol propietario de la tabla conectándose directamente (`psql`, una
sesión de DBA, un backup restaurado abierto para mantenimiento). ADR-0003 lo dice sin rodeos: "un
administrador de la base de datos con acceso directo puede alterarla — el sistema depende de la
custodia del acceso a PostgreSQL." Este es un riesgo residual aceptado y documentado, no algo que se
espere que #3 cierre ni que pueda cerrar a nivel de esquema. Se mitiga organizacionalmente (acceso de
DBA restringido, backups) según ADR-0007, no técnicamente por #3.

## Q4 — Modelo de roles y permisos

Se requieren dos roles de Postgres:

- **Rol de migración/propietario** (p. ej. `seei_migrator`) — privilegios DDL completos, propietario
  de todas las tablas, único rol que ejecuta `prisma migrate deploy`/`prisma migrate dev`. Usado
  exclusivamente por CI/despliegue y por el herramental de desarrollo local, nunca por el proceso
  backend en ejecución.
- **Rol de aplicación de runtime** (p. ej. `seei_app`) — el rol con el que el backend NestJS se
  conecta en runtime. Recibe `SELECT, INSERT` sobre `EventoAuditoría` y permisos CRUD ordinarios
  sobre las tablas de negocio, pero con **`REVOKE UPDATE, DELETE` (y `TRUNCATE`) explícito** sobre
  `EventoAuditoría` en particular.

**Hueco de aprovisionamiento — señalar a #1.** La propuesta de #1 (`system-scaffolding`), tal como
está escrita, configura una única datasource/conexión de Postgres para Prisma y nunca menciona una
división de roles; su Docker Compose y el fixture de Postgres de CI aprovisionan un único usuario de
base de datos. #3 no puede entregar su garantía central sin que esa división exista. Dos maneras de
cerrar el hueco, a decidir durante `sdd-propose`:

1. **Enmendar #1** (si todavía no se le aplicó `sdd-apply`) para aprovisionar ambos roles en su
   script de init de Docker Compose y en los secretos de CI — lo más limpio, dado que el
   aprovisionamiento de roles es infraestructura, no lógica de auditoría.
2. **Que #3 lo absorba**, agregando las sentencias `CREATE ROLE`/`GRANT`/`REVOKE` del segundo rol a su
   propia migración de SQL raw y actualizando el `DATABASE_URL` de runtime del backend para que
   apunte al nuevo rol, mientras CI/Docker Compose ganan una segunda cadena de conexión (migrador vs.
   runtime) como cambio de configuración que introduce #3.

De cualquier manera, **este es un cambio transversal real y no trivial sobre los artefactos de #1** y
debe explicitarse en la tabla de riesgos de la propuesta, no tratarse como un detalle interno de #3.

## Q5 — Servicio de registro transaccional

**Garantizar escrituras en la misma transacción con Prisma:** el único mecanismo que compone una
escritura de negocio arbitraria con una escritura de auditoría dentro de una misma transacción de
Postgres es la **transacción interactiva** de Prisma, `prisma.$transaction(async (tx) => {
...escrituras de negocio vía tx...; await auditoriaService.log(tx, ...); })`. La forma de arreglo
`$transaction([...])` solo funciona para una lista fija de operaciones independientes conocidas de
antemano y no puede depender de IDs generados sobre la marcha (p. ej. el `Voto.id` recién creado), así
que aquí es insuficiente.

Un contexto con alcance de request de NestJS o un helper liviano de unidad de trabajo (p. ej. un
portador basado en AsyncLocalStorage que haga circular el cliente `tx` activo a través de la inyección
de dependencias para que un servicio de dominio y `AuditoriaService` escriban en la misma transacción
sin pasar `tx` a mano en cada llamada) es una **comodidad**, no la fuente de la garantía de atomicidad
en sí — la garantía proviene puramente de que ambas escrituras ocurran dentro del mismo callback de
`$transaction` sobre la misma conexión de Postgres. Construir la plomería de AsyncLocalStorage es
alcance opcional para #3; una versión mínima (`log(tx, eventType, ...)` que acepta un parámetro `tx`
explícito) alcanza para demostrar la garantía bajo TDD estricto y es de menor riesgo para el
presupuesto de 400 líneas (ver Q9).

**Semántica de rollback — comportamiento correcto:** si la transacción de negocio hace rollback, la
inserción de auditoría (anidada en la misma transacción) hace rollback con ella — **no debe existir
ninguna fila de auditoría para una operación que nunca ocurrió.** Esto es correcto: un rastro de
auditoría de cosas que no ocurrieron corrompería la garantía de escrutinio reproducible (Flujo 4: "el
recuento sobre Voto coincide con los eventos VOTO de auditoría"). Nótese el matiz: los eventos
`RECHAZO` (voto rechazado porque la elección está cerrada, porque el derecho ya fue ejercido, etc.) no
están anidados dentro de una transacción de negocio *fallida* — son **su propia transacción exitosa e
independiente** que registra la decisión de rechazo en sí; el Flujo 1 de TECH-DESIGN.md exige
explícitamente un evento de auditoría `RECHAZO` para estos casos, así que la "operación de negocio"
que allí se registra ES el rechazo, no el voto.

**Que falle la escritura de auditoría aborta la operación de negocio — esto es correcto y está
diseñado así.** Como ambas escrituras comparten una transacción, un fallo de cualquiera de los dos
lados (p. ej. el trigger de claves prohibidas de Q2 rechazando un payload malformado) fuerza el
rollback de ambas. Esto coincide con la postura del PRD/ADR-0003 ("todo evento queda registrado", "0
votos duplicados... verificable contra auditoría") y refleja el mismo precedente de todo o nada que
ADR-0012 ya estableció para el patrón outbox (la fila `JobCorreo` nace en la misma transacción que el
hecho que notifica). Una operación que no puede auditarse de forma durable no debe considerarse
ocurrida.

## Q6 — Retención y anonimización: FUERA DE ALCANCE para #3

El punto 5 del ADR-0010 describe la anonimización explícitamente como **"un proceso administrativo de
anonimización — ejecutado con acceso de administrador de base de datos, fuera de la aplicación y
documentado."** Esa frase hace un trabajo real: *no* es una feature de aplicación, ni un job
programado, ni código de capa de aplicación del que sería dueño el servicio de registro de #3. El
único deber de #3 relacionado con la retención es (a) hacer permanentes los triggers ("los triggers
anti-UPDATE/DELETE permanecen" — sin excepción temporal incorporada en la lógica del trigger) y (b) no
construir nada que impida estructuralmente que funcione un futuro script de anonimización ejecutado
por un DBA. Nótese que la anonimización es en sí misma un `UPDATE` realizado por un superusuario, que
por diseño evade la imposición de nivel de aplicación descrita en Q3, así que ninguna cuestión de
clave foránea ni de trigger la bloquea mientras se mantenga ejecutada por un DBA, que es lo que manda
ADR-0010.

Construir el runbook/script de anonimización real **no es alcance de #3** — está más cerca de un
runbook de operaciones y actualmente **ningún ítem del backlog es dueño de él** (el #21 de BACKLOG.md
solo implementa "los plazos del ADR-0010" para su *vista*, no el procedimiento de anonimización en
sí). Este hueco debería señalarse a quien sea dueño del producto/backlog como hueco de documentación o
de backlog futuro, no absorberse en silencio dentro de #3.

## Q7 — Evidencia de manipulación: NO es requerida, no inventarla

ADR-0010 no exige nada más allá de append-only mediante triggers + restricción de rol y la
verificación cruzada de cardinalidad/cronología contra `Voto` (que pertenece a la lógica de la vista
de #21, no al camino de escritura de #3). No hay mención alguna, ni en ADR-0010, ni en TECH-DESIGN.md,
ni en la tabla de resolución de REVISION-ADVERSARIAL.md, de un hash chain (cadena de hashes), una
verificación de integridad de secuencia ni un job de verificación periódica. Agregar uno sería scope
creep: introduce complejidad real (elección del algoritmo de encadenamiento, un job de verificación,
gestión de claves si hay firma de por medio) que ningún requisito justifica, y cambiaría en silencio
el modelo de confianza que ADR-0003/0010 ya aceptaron (la custodia del DBA es el límite de confianza
declarado para la manipulación por acceso directo — un hash chain solo eleva el costo de detección
para un superusuario determinado, no cierra el acceso que los ADR ya aceptaron como riesgo residual).
Si esto se desea más adelante, necesita su propio ADR, no una suposición incorporada en #3.

## Q8 — Testing bajo TDD estricto (RED → GREEN → REFACTOR)

1. **RED — rechazar UPDATE.** Insertar una fila de auditoría (fixture), luego intentar el SQL raw
   `UPDATE "EventoAuditoria" SET event_type = 'X' WHERE id = $1` dentro de un test. Antes de que
   exista el trigger, el update tiene éxito silenciosamente — el test falla porque no se lanzó ningún
   error. **GREEN**: tras agregar el trigger `BEFORE UPDATE` con `RAISE EXCEPTION`, la misma sentencia
   lanza un error de Postgres (SQLSTATE `P0001` por defecto, o un SQLSTATE personalizado asignado con
   `RAISE EXCEPTION ... USING ERRCODE = '<custom>'` para una verificación más limpia); el test
   verifica que ese error aflore a través de Prisma y que el `event_type` de la fila quede sin cambios
   después del intento.
2. **RED/GREEN — rechazar DELETE.** Misma forma, `DELETE FROM "EventoAuditoria" WHERE id = $1`,
   trigger `BEFORE DELETE`, verificar que la fila siga existiendo después.
3. **RED/GREEN — rechazar en la capa de permisos, independientemente del trigger.** Conectarse con las
   credenciales propias del rol de aplicación de runtime e intentar UPDATE/DELETE directamente
   (evitando la capa de servicio) → esperar el código de error de Postgres `42501`
   (`insufficient_privilege`). Este es un test distinto de los #1/#2 porque ejercita la capa de REVOKE
   de forma aislada — valioso porque ambas defensas (Q3) necesitan prueba independiente, no solo la
   prueba de que la combinación funciona.
4. **RED/GREEN — una transacción de negocio con rollback no deja fila de auditoría.** Envolver una
   escritura de negocio + `AuditoriaService.log(...)` en un mismo `$transaction`, forzar un error
   lanzado después de ambas escrituras pero antes del commit implícito → verificar que después no haya
   filas ni en la tabla de negocio ni en `EventoAuditoría` para esa operación.
5. **RED/GREEN — una transacción confirmada deja exactamente una fila de auditoría.** Mismo envoltorio,
   sin error forzado → verificar que exista exactamente una fila de negocio y exactamente una fila de
   auditoría, con `entity_id` coincidiendo con el id de la fila de negocio.
6. **RED/GREEN — un payload de VOTO malformado aborta toda la transacción.** Intentar registrar un
   evento `VOTO` cuyo payload incluya una clave prohibida (`candidato_id`, según el trigger de Q2)
   dentro de la misma transacción que una escritura de negocio → verificar que el trigger de INSERT lo
   rechace (SQLSTATE personalizado) y que la escritura de negocio también haga rollback.

## Q9 — Pronóstico de presupuesto de líneas (presupuesto de revisión de 400 líneas)

Estimación aproximada de adiciones+eliminaciones autoradas:

| Pieza | Líneas est. |
|---|---|
| DDL de la tabla `EventoAuditoría` (SQL raw) | 15–20 |
| Triggers `BEFORE UPDATE`/`BEFORE DELETE` (2) | 20–30 |
| Trigger `BEFORE INSERT` de claves prohibidas (Q2) | 15–20 |
| Creación de roles + sentencias `REVOKE`/`GRANT` (Q4) | 15–25 |
| Cableado de Docker Compose / CI para el segundo rol | 20–30 |
| `AuditoriaService` + interfaz mínima `log(tx, ...)` + DTOs | 80–120 |
| Unión/registro `AuditEventType` | 15–25 |
| Tests de integración RED/GREEN de rechazo por trigger | 60–90 |
| Tests de integración de atomicidad transaccional | 60–90 |
| **Total** | **~300–450** |

Esto queda en el límite del presupuesto de 400 líneas o levemente por encima — **Riesgo alto**,
comparable al riesgo ya señalado por #1 y #2. **Forma de slices sugerida si se desborda** (dos PR
fusionables y verificables de forma independiente):

- **Slice 1 — la garantía de base de datos**: DDL de la tabla, ambos triggers anti-UPDATE/DELETE, el
  trigger de claves prohibidas, la división de roles/permisos y la suite de tests RED/GREEN de rechazo
  por trigger. Es el slice de mayor prioridad de revisión (lleva la promesa central del ADR-0010) y es
  completamente probable sin que exista todavía ningún servicio de aplicación.
- **Slice 2 — el camino de escritura**: `AuditoriaService`, la unión de tipos de evento, la plomería
  de contexto transaccional si se construye, y la suite de tests de atomicidad. Depende de que exista
  la tabla del Slice 1.

## Q10 — Riesgos, incógnitas y conflictos con los ADR

- **Bloqueo duro (certeza, hoy):** #1 y #2 no están implementados; #3 no puede llegar a `sdd-apply`
  hasta que ambos se entreguen, según la cadena de dependencias de BACKLOG.md (#3 depende de #2, que
  depende de #1).
- **Hueco de división de roles en #1 (alta probabilidad):** la propuesta actual de #1 aprovisiona un
  único rol de Postgres; #3 necesita la división migración/runtime para entregar su garantía central.
  Debe resolverse en `sdd-propose` — ya sea como enmienda a #1 (si todavía no fue aplicado) o como
  cambio aditivo que #3 realiza sobre los artefactos de Docker Compose/CI de #1.
- **El trigger de claves prohibidas es una recomendación, no un requisito decidido (media):** ningún
  ADR obliga al trigger de existencia de claves JSONB de Q2; es la imposición estructural propuesta
  por esta exploración para la garantía identidad↔elección del ADR-0010. Debe confirmarse
  explícitamente (o rechazarse en favor de un mecanismo más liviano) durante
  `sdd-propose`/`sdd-design`.
- **La evasión por superusuario/DBA es real y aceptada, no un hueco que #3 deba intentar cerrar
  (documentado, certeza):** ADR-0003 lo dice con claridad; volver a discutirlo en #3 sería scope
  creep.
- **El procedimiento de anonimización no tiene dueño claro (media):** ADR-0010 manda que exista
  eventualmente, pero ningún ítem del backlog implementa hoy el runbook/script en sí. Señalarlo a
  quien sea dueño del backlog en lugar de absorberlo en silencio dentro de #3.
- **Deriva de la taxonomía de tipos de evento (media):** sin una convención de registro compartida y
  append-only, los ítems futuros (#4–#20) arriesgan cadenas `event_type` inconsistentes. #3 debería
  entregar la convención (tipo unión / `CHECK` de nomenclatura) pero no debe intentar preregistrar
  tipos de evento que pertenecen a ítems posteriores.
- **La gestión de secretos de CI/Docker Compose para dos roles es trabajo nuevo (media):** el
  aprovisionamiento actual de CI de #1 asume un único `DATABASE_URL`; probar el comportamiento tanto
  del rol migrador como del de runtime (Q8, test 3) requiere que ambas cadenas de conexión estén
  disponibles en CI, lo cual todavía no está cableado en ninguna parte del repositorio.

## Enfoques considerados (estrategia de imposición append-only)

1. **Solo triggers** — Ventajas: lo más simple, no hace falta aprovisionar roles. Desventajas: no
   impide que una credencial del rol de aplicación comprometida o con bugs deshabilite primero el
   trigger si ese rol además tiene derechos de `ALTER TABLE` (poco probable si el alcance está bien
   definido, pero depende enteramente de que el alcance de permisos sea correcto en otro lado) —
   defensa en profundidad más débil de la que exige ADR-0003. Esfuerzo: bajo.
2. **Solo REVOKE (sin triggers)** — Ventajas: defensa simple a nivel de permisos. Desventajas: una
   sesión del propietario de la tabla / rol de migración (que necesariamente tiene UPDATE/DELETE para
   correr migraciones) no queda restringida por un REVOKE al rol de aplicación; sin trigger, un bug de
   la aplicación que accidentalmente corra como el rol propietario (p. ej. una cadena de conexión
   compartida mal configurada) no tiene segunda línea de defensa. Esfuerzo: bajo.
3. **Triggers + REVOKE (el mandato real del ADR-0003)** — Ventajas: defensa en profundidad sobre dos
   capas independientes (nivel de permisos y nivel de sentencia); cada una es probable de forma
   independiente (Q8). Desventajas: requiere el trabajo de aprovisionamiento de dos roles (Q4), la
   mayor pieza concreta de infraestructura nueva que introduce este change. Esfuerzo: medio.
   **Recomendado — esto es lo que ADR-0003 exige explícitamente, no una elección que #3 pueda tomar.**
4. **Agregar `RULE`s de PostgreSQL encima** — Ventajas: ninguna respecto de los triggers. Desventajas:
   mecanismo legado, semántica más sorpresiva, desaconsejado por el proyecto Postgres. Esfuerzo:
   medio, **no recomendado.**

## Recomendación

Avanzar a `sdd-propose` acotando #3 exactamente como lo define BACKLOG.md: DDL de la tabla + triggers
+ división de roles/permisos + un servicio de registro transaccional mínimo, con la imposición
estructural de claves prohibidas de Q2 propuesta explícitamente (no asumida), el hueco de
aprovisionamiento de dos roles en #1 señalado como cambio transversal requerido, la
retención/anonimización y la evidencia de manipulación declaradas explícitamente fuera de alcance con
las citas de los ADR que respaldan esa decisión, y un plan de dos slices de PR predeclarado dado el
pronóstico de ~300–450 líneas.

## Listo para Proposal

Sí para planificación, no para implementación — `sdd-apply` para #3 no puede avanzar hasta que el
Backlog #1 (`system-scaffolding`) y el #2 (`base-schema-and-migrations`) estén realmente
implementados, no solo propuestos. El hueco de división de roles en #1 (Q4) debería plantearse al
usuario ahora, ya que afecta si #1 necesita enmendarse antes de escribir la propuesta de #3.
