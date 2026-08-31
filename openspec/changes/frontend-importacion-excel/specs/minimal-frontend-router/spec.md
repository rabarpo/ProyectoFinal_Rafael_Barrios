# Delta para minimal-frontend-router

## ADDED Requirements

### Requirement: Variante `Ruta 'importacion-excel'` plana

El sistema MUST agregar una variante `Ruta { nombre: 'importacion-excel' }` a la unión
discriminada de `rutas.ts` (`parsearRuta`/`rutaAPath` totales) y su `case` en `Enrutador.tsx`,
sin introducir rutas anidadas ni una librería de routing, siguiendo el mismo patrón que las demás
variantes planas. La ruta MUST resolver a la pantalla única de importación de padrón. El sistema
MUST NOT persistir en la URL ni en almacenamiento el archivo seleccionado ni el resultado de la
importación entre recargas.

#### Scenario: Navegación a `/importacion-excel` renderiza la pantalla de importación
- GIVEN un usuario autenticado con rol `administrador` o `director`
- WHEN el enrutador resuelve `Ruta 'importacion-excel'`
- THEN se renderiza la pantalla única de importación de padrón

#### Scenario: Recargar la página reinicia la pantalla
- GIVEN el usuario en `Ruta 'importacion-excel'` con un resultado de importación visible
- WHEN recarga el navegador
- THEN se renderiza `Ruta 'importacion-excel'` en su estado inicial, sin resultado previo

#### Scenario: Ninguna dependencia de routing nueva se agrega al `package.json`
- GIVEN el `package.json` de `apps/frontend` tras aplicar este change
- WHEN se inspeccionan sus dependencias
- THEN no aparece `react-router-dom` ni ninguna librería de routing equivalente
