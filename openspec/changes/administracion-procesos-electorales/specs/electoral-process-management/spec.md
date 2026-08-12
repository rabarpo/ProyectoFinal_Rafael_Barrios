# Especificación: electoral-process-management

## Purpose

Define el CRUD de `ProcesoElectoral` mientras permanece en estado `borrador`: listado, edición y
eliminación previas a la apertura (`#13`). Capacidad nueva. Fuera de alcance: transición a
`abierto`, congelamiento de `DerechoVoto` y bloqueo de edición (`#13`).

## Requirements

### Requirement: Listado de procesos en borrador
El sistema MUST proveer `GET /procesos` (listado, filtrable por `estado` y `tipo_proceso`) y
`GET /procesos/:id` (detalle), protegidos por `@Roles('administrador', 'director', 'comité')`,
incluyendo `publico_objetivo`, el snapshot de nivel/grado y los `ProcesoAula` asociados en el
detalle.

#### Scenario: Listado filtra por estado `borrador`
- GIVEN procesos existentes en distintos estados
- WHEN se invoca `GET /procesos?estado=borrador`
- THEN la respuesta incluye únicamente procesos en `borrador`

#### Scenario: Detalle incluye snapshot y `ProcesoAula`
- GIVEN un `ProcesoElectoral` de tipo `representante_aula` en `borrador`
- WHEN se invoca `GET /procesos/:id`
- THEN la respuesta incluye `publico_objetivo`, el snapshot de nivel/grado y la lista de
  `ProcesoAula` generados

### Requirement: Edición de un proceso en `borrador` sin límite de reintentos
El sistema MUST permitir editar cualquier campo editable (`publico_objetivo`, snapshot de
nivel/grado, `ocultar_resultados`, y la segmentación por aula) de un `ProcesoElectoral` mientras su
`estado = borrador`, recalculando el padrón en vivo y regenerando el `ProcesoAula[]` según
corresponda, sin límite de reintentos. El sistema MUST rechazar la edición si `estado != borrador`.

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

### Requirement: Eliminación de un proceso en `borrador`
El sistema MUST permitir eliminar físicamente un `ProcesoElectoral` (y sus `ProcesoAula`
asociados, vía cascada o borrado explícito en la misma transacción) mientras `estado = borrador`.
El sistema MUST rechazar la eliminación si `estado != borrador`.

#### Scenario: Eliminación exitosa de un borrador
- GIVEN un `ProcesoElectoral` en `borrador` con `ProcesoAula` asociados
- WHEN se invoca `DELETE /procesos/:id`
- THEN el proceso y sus `ProcesoAula` asociados se eliminan

#### Scenario: Eliminación rechazada fuera de `borrador`
- GIVEN un `ProcesoElectoral` con `estado != borrador`
- WHEN se invoca `DELETE /procesos/:id`
- THEN la respuesta es un error de negocio legible y la fila permanece

### Requirement: Roles autorizados a editar y eliminar borradores
El sistema MUST restringir `PATCH /procesos/:id` y `DELETE /procesos/:id` a usuarios con rol
`administrador`, `director` o `comité`, verificado por `RolesGuard`, tratando los tres roles como
equivalentes para estas operaciones sobre `borrador`.

#### Scenario: Rol no autorizado no accede a edición ni eliminación
- GIVEN una sesión con rol distinto de `administrador`/`director`/`comité`
- WHEN invoca `PATCH /procesos/:id` o `DELETE /procesos/:id`
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: Auditoría de edición y eliminación dentro de la misma transacción
El sistema MUST registrar vía `AuditoriaService.log(tx, ...)`, dentro de la misma transacción que
cada escritura, un evento `PROCESO_EDITADO` en cada `PATCH` exitoso y un evento
`PROCESO_ELIMINADO` en cada `DELETE` exitoso.

#### Scenario: Edición exitosa registra auditoría
- GIVEN una edición exitosa de un `ProcesoElectoral` en `borrador`
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con `event_type = 'PROCESO_EDITADO'` para ese proceso

#### Scenario: Eliminación exitosa registra auditoría
- GIVEN una eliminación exitosa de un `ProcesoElectoral` en `borrador`
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con `event_type = 'PROCESO_ELIMINADO'` para ese proceso
