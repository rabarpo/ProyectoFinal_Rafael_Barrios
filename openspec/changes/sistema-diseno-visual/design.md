# Diseño: sistema-diseno-visual (Backlog #24)

## Enfoque técnico

Una sola pieza de infraestructura —`apps/frontend/src/index.css`— concentra **todo** el sistema:
`@import "tailwindcss"`, un `@font-face` self-hosted y un bloque `@theme` que traduce el
front-matter de `DESIGN-SYSTEM.md` a variables de tema de Tailwind v4. No hay `tailwind.config.ts`,
no hay `postcss.config.js`, no hay `autoprefixer`: v4 con `@tailwindcss/vite` los vuelve
innecesarios (D1). Todo lo demás del change es **aditivo sobre el JSX existente**: `className` y, en
los pocos casos documentados en D4, un `<div>` de layout — cero cambios de props, de lógica, de
roles ARIA o de texto accesible.

El orden de entrega es infraestructura primero (los tokens no dependen de ningún componente) y luego
dos pasadas de aplicación, login/shell y asistente, que son independientes entre sí (ver "Corte de
PR recomendado").

Las cuatro decisiones de producto ya cerradas por el usuario entran como requisitos firmes y no se
re-litigan: fuente self-hosted (D2), `#000066` como `primary` (D3), indicador de progreso textual
(D5) y `AppShell` sin placeholder de logo (D7).

## Decisiones de arquitectura

### D1 — Tailwind CSS v4 vía `@tailwindcss/vite`, CSS-first, sin archivos de configuración

**Elección**: `tailwindcss@^4` + `@tailwindcss/vite@^4` como `devDependencies` de
`apps/frontend`; `tailwindcss()` agregado a `plugins` en `vite.config.ts` junto a `react()`;
`import './index.css'` en `main.tsx`.

| Alternativa | Veredicto |
|---|---|
| **Tailwind v4 + `@tailwindcss/vite` + `@theme`** | **Elegida** |
| Tailwind v4 + `@tailwindcss/postcss` | Obliga a crear `postcss.config.js` que hoy no existe, y pierde el pipeline nativo de Vite. **Descartada** |
| Tailwind v3 + `tailwind.config.ts` + PostCSS + autoprefixer | Dos archivos de config y una dependencia más para el mismo resultado; v3 es la mayor anterior y su `theme.extend` en JS es más verboso que `@theme`. **Descartada** |
| CSS variables a mano + clases BEM | Sin sistema de variantes (`hover:`, `focus-visible:`, `md:`) hay que escribir media queries y pseudo-clases a mano en 11 componentes. **Descartada** |
| CSS Modules / styled-components / Emotion | Ninguna existe en el repo; introducir runtime de CSS-in-JS en una SPA sin router es peso sin beneficio. **Descartada** |

**Confirmación de compatibilidad**: Vite 6 está dentro del rango soportado por `@tailwindcss/vite`
v4, y el `defineConfig` actual viene de `vitest/config`, que reexporta el de Vite — el plugin se
registra igual. **Vitest no se ve afectado**: `test.css` está en su valor por omisión (`false`), y
ningún `*.spec.tsx` importa un `.css`; el único importador de `index.css` será `main.tsx`, que no
tiene test. Los estilos no se evalúan en jsdom y no hacen falta para ninguna aserción existente.

**Costo aceptado**: v4 emite CSS moderno (`@property`, `color-mix()`, cascade layers) y exige
navegadores Chrome 111+/Safari 16.4+/Firefox 128+. Se acepta explícitamente: el despliegue objetivo
es institucional y actual, y ninguna otra parte del proyecto declara un piso de navegador más bajo.
Queda anotado en Preguntas abiertas.

### D2 — Hanken Grotesk: un woff2 variable vendorizado en el repo + `@font-face` propio

**Elección**: **un** archivo `apps/frontend/src/assets/fonts/HankenGrotesk-Variable.woff2`
(subconjunto `latin`, eje `wght` 100–900, sin itálica) commiteado al repo junto a su licencia
`OFL.txt`, declarado con un `@font-face` a nivel superior de `src/index.css`:

```css
@import 'tailwindcss';

@font-face {
  font-family: 'Hanken Grotesk';
  src: url('./assets/fonts/HankenGrotesk-Variable.woff2') format('woff2');
  font-weight: 100 900;   /* cubre 400/500/600/700 de la escala y cualquier peso futuro */
  font-style: normal;
  font-display: swap;
}
```

**Por qué `src/assets/` y no `public/fonts/`**: desde `src/`, Vite resuelve el `url()` en tiempo de
build — un archivo faltante o mal nombrado **rompe el build** en vez de producir un 404 silencioso
en producción — y emite el asset con hash de contenido, apto para caché inmutable. En `public/` la
ruta es una cadena sin verificar y sin fingerprint.

**Por qué `@font-face` y no `@theme`**: `@theme` solo declara variables de tema; no puede declarar
una `@font-face`. El puente entre ambos es una sola línea del `@theme`: `--font-sans`.

**Por qué a nivel superior y no dentro de `@layer base`**: ambas funcionan, pero `@font-face` fuera
de toda capa elimina cualquier duda de orden de cascada; es una at-rule declarativa, no una regla
que compita por especificidad.

**Por qué variable y no cuatro estáticos**: un archivo, una petición, cubre los cuatro pesos que
`DESIGN-SYSTEM.md` usa (400 body, 500 title-md, 600 headline/label, 700 display) y también los que
`#12`/`#14` pidan después, sin tocar el CSS. La verificación del requisito "pesos ≥ 400/500/600/700"
se hace contra el rango declarado `font-weight: 100 900`, que los contiene — esto queda escrito acá
para que `sdd-verify` no lo lea como incumplimiento.

| Alternativa | Veredicto |
|---|---|
| **woff2 variable vendorizado + `@font-face` propio** | **Elegida** |
| `@fontsource-variable/hanken-grotesk` (npm) | También es self-hosted y se actualiza con el lockfile, pero mete una dependencia de runtime y esconde el `@font-face` en `node_modules`: la propiedad "cero CDN" deja de ser auditable leyendo un archivo. **Descartada** |
| Cuatro woff2 estáticos (400/500/600/700) | Cuatro peticiones y cuatro bloques `@font-face` para cubrir menos casos que uno variable. **Descartada** |
| Google Fonts CDN (`<link>` en `index.html`) | **Vetada por el usuario** y por la spec: dependencia de red externa y excepción de CSP en un entorno institucional |
| `woff` / `ttf` de respaldo | Todo navegador que soporta el CSS que emite v4 (D1) soporta woff2. Peso muerto. **Descartada** |

**Obligación de licencia**: Hanken Grotesk es OFL 1.1; el `OFL.txt` viaja junto al archivo en
`src/assets/fonts/`. No se renombra la familia.

### D3 — Mapeo de tokens: qué se declara, y qué deliberadamente **no** se redeclara

El `@theme` de `src/index.css` es la única traducción de `DESIGN-SYSTEM.md`. Regla de nombres:
**fidelidad 1:1 con el front-matter**, para que la trazabilidad doc → token sea mecánica y
auditable.

#### Color — las 52 claves de `colors`, 1:1

Cada clave `k: v` del front-matter se declara como `--color-k: v`. Con eso `primary` resuelve a
`#000066` (requisito de la spec, ya corregido en el front-matter) y las utilidades quedan como
`bg-primary`, `text-on-surface`, `border-border-gray`, `bg-surface-container-low`, etc.

**No se resetea el namespace** (`--color-*: initial`): la paleta por defecto de v4 queda disponible.
Resetearla exigiría redeclarar `white`/`black` y rompería `text-white` sin ganancia real en una
superficie de 11 componentes; la disciplina se sostiene por revisión, no por ausencia de utilidades.

**Cuatro trampas del front-matter que este diseño fija por escrito** (mismo tipo de artefacto de
exportación Material que ya tenía `primary: #000000`):

| Clave | Problema | Regla para la implementación |
|---|---|---|
| `outline: #767683` | La prosa dice que el borde de 1px es `#D1D5DB`, que es `border-gray`, **no** `outline` | El hairline se escribe `border border-border-gray`. `--color-outline` se declara por fidelidad pero **no se usa** en este change |
| `tertiary: #000000` | La prosa dice "Tertiary (Teal)"; el teal real vive en `on-tertiary-container`/`tertiary-fixed` | Se declara 1:1 y **no se usa**: el teal es para chips/badges, que son `#12`/`#14`. Ver Preguntas abiertas |
| `secondary: #b41d11` vs `academic-red: #990000` | La prosa manda `#990000` para botones secundarios | Ninguno de los 11 componentes necesita botón secundario sólido; ambos se declaran, ninguno se usa. Ver Preguntas abiertas |
| `background: #f9f9f9` vs prosa `#F2F2F2` | Discrepancia de fondo de página | **Gana el front-matter** (`#f9f9f9`), por el mismo criterio con que el usuario resolvió `primary` ahí |

#### Tipografía — ocho variantes con sus defaults acoplados

```css
@theme {
  --font-sans: 'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif;

  --text-display-lg: 48px;
  --text-display-lg--line-height: 56px;
  --text-display-lg--font-weight: 700;
  --text-display-lg--letter-spacing: -0.02em;

  --text-headline-lg: 32px;
  --text-headline-lg--line-height: 40px;
  --text-headline-lg--font-weight: 600;

  --text-headline-lg-mobile: 24px;
  --text-headline-lg-mobile--line-height: 32px;
  --text-headline-lg-mobile--font-weight: 600;

  --text-title-md: 20px;
  --text-title-md--line-height: 28px;
  --text-title-md--font-weight: 500;

  --text-body-lg: 18px;
  --text-body-lg--line-height: 28px;
  --text-body-lg--font-weight: 400;

  --text-body-md: 16px;
  --text-body-md--line-height: 24px;
  --text-body-md--font-weight: 400;

  --text-label-md: 14px;
  --text-label-md--line-height: 20px;
  --text-label-md--font-weight: 600;
  --text-label-md--letter-spacing: 0.01em;

  --text-caption: 12px;
  --text-caption--line-height: 16px;
  --text-caption--font-weight: 400;
}
```

Los sufijos `--line-height`/`--font-weight`/`--letter-spacing` son la sintaxis de v4 para acoplar
defaults a un tamaño: `text-label-md` aplica los cuatro valores de una sola clase. Eso es lo que
hace innecesario repetir `font-semibold tracking-wide` en cada uso y lo que mantiene el JSX legible.

**`--font-sans` es global sin una sola `className`**: el preflight de v4 aplica la familia a `html`
a través de `--default-font-family`, que apunta a `--font-sans`. Si la versión instalada no lo
cableara así, la corrección es una regla explícita —`@layer base { html { font-family:
var(--font-sans); } }`— y no un pase de `font-sans` por 11 componentes.

**Escalado móvil** (`DESIGN-SYSTEM.md`, "Scaling"): patrón mobile-first
`text-headline-lg-mobile md:text-headline-lg` en los `<h1>`/`<h2>`. `md:` = 768px, el corte
tablet/mobile del propio documento.

#### Forma, espaciado, elevación y contenedor

```css
@theme {
  --radius-control: 0.25rem;   /* botones e inputs (prosa: "4px radius") */
  --radius-card: 0.5rem;       /* tarjetas y bloques instructivos (prosa: "8px") */
  --shadow-elevation: 0 4px 20px rgb(0 0 102 / 0.08);
  --container-page: 80rem;     /* spacing.max-width = 1280px */
}
```

**Lo que NO se declara, y por qué eso es la decisión correcta**:

| Token de `DESIGN-SYSTEM.md` | Ya existe en v4 | Utilidad a usar |
|---|---|---|
| `spacing.base: 4px` | `--spacing: 0.25rem` es el default de v4 — **valor idéntico** | `p-4` = 16px, `gap-6` = 24px, escala entera arbitraria |
| `gutter-desktop: 24px` / `gutter-mobile: 16px` | — | `gap-4 md:gap-6` |
| `margin-desktop: 48px` / `margin-mobile: 20px` | — | `px-5 md:px-12` |
| `max-width: 1280px` | `--container-7xl: 80rem` | alias semántico `max-w-page` (arriba) |
| `rounded.sm: 0.125` … `xl: 0.75` | v4 ya trae `xs .125 / sm .25 / md .375 / lg .5 / xl .75` | la escala completa **ya está**, solo corrida una etiqueta en el extremo chico |
| `rounded.full: 9999px` | `rounded-full` | tal cual |

Redeclarar `--radius-sm: 0.125rem` para copiar la etiqueta v3 del documento haría que `rounded-sm`
signifique en este repo algo distinto de lo que dice la documentación de v4 que se va a consultar —
una trampa permanente a cambio de cero valor. Por eso el aporte propio son **dos alias semánticos**
(`control`, `card`) que expresan la intención de la prosa, y la escala numérica se deja intacta.
Idéntico criterio con `--spacing`: el 4px del documento **ya es** el default de v4; declararlo de
nuevo sería ruido.

#### Patrones compuestos derivados de la prosa (contrato para la fase de aplicación)

| Patrón | Clases |
|---|---|
| Contenedor de página | `mx-auto w-full max-w-page px-5 md:px-12` |
| Tarjeta / bloque | `rounded-card bg-surface-white shadow-elevation p-6` |
| Input | `w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary` |
| Etiqueta de campo | `text-label-md text-on-surface-variant` (encima del campo, prosa "labels placed above") |
| Botón primario | `rounded-control bg-primary px-6 py-3 text-label-md text-on-primary disabled:opacity-50` |
| Botón terciario (texto) | `rounded-control px-4 py-3 text-label-md text-primary` — "Anterior", "Cancelar" |
| Mensaje `role="alert"` | `text-label-md text-error` |
| Fondo de app | `bg-background text-on-surface` |

El foco de 2px azul de la prosa se implementa con `focus-visible:outline-2 focus-visible:outline-primary`
—`focus-visible` y no `focus`— para no dibujar el anillo en clics de mouse.

### D4 — Contrato de no-ruptura: qué se puede tocar, qué no, y con qué evidencia

La exploración concluyó que agregar `className` es seguro porque los tests seleccionan por
rol/label/texto. Es cierto **en general**, pero la lectura de los specs encontró **dos aserciones
concretas que sí restringen la estructura**, y son requisitos de diseño, no advertencias:

| Evidencia | Restricción que impone |
|---|---|
| `BotonGoogle.spec.tsx:29` — `expect(container).toBeEmptyDOMElement()` sin `VITE_GOOGLE_CLIENT_ID` | El `return null` **debe seguir siendo el primer return**. Envolver el componente en un `<div>` de layout rompería el fail-closed de D10 de `#11`. Ver D6 |
| `ProcesoWizardPage.spec.tsx:33,87,136,142` — `getByRole('radio', { name: /^estudiantes$/i })`, `/^aulas$/i`, `/^padres de familia$/i` | Regex **anclados** sobre el nombre accesible, que se calcula con el texto del `<label>` que envuelve al radio. Está permitido envolver el texto en un `<span>`; está **prohibido** agregar cualquier texto nuevo dentro de esos `<label>` (ayudas, contadores, iconos con texto alternativo) |

Reglas generales que se derivan del resto de la evidencia:

1. **Envolver `label` + `input` en un `<div>` es seguro**: la asociación es por `htmlFor`/`id`
   (`useId()`), no por proximidad en el DOM. Aplica a `FormularioCredenciales`,
   `DialogoVinculacion`, `PasoDatos` y a los tres campos condicionales de `PasoPublico` —
   estos últimos hoy son fragmentos `<>…</>` y pasan a ser `<div className="…">`, que es
   exactamente el "wrapper nuevo" que la spec autoriza como "estructura de layout estrictamente
   necesaria".
2. **`role`, `aria-label`, `htmlFor`, `id`, `name`, `type`, `data-testid` y todo texto visible se
   preservan byte a byte.** En particular `role="dialog" aria-label="Vincular cuenta de Google"`
   sigue en el **mismo** elemento (`DialogoVinculacion.tsx:23`), que ahora además es la tarjeta.
3. **`AppShell.tsx:17` — `<span>Rol: {rol}</span>` no se parte en dos elementos.**
   `AppShell.spec.tsx:31` usa `getByText(/director/i)`; partirlo funcionaría hoy, pero deja el
   texto disperso sin necesidad. Se estiliza el `<span>` tal cual.
4. **Ningún `*.spec.tsx` se modifica en este change.** Si un test falla, el cambio de estilo se
   corrige; el test no.
5. **Cero cambios de props, firmas, hooks, `useReducer`, efectos o llamadas de red.** El diff de
   los 11 componentes debe ser, salvo los wrappers de esta tabla, atributos `className` y saltos de
   línea de formato.

### D5 — Indicador de progreso: `<p>Paso N de 4</p>`, ni heading ni stepper

**Elección**: en `ProcesoWizardPage.tsx`, encima del contenido del paso,
`<p className="text-label-md text-primary">Paso {estado.paso} de 4</p>`.

| Alternativa | Veredicto |
|---|---|
| **Texto simple con tokens existentes** | **Elegida** — decisión de producto ya cerrada por el usuario |
| Barra de progreso lineal | La prosa la describe para el **flujo de votación**, no para el asistente de administración; sería inventar un componente para una pantalla que el documento no cubre |
| Stepper con círculos numerados | No documentado en `DESIGN-SYSTEM.md`. Prohibido por la spec |

**Por qué `<p>` y no `<h2>`/`<h1>`**: `ProcesoWizardPage.spec.tsx:53,69` usa
`getByRole('heading', { name: … })`; introducir un heading nuevo agrega ruido al árbol de headings
por una etiqueta que es metadato, no título. Tampoco lleva `aria-live`: el cambio de paso ya
reemplaza todo el contenido y el foco, y un anuncio extra sería redundante.

### D6 — `BotonGoogle`: `className` sobre el `div` que ya existe, cero wrapper, cero selectores descendientes

**Elección**: se agrega `className` **al mismo** `<div ref={contenedorRef} data-testid="boton-google">`
(`BotonGoogle.tsx:22`) y no se crea ningún elemento nuevo.

**Fundamento**: (a) el `return null` previo debe seguir siendo lo primero que pasa cuando falta
`VITE_GOOGLE_CLIENT_ID`, por la aserción `toBeEmptyDOMElement` de D4 — un wrapper que envolviera al
componente entero lo rompería; (b) el subárbol de ese `div` lo escribe Google Identity Services
mediante `renderButton`, y su marcado no es contrato público.

**Prohibiciones explícitas para la implementación**, que la spec exige y este diseño concreta:

- Nada de variantes descendientes (`[&>div]:…`, `[&_iframe]:…`) ni CSS global apuntando dentro del
  contenedor.
- Nada de `width`/`transform`/`filter`/`scale` sobre el contenedor para "estirar" el botón: el ancho
  del widget se configura por la opción `width` de `renderButton` en `useGoogleIdentity.ts`, que
  **este change no toca**.
- Solo se permiten margen, padding, y alineación del propio contenedor (`flex justify-center`,
  `mt-*`), más un separador visual "o" entre el formulario y el botón, que vive en `LoginPage`, no
  acá.

### D7 — `AppShell`: superficie, espaciado y tipografía; sin logo, sin navegación

`<header>` pasa a `border-b border-border-gray bg-surface-white`, con contenedor de página
(`mx-auto w-full max-w-page px-5 md:px-12`), el rol en `text-label-md text-on-surface-variant` y
"Cerrar sesión" como botón terciario. `<main>` recibe el mismo contenedor más ritmo vertical
(`py-10 md:py-12`), y el `<div>` raíz toma `min-h-screen bg-background text-on-surface`.

**Sin placeholder de logo** — decisión de producto ya cerrada: no existe asset institucional y un
recuadro gris vacío es peor que la ausencia. Sin navegación ni menú: sigue fuera de alcance por la
propuesta de `#11`.

### D8 — Dónde vive el layout: el contenedor de página se repite, no se abstrae

**Elección**: el patrón `mx-auto w-full max-w-page px-5 md:px-12` se escribe literal en `AppShell`
y en `LoginPage` (las dos únicas raíces de pantalla), **sin** crear un componente `Container` ni una
clase de componente con `@apply`.

**Fundamento**: dos usos no justifican una abstracción, y las dos alternativas tienen costo real —
un componente `Container` es un archivo nuevo fuera de la lista de 11 que la spec fija, y `@apply`
mueve la definición del layout del JSX a un CSS que ya no se puede leer junto al marcado. Cuando
`#12`–`#17` agreguen la tercera y cuarta pantalla, esa es la señal para extraerlo. Se documenta acá
para que no se relitigue en cada PR.

## Flujo de datos — cómo llega un token desde el documento hasta el pixel

    DESIGN-SYSTEM.md          src/index.css                 Vite + @tailwindcss/vite        Navegador
     front-matter (YAML)   │                              │                              │
       colors ────────────>│ @theme { --color-*: … }      │                              │
       typography ────────>│ @theme { --text-*: … }       │                              │
       rounded/spacing ───>│ (ya cubiertos por v4 — D3)   │                              │
                           │ @font-face → ./assets/fonts/*.woff2                          │
                           │                              │                              │
     JSX className="bg-primary text-body-md rounded-card"  │                              │
                           │                              │─ escanea src/**/*.tsx ──────>│
                           │                              │─ emite CSS + woff2 con hash ─>│
                           │                              │                              │
     main.tsx ── import './index.css' ────────────────────>│                              │
                           │                              │  preflight: html { font-family: var(--font-sans) }
                           │                              │  ⇒ Hanken Grotesk global sin className (D3)

    Vitest (jsdom): test.css = false ⇒ ningún .css se procesa; los estilos no existen en
    el DOM de prueba y ninguna aserción por rol/label/texto los necesita (D1).

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/frontend/package.json` | Modificar | `tailwindcss` y `@tailwindcss/vite` (`^4`) en `devDependencies` |
| `apps/frontend/vite.config.ts` | Modificar | `tailwindcss()` en `plugins`, junto a `react()`; `server.proxy` y el bloque `test` intactos |
| `apps/frontend/src/index.css` | Crear | `@import "tailwindcss"` + `@font-face` (D2) + `@theme` completo (D3) |
| `apps/frontend/src/assets/fonts/HankenGrotesk-Variable.woff2` | Crear | Fuente self-hosted, subconjunto `latin`, eje `wght` 100–900 (binario, no cuenta al presupuesto de líneas) |
| `apps/frontend/src/assets/fonts/OFL.txt` | Crear | Licencia OFL 1.1 que acompaña al archivo de fuente |
| `apps/frontend/src/main.tsx` | Modificar | `import './index.css'` — única línea |
| `apps/frontend/src/index.css.spec.ts` | Crear | Test de tokens y de "cero CDN" (ver Estrategia de pruebas) |
| `apps/frontend/src/app/AppShell.tsx` | Modificar | D7 |
| `apps/frontend/src/app/App.tsx` | Modificar | Solo si la composición necesita una clase de raíz; si no, queda sin cambios y se documenta |
| `apps/frontend/src/auth/LoginPage.tsx` | Modificar | Contenedor centrado + tarjeta + separador "o" antes de `BotonGoogle` |
| `apps/frontend/src/auth/FormularioCredenciales.tsx` | Modificar | `<div>` por par label+input (D4.1), input/botón con patrones de D3 |
| `apps/frontend/src/auth/DialogoVinculacion.tsx` | Modificar | Tarjeta sobre el mismo `div[role=dialog]`; fila de botones |
| `apps/frontend/src/auth/BotonGoogle.tsx` | Modificar | `className` sobre el `div` existente (D6) |
| `apps/frontend/src/procesos/ProcesoWizardPage.tsx` | Modificar | Tarjeta del asistente, `<p>Paso N de 4</p>` (D5), barra de navegación |
| `apps/frontend/src/procesos/pasos/PasoDatos.tsx` | Modificar | Campos apilados con patrón de input |
| `apps/frontend/src/procesos/pasos/PasoPublico.tsx` | Modificar | `fieldset`/`legend` estilizados; fragmentos condicionales → `<div>` (D4.1); **sin texto nuevo dentro de los `<label>` de radio** (D4) |
| `apps/frontend/src/procesos/pasos/PasoPadron.tsx` | Modificar | Cifras y desglose por aula con escala tipográfica |
| `apps/frontend/src/procesos/pasos/PasoRevision.tsx` | Modificar | `dl/dt/dd` en grilla, checkbox alineado, botón primario |
| `openspec/changes/sistema-diseno-visual/tasks.md` | Crear | Fase `sdd-tasks` |

**Archivos que NO se crean, deliberadamente**: `tailwind.config.ts`, `postcss.config.js`,
`.postcssrc`, componente `Container`, hoja de clases con `@apply`. **Archivo que NO se toca**:
`apps/frontend/index.html` — no lleva `<link>` de fuente porque no hay CDN (D2).

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Tokens (RED primero) | `src/index.css` declara `--color-primary: #000066`; existen `--text-display-lg`, `--text-headline-lg`, `--text-title-md`, `--text-body-lg`, `--text-body-md`, `--text-label-md`, `--text-caption`; `--shadow-elevation` contiene `0 4px 20px`; `--font-sans` empieza por `'Hanken Grotesk'` | Vitest lee el archivo con `readFileSync` y afirma sobre el texto — no necesita DOM ni build |
| Cero CDN (RED, adversarial) | Ningún archivo de `apps/frontend/src/**` ni `index.html` contiene `fonts.googleapis.com`, `fonts.gstatic.com` ni `@import url(http`; el `@font-face` apunta a una ruta relativa `./assets/fonts/`; el `.woff2` referenciado **existe en disco** | Vitest + `readFileSync`/`existsSync` |
| Pesos de fuente | El bloque `@font-face` declara `font-weight: 100 900`, rango que contiene 400/500/600/700 | Misma spec de tokens |
| Regresión (la prueba principal) | La suite completa de `apps/frontend` pasa **sin que ningún `*.spec.tsx` cambie** | `pnpm --filter @seei/frontend test` tras cada componente |
| Componente (invariantes de D4) | `BotonGoogle` sin `VITE_GOOGLE_CLIENT_ID` sigue dejando el `container` vacío; `getByRole('radio', { name: /^estudiantes$/i })` sigue resolviendo; `role="dialog"` con su `aria-label` sigue en un solo elemento | Los specs **ya existentes**, sin tocar |
| Componente (nuevo) | En el paso 2, `getByText(/paso 2 de 4/i)` está presente; el indicador **no** aparece como `heading` (`queryByRole('heading', { name: /paso 2 de 4/i })` es `null`) | Vitest + Testing Library, único test nuevo de componente |
| Build | `pnpm --filter @seei/frontend build` termina sin error y el `dist` incluye un `.woff2` con hash; `pnpm --filter @seei/frontend typecheck` limpio | Scripts existentes |
| A11y (manual, por PR) | Contraste de `on-primary` sobre `primary` y de `on-surface-variant` sobre `surface-white`; el foco es visible con teclado en cada input y botón | Revisión manual documentada en la descripción del PR |

## Matriz de amenazas

N/A — este change no toca enrutamiento, shell, subprocesos, automatización de VCS/PR, clasificación
de archivos ejecutables ni integración de procesos. No agrega superficie de red ni de datos: es CSS
y `className`.

Dos notas de postura que **mejoran** respecto del estado actual y quedan registradas: (a) la fuente
self-hosted evita agregar `fonts.googleapis.com`/`fonts.gstatic.com` como orígenes nuevos, así que
la futura CSP sigue teniendo un único origen de tercero, `accounts.google.com/gsi/client` (D10 de
`#11`); (b) D6 prohíbe explícitamente inyectar estilos dentro del subárbol de Google Identity
Services, con lo que ninguna regla de este change puede alterar lo que el usuario ve al autenticar.

## Migración / rollout

No hay migración: sin schema, sin datos, sin feature flag, sin variables de entorno nuevas.

| # | Paso | Verificación |
|---|---|---|
| R1 | `pnpm install` tras agregar las dos devDeps | `pnpm --filter @seei/frontend build` compila |
| R2 | Colocar el `.woff2` y el `OFL.txt` antes de mergear `index.css` | Si falta el archivo, el build **falla** (D2) — señal deseada |
| R3 | Desplegar frontend | En DevTools → Network, `.woff2` servido desde el propio origen y **ninguna** petición a un dominio de fuentes |
| R4 | Recorrido manual | Login → shell → los 4 pasos del asistente, en viewport 375px y 1440px |

**Rollback**: `git revert` del PR correspondiente. Cada PR de aplicación es independiente y revertir
uno solo deja esos componentes sin estilo pero **funcionalmente idénticos** (degradación elegante a
HTML semántico). Revertir el PR de infraestructura sin revertir los de aplicación deja `className`
sin hoja de estilos: inofensivo en runtime, pero el orden de reversión es el inverso al de entrega.

## Corte de PR recomendado (insumo para `sdd-tasks`)

Presupuesto de 400 líneas autoradas (`additions + deletions`), estrategia `ask-on-risk`. Cadena de
ramas: PR1 apunta a la rama de feature; cada PR siguiente apunta al anterior. Los binarios de fuente
no cuentan al presupuesto pero sí a la identidad del snapshot.

| PR | Contenido | Estimación | Riesgo de presupuesto |
|---|---|---|---|
| 1 | **Cimientos**: devDeps, `tailwindcss()` en `vite.config.ts`, `src/index.css` completo (`@font-face` + `@theme`), `.woff2` + `OFL.txt`, `import './index.css'` en `main.tsx`, spec de tokens y de cero-CDN | ~230 | Bajo |
| 2 | **Login y shell**: `AppShell`, `App`, `LoginPage`, `FormularioCredenciales`, `DialogoVinculacion`, `BotonGoogle` (D6, D7) | ~250 | Bajo |
| 3 | **Asistente, parte 1**: `ProcesoWizardPage` (tarjeta, navegación, indicador `Paso N de 4` + su test), `PasoDatos`, `PasoPublico` | ~290 | **Medio** |
| 4 | **Asistente, parte 2**: `PasoPadron`, `PasoRevision`, pasada responsive final y revisión de contraste/foco de las cuatro pantallas | ~180 | Bajo |

**Decision needed before apply: No**
**Chained PRs recommended: Yes**
**400-line budget risk: Low**

**Por qué este corte y no otro**: PR1 es la única pieza que los demás necesitan y es puramente
aditiva (ningún componente cambia todavía, así que la suite entera debe seguir verde por
construcción — el mejor control posible de que Tailwind no rompió nada). PR2 y PR3/PR4 tocan
carpetas disjuntas (`auth/`+`app/` vs `procesos/`) y **podrían revisarse en paralelo**; se encadenan
igual para que cada diff se lea contra el estado inmediatamente anterior. El asistente se parte en
dos porque sus cinco archivos suman 502 líneas de origen y una pasada de estilos toca la mayoría:
en un solo PR el diff superaría el presupuesto.

**Cortes de respaldo si algún PR se pasa**: sacar `DialogoVinculacion` + `BotonGoogle` del PR2 a un
PR propio (son el flujo de Google y se revisan juntos, igual que en `#11`); sacar `PasoPublico` del
PR3 (es el archivo más grande, 139 líneas, con `fieldset` y tres campos condicionales).

**Dependencia de orden**: PR2, PR3 y PR4 **no pueden mergear antes del PR1** — sin `@theme` las
clases no existen y el resultado visual sería HTML sin estilo con `className` muerto.

## Preguntas abiertas

- [ ] **Piso de navegador.** Tailwind v4 exige Chrome 111+ / Safari 16.4+ / Firefox 128+ (D1). El
      proyecto no declara compatibilidad de navegadores en ninguna parte. Si el laboratorio de la
      institución corre equipos con navegadores más viejos, la decisión debe revisarse antes del PR1
      (la salida sería Tailwind v3, no un polyfill).
- [ ] **`tertiary: #000000` contra la prosa "Tertiary (Teal)"** — mismo tipo de artefacto de
      exportación que tenía `primary`. Este change lo declara 1:1 y no lo usa, pero `#12`/`#14`
      necesitan el teal para chips/badges y van a chocar con esto. Corregir el front-matter en el
      change que introduzca esos componentes.
- [ ] **`secondary: #b41d11` contra `academic-red: #990000`** — la prosa manda `#990000` para
      botones secundarios. Ningún componente actual usa botón secundario sólido, así que la decisión
      se difiere; hay que tomarla cuando aparezca la primera acción destructiva o de "acción
      académica".
- [ ] **`background: #f9f9f9` contra la prosa `#F2F2F2`.** Se resolvió a favor del front-matter por
      consistencia con la corrección de `primary`, pero conviene que el usuario confirme cuál era la
      intención visual real al ver la app renderizada (R4 del rollout).
- [ ] **`AuthGuard.tsx` queda sin estilizar.** Renderiza el estado `cargando` y **no está** en la
      lista de 11 componentes que fija la spec, así que ese estado se verá como texto plano. Es un
      hueco visual conocido y deliberado; agregarlo exigiría ampliar la spec.
- [ ] **`HealthPage.tsx` sigue sin estilo** — pantalla de diagnóstico fuera del shell (D8 de `#11`),
      fuera de alcance a propósito.
- [ ] **Sin herramienta de regresión visual ni storybook** (fuera de alcance por la propuesta): la
      verificación de que "se ve bien" es manual por PR. A partir de `#14` conviene evaluarlo.
