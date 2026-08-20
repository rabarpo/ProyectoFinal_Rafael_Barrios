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

### Requirement: Resolución de referencias legibles y creación idempotente de `Matrícula`

El sistema MUST exponer en `MatriculasService` un método `crearIdempotente()` invocable fila a
fila sin depender de HTTP, para que `importacion-excel` (`#9`) lo reutilice. El método MUST
recibir `grado_nombre`, `seccion_nombre`, `turno` y `anio_escolar_codigo` (columnas legibles de la
fila de origen, no UUID) y MUST resolverlas a los `id` existentes de `Aula` y `AnioEscolar` antes
de aplicar la lógica de idempotencia. `anio_escolar_codigo` MUST resolverse contra el campo único
`nombre` de `AnioEscolar`, ya declarado por el esquema. `Aula` no declara hoy un campo `codigo`
propio, así que el `Aula` MUST resolverse buscando la combinación única
`(grado.nombre, seccion.nombre, turno, anio_escolar_id)` — la misma combinación que ya garantiza
unicidad de `Aula` en el esquema (`@@unique([grado_id, seccion_id, anio_escolar_id])` más `turno`
determinado por esa fila), sin requerir ningún campo ni migración nueva.

El método MUST ser idempotente por la combinación `(usuario_id, aula_id, anio_escolar_id)`: si ya
existe una `Matrícula` con esa combinación exacta, MUST devolver esa fila existente sin crear una
segunda (`creado: false`), en vez de lanzar `409 RESTRICCION_UNICA` como hace `crear()`. El método
MUST reutilizar, sin duplicar su lógica, las mismas validaciones ya vigentes de `crear()`:
existencia de `Usuario`/`Aula`/`AnioEscolar` referenciados, `Usuario.rol = 'estudiante'`, y
coherencia jerárquica entre `anio_escolar_id` y el `Aula` referenciada. El método MUST aceptar un
`tx: Prisma.TransactionClient` externo opcional, sin abrir su propia transacción cuando se le pasa
uno, siguiendo el mismo criterio que `UsersService.crearIdempotente()`.

#### Scenario: Invocación repetida con la misma combinación no duplica la `Matrícula`
- GIVEN una `Matrícula` ya creada para `(usuario_id, aula_id, anio_escolar_id)`
- WHEN se invoca `MatriculasService.crearIdempotente()` nuevamente con la misma combinación
- THEN no se crea una segunda fila y el método devuelve `creado: false`

#### Scenario: Clave compuesta de `Aula` o `anio_escolar_codigo` inexistente se reporta sin crear la `Matrícula`
- GIVEN una combinación `(grado_nombre, seccion_nombre, turno, anio_escolar_codigo)` que no
  resuelve a ningún `Aula` existente, o un `anio_escolar_codigo` que no resuelve a ningún
  `AnioEscolar` existente
- WHEN se invoca `MatriculasService.crearIdempotente()` con esos valores
- THEN el método señala una referencia inexistente y no se crea ninguna `Matrícula`

#### Scenario: Reutiliza la validación de rol estudiante ya vigente
- GIVEN un `Usuario` resuelto con `rol` distinto de `estudiante`
- WHEN se invoca `MatriculasService.crearIdempotente()` referenciándolo
- THEN se rechaza igual que en `crear()`, sin crear ninguna `Matrícula`

#### Scenario: Reutiliza la coherencia jerárquica ya vigente
- GIVEN un `Aula` resuelta desde `(grado_nombre, seccion_nombre, turno)` cuyo `anio_escolar_id` no
  coincide con el `anio_escolar_id` resuelto desde `anio_escolar_codigo`
- WHEN se invoca `MatriculasService.crearIdempotente()` con esos valores
- THEN se rechaza igual que en `crear()`, sin crear ninguna `Matrícula`

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

### Requirement: UI de gestión de Matrícula con filtros en cascada

El sistema MUST proveer, en la pestaña "Matrícula" de `Ruta 'academica'`, un listado que crea y
elimina `Matrícula` reutilizando `TablaGenerica`/`FormularioGenerico`, filtrando por `usuario_id`,
`aula_id` y `anio_escolar_id` reflejando los filtros ya soportados por `GET /matriculas`.

#### Scenario: Listado de Matrícula filtrado por AñoEscolar y Aula
- GIVEN el usuario en la pestaña "Matrícula" con `aula_id` y `anio_escolar_id` elegidos en el
  filtro
- WHEN la pestaña carga el listado
- THEN invoca `matriculas?aula_id&anio_escolar_id` con esos valores

### Requirement: Traslado de Matrícula como eliminar + crear, nunca como edición

El sistema MUST NOT ofrecer ninguna acción "Editar" sobre una fila de `Matrícula`, dado que el
backend no expone `PATCH /matriculas/:id`. El sistema MUST implementar el traslado de un
estudiante a otra `Aula` como una acción de UI compuesta que primero invoca `POST` para crear la
nueva matrícula en la `Aula` destino y solo tras confirmar su éxito invoca `DELETE` sobre la
matrícula original, nunca como una edición in situ. Este orden (crear antes de eliminar) es
deliberado: evita dejar al estudiante sin ninguna matrícula activa si el paso de eliminación
falla, a costa de requerir manejo explícito del caso en que la creación tiene éxito pero la
eliminación posterior falla (matrícula duplicada temporal, ver escenario siguiente).

#### Scenario: No existe botón "Editar" en el listado de Matrícula
- GIVEN el listado de `Matrícula` renderizado
- WHEN se inspeccionan las acciones disponibles por fila
- THEN no aparece ningún botón "Editar", solo "Eliminar" y "Trasladar"

#### Scenario: Trasladar una Matrícula crea la nueva antes de eliminar la original
- GIVEN una `Matrícula` existente en `Aula` A
- WHEN el usuario completa la acción de traslado a `Aula` B
- THEN la UI invoca `POST /matriculas` con `aula_id` de B ANTES de invocar `DELETE /matriculas/:id`
  sobre la original, y nunca un `PATCH`

#### Scenario: Si la creación de la nueva Matrícula falla, no se elimina la original
- GIVEN el usuario completa la acción de traslado a `Aula` B
- WHEN `POST /matriculas` responde con un error
- THEN la UI muestra el error y no invoca `DELETE /matriculas/:id` sobre la matrícula original

#### Scenario: Si la eliminación posterior a una creación exitosa falla, se advierte al usuario
- GIVEN el traslado creó exitosamente la nueva `Matrícula` en `Aula` B
- WHEN el posterior `DELETE /matriculas/:id` sobre la original falla
- THEN la UI muestra una alerta persistente que nombra ambos ids de matrícula e instruye cuál
  eliminar manualmente

### Requirement: Defensa en profundidad del rol comité sobre Matrícula

El sistema MUST ocultar, para una sesión con rol `comite`, los botones "Crear", "Eliminar" y
"Trasladar" en la pestaña "Matrícula", dejando visible únicamente el listado.

#### Scenario: Comité ve el listado de matrículas sin acciones de escritura
- GIVEN una sesión con rol `comite` en la pestaña "Matrícula"
- WHEN observa el listado
- THEN no ve ningún botón "Crear", "Eliminar" ni "Trasladar"
