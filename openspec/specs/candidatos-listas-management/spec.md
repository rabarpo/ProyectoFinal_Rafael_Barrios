# Especificación: candidatos-listas-management

## Purpose

Define el CRUD de `Lista`/`Candidato`/`OpciónConsulta` dentro de un `ProcesoElectoral`, la subida y
entrega de foto (obligatoria) y plan de trabajo en PDF (opcional) como `Bytes`, la baja distinta del
borrado físico, y la auditoría de cada escritura. Capacidad nueva. Fuera de alcance: apertura de
proceso (`#13`), escrutinio (`#17`), catálogo formal `Cargo`, validación cruzada
`TipoProceso`↔`Lista`/`Candidato`.

## Requirements

### Requirement: CRUD de `Lista`/`Candidato`/`OpciónConsulta` acotado a un `ProcesoElectoral`
El sistema MUST proveer creación, listado, edición y baja de `Lista`, `Candidato` y
`OpciónConsulta`, cada operación acotada a un `proceso_id` existente, protegidas por
`@Roles('administrador', 'director', 'comité')`. `cargo` en `Candidato` MUST aceptar texto libre sin
restricción de unicidad dentro de una `Lista`.

#### Scenario: Alta de candidato dentro de un proceso válido
- GIVEN un `ProcesoElectoral` existente
- WHEN se invoca la creación de un `Candidato` con ese `proceso_id`, foto y datos válidos
- THEN el candidato se crea vinculado a ese proceso

#### Scenario: Alta rechazada contra un proceso inexistente
- GIVEN ningún `ProcesoElectoral` con el id dado
- WHEN se invoca la creación de `Lista`/`Candidato`/`OpciónConsulta` con ese `proceso_id`
- THEN la operación se rechaza con violación de clave foránea o error de negocio legible

#### Scenario: `cargo` repetido dentro de la misma lista es aceptado
- GIVEN una `Lista` con un `Candidato` de `cargo = "Vocal"`
- WHEN se crea otro `Candidato` en la misma `Lista` con `cargo = "Vocal"`
- THEN la creación se acepta sin error de unicidad

### Requirement: Foto de candidato obligatoria con allowlist y tope de tamaño
El sistema MUST exigir una foto al crear un `Candidato`, aceptando únicamente `image/png` e
`image/jpeg` hasta 2MB, almacenada como `Bytes` en Postgres junto a su `foto_mime` (patrón
`Configuración.logo`). El sistema MUST rechazar la creación si la foto está ausente, excede el
tope o no está en la allowlist.

#### Scenario: Foto válida se almacena y se sirve
- GIVEN un archivo PNG de 1MB adjunto a la creación de un `Candidato`
- WHEN se completa la creación
- THEN la foto se almacena como `Bytes` con `foto_mime = 'image/png'` y es recuperable vía
  `StreamableFile`

#### Scenario: Creación rechazada sin foto
- GIVEN una solicitud de creación de `Candidato` sin archivo de foto adjunto
- WHEN se invoca la creación
- THEN la solicitud se rechaza sin crear la fila

#### Scenario: Foto rechazada por tipo no permitido
- GIVEN un archivo `application/pdf` adjunto como foto
- WHEN se invoca la creación de un `Candidato`
- THEN la solicitud se rechaza con un error de tipo de archivo no permitido

#### Scenario: Foto rechazada por exceder el tope de tamaño
- GIVEN un archivo PNG de 3MB adjunto como foto
- WHEN se invoca la creación de un `Candidato`
- THEN la solicitud se rechaza con `PayloadTooLargeException`

### Requirement: Plan de trabajo en PDF opcional con tope de tamaño
El sistema MUST aceptar opcionalmente un plan de trabajo en `application/pdf` hasta 5MB por
`Lista` (no por `Candidato`), vía el subrecurso `PUT /listas/:id/plan-trabajo` (espejo de
`POST /configuracion/logo`), almacenado como `Bytes` en `plan_trabajo` junto a `plan_trabajo_mime`
y `plan_trabajo_nombre`. El sistema MUST rechazar el archivo si excede el tope o no es
`application/pdf`, sin bloquear la creación ni edición de la `Lista` cuando el PDF está ausente.

#### Scenario: Creación exitosa de lista sin plan de trabajo adjunto
- GIVEN una creación de `Lista` sin PDF adjunto
- WHEN se completa la creación
- THEN la lista se crea con `plan_trabajo` en `NULL`

#### Scenario: PDF válido se almacena y se sirve
- GIVEN un archivo PDF de 4MB enviado a `PUT /listas/:id/plan-trabajo`
- WHEN se completa la subida
- THEN el PDF se almacena como `Bytes` en `plan_trabajo` y es recuperable vía `StreamableFile`
  con `Content-Disposition: attachment` y el `plan_trabajo_nombre` original

#### Scenario: PDF rechazado por exceder el tope de tamaño
- GIVEN un archivo PDF de 6MB adjunto como plan de trabajo
- WHEN se invoca la creación de un `Candidato`
- THEN la solicitud se rechaza con `PayloadTooLargeException` sin crear la fila

### Requirement: Baja de candidato o lista distinta del borrado físico
El sistema MUST proveer una operación de baja que fija `EstadoParticipacion = baja` y `baja_en`
para `Lista`/`Candidato`, permitida en cualquier `Proceso.estado` (incluido `abierto`) y restringida
a roles `administrador`/`director`/`comité`. Los `Voto` ya emitidos hacia una entidad dada de baja
MUST permanecer válidos y sin modificación.

#### Scenario: Baja de candidato con proceso abierto
- GIVEN un `Candidato` activo perteneciente a un `ProcesoElectoral` en `estado = abierto`
- WHEN se invoca la baja de ese candidato
- THEN el candidato queda con `EstadoParticipacion = baja` y `baja_en` establecido, y el proceso
  permanece `abierto`

#### Scenario: Votos previos a la baja permanecen válidos
- GIVEN un `Candidato` con `Voto` ya registrados y luego dado de baja
- WHEN se consultan esos `Voto`
- THEN permanecen sin alteración y referenciando al mismo `candidato_id`

### Requirement: Borrado físico bloqueado si existen `Voto` dependientes
El sistema MUST permitir el borrado físico de `Lista`/`Candidato`/`OpciónConsulta` únicamente
cuando ningún `Voto` la referencia, rechazando la operación con el código de error
`ENTIDAD_CON_DEPENDIENTES` en caso contrario (patrón `AulasService.eliminar()`).

#### Scenario: Borrado físico exitoso sin votos asociados
- GIVEN un `Candidato` sin ningún `Voto` referenciándolo
- WHEN se invoca su borrado físico
- THEN la fila se elimina

#### Scenario: Borrado físico rechazado con votos asociados
- GIVEN un `Candidato` con al menos un `Voto` referenciándolo
- WHEN se invoca su borrado físico
- THEN la operación se rechaza con `ENTIDAD_CON_DEPENDIENTES` y la fila permanece

### Requirement: Auditoría de creación, edición, baja y borrado en la misma transacción
El sistema MUST registrar vía `AuditoriaService.log(tx, ...)`, dentro de la misma transacción que
cada escritura, un evento `CANDIDATO_*`/`LISTA_*` (creado, editado, dado de baja, eliminado) según
corresponda a la operación exitosa.

#### Scenario: Alta exitosa registra auditoría
- GIVEN una creación exitosa de `Candidato`
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con `event_type = 'CANDIDATO_CREADO'` para ese candidato

#### Scenario: Baja exitosa registra auditoría
- GIVEN una baja exitosa de `Candidato`
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con `event_type = 'CANDIDATO_DADO_DE_BAJA'` para ese candidato

### Requirement: `OpciónConsulta.etiqueta` como texto libre
El sistema MUST aceptar cualquier texto no vacío en `OpciónConsulta.etiqueta`, sin forzar valores
`A`/`B`/`C`; la UI SHOULD sugerirlos como valor por defecto sin restringir la entrada.

#### Scenario: Etiqueta personalizada aceptada
- GIVEN la creación de una `OpciónConsulta` con `etiqueta = "Sí"`
- WHEN se completa la creación
- THEN la opción se crea con esa etiqueta sin error de validación
