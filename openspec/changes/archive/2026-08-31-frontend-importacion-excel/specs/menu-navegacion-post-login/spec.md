# Delta para menu-navegacion-post-login

## MODIFIED Requirements

### Requirement: Placeholders deshabilitados para lo que #26 no construye
El sistema MUST mostrar, solo para los roles cuyo mapa lo incluya (`administrador`, `director`
para las 2 secciones restantes), un placeholder visualmente deshabilitado por cada sección futura
(usuarios, configuración) que el rol tenga en su mapa. `académica` MUST NOT
seguir siendo placeholder para ningún rol — pasa a item real navegable para `administrador`,
`director` y `comite`. `importacion-excel` MUST NOT seguir siendo placeholder para ningún rol —
pasa a item real navegable para `administrador` y `director` (ver requisito siguiente). El
placeholder MUST NOT tener `href`/`onClick` ni `Ruta` asociada — no es un enlace funcional ni una
ausencia total del item.
(Previously: la lista de placeholders incluía "importación Excel" para `administrador`/`director`; ahora ese item es navegable y solo quedan usuarios y configuración como placeholders.)

#### Scenario: Administrador ve placeholder deshabilitado
- GIVEN un usuario con rol `administrador` en la pantalla de inicio
- WHEN observa el item "Usuarios" del menú
- THEN el item aparece deshabilitado con indicación "próximamente"
- AND interactuar con él no dispara navegación alguna

#### Scenario: Comité ya no ve placeholder de académica
- GIVEN un usuario con rol `comite` en la pantalla de inicio
- WHEN revisa el menú completo
- THEN "académica" aparece como item real navegable, no como placeholder
- AND no aparece ningún item de usuarios, configuración ni importación Excel

## ADDED Requirements

### Requirement: Ítem real de importación de Excel para administrador y director

El sistema MUST mostrar el item "Importación de Excel" como enlace funcional a
`Ruta 'importacion-excel'` únicamente para las sesiones con rol `administrador` y `director`,
reemplazando el placeholder previo de esos dos roles. El sistema MUST NOT mostrar este item para
`comite`, `docente`, `estudiante` ni ningún otro rol.

#### Scenario: Administrador navega a importación de Excel desde el menú
- GIVEN un usuario con rol `administrador` en la pantalla de inicio
- WHEN hace click en el item "Importación de Excel"
- THEN el enrutador resuelve `Ruta 'importacion-excel'`
- AND se renderiza la pantalla única de importación de padrón

#### Scenario: Director ve el item como navegable
- GIVEN un usuario con rol `director` en la pantalla de inicio
- WHEN revisa el menú
- THEN "Importación de Excel" aparece como item real navegable, no como placeholder "próximamente"

#### Scenario: Comité no ve el item de importación de Excel
- GIVEN un usuario con rol `comite` en la pantalla de inicio
- WHEN revisa el menú completo
- THEN no aparece ningún item de importación de Excel, ni real ni placeholder

#### Scenario: Roles sin gestión no ven el item
- GIVEN un usuario con rol `docente` o `estudiante`
- WHEN navega a `/`
- THEN el menú no muestra el item "Importación de Excel"
