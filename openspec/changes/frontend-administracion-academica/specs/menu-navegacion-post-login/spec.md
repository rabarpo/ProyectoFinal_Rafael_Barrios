# Delta for menu-navegacion-post-login

## ADDED Requirements

### Requirement: Ítem real de académica para administrador, director y comité

El sistema MUST mostrar el item "Académica" como enlace funcional a `Ruta 'academica'` para las
sesiones con rol `administrador`, `director` y `comite`, reemplazando el placeholder previo de
esos tres roles.

#### Scenario: Administrador navega a académica desde el menú
- GIVEN un usuario con rol `administrador` en la pantalla de inicio
- WHEN hace click en el item "Académica"
- THEN el enrutador resuelve `Ruta 'academica'`
- AND se renderiza `AcademicaPage`

#### Scenario: Comité navega a académica en modo lectura
- GIVEN un usuario con rol `comite` en la pantalla de inicio
- WHEN hace click en el item "Académica"
- THEN el enrutador resuelve `Ruta 'academica'`
- AND se renderiza `AcademicaPage` sin ningún botón de escritura visible

## MODIFIED Requirements

### Requirement: Aterrizaje post-login por rol

El sistema MUST resolver `parsearRuta('/')` a la variante `Ruta { nombre: 'inicio' }` para
cualquier sesión autenticada, reemplazando el hardcode previo a `proceso-nuevo`. La navegación
visible en `inicio` MUST mostrar exactamente los items reales listados en la tabla de referencia
para el rol de la sesión — ni más ni menos. Tras este change, `académica` pasa de placeholder a
item real para `administrador`, `director` y `comite`.
(Previously: `académica` era placeholder para los tres roles; el menú solo mostraba `procesos` y
`proceso-nuevo` como items reales para `administrador`/`director`.)

#### Scenario: Administrador aterriza en inicio con su menú completo
- GIVEN un usuario con rol `administrador` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`, no `proceso-nuevo`
- AND el menú muestra `procesos`, `proceso-nuevo` y `académica` como items reales

#### Scenario: Director aterriza en inicio con su menú completo
- GIVEN un usuario con rol `director` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú muestra `procesos`, `proceso-nuevo` y `académica` como items reales

#### Scenario: Comité aterriza en inicio con académica como item real de solo lectura
- GIVEN un usuario con rol `comite` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú muestra `procesos`, `proceso-nuevo` y `académica` como items reales
- AND no muestra los placeholders de usuarios, configuración ni importación Excel

#### Scenario: Docente aterriza en inicio sin items de gestión
- GIVEN un usuario con rol `docente` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú no muestra ningún item real ni placeholder de gestión

#### Scenario: Estudiante aterriza en inicio sin items de gestión
- GIVEN un usuario con rol `estudiante` inicia sesión
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'`
- AND el menú no muestra ningún item real ni placeholder de gestión

### Requirement: Placeholders deshabilitados para lo que #26 no construye

El sistema MUST mostrar, solo para los roles cuyo mapa lo incluya (`administrador`, `director`
para las 3 secciones restantes), un placeholder visualmente deshabilitado por cada sección futura
(usuarios, configuración, importación Excel) que el rol tenga en su mapa. `académica` MUST NOT
seguir siendo placeholder para ningún rol — pasa a item real navegable para `administrador`,
`director` y `comite`. El placeholder MUST NOT tener `href`/`onClick` ni `Ruta` asociada — no es
un enlace funcional ni una ausencia total del item.
(Previously: `académica` era uno de los placeholders deshabilitados, visible para
`administrador`/`director`/`comite`.)

#### Scenario: Administrador ve placeholder deshabilitado de Usuarios
- GIVEN un usuario con rol `administrador` en la pantalla de inicio
- WHEN observa el item "Usuarios" del menú
- THEN el item aparece deshabilitado con indicación "próximamente"
- AND interactuar con él no dispara navegación alguna

#### Scenario: Comité ya no ve placeholder de académica
- GIVEN un usuario con rol `comite` en la pantalla de inicio
- WHEN revisa el menú completo
- THEN "académica" aparece como item real navegable, no como placeholder
- AND no aparece ningún item de usuarios, configuración ni importación Excel
