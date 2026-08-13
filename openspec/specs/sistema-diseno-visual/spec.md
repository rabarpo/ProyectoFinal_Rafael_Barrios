# Especificación: sistema-diseno-visual

## Purpose

Traducir `DESIGN-SYSTEM.md` a tokens Tailwind CSS v4 (`@theme` en `src/index.css`) y aplicarlos a
los 11 componentes existentes (login + asistente de proceso electoral, `#11`). Capacidad nueva:
infraestructura de estilos (tokens, fuente self-hosted) y su aplicación visual. Fuera de alcance:
componentes de candidatos/boleta (`#12`/`#14`) aún no implementados, dark mode, y cualquier cambio
de comportamiento, props o selectores de test de los componentes existentes.

## Requirements

### Requirement: Tokens de diseño vía `@theme` en Tailwind v4
El sistema MUST definir en `apps/frontend/src/index.css` un bloque `@theme` que traduzca de
`DESIGN-SYSTEM.md`: paleta de color, escala tipográfica (Hanken Grotesk), escala de `border-radius`
y escala de espaciado. El sistema MUST usar `institution-blue` (`#000066`) como fuente de verdad
del token `primary`, conforme a la corrección ya aplicada en el front-matter de
`DESIGN-SYSTEM.md`.

#### Scenario: El token `primary` resuelve a institution-blue
- GIVEN el bloque `@theme` en `src/index.css`
- WHEN se lee el valor de `--color-primary`
- THEN el valor es `#000066`

#### Scenario: La escala tipográfica expone las variantes documentadas
- GIVEN el bloque `@theme`
- WHEN se listan los tokens de tipografía definidos
- THEN existen variantes equivalentes a `display-lg`, `headline-lg`, `title-md`, `body-lg`,
  `body-md`, `label-md` y `caption` tal como las define `DESIGN-SYSTEM.md`

### Requirement: Hanken Grotesk self-hosted, sin CDN externo
El sistema MUST cargar la tipografía Hanken Grotesk mediante archivos de fuente vendorizados dentro
del build del frontend (`@font-face` apuntando a archivos locales), y MUST NOT depender de Google
Fonts ni de ninguna otra CDN externa de tipografía.

#### Scenario: No hay solicitud de red a un CDN de fuentes
- GIVEN la aplicación cargada en el navegador
- WHEN se inspeccionan las solicitudes de red generadas por la carga de fuentes
- THEN ninguna solicitud apunta a un dominio externo de fuentes (p. ej. `fonts.googleapis.com`,
  `fonts.gstatic.com`)
- AND los archivos de fuente se sirven desde el propio origen del build

#### Scenario: Pesos incluidos cubren los usos documentados
- GIVEN los archivos de fuente vendorizados
- WHEN se listan los pesos incluidos
- THEN incluyen al menos 400, 500, 600 y 700, correspondientes a los usos definidos en
  `DESIGN-SYSTEM.md`

### Requirement: Aplicación de tokens a los 11 componentes existentes
El sistema MUST aplicar clases de utilidad Tailwind derivadas de los tokens a los 11 componentes
existentes: `auth/{FormularioCredenciales,LoginPage,BotonGoogle,DialogoVinculacion}.tsx`,
`app/{AppShell,App}.tsx`, `procesos/ProcesoWizardPage.tsx` y
`procesos/pasos/{PasoDatos,PasoPublico,PasoPadron,PasoRevision}.tsx`. El sistema MUST limitar estos
cambios a la adición de `className` y estructura de layout estrictamente necesaria para aplicar
espaciado/tipografía; el sistema MUST NOT alterar props, lógica de negocio, ni el rol/label/texto
accesible de ningún elemento existente.

#### Scenario: Los 11 componentes usan tokens del design system
- GIVEN cada uno de los 11 componentes listados
- WHEN se inspecciona su JSX renderizado
- THEN al menos un elemento usa una clase Tailwind mapeada a un token de `@theme` (color,
  tipografía, radio o espaciado)

#### Scenario: Ningún componente cambia su rol o texto accesible
- GIVEN el árbol accesible de un componente antes y después de aplicar estilos
- WHEN se comparan roles, labels y textos expuestos
- THEN no hay diferencias

### Requirement: Indicador de progreso del asistente con tratamiento simple
El sistema MUST mostrar en `ProcesoWizardPage.tsx` un indicador de progreso textual ("Paso N de 4")
estilizado únicamente con tokens ya definidos en `@theme` (color primario, tipografía, espaciado).
El sistema MUST NOT introducir un componente visual de progreso (barra, stepper con círculos, etc.)
no documentado en `DESIGN-SYSTEM.md`.

#### Scenario: El wizard muestra el paso actual con tokens existentes
- GIVEN el asistente en el paso 2 de 4
- WHEN se renderiza el indicador de progreso
- THEN el texto mostrado es equivalente a "Paso 2 de 4"
- AND su estilo usa únicamente tokens ya definidos (color primario, tipografía, espaciado)

### Requirement: AppShell limitado a tokens de superficie sin branding nuevo
El sistema MUST aplicar a `AppShell.tsx` únicamente tokens de superficie, espaciado y tipografía al
header existente (rol del usuario y botón de logout). El sistema MUST NOT introducir un
placeholder de logo institucional ni ningún otro asset gráfico nuevo, dado que no existe un asset
de logo disponible.

#### Scenario: El header del AppShell usa tokens sin logo
- GIVEN el `AppShell` renderizado con un usuario autenticado
- WHEN se inspecciona el header
- THEN muestra el rol del usuario y el botón de logout estilizados con tokens del design system
- AND no incluye ningún elemento de logo o imagen de marca

### Requirement: Contenedor de BotonGoogle estilizado sin tocar el widget interno
El sistema MUST estilizar únicamente el contenedor/wrapper alrededor del widget de Google Identity
Services en `BotonGoogle.tsx` (espaciado, alineación, superficie circundante). El sistema MUST NOT
modificar, envolver con estilos forzados, ni intentar sobrescribir el renderizado interno del
widget de Google, que permanece bajo control exclusivo de Google Identity Services.

#### Scenario: El contenedor tiene estilos, el widget interno no se toca
- GIVEN `BotonGoogle.tsx` renderizado
- WHEN se inspecciona el DOM
- THEN el `div[data-testid="boton-google"]` (o su wrapper directo) tiene clases de estilo
  aplicadas
- AND ningún estilo se inyecta o fuerza dentro del subárbol que Google Identity Services controla

### Requirement: Cero regresión en la suite de tests existente
El sistema MUST mantener en verde la suite de tests existente (Vitest + Testing Library) tras
aplicar los cambios de este change, sin modificar ningún selector de test (`getByRole`,
`getByLabelText`, `getByText`) ni el comportamiento funcional de los componentes.

#### Scenario: La suite completa pasa sin cambios en los tests
- GIVEN la suite de tests existente antes de este change
- WHEN se ejecuta la suite completa después de aplicar los tokens y clases de estilo
- THEN todos los tests pasan sin que se haya modificado ningún archivo `*.spec.tsx`

#### Scenario: Un selector por rol sigue encontrando el mismo elemento
- GIVEN un test que usa `screen.getByRole('button', { name: /iniciar sesión/i })` (o equivalente)
- WHEN el componente correspondiente recibe clases de Tailwind
- THEN el selector sigue encontrando exactamente el mismo elemento
