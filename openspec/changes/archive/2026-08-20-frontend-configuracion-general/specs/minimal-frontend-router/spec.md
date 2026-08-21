# Delta for minimal-frontend-router

## ADDED Requirements

### Requirement: Variante `Ruta 'configuracion'` plana sin sub-rutas

El sistema MUST agregar una variante `Ruta { nombre: 'configuracion' }` a la unión discriminada de
`rutas.ts` (`parsearRuta`/`rutaAPath` totales) y su `case` en `Enrutador.tsx`, sin introducir rutas
anidadas ni una librería de routing. Al ser un singleton sin jerarquía de entidades, esta ruta MUST
NOT requerir sub-rutas ni estado de navegación interna por pestañas.

#### Scenario: Navegación a `/configuracion` renderiza la página de configuración

- GIVEN un usuario autenticado con rol `administrador` o `director`
- WHEN el enrutador resuelve `Ruta 'configuracion'`
- THEN se renderiza `ConfiguracionPage` con el formulario, la subida de logo y la lista de comité

#### Scenario: Ninguna dependencia de routing nueva se agrega al `package.json`

- GIVEN el `package.json` de `apps/frontend` tras aplicar este change
- WHEN se inspeccionan sus dependencias
- THEN no aparece `react-router-dom` ni ninguna librería de routing equivalente
