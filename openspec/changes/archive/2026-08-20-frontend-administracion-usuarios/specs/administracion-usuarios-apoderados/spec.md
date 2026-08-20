# Delta for administracion-usuarios-apoderados

## ADDED Requirements

### Requirement: UI de listado central de `Usuario` con filtro por rol y estado

El sistema MUST proveer, en `Ruta 'usuarios'`, un listado central de `Usuario` que consuma
`GET /usuarios` con filtro opcional por `rol` y `estado`, reutilizando `TablaGenerica` de
`comun/piezas/`.

#### Scenario: Filtrar el listado por rol y estado

- GIVEN un administrador autenticado en `Ruta 'usuarios'`
- WHEN selecciona `rol = 'docente'` y `estado = 'activo'` en los filtros
- THEN el listado muestra únicamente usuarios que cumplen ambos filtros

#### Scenario: Listado vacío no rompe la vista

- GIVEN un filtro que no coincide con ningún `Usuario`
- WHEN se aplica ese filtro
- THEN la UI muestra un estado vacío legible, sin error

### Requirement: Alta y edición de `Usuario` sin campo de contraseña

El sistema MUST proveer un formulario de alta/edición de `Usuario` (`nombres`, `dni`, `codigo`,
`correo`, `rol`) que cubra los cinco roles del sistema (`estudiante`, `docente`, `comite`,
`administrador`, `director`), consumiendo `POST /usuarios` y `PATCH /usuarios/:id`. El formulario
MUST NOT incluir ningún campo de contraseña, porque el login real es Google OAuth y
`password_hash` siempre se fija en `null` desde este módulo.

#### Scenario: Alta de un usuario con rol docente sin campo de contraseña

- GIVEN un administrador autenticado en el formulario de alta
- WHEN completa `nombres`, `dni`, `codigo`, `correo` y `rol = 'docente'` y confirma
- THEN se invoca `POST /usuarios` sin ningún campo de contraseña en el payload
- AND el nuevo usuario aparece en el listado

#### Scenario: Errores de unicidad del backend se muestran legibles

- GIVEN un `dni` ya usado por otro `Usuario`
- WHEN se confirma el alta con ese `dni`
- THEN la UI muestra el error 4xx del backend identificando `dni` como campo en conflicto, sin
  enviar un segundo intento automático

#### Scenario: Edición de un usuario existente

- GIVEN un `Usuario` existente abierto en su ficha
- WHEN el administrador edita `correo` y confirma
- THEN se invoca `PATCH /usuarios/:id` con el nuevo `correo` y el listado refleja el cambio

### Requirement: Cambio de estado activo/inactivo sin acción de eliminar

El sistema MUST proveer una acción de cambio de estado (`activo` ↔ `inactivo`) sobre un `Usuario`,
consumiendo `PATCH /usuarios/:id/estado`, con confirmación previa. El sistema MUST NOT ofrecer
ninguna acción de "Eliminar" sobre `Usuario` en la UI, porque el backend no expone `DELETE` físico
para este recurso.

#### Scenario: Desactivar un usuario activo

- GIVEN un `Usuario` con `estado = 'activo'` en su ficha
- WHEN el administrador confirma el cambio de estado a `inactivo`
- THEN se invoca `PATCH /usuarios/:id/estado` con `estado = 'inactivo'`
- AND la ficha refleja `estado = 'inactivo'`

#### Scenario: Ningún botón "Eliminar" está disponible

- GIVEN la ficha de cualquier `Usuario`
- WHEN el administrador revisa las acciones disponibles
- THEN no existe ningún botón o acción etiquetada "Eliminar"

### Requirement: Panel de `Apoderado` visible solo para `rol === 'estudiante'`

El sistema MUST mostrar, dentro de la ficha de un `Usuario`, un panel de gestión de `Apoderado`
(crear, editar, eliminar) únicamente cuando `rol === 'estudiante'`, consumiendo
`/usuarios/:id/apoderados`. El sistema MUST NOT mostrar ese panel para ningún otro rol. La
eliminación de un `Apoderado` MUST presentarse como borrado físico real (sin cambio de estado
intermedio), con confirmación previa.

#### Scenario: Panel de apoderados visible en la ficha de un estudiante

- GIVEN un `Usuario` con `rol = 'estudiante'` abierto en su ficha
- WHEN se renderiza la ficha
- THEN el panel de apoderados es visible y lista los `Apoderado` vinculados vía
  `GET /usuarios/:id/apoderados`

#### Scenario: Panel de apoderados ausente para un rol distinto de estudiante

- GIVEN un `Usuario` con `rol = 'docente'` abierto en su ficha
- WHEN se renderiza la ficha
- THEN el panel de apoderados no se renderiza

#### Scenario: Alta de un apoderado desde la ficha del estudiante

- GIVEN el panel de apoderados visible en la ficha de un estudiante
- WHEN el administrador completa nombres y DNI del apoderado y confirma
- THEN se invoca `POST /usuarios/:id/apoderados` y el nuevo apoderado aparece en el panel

#### Scenario: Eliminar un apoderado pide confirmación y es borrado físico

- GIVEN un `Apoderado` existente listado en el panel
- WHEN el administrador confirma "Eliminar" sobre ese apoderado
- THEN se invoca `DELETE /usuarios/:id/apoderados/:apoderadoId`
- AND el apoderado desaparece del panel sin quedar en ningún estado intermedio

### Requirement: Aislamiento del rol `comite` en el cliente

El sistema MUST ocultar el item de menú `usuarios` y toda acción de escritura de este dominio
(alta, edición, cambio de estado, alta/edición/eliminación de apoderado) para una sesión con
`rol === 'comite'`, como defensa en profundidad — el backend ya rechaza `comite` en todos los
endpoints de `UsersModule` (spec `administracion-usuarios-apoderados`, "Aislamiento de rol
comite").

#### Scenario: Comité no ve el item de menú `usuarios`

- GIVEN una sesión con `rol = 'comite'`
- WHEN se renderiza el menú de navegación
- THEN el item `usuarios` no aparece

#### Scenario: Comité navegando directamente a `/usuarios` no ve botones de escritura

- GIVEN una sesión con `rol = 'comite'` que navega directamente a `Ruta 'usuarios'`
- WHEN se renderiza la vista
- THEN no se muestra ningún botón "Crear", "Editar", "Cambiar estado" ni acción sobre `Apoderado`
