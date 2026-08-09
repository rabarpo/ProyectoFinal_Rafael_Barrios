# Especificación: student-enrollment

## Purpose

Define el CRUD de `Matrícula`, la asociación `Usuario` (estudiante) ↔ `Aula` ↔ `AñoEscolar`, sobre
el modelo ya existente en `base-schema` (`#2`). Protegido por `@Roles('administrador',
'director')`. Capacidad nueva — no hay spec previa que modificar. El congelamiento del padrón para
procesos electorales es responsabilidad de `#13`, no de este módulo.

## Requirements

### Requirement: Alta de `Matrícula` vinculando `Usuario`, `Aula` y `AñoEscolar` existentes
El sistema MUST proveer `POST /matriculas`, protegido con `@Roles('administrador', 'director')`,
que crea una `Matrícula` referenciando un `Usuario`, un `Aula` y un `AñoEscolar` existentes. El
sistema MUST validar la unicidad de `(usuario_id, aula_id, anio_escolar_id)` antes de escribir y
devolver un error 4xx legible en caso de conflicto. El sistema MUST validar que el `Usuario`
referenciado tenga `rol = 'estudiante'`, rechazando la matriculación de cualquier otro rol con un
error de negocio legible.

#### Scenario: Matriculación exitosa
- GIVEN un `Usuario` con `rol = 'estudiante'`, un `Aula` y un `AñoEscolar` existentes
- WHEN un administrador invoca `POST /matriculas` referenciando los tres
- THEN se crea la `Matrícula` vinculando esos tres registros

#### Scenario: Matrícula duplicada en el mismo año se rechaza
- GIVEN una `Matrícula` existente con `(usuario_id, aula_id, anio_escolar_id)` dado
- WHEN se invoca `POST /matriculas` con la misma combinación
- THEN la respuesta es un error 4xx que identifica el conflicto y no se crea una segunda fila

#### Scenario: Referencia a `Usuario`, `Aula` o `AñoEscolar` inexistente se rechaza
- GIVEN un id de `Usuario`, `Aula` o `AñoEscolar` que no existe
- WHEN se invoca `POST /matriculas` referenciándolo
- THEN la respuesta es un error de negocio legible y no se crea la `Matrícula`

#### Scenario: Matriculación de un `Usuario` que no es estudiante se rechaza
- GIVEN un `Usuario` con `rol = 'docente'`
- WHEN se invoca `POST /matriculas` referenciándolo
- THEN la respuesta es un error de negocio legible y no se crea la `Matrícula`

### Requirement: Coherencia jerárquica de `Matrícula` con su `Aula`
El sistema MUST validar, antes de escribir, que el `anio_escolar_id` de una `Matrícula` coincida
exactamente con el `anio_escolar_id` del `Aula` referenciada. El sistema MUST devolver un error de
negocio legible (409) cuando la `Matrícula` intente referenciar un `AñoEscolar` distinto del que ya
tiene su `Aula`, en vez de crear una fila incoherente que el esquema no impide por sí solo.

#### Scenario: `Matrícula` con `anio_escolar_id` distinto al de su `Aula` se rechaza
- GIVEN un `Aula` vinculada al `AñoEscolar` X
- WHEN se invoca `POST /matriculas` referenciando esa `Aula` pero con `anio_escolar_id` del
  `AñoEscolar` Y
- THEN la respuesta es un error de negocio legible y no se crea la `Matrícula`

### Requirement: Consulta y listado de `Matrícula`
El sistema MUST proveer `GET /matriculas/:id` y `GET /matriculas`, protegidos con
`@Roles('administrador', 'director')`, permitiendo filtrar el listado por `usuario_id`, `aula_id`
y `anio_escolar_id`.

#### Scenario: Listado filtrado por `AñoEscolar`
- GIVEN varias `Matrícula` en distintos años escolares
- WHEN un director invoca `GET /matriculas?anio_escolar_id=X`
- THEN la respuesta contiene únicamente las matrículas de ese año

### Requirement: `DELETE` físico de `Matrícula` (retiro/traslado)
El sistema MUST proveer `DELETE /matriculas/:id`, protegido con `@Roles('administrador',
'director')`, que ejecuta un borrado físico real de la fila, representando el retiro o traslado de
un estudiante. El sistema MUST registrar `MATRICULA_ELIMINADA` vía `AuditoriaService.log(tx,
...)` dentro de la misma transacción que el `delete`.

#### Scenario: Eliminación exitosa
- GIVEN una `Matrícula` existente
- WHEN un administrador invoca `DELETE /matriculas/:id`
- THEN la fila ya no existe en la base de datos
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'MATRICULA_ELIMINADA'`

### Requirement: Aislamiento de rol y auditoría aditiva sobre `Matrícula`
El sistema MUST rechazar toda solicitud sobre `/matriculas` de un usuario cuyo rol no sea
`administrador` ni `director`, verificado por `RolesGuard`, tratando ambos roles como
equivalentes. El sistema MUST registrar `MATRICULA_CREADA` vía `AuditoriaService.log(tx, ...)`
dentro de la misma transacción que el `insert`, agregando únicamente claves nuevas y aditivas a
`AUDIT_EVENT_TYPES` sin modificar la cláusula `WHEN` del trigger estructural de ADR-0016.

#### Scenario: Rol no autorizado no accede a ningún endpoint de matrícula
- GIVEN una sesión con rol distinto de `administrador`/`director`
- WHEN invoca cualquier endpoint de `/matriculas`
- THEN la solicitud se rechaza sin ejecutar el handler
