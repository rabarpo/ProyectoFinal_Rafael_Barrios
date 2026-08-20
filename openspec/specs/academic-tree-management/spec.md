# Especificación: academic-tree-management

## Purpose

Define el CRUD de la jerarquía académica `Nivel` → `Grado` → `Sección` → `Aula`, sobre el modelo
ya existente en `base-schema` (`#2`), con las restricciones de unicidad ya declaradas en el
esquema y `onDelete: Restrict` en todas las FK involucradas. Protegido por `@Roles('administrador',
'director')`. Capacidad nueva — no hay spec previa que modificar. Fuera de alcance: `AñoEscolar`
(`school-year-management`) y `Matrícula` (`student-enrollment`).

## Requirements

### Requirement: CRUD de `Nivel`
El sistema MUST proveer `POST`, `GET` (listado y por id), `PATCH` y `DELETE` sobre `/niveles`,
protegidos con `@Roles('administrador', 'director')`. El sistema MUST validar la unicidad de
`nombre` antes de escribir y devolver un error 4xx legible en caso de conflicto. `DELETE` MUST ser
un borrado físico real, capturando la violación de `onDelete: Restrict` cuando existan `Grado`
dependientes y devolviendo un error de negocio legible (4xx/409) en vez del error crudo de
Postgres.

#### Scenario: Creación exitosa
- GIVEN un administrador autenticado y un `nombre` no usado
- WHEN invoca `POST /niveles`
- THEN se crea el `Nivel`

#### Scenario: Eliminación rechazada por `Grado` dependiente
- GIVEN un `Nivel` con al menos un `Grado` asociado
- WHEN se invoca `DELETE /niveles/:id`
- THEN la respuesta es un error de negocio legible y la fila permanece

### Requirement: CRUD de `Grado` acotado a un `Nivel`
El sistema MUST proveer `POST`, `GET` (listado y por id), `PATCH` y `DELETE` sobre `/grados`,
protegidos con `@Roles('administrador', 'director')`, vinculando cada `Grado` a un `Nivel`
existente. El sistema MUST validar la unicidad de `(nivel_id, nombre)` antes de escribir y
devolver un error 4xx legible en caso de conflicto. `DELETE` MUST ser físico, capturando la
violación de `onDelete: Restrict` cuando existan `Sección` o `Aula` dependientes.

#### Scenario: Creación con `Nivel` inexistente se rechaza
- GIVEN ningún `Nivel` con el id dado
- WHEN se invoca `POST /grados` referenciándolo
- THEN la respuesta es un error de negocio legible y no se crea el `Grado`

#### Scenario: Mismo `nombre` en `Nivel` distinto es aceptado
- GIVEN un `Grado` con `nombre = '1ro'` bajo un `Nivel` A
- WHEN se crea otro `Grado` con `nombre = '1ro'` bajo un `Nivel` B
- THEN ambos se crean sin conflicto de unicidad

### Requirement: CRUD de `Sección` acotada a `Grado` y `AñoEscolar`
El sistema MUST proveer `POST`, `GET` (listado y por id), `PATCH` y `DELETE` sobre `/secciones`,
protegidos con `@Roles('administrador', 'director')`, vinculando cada `Sección` a un `Grado` y un
`AñoEscolar` existentes. El sistema MUST validar la unicidad de `(grado_id, anio_escolar_id,
nombre)` antes de escribir. `DELETE` MUST ser físico, capturando la violación de `onDelete:
Restrict` cuando existan `Aula` dependientes.

#### Scenario: Creación exitosa vinculada a `Grado` y `AñoEscolar`
- GIVEN un `Grado` y un `AñoEscolar` existentes
- WHEN un director invoca `POST /secciones` referenciando ambos
- THEN se crea la `Sección` vinculada a ambos

#### Scenario: Duplicado en la misma combinación se rechaza
- GIVEN una `Sección` existente con `(grado_id, anio_escolar_id, nombre)` dado
- WHEN se invoca `POST /secciones` con la misma combinación
- THEN la respuesta es un error 4xx que identifica el conflicto

### Requirement: Coherencia jerárquica entre `Sección` y su `Grado`
El sistema MUST validar, antes de escribir, que el `grado_id` referenciado por una `Sección` sea
consistente con la propia jerarquía (no hay ambigüedad posible en `Sección`, que solo referencia
`Grado` y `AñoEscolar` directamente); esta validación se limita a que ambos ids existan (ya cubierto
por el requisito de CRUD de `Sección`). El propósito de este requisito es dejar explícito el punto
de partida de la cadena de coherencia que se completa en `Aula` y en `student-enrollment`.

#### Scenario: `Sección` referenciando un `Grado` inexistente se rechaza
- GIVEN ningún `Grado` con el id dado
- WHEN se invoca `POST /secciones` referenciándolo
- THEN la respuesta es un error de negocio legible y no se crea la `Sección`

### Requirement: CRUD de `Aula` acotada a `Grado`, `Sección`, `AñoEscolar` y `Turno`
El sistema MUST proveer `POST`, `GET` (listado y por id), `PATCH` y `DELETE` sobre `/aulas`,
protegidos con `@Roles('administrador', 'director')`, vinculando cada `Aula` a un `Grado`, una
`Sección` y un `AñoEscolar` existentes, con `turno` en (`manana`, `tarde`). El sistema MUST
validar la unicidad de `(grado_id, seccion_id, anio_escolar_id)` antes de escribir. `DELETE` MUST
ser físico, capturando la violación de `onDelete: Restrict` cuando existan `Matrícula`
dependientes.

#### Scenario: Creación exitosa con turno válido
- GIVEN un `Grado`, una `Sección` y un `AñoEscolar` existentes
- WHEN se invoca `POST /aulas` con `turno = 'manana'`
- THEN se crea el `Aula` vinculada a los tres y con ese `turno`

#### Scenario: Eliminación rechazada por `Matrícula` dependiente
- GIVEN un `Aula` con al menos una `Matrícula` asociada
- WHEN se invoca `DELETE /aulas/:id`
- THEN la respuesta es un error de negocio legible y la fila permanece

### Requirement: Coherencia jerárquica de `Aula` con su `Sección`
El sistema MUST validar, antes de escribir, que el `grado_id` y el `anio_escolar_id` de un `Aula`
coincidan exactamente con el `grado_id` y el `anio_escolar_id` de la `Sección` referenciada. El
sistema MUST devolver un error de negocio legible (409) cuando el `Aula` intente referenciar un
`Grado` o un `AñoEscolar` distinto del que ya tiene su `Sección`, en vez de crear una fila
incoherente que el esquema no impide por sí solo.

#### Scenario: `Aula` con `grado_id` distinto al de su `Sección` se rechaza
- GIVEN una `Sección` vinculada al `Grado` A
- WHEN se invoca `POST /aulas` referenciando esa `Sección` pero con `grado_id` del `Grado` B
- THEN la respuesta es un error de negocio legible y no se crea el `Aula`

#### Scenario: `Aula` con `anio_escolar_id` distinto al de su `Sección` se rechaza
- GIVEN una `Sección` vinculada al `AñoEscolar` X
- WHEN se invoca `POST /aulas` referenciando esa `Sección` pero con `anio_escolar_id` del
  `AñoEscolar` Y
- THEN la respuesta es un error de negocio legible y no se crea el `Aula`

### Requirement: Aislamiento de rol y auditoría aditiva sobre el árbol académico
El sistema MUST rechazar toda solicitud sobre `/niveles`, `/grados`, `/secciones` o `/aulas` de un
usuario cuyo rol no sea `administrador` ni `director`, verificado por `RolesGuard`, tratando
ambos roles como equivalentes. El sistema MUST registrar vía `AuditoriaService.log(tx, ...)`,
dentro de la misma transacción que cada escritura, los eventos de creación, actualización y
eliminación de las cuatro entidades, agregando únicamente claves nuevas y aditivas a
`AUDIT_EVENT_TYPES` sin modificar la cláusula `WHEN` del trigger estructural de ADR-0016.

#### Scenario: Rol no autorizado no accede a ningún endpoint del árbol
- GIVEN una sesión con rol distinto de `administrador`/`director`
- WHEN invoca cualquier endpoint de `/niveles`, `/grados`, `/secciones` o `/aulas`
- THEN la solicitud se rechaza sin ejecutar el handler

#### Scenario: Creación de `Aula` registra un evento de auditoría
- GIVEN una creación exitosa de `Aula`
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con el `event_type` de creación correspondiente

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
