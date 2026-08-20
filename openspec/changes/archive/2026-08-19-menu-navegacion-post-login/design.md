# Diseño: menu-navegacion-post-login (Backlog #25)

## Enfoque técnico

Frontend puro, sin backend nuevo. Se **extiende** el enrutador hand-rolled vigente (D10/D11/D13 de
`#12`, archivadas en `archive/2026-08-13-candidatos-listas-opciones-consulta/design.md`) agregando
una variante `inicio` a la unión `Ruta` y reasignando el path de `proceso-nuevo`; ninguna de esas
decisiones se reabre. Un módulo de datos nuevo (`menu-por-rol.ts`) declara el mapa estático
rol→items —única fuente para la barra de navegación y para la pantalla de inicio— y `AppShell`
pasa a montar la navegación, reemplazando su contrato "sin navegación, sin menú" de `#24`. El delta
de spec corresponde a la capability existente `minimal-frontend-router`; no se crea ninguna
capability nueva.

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Variante de inicio y path de `proceso-nuevo` | Variante `{ nombre: 'inicio' }`; `parsearRuta` devuelve `inicio` cuando no hay segmentos (`rutas.ts:36-38`) y `rutaAPath('inicio') === '/'`. `proceso-nuevo` se muda a **`/procesos/nuevo`** (`partes[0] === 'procesos' && partes.length === 2 && partes[1] === 'nuevo'`) | Dejar `proceso-nuevo` sin path propio; ruta plana `/nuevo-proceso`; renombrar `proceso-nuevo` a `inicio` reutilizando la variante | `rutaAPath` es **total** sobre la unión y `navegar({ nombre: 'proceso-nuevo' })` ya tiene dos llamadores reales (`ProcesosIndexPage.tsx:47`, `VotacionPage.tsx:156`): si `/` pasa a `inicio` sin reasignar, dos variantes colapsan en `/` y se rompe el round-trip que `rutas.spec.ts:9-26` verifica para **cada** variante navegable. `/procesos/nuevo` no colisiona (el bloque de candidatos exige `length >= 3`; `apertura` exige `length === 3`) y agrupa la creación bajo su recurso, igual que `/procesos/:id/abrir`. Extensión por variante, exactamente como manda D10 |
| D2 | Forma del mapa rol→items | `apps/frontend/src/app/menu-por-rol.ts`: `type RolSesion = SesionUsuario['rol']` y `const MENU_POR_ROL: Record<RolSesion, ItemMenu[]>`, con `ItemMenu` como **unión discriminada** `{ clase: 'navegable'; ruta: Ruta }` / `{ clase: 'proximamente' }` | `{ ruta: Ruta \| null; deshabilitado: boolean }`; lista plana con `roles: RolSesion[]` filtrada en render; derivar el menú de un endpoint de capacidades | Misma disciplina que `Ruta` (D10): unión discriminada en vez de campos opcionales, para que el compilador impida los dos estados incoherentes ("placeholder con ruta", "navegable sin ruta") en lugar de confiar en una convención. `Record<RolSesion, …>` sobre el tipo **derivado del contrato generado** (`SesionUsuarioDto.rol`, `api.d.ts:993`) hace que agregar un rol a `RolUsuario` (`schema.prisma:30-36`) rompa la compilación, en vez de degradar en silencio a menú vacío. El endpoint de capacidades es el enfoque 3 ya descartado por la propuesta |
| D3 | Contenido del mapa | Espeja los `@Roles` reales verificados en el backend (tabla abajo). `docente` y `estudiante` reciben **cero** items | Dar a todos los roles los mismos items y confiar en el 403; inventar items para `docente`/`estudiante` | La propuesta acepta la duplicación deliberada sólo si su peor caso es un enlace visible que el backend rechaza; espejar los `@Roles` vigentes minimiza incluso ese caso. `docente`/`estudiante` no tienen **ningún** endpoint de gestión: sus únicas rutas (`votacion`, `comprobante`) llevan un id de instancia y llegan por correo, no son listables (exploración). Su menú vacío es correcto y lo cubre el estado vacío de D6 |
| D4 | Dónde se monta la navegación | **Dentro de `AppShell.tsx`**: `AppShell` renderiza `<NavegacionPrincipal />` en una segunda fila del `<header>` existente, y se reescribe el comentario de contrato del archivo | Componente de nav hermano de `AppShell` en `App.tsx`, sin tocarlo; nav dentro de `Enrutador`; repetir la nav en cada página | `AppShell` ya es el único dueño del cromo persistente y el único que lee el rol con `useSesion()` (`AppShell.tsx:11-12`); montarla afuera duplicaría esa lectura, partiría el layout en dos dueños y quedaría fuera del contenedor `max-w-page`. D11 exige que todo lo autenticado viva dentro de `AuthGuard` > `AppShell`. El comentario "Sin navegación, sin menú — fuera de alcance de la propuesta" era el contrato explícito de `#24`: se **reemplaza documentando el cambio** ("navegación principal por rol, #25; sin submenús ni rutas anidadas"), nunca se borra en silencio |
| D5 | Presentación del placeholder de `#26` | `<button type="button" disabled>` con la etiqueta y el texto fijo "Próximamente"; sin `onClick`, sin `href`, sin `Ruta` en el dato (garantizado por D2) | `<a href="#">` con `preventDefault`; ocultar los items hasta que exista `#26`; sólo un `title`/tooltip | La decisión 3 de la propuesta exige que se vea que la sección existirá sin simular que funciona. `disabled` lo garantiza **estructuralmente** (el DOM no navega aunque alguien fuerce el click, y no hay ruta que forzar), mientras que `href="#"` sigue ensuciando el historial si el JS falla y un tooltip no existe en táctil. Copy sin fecha, según el riesgo declarado en la propuesta |
| D6 | Contenido de `InicioPage` | `apps/frontend/src/app/InicioPage.tsx`: saludo con el rol + grid de tarjetas derivado del **mismo** `MENU_POR_ROL`. Sin fetch, sin estado, sin efectos. Estado vacío explícito para `docente`/`estudiante` | Resumen de procesos activos o de la votación en curso; una lista de accesos propia de la página, distinta de la del menú | El backlog fija "sin lógica de negocio propia, sólo enrutamiento y layout" (resuelve la pregunta abierta 2 de la propuesta hacia el alcance mínimo). Un resumen exigiría `procesos-api.listar()`, que `docente`/`estudiante` no pueden llamar ⇒ un 403 en la primera pantalla post-login. Una sola fuente para nav y home hace que el test de datos de D8 cubra ambas superficies |
| D7 | Layout y tokens | Barra horizontal dentro del `<header>` de `AppShell` (apilada en móvil), **exclusivamente** con tokens vigentes de `index.css`: `primary`, `on-primary`, `surface-white`, `surface-container`, `border-gray`, `on-surface-variant`, `text-label-md`, `text-caption`, `rounded-control`, `rounded-card`, `shadow-elevation`, `max-page` | Sidebar fijo; tokens nuevos; librería de UI o de nav | Mismo criterio que D13 de `#12`. No hay wireframe de referencia (riesgo declarado en la exploración): una barra dentro del header reutiliza el contenedor `max-w-page` ya montado y no toca `<main>`, mientras que un sidebar obligaría a reescribir el grid del shell y a inventar tokens de ancho. `#24` archivó el sistema visual y no se le agregan tokens |
| D8 | Cómo se prueba el mapa | `menu-por-rol.spec.ts` como **test de datos** (Vitest, sin render): para cada uno de los 5 roles, igualdad exacta del conjunto de `id` visibles; más dos invariantes — ningún item `proximamente` expone `ruta`, y toda `ruta` de item navegable cumple `parsearRuta(rutaAPath(r))` | `toMatchSnapshot()` del menú renderizado; e2e con navegador; sólo probar el render de `NavegacionPrincipal` | Resuelve la pregunta abierta 3 de la propuesta: el contenido del mapa es un dato, y probarlo como dato es exhaustivo por rol, no necesita jsdom y no se rompe al mover un `className`. El snapshot mezcla contenido con presentación y produce diffs ruidosos justamente en la parte que más se retoca. Sin e2e nuevos: `#25` no toca backend |

### D3 — mapa rol→items (fuente: `@Roles` vigentes)

| Rol | Navegables | Placeholders `#26` (deshabilitados) | `@Roles` que lo respalda |
|---|---|---|---|
| `administrador` | Procesos, Nuevo proceso | Académica, Usuarios, Configuración, Importación Excel | `procesos.controller.ts:56`, `users.controller.ts:34`, `configuracion.controller.ts:126`, `importacion.controller.ts:67` |
| `director` | Procesos, Nuevo proceso | Académica, Usuarios, Configuración, Importación Excel | idéntico a `administrador` en los cuatro controladores |
| `comite` | Procesos, Nuevo proceso | Académica | `procesos`/`candidatos` incluyen `comite`; las lecturas académicas también (`niveles/grados/secciones/aulas.controller.ts`), pero usuarios/configuración/importación son sólo `administrador`,`director` |
| `docente` | — | — | Ningún endpoint de gestión lo admite |
| `estudiante` | — | — | Ídem; vota por enlace con id de instancia |

`resultados` **no** aparece en ninguna fila: se alcanza sólo vía `procesos` → proceso → resultados
(decisión 2 de la propuesta, respeta el "sin listado agregado" de `#16`).

## Flujo de datos

```
App → AuthProvider → AuthGuard → QueryProvider → AppShell ─┬─ <header> → NavegacionPrincipal
                                                           │                 │ useSesion().sesion.rol
                                                           │                 ↓
                                                           │            MENU_POR_ROL[rol]
                                                           │                 ├ clase 'navegable'    → navegar(item.ruta)
                                                           │                 └ clase 'proximamente' → <button disabled>
                                                           └─ <main> → Enrutador ── useRuta()
                                                                          ├ '/'               → InicioPage   (nuevo)
                                                                          ├ '/procesos/nuevo' → ProcesoWizardPage
                                                                          ├ '/procesos'       → ProcesosIndexPage
                                                                          └ otro              → … / no-encontrada

InicioPage → MENU_POR_ROL[rol]  (misma constante, sin fetch ni estado)
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/frontend/src/app/rutas.ts` | Modify | D1: variante `inicio`; `/` ⇒ `inicio`; `/procesos/nuevo` ⇒ `proceso-nuevo`; `rutaAPath` para ambas |
| `apps/frontend/src/app/rutas.spec.ts` | Modify | D1: `inicio` en el round-trip; `/procesos/nuevo` resuelve a `proceso-nuevo` |
| `apps/frontend/src/app/menu-por-rol.ts` | Create | D2/D3: `RolSesion`, `ItemMenu`, `MENU_POR_ROL` |
| `apps/frontend/src/app/menu-por-rol.spec.ts` | Create | D8: items exactos por rol + dos invariantes |
| `apps/frontend/src/app/NavegacionPrincipal.tsx` | Create | D4/D5/D7: barra por rol, placeholders `disabled` |
| `apps/frontend/src/app/NavegacionPrincipal.spec.tsx` | Create | Render: rol sin items no rompe; placeholder no navega al hacer click |
| `apps/frontend/src/app/InicioPage.tsx` | Create | D6: saludo + accesos + estado vacío |
| `apps/frontend/src/app/InicioPage.spec.tsx` | Create | D6: `administrador` ve accesos; `estudiante` ve el estado vacío |
| `apps/frontend/src/app/AppShell.tsx` | Modify | D4: monta `NavegacionPrincipal`; se reescribe el comentario de contrato de `#24` |
| `apps/frontend/src/app/Enrutador.tsx` | Modify | D1: `case 'inicio'` ⇒ `InicioPage`; comentario del cambio de `/` |
| `apps/frontend/src/app/Enrutador.spec.tsx` | Modify | D1: `/` resuelve a `InicioPage`, no a `ProcesoWizardPage` |
| `apps/frontend/src/app/useRuta.spec.tsx` | Modify | D1: la aserción de `/` ⇒ `proceso-nuevo` (línea 23) pasa a `inicio` |
| `openspec/specs/minimal-frontend-router/spec.md` (delta en el change) | Modify | Destino de `/`, path de `proceso-nuevo`, menú por rol |
| Backend | None | Sin endpoints, DTOs, migraciones ni contrato nuevo |

## Interfaces / Contratos

```ts
// apps/frontend/src/app/rutas.ts — D1 (extensión de la unión de #12 D10)
export type Ruta =
  | { nombre: 'inicio' }          // ← nueva; destino de '/'
  | { nombre: 'proceso-nuevo' }   // ← ahora '/procesos/nuevo'
  | /* … las 8 variantes restantes, sin cambios … */;
```

```ts
// apps/frontend/src/app/menu-por-rol.ts — D2/D3
import type { SesionUsuario } from '../auth/auth-api';
import type { Ruta } from './rutas';

export type RolSesion = SesionUsuario['rol']; // derivado del contrato generado

export type ItemMenu =
  | { clase: 'navegable'; id: string; etiqueta: string; ruta: Ruta }
  | { clase: 'proximamente'; id: string; etiqueta: string };

// Record total: agregar un rol en RolUsuario rompe la compilación, no el menú.
export const MENU_POR_ROL: Record<RolSesion, readonly ItemMenu[]> = { /* … */ };
```

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (Vitest) | `parsearRuta`/`rutaAPath` para `inicio` y `/procesos/nuevo`; round-trip de todas las variantes; `/procesos/nuevo/x` ⇒ `no-encontrada` | `rutas.spec.ts` existente, ampliado |
| Unit — datos (Vitest, sin render) | D8: los 5 roles con su conjunto exacto de `id`; ningún `proximamente` con `ruta`; toda `ruta` navegable round-trips | `menu-por-rol.spec.ts` nuevo |
| Componente (Vitest + RTL) | `/` monta `InicioPage`; rol sin items renderiza el estado vacío sin excepción; click en un placeholder no cambia `window.location.pathname` | `Enrutador.spec.tsx` (patrón `proveer()` con `SesionContext` ya vigente), `NavegacionPrincipal.spec.tsx`, `InicioPage.spec.tsx` |
| E2E | — | Ninguno nuevo: `#25` no agrega superficie de backend |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Enrutamiento (cliente) | `/` sin sesión; `/procesos/nuevo` sin sesión; `/procesos/nuevo/extra`; `pushState` a un path desconocido; item de menú de un rol que el backend rechaza | **Applicable** — el change cambia el destino de `/` y agrega una variante | La nav y `InicioPage` viven dentro de `AuthGuard` > `AppShell` (D11 de `#12`, sin cambios): la sesión, nunca la URL, decide entre `LoginPage` y la app. `parsearRuta` sigue siendo total ⇒ todo lo no reconocido cae en `no-encontrada` dentro del shell. El mapa rol→items es presentación, no autorización: la única autorización sigue siendo `@Roles` server-side, que responde 403 aunque el enlace se vea | Sin sesión, `/` y `/procesos/nuevo` ⇒ `LoginPage`; `/procesos/nuevo/extra` ⇒ `no-encontrada` sin excepción; rol sin items ⇒ nav vacía sin crash |
| Clasificación de archivo activo | — | N/A: el change no sube ni sirve archivos | — |
| Selección de repositorio Git | — | N/A: el change no ejecuta Git | — |
| Estado de commit / de push | — | N/A: sin automatización de commits ni push | — |
| Comandos de PR | — | N/A: sin automatización de PR | — |

Sin shell, subprocesos ni integración de procesos.

## Migración / Rollout

Sin migración de datos ni feature flags. Único efecto observable en despliegue: los enlaces
externos o marcadores a `/` que antes abrían el asistente de proceso ahora abren la pantalla de
inicio, y el asistente pasa a `/procesos/nuevo`; no hay datos persistidos que dependan de esas
URLs. Rollback = revertir el/los commits (plan de la propuesta, sin efectos colaterales).

Presupuesto de PR: el change es frontend puro, ~6 archivos nuevos y ~6 modificados, con holgura
por debajo del presupuesto de 400 líneas ⇒ **un solo PR** salvo que `sdd-tasks` estime lo contrario.

## Preguntas abiertas

- [ ] Copy exacto de los placeholders (pregunta 1 de la propuesta): D5 fija la forma
      (`disabled` + texto "Próximamente", sin fecha); las etiquetas de las cuatro secciones de
      `#26` quedan por confirmar en `sdd-spec`.
- [ ] `comite` ve el placeholder "Académica" porque el backend le concede las lecturas
      (`@Roles('administrador','director','comite')` en los `GET`) pero no las escrituras;
      confirmar en `#26` si su pantalla será de sólo lectura o si el item debe desaparecer.
- [ ] Al mudar `proceso-nuevo` a `/procesos/nuevo`, cualquier enlace externo o documentación que
      apunte a `/` para crear un proceso queda desactualizado; verificar en `apply` que no haya
      referencias en plantillas de correo ni en `README`/`TECH-DESIGN.md`.
