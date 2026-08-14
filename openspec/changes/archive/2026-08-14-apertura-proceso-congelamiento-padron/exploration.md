# Exploración: apertura-proceso-congelamiento-padron (Backlog #13 — Apertura del proceso y congelamiento del padrón)

## Estado actual

`ProcesoElectoral` ya tiene todos los campos que `#13` necesita escribir (`estado`,
`apertura_real`/`cierre_real`, `ocultar_resultados`), y `DerechoVoto` existe completo en
`apps/backend/prisma/schema.prisma`, pero **hoy no se escribe ni una sola fila de `DerechoVoto`**
en ningún lugar del código actual. `PadronService.calcular()`
(`apps/backend/src/procesos/padron.service.ts`) ya implementa exactamente la lógica de agregación
que hace falta — `resolverAulas()` + `derechosPorAula()` — pero a nivel de agregado por aula, sin
materializar filas nunca (la spec de `#11` lo prohíbe explícitamente: "MUST NOT persistir filas de
`DerechoVoto` durante el asistente"). `ProcesosService` (`procesos.service.ts`) no tiene ningún
método de transición de estado; `ActualizarProcesoDto` excluye `estado` de `PATCH` a propósito, y
`editar()` rechaza cualquier escritura una vez que `estado !== 'borrador'`. No existe ningún
endpoint de apertura — esto tiene que ser una acción dedicada nueva (`POST /procesos/:id/abrir`),
no una extensión de `PATCH`. El ADR-0011 confirma que `Apoderado` no tiene login propio — "doble
derecho" significa que la misma cuenta `Usuario` del estudiante recibe dos filas de `DerechoVoto`
(`en_calidad_de = 'estudiante'` / `'padre'`) en procesos con alcance `comunidad`, nunca una cuenta
separada. El ADR-0008 fija que `ocultar_resultados` queda congelado al abrir. El patrón de "hora
del servidor" ya está resuelto por dos fuentes convergentes: `@default(now())` del lado de la base
de datos en todo el schema, y `openspec/changes/vote-casting/exploration.md` §9, que es categórico
en que la hora del servidor debe sellarse vía `now()`/`clock_timestamp()` de Postgres dentro de la
transacción, nunca `Date.now()` de Node.

## Áreas afectadas

- `apps/backend/src/procesos/procesos.service.ts` — nuevo método/transacción `abrir(id, actorId)`.
- `apps/backend/src/procesos/padron.service.ts` — reutilizar `resolverAulas()`; necesita una
  función hermana de materialización a nivel de fila.
- `apps/backend/src/procesos/procesos.controller.ts` — nuevo endpoint `POST /procesos/:id/abrir`.
- `apps/backend/src/auditoria/audit-event-types.ts` — nueva clave `PROCESO_ABIERTO`.
- `apps/backend/prisma/schema.prisma` — posible `@@unique([proceso_id, usuario_id,
  en_calidad_de])` nuevo en `DerechoVoto`.
- `apps/backend/src/procesos/procesos.errors.ts` — nuevos códigos de error (`PROCESO_YA_ABIERTO`,
  `AULA_SIN_CANDIDATOS`, etc.).
- `apps/frontend/src/procesos/` — nueva acción de UI "Abrir proceso" fuera del asistente de 4 pasos
  ya existente (la spec de `#11` excluye explícitamente la apertura del alcance del asistente).
- `openspec/changes/vote-casting/exploration.md` — ya depende de decisiones que `#13` tiene que
  fijar formalmente (forma de `aula_snapshot`, mecánica del doble derecho).

## Enfoques posibles

1. **Endpoint dedicado `POST /procesos/:id/abrir`, materialización a nivel de fila reutilizando
   `resolverAulas()`, una sola transacción con auditoría** — Pros: separa limpiamente la semántica
   irreversible de "abrir" del `PATCH` reversible; reutiliza la resolución de aulas ya probada;
   coincide con el patrón ya usado por `crear()`/`editar()` (transacción interactiva + auditoría
   adentro). Cons: introduce un tercer camino de escritura de estado. Esfuerzo: Medio.
2. **Extender `ActualizarProcesoDto`/`editar()` para aceptar `estado: 'abierto'`** — Cons:
   contradice la exclusión deliberada de `estado` ya codificada/comentada; mezcla dos dominios de
   validación incompatibles. Esfuerzo: Alto (refactor de código ya archivado y testeado).
3. **Materialización asíncrona vía worker/job** — Cons: no hay precedente en este repo de
   escrituras de datos de negocio síncronas que se vuelvan asíncronas (solo el outbox de
   notificaciones lo es); requeriría un nuevo valor transitorio de `EstadoProceso` que no está en
   el enum. Esfuerzo: Alto, no recomendado sin evidencia de volumen.

## Recomendación

Enfoque 1 — endpoint dedicado, una sola transacción, reutilizando la resolución de aulas de
`padron.service.ts` pero materializando a nivel de fila.

## Riesgos

- El volumen de la transacción de materialización (cientos-miles de filas de `DerechoVoto` para
  procesos institucionales ×2 en `comunidad`) necesita una prueba de carga, no solo tests
  funcionales.
- Snapshot vs. recálculo al momento de la apertura queda sin resolver — impacta directamente el
  requisito de que "un cambio de aula post-apertura no afecte el padrón ya congelado".
- Acoplamiento con `#14` (aún sin implementar): `vote-casting/exploration.md` ya asume una forma
  específica de `aula_snapshot` que `#13` tiene que declarar formalmente.
- No hay precedente existente en `procesos/` para un servicio de transición de estado irreversible
  con sus propias validaciones de negocio — este sería el primero de su tipo en el módulo.
- Falta la superficie de UI de "confirmación antes de abrir" (TECH-DESIGN.md exige que
  `ocultar_resultados` se muestre de forma prominente en una revisión pre-apertura) — no existe
  referencia de diseño de Stitch para esta pantalla.

## Listo para propuesta

Sí — con siete reglas de negocio adoptadas (recálculo de elegibilidad al momento de la apertura,
exclusión vs. bloqueo de `representante_aula` sin candidatos, alcance del derecho para tipo
`padres`, `docente` fuera de alcance, restricción de unicidad de `DerechoVoto`, comportamiento de
idempotencia/reintento de la apertura) a declarar explícitamente en `sdd-propose` como defaults
configurables/revisables según el mandato de "Ausencia de reglamento previo" de `BACKLOG.md`, y
coordinación explícita con `vote-casting/exploration.md`.
