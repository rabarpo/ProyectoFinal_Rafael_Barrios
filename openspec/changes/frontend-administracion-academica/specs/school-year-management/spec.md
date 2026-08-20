# Delta for school-year-management

## ADDED Requirements

### Requirement: UI de gestión de AñoEscolar

El sistema MUST proveer, en la pestaña "Año escolar" de `Ruta 'academica'`, un listado que crea,
edita (`nombre`) y elimina `AñoEscolar` reutilizando `TablaGenerica`/`FormularioGenerico`, y MUST
mostrar en el error de eliminación el mensaje legible `409 ENTIDAD_CON_DEPENDIENTES` cuando el
backend lo devuelva.

#### Scenario: Eliminar AñoEscolar con Sección dependiente muestra el error legible
- GIVEN un `AñoEscolar` con al menos una `Sección` asociada
- WHEN el usuario confirma "Eliminar" sobre ese `AñoEscolar`
- THEN la UI muestra el mensaje de error legible del backend, no un error genérico

### Requirement: Activación de AñoEscolar con confirmación simple

El sistema MUST mostrar un botón "Activar" por cada fila de `AñoEscolar` no activo, que al hacer
click abre un diálogo de confirmación simple antes de invocar `PATCH :id/activar`. El diálogo
MUST NOT mostrar cuál año queda desactivado (decisión ya tomada: confirmación simple, no un
resumen del año previamente activo).

#### Scenario: Activar un año pide confirmación antes de invocar el backend
- GIVEN el usuario en la pestaña "Año escolar" con un `AñoEscolar` B no activo
- WHEN hace click en "Activar" sobre B
- THEN se abre un diálogo de confirmación simple, sin listar el año que se desactivará
- AND solo tras confirmar se invoca `PATCH /anios-escolares/B/activar`

#### Scenario: Cancelar el diálogo no activa ningún año
- GIVEN el diálogo de confirmación de activación abierto
- WHEN el usuario lo cancela
- THEN no se invoca `PATCH :id/activar` y el año activo no cambia

### Requirement: Defensa en profundidad del rol comité sobre AñoEscolar

El sistema MUST ocultar, para una sesión con rol `comite`, los botones "Crear", "Editar",
"Eliminar" y "Activar" en la pestaña "Año escolar", dejando visible únicamente el listado.

#### Scenario: Comité ve el listado de años sin botón Activar
- GIVEN una sesión con rol `comite` en la pestaña "Año escolar"
- WHEN observa el listado
- THEN no ve ningún botón "Crear", "Editar", "Eliminar" ni "Activar"
