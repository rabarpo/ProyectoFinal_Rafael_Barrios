# Menu de navegación post-login — Specification

## Purpose

Reemplaza el destino hardcodeado de `/` (`proceso-nuevo`) por una pantalla de inicio y un menú
de navegación condicionados por rol, montados dentro de `AppShell` sin romper D10/D11. El mapa
rol→items es una capa de presentación en el cliente; la autorización real sigue siendo
`@Roles()` en el backend. Mapa de referencia (según `@Roles()` ya vigente en
`procesos.controller.ts`, `candidatos.controller.ts`, `listas.controller.ts`,
`opciones.controller.ts`, `academico/*.controller.ts`, `importacion.controller.ts`,
`users.controller.ts`, `configuracion.controller.ts`):

| Rol | Items reales | Placeholders "próximamente" |
|-----|--------------|------------------------------|
| `administrador` | `procesos`, `proceso-nuevo`, `académica`, `panel-jornada` | usuarios, configuración, importación Excel |
| `director` | `procesos`, `proceso-nuevo`, `académica`, `panel-jornada` | usuarios, configuración, importación Excel |
| `comite` | `procesos`, `proceso-nuevo`, `académica`, `panel-jornada` | Ninguno |
| `docente` | Ninguno (sin `@Roles` que lo autorice en estas rutas de gestión) | Ninguno |
| `estudiante` | Ninguno (sin `@Roles` que lo autorice en estas rutas de gestión) | Ninguno |

`resultados` y `votacion`/`comprobante` no son items de menú: se alcanzan navegando desde un
proceso concreto o por URL puntual (decisión 2 de la propuesta). Tampoco hay item "candidatos":
no existe ninguna `Ruta` de listado de candidatos sin `procesoId` — un item que apuntara a la
misma `Ruta 'procesos'` que "Procesos" sería un destino duplicado sin diferencia visible para el
usuario (corregido tras revisión de `sdd-apply`, ver nota en `menu-por-rol.ts`).

## Requirements

### Requirement: Aterrizaje post-login por rol
El sistema MUST resolver `parsearRuta('/')` a la variante `Ruta { nombre: 'inicio' }` para
cualquier sesión autenticada, reemplazando el hardcode previo a `proceso-nuevo`. La navegación
visible en `inicio` MUST mostrar exactamente los items reales listados en la tabla anterior para
el rol de la sesión — ni más ni menos. `administrador`, `director` y `comite` MUST incluir
"Panel de jornada" como item real navegable.

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

### Requirement: Placeholders deshabilitados para lo que #26 no construye
El sistema MUST mostrar, solo para los roles cuyo mapa lo incluya (`administrador`, `director`
para las 2 secciones restantes), un placeholder visualmente deshabilitado por cada sección futura
(usuarios, configuración) que el rol tenga en su mapa. `académica` MUST NOT seguir siendo 
placeholder para ningún rol — pasa a item real navegable para `administrador`, `director` y 
`comite`. `importacion-excel` MUST NOT seguir siendo placeholder para ningún rol — pasa a item 
real navegable para `administrador` y `director` (ver requisito siguiente). El placeholder MUST 
NOT tener `href`/`onClick` ni `Ruta` asociada — no es un enlace funcional ni una ausencia total 
del item.

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

### Requirement: Navegación a Procesos reutiliza la pantalla existente
El sistema MUST resolver el item de menú "Procesos" a la `Ruta 'procesos'` existente, renderizada
por `ProcesosIndexPage`, sin crear una pantalla duplicada.

#### Scenario: Click en "Procesos" desde el menú
- GIVEN un usuario con rol `administrador`, `director` o `comite` en la pantalla de inicio
- WHEN hace click en el item "Procesos"
- THEN el enrutador resuelve `Ruta 'procesos'`
- AND se renderiza `ProcesosIndexPage`, la misma instancia usada por el resto del sistema

### Requirement: Sin acceso directo a Resultados desde el menú principal
El sistema MUST NOT incluir un item de menú que enlace a `resultados` sin `procesoId`. El único
camino a resultados MUST ser navegar `procesos` → un proceso concreto → su vista de resultados.

#### Scenario: El menú principal no ofrece "Resultados"
- GIVEN cualquier rol autenticado en la pantalla de inicio
- WHEN revisa los items del menú
- THEN ningún item enlaza directamente a `Ruta 'resultados'` sin `procesoId`

### Requirement: Ruta desconocida sigue cayendo en no-encontrada dentro del shell
El sistema MUST preservar D11: cualquier URL no reconocida por `parsearRuta` MUST resolver a
`Ruta 'no-encontrada'` renderizada dentro de `AuthGuard` > `AppShell`, incluso con el nuevo menú
montado.

#### Scenario: URL inexistente tras agregar el menú
- GIVEN un usuario autenticado con el nuevo menú montado
- WHEN navega a una URL que ninguna variante de `Ruta` reconoce
- THEN se renderiza `Ruta 'no-encontrada'` dentro del shell, no una pantalla en blanco ni un guard distinto

### Requirement: Comportamiento defensivo ante rol sin entrada en el mapa
El sistema MUST NOT lanzar una excepción ni dejar la pantalla de inicio en blanco si el rol de la
sesión no tiene entrada en el mapa rol→items (rol inesperado o mapa desalineado). MUST renderizar
la pantalla de inicio con un menú vacío de items de gestión en ese caso, nunca un crash.

#### Scenario: Rol sin entrada en el mapa
- GIVEN una `SesionUsuario` con un valor de `rol` sin entrada en el mapa rol→items
- WHEN el cliente navega a `/`
- THEN se renderiza `Ruta 'inicio'` sin lanzar error
- AND el menú no muestra items de gestión, sin romper el resto del shell (header, "Cerrar sesión")

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
