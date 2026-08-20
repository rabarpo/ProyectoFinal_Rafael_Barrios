# Delta for academic-tree-management

## ADDED Requirements

### Requirement: UI de gestión en cascada para Nivel, Grado, Sección y Aula

El sistema MUST proveer, dentro de `Ruta 'academica'`, una pestaña por cada una de `Nivel`,
`Grado`, `Sección` y `Aula` que liste, cree, edite y elimine esa entidad reutilizando
`TablaGenerica`/`FormularioGenerico`. El listado de `Grado` MUST filtrar por `nivel_id`, el de
`Sección` por `grado_id` y `anio_escolar_id`, y el de `Aula` por `grado_id`, `seccion_id`,
`anio_escolar_id` y `turno`, reflejando en la UI los filtros ya soportados por el backend en vez de
mostrar un listado plano sin contexto jerárquico.

#### Scenario: Listado de Grado filtrado por Nivel seleccionado
- GIVEN el usuario en la pestaña "Grado" con un `Nivel` elegido en el filtro
- WHEN la pestaña carga el listado
- THEN invoca `grados?nivel_id=<id>` y muestra solo los `Grado` de ese `Nivel`

#### Scenario: Listado de Aula filtrado por Grado, Sección, AñoEscolar y turno
- GIVEN el usuario en la pestaña "Aula" con `Grado`, `Sección`, `AñoEscolar` y `turno` elegidos
- WHEN la pestaña carga el listado
- THEN invoca `aulas?grado_id&seccion_id&anio_escolar_id&turno` con esos valores

#### Scenario: Eliminar Nivel con Grado dependiente muestra el error legible del backend
- GIVEN un `Nivel` con al menos un `Grado` asociado
- WHEN el usuario confirma "Eliminar" en la fila de ese `Nivel`
- THEN la UI muestra el mensaje `409 ENTIDAD_CON_DEPENDIENTES` devuelto por el backend en un texto
  legible, no un error genérico ni un stack trace

### Requirement: Componentes genéricos de tabla y formulario reutilizables

El sistema MUST construir `comun/piezas/TablaGenerica.tsx` y `comun/piezas/FormularioGenerico.tsx`
con columnas y campos declarados por props, y MUST usarlos en las cuatro pestañas de este
requisito en vez de replicar el patrón `<ul>/<li>` ad-hoc de `TablaCandidatos`.

#### Scenario: Las cuatro pestañas reutilizan el mismo componente de tabla
- GIVEN las pestañas de Nivel, Grado, Sección y Aula ya implementadas
- WHEN se inspecciona su código
- THEN las cuatro instancian `TablaGenerica` con columnas propias, sin duplicar la lógica de tabla

### Requirement: Defensa en profundidad del rol comité en el árbol académico

El sistema MUST ocultar, para una sesión con rol `comite`, todo botón de crear/editar/eliminar en
las pestañas de Nivel, Grado, Sección y Aula, dejando visibles únicamente los listados, aunque el
backend ya rechace esas operaciones con `403`.

#### Scenario: Comité ve las pestañas sin botones de escritura
- GIVEN una sesión con rol `comite` en `Ruta 'academica'`
- WHEN navega por las pestañas de Nivel, Grado, Sección y Aula
- THEN ve los listados pero ningún botón "Crear", "Editar" ni "Eliminar"

#### Scenario: Administrador y director ven el CRUD completo
- GIVEN una sesión con rol `administrador` o `director` en `Ruta 'academica'`
- WHEN navega por las pestañas de Nivel, Grado, Sección y Aula
- THEN ve los botones "Crear", "Editar" y "Eliminar" en cada listado
