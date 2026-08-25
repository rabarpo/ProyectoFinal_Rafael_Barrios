# Delta for configuracion-institucional

Cross-referencia: `Design.md` §Boleta de 3 pasos (imagen institucional del Paso 1).

## ADDED Requirements

### Requirement: `GET /configuracion/logo` accesible a cualquier usuario autenticado

El sistema MUST relajar únicamente el método `GET /configuracion/logo` a nivel de método
(`@UseGuards(AuthGuard)`, override del guard de clase, sin `@Roles`), de modo que cualquier
usuario autenticado — incluidos votantes con rol `estudiante`/`padre` — pueda obtener el logo
institucional para el Paso 1 del flujo de votación. El sistema MUST NOT relajar ningún otro
método de `ConfiguracionController`, que MUST mantener `@Roles('administrador', 'director')` sin
cambios.

#### Scenario: Un votante (rol `estudiante`) obtiene el logo institucional
- GIVEN un usuario autenticado con `rol = 'estudiante'` y un logo institucional persistido
- WHEN invoca `GET /configuracion/logo`
- THEN responde `200` con el binario del logo, igual que para `administrador`/`director`

#### Scenario: Un votante (rol `padre`) obtiene el logo institucional
- GIVEN un usuario autenticado con `rol = 'padre'` y un logo institucional persistido
- WHEN invoca `GET /configuracion/logo`
- THEN responde `200` con el binario del logo

#### Scenario: El resto de `ConfiguracionController` sigue restringido a administrador/director
- GIVEN un usuario autenticado con `rol = 'estudiante'` (o `'padre'`, o `'comite'`)
- WHEN invoca `GET /configuracion`, `PUT /configuracion`, `POST /configuracion/logo`, o el
  listado de comité
- THEN cada uno de esos endpoints rechaza la petición sin ejecutar el handler, igual que antes de
  este change

#### Scenario: Petición sin sesión válida sigue siendo rechazada
- GIVEN una petición a `GET /configuracion/logo` sin sesión autenticada
- WHEN se invoca el endpoint
- THEN responde con rechazo de autenticación, sin exponer el binario del logo
