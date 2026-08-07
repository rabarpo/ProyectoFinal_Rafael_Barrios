# Propuesta: append-only-audit-engine (Backlog #3 — Motor de auditoría append-only)

## Intención

Hoy no existe código ni esquema de auditoría en ninguna parte del repositorio. PRD.md promete "todo
evento queda registrado en una auditoría inmutable" y "ningún registro de auditoría puede modificarse
ni eliminarse desde la aplicación"; ADR-0003 se compromete a imponer eso en el motor de base de datos,
no solo en el código de aplicación; ADR-0010 agrega encima la restricción de voto secreto (el rastro
de auditoría nunca debe permitir que nadie reconstruya quién votó por qué). Todo ítem posterior que
escriba un evento de auditoría (#4–#20) está bloqueado hasta que existan esta tabla, sus garantías
estructurales y un servicio de registro mínimo. Este change entrega exactamente eso: el camino de
escritura y sus garantías estructurales. No decide cómo se ve la interfaz de auditoría — eso es el
Backlog #21.

**Bloqueo duro:** este change no puede llegar a `sdd-apply` hasta que el Backlog #1
(`system-scaffolding`) y el Backlog #2 (`base-schema-and-migrations`) estén realmente implementados,
no solo propuestos. #1 aprovisiona los dos roles de Postgres de los que depende este change (ver
Dependencias); #2 aprovisiona la baseline de Prisma y el resto del esqueleto relacional sobre el que
se apila la migración de este change.

## Alcance

### Dentro de alcance

- DDL de la tabla `EventoAuditoría` (migración en SQL raw — Prisma no puede expresar triggers, según
  ADR-0003)
- Par de triggers anti-`UPDATE`/anti-`DELETE` (`BEFORE UPDATE`, `BEFORE DELETE`, `RAISE EXCEPTION`)
- Trigger `BEFORE INSERT` de claves prohibidas que rechaza todo evento de la familia `VOTO` cuyo
  `payload` JSONB contenga `candidato_id`, `lista_id`, `opcion_id`, `blanco` o `eleccion` (decisión
  nueva en este change — ver "Decisión nueva" más abajo)
- `REVOKE UPDATE, DELETE, TRUNCATE` sobre `EventoAuditoría` para el rol de aplicación de runtime
  (`seei_app`), aprovisionado por #1
- `AuditoriaService.log(tx, eventType, actorId, entityType, entityId, payload)` — un servicio de
  registro transaccional mínimo que otros módulos del backend invocan desde dentro de su propia
  transacción de negocio
- El mecanismo de extensión de tipos de evento: una unión/registro aditivo de literales de cadena
  `AuditEventType` y una restricción `CHECK` liviana sobre `event_type` (no vacío, convención de
  nombres), de modo que los ítems posteriores registren sus propios tipos de evento sin modificar
  nada de lo que este change es dueño

### Fuera de alcance

- **Camino de lectura** (consultas filtrables, exportación a CSV/PDF, bloqueo identidad↔elección en la
  capa de consulta/serialización, reconstrucción completa de la cadena) — Backlog #21. #21 depende de
  #3.
- **Retención y anonimización** — ADR-0010 §5 define esto como "un proceso administrativo de
  anonimización — ejecutado con acceso de administrador de base de datos, fuera de la aplicación y
  documentado." Esto explícitamente no es código de aplicación. El único deber de este change
  relacionado con la retención es mantener permanentes los triggers anti-UPDATE/DELETE (sin excepción
  temporal) y no construir nada que bloquee estructuralmente un futuro script de anonimización
  ejecutado por un DBA.
- **Evidencia de manipulación** (hash chaining, verificaciones de integridad de secuencia, jobs de
  verificación periódica) — ningún ADR lo exige. El límite de confianza declarado por ADR-0003 es la
  custodia por parte del DBA del acceso directo a Postgres (mitigada organizacionalmente según
  ADR-0007), no la detección criptográfica de manipulación. Agregar un hash chain ahora cambiaría en
  silencio ese modelo de confianza aceptado; si se desea más adelante, necesita su propio ADR.
- El aprovisionamiento de roles de Postgres en sí — ver Dependencias. Este change solo emite `REVOKE`
  contra un rol que ya debe existir.
- Enumerar cada tipo de evento futuro — el registro es aditivo por diseño; #3 no es dueño ni
  preregistra tipos de evento que pertenecen a #4–#20.

## Decisión nueva (no cubierta por ningún ADR existente)

El trigger `BEFORE INSERT` de claves prohibidas es una decisión nueva de imposición estructural, no
algo que ADR-0003 o ADR-0010 ya manden textualmente. Fundamento: ADR-0010 §1 exige que "el evento
`VOTO` de auditoría no contiene la elección", y el hallazgo C1 de REVISION-ADVERSARIAL.md (resuelto
por ADR-0010) ya mostró que confiar en que el DTO de cada futuro contribuyente simplemente omita el
campo es insuficiente — quien implemente #14/#16/#18 podría violar trivialmente la regla agregando una
clave JSONB extra. Un trigger `BEFORE INSERT` a nivel de base de datos cierra ese hueco sin importar
qué módulo del backend escriba el evento. **Recomendación: registrar esto como enmienda al ADR-0010 (o
como un ADR nuevo) durante `sdd-design`**, ya que es comportamiento nuevo impuesto por la base de datos
que quienes contribuyan en el futuro necesitan poder descubrir desde el registro de ADR, no solo desde
esta propuesta.

## Esquema del evento

SQL raw (no DSL completo de Prisma, según la admisión del ADR-0003 de que los triggers quedan fuera
del DSL de Prisma):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID / bigserial | PK |
| `actor_usuario_id` | FK nulable → `Usuario` | nulable: algunos eventos no tienen actor autenticado (p. ej. un login fallido contra una cuenta inexistente) |
| `event_type` | `TEXT` | no es un `ENUM` de Postgres (necesitaría una migración por cada tipo nuevo); restringido por un `CHECK` liviano (no vacío, convención de nombres) |
| `entity_type` | `TEXT` | p. ej. `'Voto'`, `'ProcesoElectoral'`, `'Usuario'` |
| `entity_id` | `TEXT`/UUID nulable | nulable para eventos sin una única fila afectada (p. ej. resúmenes de importación masiva) |
| `occurred_at` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | solo hora del servidor, nunca provista por el cliente — TECH-DESIGN.md exige repetidamente "hora del servidor" |
| `ip_address` | `INET`, nulable | |
| `user_agent` | `TEXT`, nulable | |
| `payload` | `JSONB` | detalle específico del evento |

**Por qué JSONB y no columnas tipadas.** Los tipos de evento son heterogéneos — el detalle de un
evento `VOTO` no se parece en nada al de un evento `CORREO_FALLIDO`. Las columnas tipadas forzarían
una tabla ancha y dispersa o una explosión de una tabla por tipo de evento; ni TECH-DESIGN.md ni
ADR-0003 piden eso. El propio ADR-0003 ya se compromete con una "columna JSONB para el detalle del
evento". Contrapartida: JSONB pierde la imposición de `CHECK`/FK a nivel de columna sobre los campos
anidados — mitigado, para el único campo que realmente importa, mediante el trigger de claves
prohibidas de arriba.

**Regla dura de identidad↔elección (ADR-0010, no negociable).** Ningún valor de `candidato_id`,
`lista_id`, `opcion_id` ni `blanco` puede aparecer jamás en el `payload` de un evento de la familia
`VOTO`, sin importar si en esa fila también está poblado `actor_usuario_id`. ADR-0010 §1 lo dice sin
rodeos: el evento de auditoría `VOTO` "no contiene la elección [...] nunca la lista u opción elegida".
La imposición es el trigger `BEFORE INSERT` descrito arriba, no una convención de revisión de código.

**Alcance de la "familia `VOTO`" — decidido tras la exploración del ítem #14.** La familia incluye
también los eventos `RECHAZO`, no solo los `VOTO`. Motivo: un rechazo nunca necesita transportar la
elección —el voto jamás se emitió—, pero un implementador podría registrar en su payload qué opción
tenía marcada el votante en el momento del rechazo (por ejemplo, volcando el estado del formulario).
Eso filtraría intención de voto, que en un entorno escolar es tan sensible como la elección misma. El
trigger debe cubrir ambos tipos de evento, de modo que la garantía no dependa de la disciplina de
quien implemente el ítem #14.

## Imposición: dos capas independientes

ADR-0003 exige ambas, textualmente: "triggers que rechazan `UPDATE` y `DELETE`, **y** un rol de
aplicación sin permisos de modificación sobre ella". Esto es defensa en profundidad — si una capa
queda mal configurada o es evadida (un trigger eliminado por accidente en una migración posterior; un
permiso reotorgado por accidente), la otra sigue en pie para el camino normal de la aplicación.

| Capa | Detiene | NO detiene |
|---|---|---|
| Trigger `BEFORE UPDATE`/`BEFORE DELETE` con `RAISE EXCEPTION` | Que cualquier rol intente `UPDATE`/`DELETE` mediante SQL normal mientras el trigger esté habilitado | A un superusuario o al propietario de la tabla que ejecute primero `ALTER TABLE ... DISABLE TRIGGER ALL` o `DROP TRIGGER` |
| `REVOKE UPDATE, DELETE, TRUNCATE` al rol de runtime (`seei_app`) | La conexión de runtime normal de la aplicación — bugs accidentales, una credencial de nivel de aplicación comprometida, inyección SQL usando credenciales de la aplicación | Al propietario de la tabla / rol de migración / superusuario, que no está sujeto a un permiso que nunca tuvo o que puede reotorgarse a sí mismo |

**Riesgo residual, enunciado sin suavizar.** Ninguna de las dos capas detiene a un superusuario de
PostgreSQL ni al rol propietario de la tabla conectándose directamente (`psql`, una sesión de DBA, un
backup restaurado abierto para mantenimiento). ADR-0003 lo dice sin rodeos: "un administrador de la
base de datos con acceso directo puede alterarla — el sistema depende de la custodia del acceso a
PostgreSQL." Este es un riesgo residual aceptado y documentado que no se espera que este change cierre
ni que pueda cerrar a nivel de esquema. Se mitiga organizacionalmente (acceso de DBA restringido,
backups) según ADR-0007, no técnicamente por este change.

## Servicio de registro transaccional

**Fuente de la atomicidad.** La transacción interactiva de Prisma —
`prisma.$transaction(async (tx) => { ...escrituras de negocio vía tx...; await auditoriaService.log(tx, ...); })`
— es el único mecanismo que compone una escritura de negocio arbitraria con una escritura de auditoría
dentro de una misma transacción de Postgres. La forma de arreglo `$transaction([...])` solo funciona
para una lista fija de operaciones independientes conocidas de antemano y no puede depender de IDs
generados sobre la marcha (p. ej. el `Voto.id` recién creado), así que aquí es insuficiente y se
rechaza explícitamente como enfoque.

**Semántica de rollback.** Si la transacción de negocio hace rollback, la inserción de auditoría
anidada hace rollback con ella — no existe fila de auditoría para una operación que nunca ocurrió. Un
rastro de auditoría de cosas que no ocurrieron corrompería la garantía de escrutinio reproducible
(Flujo 4: "el recuento sobre `Voto` coincide con los eventos `VOTO` de auditoría").

**Matiz de `RECHAZO`.** El rechazo de un voto (elección cerrada, derecho ya ejercido, etc.) no está
anidado dentro de una transacción de negocio *fallida* — es su propia transacción exitosa e
independiente que registra la decisión de rechazo en sí. El Flujo 1 de TECH-DESIGN.md exige un evento
de auditoría `RECHAZO` para estos casos; la "operación de negocio" que allí se registra ES el rechazo,
no el voto.

**Que falle la escritura de auditoría aborta la operación de negocio — por diseño.** Como ambas
escrituras comparten una transacción, un fallo de cualquiera de los dos lados (p. ej. el trigger de
claves prohibidas rechazando un payload malformado) fuerza el rollback de ambas. Una operación que no
puede auditarse de forma durable no debe considerarse ocurrida. Esto refleja el precedente del outbox
del ADR-0012 (la fila `JobCorreo` nace en la misma transacción que el hecho que notifica).

**Interfaz.** `AuditoriaService.log(tx, eventType: string, actorId: string | null, entityType:
string, entityId: string | null, payload: JsonValue)` — una firma estable y mínima que todo escritor
futuro (#4–#20) puede invocar sin que cambie el código de este change. Una comodidad de unidad de
trabajo basada en `AsyncLocalStorage` que haga circular `tx` automáticamente por la inyección de
dependencias es alcance explícitamente opcional, de menor prioridad que demostrar la garantía bajo TDD
estricto.

## Mecanismo de registro de tipos de evento

`event_type` es `TEXT`, restringido solo por un `CHECK` liviano (no vacío, que coincida con una
convención de nombres como `^[A-Z_]+$`), no un `ENUM` de Postgres (que necesitaría una migración por
cada valor nuevo). Del lado de TypeScript, este change entrega una unión de literales de cadena
`AuditEventType` (u objeto de registro) pequeña y aditiva en una ubicación compartida (p. ej.
`packages/contracts` o un pequeño `audit-event-types.ts` en el backend) que los ítems posteriores
extienden agregando su propio literal. Ningún archivo del que este change sea dueño necesita
modificarse por cada tipo de evento nuevo más allá de esa unión.

## Fuera de alcance, con citas de los ADR

- **Retención/anonimización** — ADR-0010 §5: "un proceso administrativo de anonimización — ejecutado
  con acceso de administrador de base de datos, fuera de la aplicación y documentado." No es código de
  aplicación; no es alcance de este change.
- **Evidencia de manipulación (hash chaining, etc.)** — ningún ADR lo exige. La sección
  "Consecuencias" del ADR-0003 ya nombra la custodia del DBA como el límite de confianza aceptado;
  introducir maquinaria de evidencia de manipulación elevaría en silencio el modelo de confianza más
  allá de lo que ADR-0003/0010 aceptaron y necesita su propio ADR si se persigue más adelante.

## Capacidades

### Capacidades nuevas
- `append-only-audit-engine`: DDL de la tabla `EventoAuditoría`, par de triggers anti-UPDATE/DELETE,
  trigger `BEFORE INSERT` de claves prohibidas, `REVOKE` sobre el rol de runtime, servicio de registro
  transaccional `AuditoriaService`, y el mecanismo aditivo de registro de tipos de evento

### Capacidades modificadas
Ninguna — change greenfield, no hay specs existentes que modificar. (Este change enmienda los
artefactos de la propuesta de #1 solo en la medida en que la propia enmienda de #1 ya aprovisiona los
dos roles que este change consume; ver Dependencias.)

## Enfoque

Migración de Prisma aumentada con SQL raw, apilada directamente después del esquema de #2, que
contiene: el DDL de la tabla `EventoAuditoría`, los tres triggers (anti-UPDATE, anti-DELETE, y el
`BEFORE INSERT` de claves prohibidas) y las sentencias `REVOKE` contra el rol de runtime.
`AuditoriaService` es un provider delgado de NestJS con un único método público (`log`) que acepta un
parámetro `tx` explícito — no se requiere plomería de contexto transaccional a nivel de framework para
demostrar la garantía. El TDD estricto aplica en todo momento: cada trigger y la garantía de
atomicidad se demuestran RED→GREEN contra códigos de error reales de Postgres antes de considerarse
terminados (ver Testing más abajo).

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `apps/backend/prisma/migrations/*` | Nueva | DDL de la tabla de auditoría + triggers + `REVOKE`, aumentado con SQL raw, apilado después de las migraciones de #2 |
| `apps/backend/src/auditoria/auditoria.service.ts` | Nueva | `AuditoriaService.log(tx, ...)` |
| `apps/backend/src/auditoria/audit-event-types.ts` (o `packages/contracts`) | Nueva | Unión/registro aditivo `AuditEventType` |
| `apps/backend/test/auditoria/*.spec.ts` | Nueva | Tests de integración RED/GREEN de rechazo por trigger y de atomicidad |
| `infra/docker` / secretos de CI (provenientes de #1, consumidos aquí) | Consumida, no modificada por este change | Ambas cadenas de conexión de Postgres (`seei_migrator`, `seei_app`) deben estar ya disponibles |

## Dependencias

- **Backlog #1 (`system-scaffolding`)** — bloqueo duro. Su propuesta ya enmendada aprovisiona los dos
  roles de Postgres que este change requiere: el rol de migración/propietario (`seei_migrator`, usado
  para ejecutar la migración que contiene el DDL y los triggers de este change) y el rol de aplicación
  de runtime (`seei_app`, destinatario del `REVOKE` de este change). **Este change no crea ninguno de
  los dos roles — solo emite `REVOKE UPDATE, DELETE, TRUNCATE` sobre `EventoAuditoría` contra el rol
  de runtime que #1 aprovisiona.** Ambas cadenas de conexión deben estar cableadas en Docker Compose y
  en CI antes de que pueda ejecutarse el test 3 de Q8 (test de la capa de permisos) de este change.
- **Backlog #2 (`base-schema-and-migrations`)** — bloqueo duro. Provee la baseline de Prisma y el
  esqueleto relacional sobre el que se apila la migración de este change; la propuesta de #2 excluyó
  explícitamente `EventoAuditoría` y la movió aquí por completo (tabla + triggers + servicio), como
  una unidad atómica y autocontenida.

## Enfoque de TDD estricto

RED→GREEN, seis casos (según la Q8 de la exploración):

1. **Rechazar UPDATE.** Insertar una fila de fixture, luego `UPDATE "EventoAuditoria" SET event_type =
   'X' WHERE id = $1`. RED: tiene éxito silenciosamente antes de que exista el trigger. GREEN: tras
   agregar el trigger `BEFORE UPDATE`, la sentencia lanza un error de Postgres; verificar que el
   `event_type` de la fila quede sin cambios.
2. **Rechazar DELETE.** Misma forma con `DELETE FROM "EventoAuditoria" WHERE id = $1` y un trigger
   `BEFORE DELETE`; verificar que la fila siga existiendo después.
3. **Rechazar en la capa de permisos, independientemente del trigger.** Conectarse con las credenciales
   propias del rol de aplicación de runtime e intentar `UPDATE`/`DELETE` directamente, evitando la capa
   de servicio. Esperar el código de error de Postgres `42501` (`insufficient_privilege`). Esto prueba
   la capa de `REVOKE` de forma aislada — ambas defensas necesitan prueba independiente, no solo la
   prueba de que la combinación funciona.
4. **Una transacción de negocio con rollback no deja fila de auditoría.** Envolver una escritura de
   negocio + `AuditoriaService.log(...)` en un mismo `$transaction`, forzar un error lanzado después de
   ambas escrituras pero antes del commit implícito. Verificar cero filas tanto en la tabla de negocio
   como en `EventoAuditoría`.
5. **Una transacción confirmada deja exactamente una fila de auditoría.** Mismo envoltorio, sin error
   forzado. Verificar exactamente una fila de negocio y exactamente una fila de auditoría, con
   `entity_id` coincidiendo con el id de la fila de negocio.
6. **Un payload de `VOTO` malformado aborta toda la transacción.** Intentar registrar un evento `VOTO`
   cuyo payload incluya una clave prohibida (`candidato_id`) dentro de la misma transacción que una
   escritura de negocio. Verificar que el trigger `BEFORE INSERT` lo rechace y que la escritura de
   negocio también haga rollback.

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Bloqueado por #1/#2, ninguno implementado todavía | Certeza, hoy | No puede llegar a `sdd-apply` hasta que ambos se entreguen; esta propuesta asume que existen la división de roles de #1 y el esquema de #2 |
| El runbook de anonimización no tiene dueño en el backlog | Media, señalado y no absorbido | ADR-0010 manda que el procedimiento exista eventualmente, pero ningún ítem del backlog implementa hoy el runbook/script. **Este es un hueco de producto/backlog para que el usuario lo asigne, no algo que este change absorba en silencio.** |
| Deriva de la taxonomía de tipos de evento entre #4–#20 | Media | Este change entrega la convención (tipo unión + `CHECK` de nomenclatura) pero no preregistra tipos de evento que pertenecen a ítems posteriores; el riesgo de deriva persiste si los ítems posteriores no siguen la convención |
| Pronóstico de ~300–450 líneas, en el límite del presupuesto de revisión de 400 líneas o por encima | Alta | Forma sugerida de dos slices para `sdd-tasks` — Slice 1: DDL de la tabla + los tres triggers + división de roles/permisos + tests de rechazo por trigger (máxima prioridad de revisión, completamente probable sin que exista ningún servicio); Slice 2: `AuditoriaService` + unión de tipos de evento + tests de atomicidad (depende de la tabla del Slice 1). **La decisión de la división en sí se difiere a `sdd-tasks`, no se toma aquí.** |
| El trigger de claves prohibidas es una decisión nueva, todavía no reflejada en el texto del ADR-0010 | Baja-Media | Registrada arriba como "Decisión nueva"; se recomienda una enmienda al ADR-0010 o un ADR nuevo durante `sdd-design` para que el mecanismo sea descubrible desde el registro de ADR y no solo desde esta propuesta |
| Evasión por acceso directo de superusuario/DBA | Certeza, aceptada, fuera del poder de este change para cerrarla | Documentada sin rodeos arriba según ADR-0003; mitigada organizacionalmente según ADR-0007, no vuelta a discutir aquí |

## Plan de rollback

Greenfield, no existen datos de producción en el momento en que este change se entrega (según el
precedente de rollback de #1 y #2). Si un slice resulta inviable: hacer `git revert` del o los PR
relevantes (según el plan de dos slices que finalizará `sdd-tasks`). Si la migración ya se aplicó a
una base de datos compartida de dev/CI, aplicar una pequeña migración hacia adelante que elimine los
triggers, revoque/reotorgue lo necesario y elimine `EventoAuditoría` — sin migraciones de bajada
mantenidas a mano, consistente con el precedente de #1 y #2. Como este change es el único dueño de
`EventoAuditoría` y ninguna otra tabla depende de ella por FK, el rollback no acarrea riesgo de
esquema en cascada sobre las tablas de #2. Cualquier fila de auditoría escrita entre el apply y el
rollback se pierde junto con la tabla — aceptable únicamente porque todavía no existen datos de
producción; este plan de rollback NO aplica una vez que existan votos/eventos reales después de la
puesta en marcha, momento en el cual el rollback requeriría el mismo procedimiento documentado y
ejecutado por un DBA que ADR-0010 ya anticipa para la anonimización.

## Criterios de éxito

- [ ] La tabla `EventoAuditoría` existe con el conjunto completo de columnas (tabla del Esquema del
      evento de arriba)
- [ ] Los triggers `BEFORE UPDATE` y `BEFORE DELETE` rechazan todos los intentos de `UPDATE`/`DELETE`
      sobre `EventoAuditoría`, verificado contra códigos de error reales de Postgres
- [ ] El rol de runtime (`seei_app`) tiene `UPDATE`, `DELETE` y `TRUNCATE` revocados sobre
      `EventoAuditoría` y esto se demuestra de forma independiente de la capa de triggers (código de
      error `42501`)
- [ ] El trigger `BEFORE INSERT` rechaza todo evento de la familia `VOTO` cuyo payload contenga
      `candidato_id`, `lista_id`, `opcion_id`, `blanco` o `eleccion`
- [ ] `AuditoriaService.log(tx, ...)` escribe una fila de auditoría dentro del propio `$transaction`
      de quien llama; una transacción de negocio con rollback deja cero filas de auditoría y una
      confirmada deja exactamente una
- [ ] Un payload de `VOTO` malformado aborta tanto la inserción de auditoría como la escritura de
      negocio que la envuelve
- [ ] La unión/registro `AuditEventType` existe en una ubicación compartida y aditiva; ningún archivo
      del que este change sea dueño requiere modificación para que un ítem posterior registre un tipo
      de evento nuevo
- [ ] Los seis casos de test RED→GREEN del Enfoque de TDD estricto pasan contra un Postgres real
- [ ] Ninguna columna, clave JSONB anidada ni vista de este change vincula la identidad del votante con
      su elección
- [ ] La anonimización/retención y la evidencia de manipulación permanecen explícitamente fuera de
      alcance, sin ningún código en este change que impida el funcionamiento de un futuro script de
      anonimización ejecutado por un DBA
