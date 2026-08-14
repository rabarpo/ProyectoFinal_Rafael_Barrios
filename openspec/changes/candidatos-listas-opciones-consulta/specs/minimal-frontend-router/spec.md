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
futuro que las requiera explícitamente.

#### Scenario: Ninguna dependencia de routing se agrega al `package.json`
- GIVEN el `package.json` de `apps/frontend` tras aplicar este change
- WHEN se inspeccionan sus dependencias
- THEN no aparece `react-router-dom` ni ninguna librería de routing equivalente
