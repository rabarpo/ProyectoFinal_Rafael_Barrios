# Delta for minimal-frontend-router

## ADDED Requirements

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

### Requirement: Sin deep-link a un usuario específico

El sistema MUST NOT persistir el usuario seleccionado en la URL ni en almacenamiento entre
recargas; al recargar `/usuarios`, el sistema MUST volver al listado central sin ninguna ficha
abierta. Esta es una decisión aceptada para la primera entrega, no un defecto (mismo criterio que
`Ruta 'academica'`).

#### Scenario: Recargar la página pierde la ficha abierta

- GIVEN el usuario con la ficha de un `Usuario` abierta dentro de `Ruta 'usuarios'`
- WHEN recarga el navegador
- THEN se renderiza `Ruta 'usuarios'` con el listado central, sin ninguna ficha abierta
