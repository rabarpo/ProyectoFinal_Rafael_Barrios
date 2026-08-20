# Especificación: minimal-frontend-router

## Purpose

Define un enrutador mínimo hand-rolled, sin librería de routing nueva, cuyo único propósito en
este change es permitir alternar entre las vistas de administración de candidatos (listado,
alta/edición) sin recargar la página. Capacidad nueva, sentando el patrón reutilizable para
`#7`/`#8`/`#10`. Fuera de alcance: rutas anidadas, guards por ruta, `react-router-dom` u otra
librería.

## Requirements

### Requirement: Enrutador mínimo basado en `window.location.pathname`
El sistema MUST montar en `apps/frontend/src/app/App.tsx` un enrutador hand-rolled que resuelva la
vista a renderizar a partir de `window.location.pathname`, sin depender de ninguna librería de
routing externa, cubriendo únicamente las rutas necesarias para listado y alta/edición de
candidatos.

#### Scenario: Ruta de listado renderiza la pantalla de gestión
- GIVEN la aplicación montada con `window.location.pathname` apuntando a la ruta de listado de
  candidatos
- WHEN el enrutador resuelve la vista
- THEN se renderiza la pantalla de listado de candidatos

#### Scenario: Ruta de alta/edición renderiza el formulario correspondiente
- GIVEN `window.location.pathname` apuntando a la ruta de alta o edición de un candidato
- WHEN el enrutador resuelve la vista
- THEN se renderiza el formulario de alta/edición sin recargar la página

#### Scenario: Navegación entre vistas no dispara recarga completa
- GIVEN el usuario ubicado en la pantalla de listado
- WHEN navega a la pantalla de alta de candidato mediante el enrutador
- THEN el cambio de vista ocurre sin una recarga completa del documento

### Requirement: Alcance mínimo sin rutas anidadas ni guards
El sistema MUST NOT introducir rutas anidadas, guards de autorización por ruta, ni ninguna librería
de routing en este change; cualquier necesidad de esas capacidades queda diferida a un change
futuro que la requiera explícitamente.

#### Scenario: Ninguna dependencia de routing se agrega al `package.json`
- GIVEN el `package.json` de `apps/frontend` tras aplicar este change
- WHEN se inspeccionan sus dependencias
- THEN no aparece `react-router-dom` ni ninguna librería de routing equivalente

### Requirement: Variante `Ruta 'academica'` con navegación interna por pestañas

El sistema MUST agregar una variante `Ruta { nombre: 'academica' }` a la unión discriminada de
`rutas.ts` (`parsearRuta`/`rutaAPath` totales) y su `case` en `Enrutador.tsx`, sin introducir
rutas anidadas ni una librería de routing. Dentro de esa única ruta, el sistema MUST resolver,
mediante estado de componente (no sub-ruta de URL), cuál de las seis pestañas (año escolar, nivel,
grado, sección, aula, matrícula) está activa.

#### Scenario: Navegación a /academica renderiza el contenedor con pestañas
- GIVEN un usuario autenticado con rol `administrador`, `director` o `comite`
- WHEN el enrutador resuelve `Ruta 'academica'`
- THEN se renderiza `AcademicaPage` con las seis pestañas visibles y una activa por defecto

#### Scenario: Cambiar de pestaña no cambia la URL
- GIVEN el usuario en `Ruta 'academica'` con la pestaña "Nivel" activa
- WHEN hace click en la pestaña "Grado"
- THEN se renderiza el listado de `Grado` sin invocar el enrutador ni cambiar
  `window.location.pathname`

### Requirement: Variante `Ruta 'usuarios'` plana

El sistema MUST agregar una variante `Ruta { nombre: 'usuarios' }` a la unión discriminada de
`rutas.ts` (`parsearRuta`/`rutaAPath` totales) y su `case` en `Enrutador.tsx`, sin introducir
rutas anidadas ni una librería de routing, siguiendo el mismo patrón que `Ruta 'academica'`. La
selección de un `Usuario` concreto y su panel contextual de apoderados MUST resolverse con estado
de componente, no con sub-rutas de URL. El desbloqueo manual NO es un panel contextual de esta
ruta — ver el siguiente requisito.

### Requirement: Variante `Ruta 'cuentas-bloqueadas'` plana e independiente

El sistema MUST agregar una variante `Ruta { nombre: 'cuentas-bloqueadas' }` a la unión discriminada
de `rutas.ts` y su `case` en `Enrutador.tsx`, colgando de la raíz y no anidada bajo `usuarios`: el
backend gatea `GET /auth/usuarios/bloqueados` y `POST /auth/usuarios/:id/desbloquear` con
`@Roles('comite')`, mientras que `Ruta 'usuarios'` es `@Roles('administrador','director')` en el
backend — son roles disjuntos, así que anidar sugeriría una jerarquía que ningún rol puede recorrer
completa.

#### Scenario: Navegación a `/cuentas-bloqueadas` renderiza el listado de cuentas bloqueadas

- GIVEN una sesión con `rol = 'comite'`
- WHEN el enrutador resuelve `Ruta 'cuentas-bloqueadas'`
- THEN se renderiza el listado de cuentas con `estado === 'bloqueado'`

#### Scenario: Navegación a `/usuarios` renderiza el listado central

- GIVEN un usuario autenticado con rol `administrador` o `director`
- WHEN el enrutador resuelve `Ruta 'usuarios'`
- THEN se renderiza el listado central de `Usuario` con filtro por rol/estado

#### Scenario: Abrir la ficha de un usuario no cambia la URL

- GIVEN el usuario en `Ruta 'usuarios'` con el listado visible
- WHEN hace click en una fila para abrir la ficha de ese `Usuario`
- THEN se renderiza la ficha sin invocar el enrutador ni cambiar `window.location.pathname`

### Requirement: Sin deep-link a usuario específico

El sistema MUST NOT persistir el usuario seleccionado en la URL ni en almacenamiento entre
recargas; al recargar `/usuarios`, el sistema MUST volver al listado central sin ninguna ficha
abierta. Esta es una decisión aceptada para la primera entrega, no un defecto (mismo criterio que
`Ruta 'academica'`).

#### Scenario: Recargar la página pierde la ficha abierta

- GIVEN el usuario con la ficha de un `Usuario` abierta dentro de `Ruta 'usuarios'`
- WHEN recarga el navegador
- THEN se renderiza `Ruta 'usuarios'` con el listado central, sin ninguna ficha abierta

### Requirement: Sin deep-link a pestaña ni entidad específica

El sistema MUST NOT persistir la pestaña activa en la URL ni en almacenamiento entre recargas; al
recargar `/academica`, el sistema MUST volver a la pestaña por defecto. Esta es una decisión
aceptada para la primera entrega, no un defecto.

#### Scenario: Recargar la página pierde la pestaña activa
- GIVEN el usuario en `Ruta 'academica'` con la pestaña "Aula" activa
- WHEN recarga el navegador
- THEN se renderiza `Ruta 'academica'` con la pestaña por defecto activa, no "Aula"
