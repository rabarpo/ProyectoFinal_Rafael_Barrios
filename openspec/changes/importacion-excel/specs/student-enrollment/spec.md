# Delta for student-enrollment

## ADDED Requirements

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

(Previously: no existe — `MatriculasService` solo tenía `crear()`, que siempre rechaza la
combinación duplicada con `409`.)

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
