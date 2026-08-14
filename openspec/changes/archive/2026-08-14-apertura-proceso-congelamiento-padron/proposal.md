# Proposal: Apertura del proceso y congelamiento del padrón

## Intent

`ProcesoElectoral` ya tiene todos los campos que necesita escribir (`estado`, `apertura_real`,
`ocultar_resultados`) y `DerechoVoto` existe completo en el schema, pero hoy no se escribe
ninguna fila de `DerechoVoto` en ningún lugar del código: `electoral-process-management` cubre
CRUD en `borrador` y excluye explícitamente la transición a `abierto`. Sin apertura no hay padrón
congelado, y sin padrón congelado `#14` (emisión de voto) no tiene sobre qué validar derecho.
Este change cierra ese hueco: materializa `DerechoVoto` por fila, congela `ocultar_resultados`
(ADR-0008) y sella la hora de apertura con reloj de Postgres (ADR-0011 §doble derecho).

## Scope

### In Scope
- `POST /procesos/:id/abrir`: transición `borrador → abierto`, endpoint dedicado.
- Materialización de `DerechoVoto` a nivel de fila, reutilizando `resolverAulas()`/elegibilidad
  de matrícula ya usadas por `crear()`/`editar()`.
- `apertura_real` sellado con `now()`/`clock_timestamp()` de Postgres dentro de la transacción.
- `ocultar_resultados` se congela (deja de ser editable) al abrir.
- Confirmación explícita (`confirmar: true` en el body) antes de ejecutar la apertura.
- Auditoría `PROCESO_ABIERTO` en la misma transacción.
- Restricción de unicidad nueva en `DerechoVoto`.

### Out of Scope
- Cierre de proceso y emisión de acta (`#17`+).
- Emisión de voto / consumo de `DerechoVoto` (`#14`).
- Validación de "aula con candidatos" para `representante_aula` (ver reglas de negocio, ítem 2 —
  no hay FK confiable entre `Candidato` y `Aula` hoy).
- Público objetivo `docente` (no existe en el enum `PublicoObjetivo` actual).
- Prueba de carga de la transacción de materialización (queda como seguimiento).

## Capabilities

### New Capabilities
- Ninguna nueva independiente — la apertura es una extensión de comportamiento sobre la gestión
  del proceso electoral, no un dominio propio.

### Modified Capabilities
- `electoral-process-management`: agrega la transición `borrador → abierto` (`POST
  /procesos/:id/abrir`), la materialización de `DerechoVoto`, el congelamiento de
  `ocultar_resultados` y el bloqueo de edición efectivo una vez `abierto` (hoy solo declarado
  como "fuera de alcance", pasa a ser comportamiento real).

## Approach

Endpoint dedicado en `procesos.controller.ts` → `ProcesosService.abrir(id, actorId, dto)`. Dentro
de una única `$transaction`: (1) `updateMany({ where: { id, estado: 'borrador' }, data: {
estado: 'abierto', apertura_real: clock_timestamp() } })` como guarda de concurrencia/idempotencia;
(2) si `count === 0`, releer el proceso y devolver 200 idempotente si ya estaba `abierto`, o 409
`PROCESO_NO_ABRIBLE` si el estado es otro; (3) si `count === 1`, recalcular elegibilidad de
matrícula sobre el `ProcesoAula[]` ya congelado en `crear()`/`editar()` (mismo patrón que
`aulasConMatriculaActiva()`), materializar `DerechoVoto` por fila vía `createMany`, y `auditoria.log`
`PROCESO_ABIERTO` con conteos. Reutiliza `resolverAulas()`/`derechosPorAula()` de
`padron.service.ts` sin reimplementar la resolución de aulas.

## Reglas de negocio adoptadas (sin reglamento previo — configurables/revisables)

1. **Snapshot vs. recálculo de elegibilidad**: se RECALCULA la matrícula elegible contra el árbol
   académico actual al momento de abrir (no se reutiliza el preview del asistente). El conjunto de
   *aulas* queda fijo desde `borrador` (`ProcesoAula` ya congelado por `crear()`/`editar()`), pero
   *quién* dentro de esas aulas tiene matrícula activa se evalúa en vivo, igual que ya hace
   `aulasConMatriculaActiva()` en `crear()`/`editar()` — nunca se cachea. *(Revisable.)*
2. **Aula sin candidatos (`representante_aula`) NO bloquea ni excluye**: `Candidato.aula` es texto
   libre sin FK a `Aula` — no existe hoy una forma confiable de saber si una aula congelada tiene
   candidatos. Se propone que `#13` NO valide esto (queda fuera de alcance); el padrón se congela
   sobre el `ProcesoAula[]` completo. *(No revisable sin agregar antes una FK `Candidato.aula_id`
   — señalado como hallazgo, no como decisión menor.)*
3. **Alcance del derecho para tipo `padres`**: todas las aulas del `ProcesoAula[]` congelado con al
   menos un estudiante elegible con apoderado activo — mismo criterio que `derechosPorAula()`, sin
   restricción adicional por candidatos (ítem 2 no aplica a este tipo). *(Revisable.)*
4. **`docente` fuera de alcance**: confirmado — `PublicoObjetivo`/`TipoProceso` no lo contemplan
   hoy; `#13` no agrega el valor al enum. *(No revisable sin change de schema aparte.)*
5. **Unicidad de `DerechoVoto`**: `@@unique([proceso_id, usuario_id, en_calidad_de])` — permite
   hasta 2 filas por cuenta en `comunidad` (estudiante + padre), bloquea duplicado en reintento.
   *(No revisable — es la base de la idempotencia del ítem 6.)*
6. **Idempotencia de `POST /procesos/:id/abrir`**: doble-click/reintento es un no-op seguro (200
   con el estado ya vigente) si el proceso ya está `abierto`; 409 `PROCESO_NO_ABRIBLE` solo si el
   estado es `cerrado`/`acta_emitida`. Guardado con `updateMany` condicional + la unicidad del
   ítem 5 como red de seguridad ante carrera. *(Revisable.)*
7. **Confirmación previa**: flag `confirmar: true` requerido en el body del mismo endpoint (400
   `CAMPO_INVALIDO` si falta/false) — no una pantalla backend separada. El frontend lee `GET
   /procesos/:id` (ya expone `ocultar_resultados`) y renderiza un modal/paso de revisión antes de
   invocar `abrir`. *(Revisable — el diseño visual del modal no tiene referencia Stitch aún.)*

**Forma de `aula_snapshot`** (reconciliación con `vote-casting/exploration.md`): el schema ya
declara `aula_snapshot String` — se fija como el `aula_id` (UUID) plano, espejo de
`ProcesoAula.aula_id` en el momento de apertura, deliberadamente SIN FK a `Aula` (mismo principio
de inmutabilidad que ADR-0003/ADR-0010: ningún cambio futuro en `Aula` debe poder afectar un
`DerechoVoto` ya congelado). `vote-casting/exploration.md` asume que existe "el aula congelada en
`DerechoVoto`" para validar compatibilidad — consistente con esta forma, sin conflicto. Se propone
agregar `@db.Uuid` al campo por consistencia de tipos (sigue sin relación Prisma).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/procesos/procesos.service.ts` | Modified | Nuevo método `abrir()` |
| `apps/backend/src/procesos/procesos.controller.ts` | Modified | `POST /procesos/:id/abrir` |
| `apps/backend/src/procesos/padron.service.ts` | Modified | Función hermana de materialización a nivel de fila |
| `apps/backend/src/procesos/procesos.errors.ts` | Modified | `PROCESO_NO_ABRIBLE` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modified | `PROCESO_ABIERTO` |
| `apps/backend/prisma/schema.prisma` | Modified | `@@unique` en `DerechoVoto`, `@db.Uuid` en `aula_snapshot` |
| `apps/frontend/src/procesos/` | New | Acción "Abrir proceso" + modal de confirmación |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Volumen de la transacción (`createMany` de cientos/miles de `DerechoVoto`) sin prueba de carga | Medium | Fuera de alcance de este PR; seguimiento explícito post-merge |
| Ítem 2 (aula sin candidatos) deja un hueco real de validación de negocio | Medium | Documentado como hallazgo, no oculto; backlog futuro si se requiere FK `Candidato.aula_id` |
| Alcance puede exceder el presupuesto de revisión (400 líneas) por transacción nueva + schema + endpoint + frontend | Medium | Evaluar PRs encadenados en `sdd-tasks` (backend de apertura vs. UI de confirmación) |
| Falta de referencia visual Stitch para el modal de confirmación pre-apertura | Low | Bloquea solo la UI, no el backend; puede resolverse en paralelo |

## Rollback Plan

Sin procesos abiertos en producción aún. La migración de `DerechoVoto` (nueva `@@unique`, tipo de
`aula_snapshot`) es aditiva/sin backfill de filas reales — revertible sin pérdida. El endpoint y
el método `abrir()` son código nuevo aislado; revertir el commit restaura el estado actual
(`abrir()` inexistente, `editar()` sigue rechazando `estado != borrador` como hoy).

## Dependencies

- `#12` (`candidatos-listas-management`, archivado): confirma que `Candidato.aula` es texto libre
  sin FK — insumo directo de la regla 2.
- `#11` (`administracion-procesos-electorales`, archivado): `ProcesoElectoral`/`ProcesoAula` a
  transicionar.
- Bloquea a `#14` (`vote-casting`): consume `DerechoVoto` ya congelado por este change.

## Success Criteria

- [ ] `POST /procesos/:id/abrir` transiciona `borrador → abierto`, sella `apertura_real` con reloj
      de Postgres, y congela `ocultar_resultados`.
- [ ] `DerechoVoto` se materializa por fila, con doble derecho correcto para `comunidad`.
- [ ] Doble-click/reintento del endpoint es idempotente (no genera filas duplicadas ni error).
- [ ] Auditoría `PROCESO_ABIERTO` registrada en la misma transacción.
- [ ] `editar()`/`eliminar()` siguen rechazando el proceso una vez `abierto` (ya cubierto, se
      verifica que sigue siendo cierto).

## Proposal question round

No se realizó ronda de preguntas interactiva antes de esta versión — la exploración y la
inspección directa del schema ya resolvían la mayoría de las ambigüedades de negocio. Puntos
abiertos para el usuario, no bloqueantes:

1. Ítem 2 (aula sin candidatos): ¿es aceptable que `#13` NO valide esto, dejando la
   responsabilidad en el admin de revisar el padrón antes de abrir? ¿O se prefiere bloquear la
   apertura completa como salvaguarda aunque sea imprecisa (falso positivo posible por texto
   libre)?
2. Ítem 6 (idempotencia): ¿el no-op silencioso (200 sin aviso) es aceptable, o el frontend debería
   mostrar un mensaje explícito de "ya estaba abierto" ante un reintento?
3. Ítem 7 (confirmación): ¿el flag `confirmar: true` en el mismo endpoint es suficiente, o el
   negocio prefiere un endpoint de dos pasos (`preview` + `confirmar`) más explícito?
