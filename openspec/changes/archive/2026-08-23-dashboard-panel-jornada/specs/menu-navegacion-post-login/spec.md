# Delta for Menu de navegación post-login

## MODIFIED Requirements

### Requirement: Aterrizaje post-login por rol
El sistema MUST resolver `parsearRuta('/')` a la variante `Ruta { nombre: 'inicio' }` para
cualquier sesión autenticada, reemplazando el hardcode previo a `proceso-nuevo`. La navegación
visible en `inicio` MUST mostrar exactamente los items reales listados en la tabla de referencia
para el rol de la sesión — ni más ni menos. `administrador`, `director` y `comite` MUST incluir
"Panel de jornada" como item real navegable, además de `procesos`, `proceso-nuevo` y `académica`.
(Previously: la tabla de items reales no incluía "Panel de jornada" para ningún rol.)

#### Scenario: Administrador aterriza en inicio con su menú completo
- GIVEN un usuario con rol `administrador` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`, no `proceso-nuevo`
- AND el menú muestra `procesos`, `proceso-nuevo`, `académica` y "Panel de jornada" como items
  reales

#### Scenario: Director aterriza en inicio con su menú completo
- GIVEN un usuario con rol `director` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú muestra `procesos`, `proceso-nuevo`, `académica` y "Panel de jornada" como items
  reales

#### Scenario: Comité aterriza en inicio con académica y panel de jornada como items reales
- GIVEN un usuario con rol `comite` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú muestra `procesos`, `proceso-nuevo`, `académica` y "Panel de jornada" como items
  reales
- AND no muestra los placeholders de usuarios, configuración ni importación Excel

#### Scenario: Docente aterriza en inicio sin items de gestión
- GIVEN un usuario con rol `docente` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú no muestra ningún item real ni placeholder de gestión, incluido "Panel de jornada"

#### Scenario: Estudiante aterriza en inicio sin items de gestión
- GIVEN un usuario con rol `estudiante` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú no muestra ningún item real ni placeholder de gestión, incluido "Panel de jornada"

## ADDED Requirements

### Requirement: Navegación a Panel de jornada reutiliza la ruta nueva
El sistema MUST resolver el item de menú "Panel de jornada" a una `Ruta` nueva propia, distinta de
`resultados` y de la ruta de proyección. MUST estar disponible únicamente para `administrador`,
`director` y `comite`.

#### Scenario: Click en "Panel de jornada" desde el menú
- GIVEN un usuario con rol `administrador`, `director` o `comite` en la pantalla de inicio
- WHEN hace click en el item "Panel de jornada"
- THEN el enrutador resuelve la `Ruta` del panel de jornada
- AND se renderiza la página del panel, scoped por proceso

### Requirement: Ruta de modo proyección sin item de menú
El sistema MUST exponer el modo proyección como una `Ruta` separada, accesible solo por URL
directa, sin item correspondiente en `MENU_POR_ROL`. MUST estar protegida por la misma
autorización de tres roles que el resto del panel de jornada (`403` para cualquier otro rol,
`401` sin sesión).

#### Scenario: Proyección no aparece en el menú
- GIVEN cualquier rol autenticado en la pantalla de inicio
- WHEN revisa los items del menú
- THEN ningún item enlaza a la `Ruta` de proyección

#### Scenario: Acceso directo a proyección con rol autorizado
- GIVEN un usuario con rol `comite` navega directamente a la URL de proyección
- WHEN el enrutador resuelve la ruta
- THEN se renderiza la vista de proyección sin controles interactivos

#### Scenario: Acceso directo a proyección con rol no autorizado
- GIVEN un usuario con rol `docente` navega directamente a la URL de proyección
- WHEN el enrutador resuelve la ruta
- THEN el backend responde `403` al pedir datos de proyección
