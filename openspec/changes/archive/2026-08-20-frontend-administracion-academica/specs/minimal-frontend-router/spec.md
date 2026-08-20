# Delta for minimal-frontend-router

## ADDED Requirements

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

### Requirement: Sin deep-link a pestaña ni entidad específica

El sistema MUST NOT persistir la pestaña activa en la URL ni en almacenamiento entre recargas; al
recargar `/academica`, el sistema MUST volver a la pestaña por defecto. Esta es una decisión
aceptada para la primera entrega, no un defecto.

#### Scenario: Recargar la página pierde la pestaña activa
- GIVEN el usuario en `Ruta 'academica'` con la pestaña "Aula" activa
- WHEN recarga el navegador
- THEN se renderiza `Ruta 'academica'` con la pestaña por defecto activa, no "Aula"
