# Delta for student-enrollment

## ADDED Requirements

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
estudiante a otra `Aula` como una acción de UI compuesta que primero invoca `DELETE` sobre la
matrícula existente y luego `POST` una nueva con la `Aula` destino, nunca como una edición in
situ.

#### Scenario: No existe botón "Editar" en el listado de Matrícula
- GIVEN el listado de `Matrícula` renderizado
- WHEN se inspeccionan las acciones disponibles por fila
- THEN no aparece ningún botón "Editar", solo "Eliminar" y "Trasladar"

#### Scenario: Trasladar una Matrícula elimina la original y crea una nueva
- GIVEN una `Matrícula` existente en `Aula` A
- WHEN el usuario completa la acción de traslado a `Aula` B
- THEN la UI invoca `DELETE /matriculas/:id` sobre la original seguido de `POST /matriculas` con
  `aula_id` de B, y nunca un `PATCH`

### Requirement: Defensa en profundidad del rol comité sobre Matrícula

El sistema MUST ocultar, para una sesión con rol `comite`, los botones "Crear", "Eliminar" y
"Trasladar" en la pestaña "Matrícula", dejando visible únicamente el listado.

#### Scenario: Comité ve el listado de matrículas sin acciones de escritura
- GIVEN una sesión con rol `comite` en la pestaña "Matrícula"
- WHEN observa el listado
- THEN no ve ningún botón "Crear", "Eliminar" ni "Trasladar"
