# Delta for electoral-process-management

## ADDED Requirements

### Requirement: Apertura de proceso con confirmación explícita
El sistema MUST proveer `POST /procesos/:id/abrir`, protegido por
`@Roles('administrador', 'director', 'comité')`, que exige `confirmar: true` en el body. El sistema
MUST rechazar la solicitud con `400 CAMPO_INVALIDO` si `confirmar` está ausente o es `false`, sin
ejecutar ninguna escritura.

#### Scenario: Apertura rechazada sin confirmación
- GIVEN un `ProcesoElectoral` en `borrador`
- WHEN se invoca `POST /procesos/:id/abrir` sin `confirmar: true` en el body
- THEN la respuesta es `400 CAMPO_INVALIDO` y el proceso permanece en `borrador`

#### Scenario: Apertura aceptada con confirmación explícita
- GIVEN un `ProcesoElectoral` en `borrador`
- WHEN se invoca `POST /procesos/:id/abrir` con `confirmar: true`
- THEN la transición se ejecuta

### Requirement: Transición `borrador → abierto` concurrency-safe e idempotente
El sistema MUST ejecutar la transición vía una operación condicional atómica (`updateMany` con
`where: { id, estado: 'borrador' }`), nunca un patrón leer-y-luego-escribir. Si la operación afecta
cero filas, el sistema MUST releer el estado actual: si ya es `abierto`, MUST responder `200` sin
generar efectos adicionales (no-op idempotente, sin mensaje especial); para cualquier otro estado
(`cerrado`, `acta_emitida`), MUST responder `409 PROCESO_NO_ABRIBLE`.

#### Scenario: Apertura exitosa desde `borrador`
- GIVEN un `ProcesoElectoral` en `borrador`
- WHEN se invoca `POST /procesos/:id/abrir` con `confirmar: true`
- THEN el proceso queda en `estado = abierto`

#### Scenario: Reintento sobre un proceso ya abierto es idempotente
- GIVEN un `ProcesoElectoral` ya en `estado = abierto`
- WHEN se invoca `POST /procesos/:id/abrir` con `confirmar: true` nuevamente
- THEN la respuesta es `200`, el proceso permanece `abierto` y no se materializan filas adicionales
  de `DerechoVoto`

#### Scenario: Apertura rechazada desde un estado no abrible
- GIVEN un `ProcesoElectoral` en `estado = cerrado` o `acta_emitida`
- WHEN se invoca `POST /procesos/:id/abrir` con `confirmar: true`
- THEN la respuesta es `409 PROCESO_NO_ABRIBLE` y el proceso no cambia de estado

### Requirement: Materialización de `DerechoVoto` con elegibilidad recalculada
Al ejecutar la transición, el sistema MUST materializar una fila de `DerechoVoto` por cada derecho
de voto vigente, reutilizando la resolución de aulas (`resolverAulas()`/`derechosPorAula()` de
`padron.service.ts`) sobre el `ProcesoAula[]` ya congelado en `borrador`. El sistema MUST recalcular
la matrícula elegible contra el árbol académico en el momento de la apertura (no el preview del
asistente), siguiendo el mismo criterio ya usado por `crear()`/`editar()`. Para procesos con
alcance `comunidad`, el sistema MUST generar dos filas por estudiante elegible con apoderado
activo, ambas asociadas al `Usuario` del estudiante: una con `en_calidad_de = 'estudiante'` y otra
con `en_calidad_de = 'padre'`.

#### Scenario: Materialización usa elegibilidad recalculada, no el preview
- GIVEN un `ProcesoElectoral` en `borrador` cuyo preview de asistente quedó desactualizado por un
  cambio posterior de matrícula
- WHEN se invoca `POST /procesos/:id/abrir` con `confirmar: true`
- THEN las filas de `DerechoVoto` materializadas reflejan la matrícula activa vigente al momento de
  la apertura, no el preview original

#### Scenario: Doble derecho para alcance `comunidad`
- GIVEN un `ProcesoElectoral` de alcance `comunidad` con un estudiante elegible y apoderado activo
- WHEN se invoca `POST /procesos/:id/abrir` con `confirmar: true`
- THEN se crean dos filas de `DerechoVoto` para la misma cuenta `Usuario` del estudiante:
  `en_calidad_de = 'estudiante'` y `en_calidad_de = 'padre'`

### Requirement: Sellado de `apertura_real` con reloj de Postgres
El sistema MUST fijar `apertura_real` usando `now()`/`clock_timestamp()` de Postgres dentro de la
misma transacción de apertura. El sistema MUST NOT usar `Date.now()` u otra fuente de hora de Node.

#### Scenario: `apertura_real` refleja el reloj del servidor de base de datos
- GIVEN un `ProcesoElectoral` en `borrador`
- WHEN se invoca `POST /procesos/:id/abrir` con `confirmar: true`
- THEN `apertura_real` queda fijado por el reloj de Postgres, no por la hora del proceso Node

### Requirement: `ocultar_resultados` inmutable una vez `abierto`
El sistema MUST congelar `ocultar_resultados` en el momento de la apertura: ningún endpoint MUST
permitir modificarlo una vez que `estado != borrador`.

#### Scenario: `ocultar_resultados` no puede cambiar tras la apertura
- GIVEN un `ProcesoElectoral` en `estado = abierto` con `ocultar_resultados = true`
- WHEN se intenta modificar `ocultar_resultados` por cualquier vía
- THEN la solicitud se rechaza y el valor permanece sin cambios

### Requirement: Unicidad de `DerechoVoto` por proceso, usuario y calidad
El sistema MUST aplicar `@@unique([proceso_id, usuario_id, en_calidad_de])` en `DerechoVoto`,
permitiendo hasta dos filas por cuenta en alcance `comunidad` (`estudiante` + `padre`) y actuando
como red de seguridad ante condiciones de carrera en reintentos concurrentes de apertura.

#### Scenario: Reintento concurrente no duplica filas de `DerechoVoto`
- GIVEN dos invocaciones concurrentes de `POST /procesos/:id/abrir` sobre el mismo proceso en
  `borrador`
- WHEN ambas intentan materializar `DerechoVoto`
- THEN no existen filas duplicadas por la combinación `(proceso_id, usuario_id, en_calidad_de)`

### Requirement: Auditoría de apertura en la misma transacción
El sistema MUST registrar vía `AuditoriaService.log(tx, ...)`, dentro de la misma transacción que
la transición de estado y la materialización de `DerechoVoto`, un evento `PROCESO_ABIERTO` con
conteos de derechos generados, únicamente cuando la apertura efectivamente cambia el estado (no en
el no-op idempotente).

#### Scenario: Apertura exitosa registra auditoría con conteos
- GIVEN una apertura exitosa que materializa `N` filas de `DerechoVoto`
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con `event_type = 'PROCESO_ABIERTO'` para ese proceso, con el
  conteo `N` registrado

#### Scenario: Reintento idempotente no genera auditoría adicional
- GIVEN un `ProcesoElectoral` ya `abierto` con su evento `PROCESO_ABIERTO` ya registrado
- WHEN se invoca `POST /procesos/:id/abrir` nuevamente
- THEN no se crea una segunda fila de `EventoAuditoría` con `event_type = 'PROCESO_ABIERTO'`

## MODIFIED Requirements

### Requirement: Edición de un proceso en `borrador` sin límite de reintentos
El sistema MUST permitir editar cualquier campo editable (`publico_objetivo`, snapshot de
nivel/grado, `ocultar_resultados`, y la segmentación por aula) de un `ProcesoElectoral` mientras su
`estado = borrador`, recalculando el padrón en vivo y regenerando el `ProcesoAula[]` según
corresponda, sin límite de reintentos. El sistema MUST rechazar la edición si `estado != borrador`,
incluyendo el caso `estado = abierto` generado por `POST /procesos/:id/abrir` — este bloqueo pasa a
ser comportamiento verificado en tiempo de ejecución, no solo una exclusión declarada de alcance.
(Previously: el bloqueo tras `abierto` estaba declarado fuera de alcance porque ningún endpoint
producía esa transición; ahora `#13` la introduce y este requisito la cubre en la práctica.)

#### Scenario: Edición exitosa de un borrador
- GIVEN un `ProcesoElectoral` en `borrador`
- WHEN se invoca `PATCH /procesos/:id` cambiando la segmentación de aulas
- THEN se actualiza el proceso y se regenera el `ProcesoAula[]` según la nueva segmentación

#### Scenario: Edición rechazada fuera de `borrador`
- GIVEN un `ProcesoElectoral` con `estado != borrador`
- WHEN se invoca `PATCH /procesos/:id`
- THEN la respuesta es un error de negocio legible y no se modifica el proceso

#### Scenario: Reedición repetida no tiene límite de reintentos
- GIVEN un `ProcesoElectoral` en `borrador` editado varias veces previamente
- WHEN se invoca `PATCH /procesos/:id` nuevamente
- THEN la edición se procesa sin restricción por cantidad de ediciones previas

#### Scenario: Edición rechazada tras apertura real
- GIVEN un `ProcesoElectoral` transicionado a `abierto` vía `POST /procesos/:id/abrir`
- WHEN se invoca `PATCH /procesos/:id` intentando modificar `ocultar_resultados` o la segmentación
  de aulas
- THEN la solicitud se rechaza y el proceso permanece con los valores congelados al abrir
