# Design: Fidelidad visual de la boleta de votación

## Enfoque técnico

Corrección de fidelidad sobre lo ya entregado por `rediseno-boleta-votacion` (#31, archivado
2026-08-24). Tres frentes, en orden de dependencia:

1. **Backend aditivo**: un campo opcional en `ComprobanteDto` (`periodo_lectivo`), poblado en un
   único lugar (`VotosService.construirComprobante()`), del que ya cuelgan los dos caminos del
   comprobante. Sin tocar `emitir()`, la transacción, la idempotencia, el `UNIQUE`, la validación
   del derecho al voto, ni `schema.prisma`.
2. **Frontend Paso 1 y Paso 2**: nuevas piezas presentacionales (`iconos-reglas.tsx`,
   `BannerInstrucciones`, `BotonSeleccion`) y reescritura de layout de `PasoInformacionProceso` y
   las 4 tarjetas.
3. **Frontend Paso 3**: `PanelComprobante` gana período lectivo, indicador estático y dos acciones.

**No requiere ADR nuevo.** Se respetan ADR-0001 (monolito modular: `votos` lee `AnioEscolar` vía
`PrismaService`, sin dependencia nueva entre módulos Nest), ADR-0004 (el campo viaja por el
contrato OpenAPI regenerado, no por un tipo escrito a mano en el frontend) y ADR-0010 (el secreto
del voto no se toca: `AnioEscolar.nombre` es configuración institucional pública, no elección).

**Desviación aceptada, cerrada por el usuario**: se mantiene el `AppShell`/sidebar de #25. La
navegación de header+tabs de las capturas NO se reproduce. `AppShell.tsx`,
`NavegacionPrincipal.tsx` y `menu-por-rol.ts` no se tocan en ninguna PR de este change.

---

## Decisiones de arquitectura

### D1 — El `<input type="radio" className="sr-only">` se conserva; el botón sólido ES su `<label>`

**Elección.** El botón sólido de selección no es un `<button>`: es un `<label>` estilizado como
botón que **contiene** el mismo `<input type="radio" name="eleccion" className="sr-only">` que hoy
vive en la tarjeta. Se extrae a una pieza compartida `BotonSeleccion` que las 4 tarjetas consumen,
para que el contrato ARIA viva en un solo archivo y no pueda divergir entre variantes. Lo que
cambia respecto de hoy es **el alcance del `<label>`**: deja de envolver toda la tarjeta y envuelve
solo el botón. El radiogroup, el `name` compartido y el radio nativo quedan intactos.

**Alternativa rechazada**: mover `role="radio"` + `aria-checked` a un `<button>` real y eliminar el
`<input>`.

**Fundamento**:

- **Navegación por teclado (el argumento decisivo)**. Con `role="radio"` en un `<button>`, el
  navegador no aporta nada: la APG de WAI-ARIA exige *roving tabindex* (un solo `tabIndex=0` en el
  grupo) y manejo manual de `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` con wrap-around, más
  `Space` para seleccionar. Ese manejador tendría que vivir en `PasoBoleta` (es quien conoce el
  orden y la longitud de la lista, incluida la tarjeta de blanco al final) y coordinar refs hacia 4
  componentes hijos distintos — código nuevo, con su propia suite de tests, para reimplementar algo
  que hoy el navegador ya da gratis por `name="eleccion"` compartido. Conservando el `<input>`,
  flechas, wrap-around, `Space`, anuncio de "N de M" en lectores de pantalla y el estado
  `:checked` siguen siendo nativos, con cero código.
- **Costo en los tests**: mínimo y localizado. `getByRole('radio')`, `toBeChecked()`,
  `fireEvent.click(radio)` y `radio.closest('label')` siguen funcionando tal cual. Las aserciones
  actuales de `TarjetaLista.spec.tsx:88-94` (`name="eleccion"`, clase `sr-only`, dentro de un
  `<label>`), `TarjetaCandidato.spec.tsx:34`, `TarjetaOpcion.spec.tsx:25` y `TarjetaLista.spec.tsx:57-74`
  ("Ver Propuesta Completa" es hermano del `<label>` y no marca el radio) **pasan sin
  modificación** — de hecho el patrón nuevo las refuerza, porque el botón outline queda todavía más
  lejos del `<label>`. Con la alternativa de `<button role="radio">`, las cinco specs de tarjeta
  más `PasoBoleta.spec.tsx` se reescriben enteras.
- **Foco visible**: el `<input>` con `sr-only` sí recibe foco. El anillo se pinta sobre el label con
  `has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-offset-2`
  (Tailwind 4 ya está en el repo, `^4.1.10`). No se usa `focus-within` porque también dispara con
  click de mouse.

**Único cambio de contrato observable**: el nombre accesible. Hoy `aria-label={opcion.etiqueta}`.
Con un texto visible genérico ("Seleccionar Candidato") repetido en todas las tarjetas, dejar el
`aria-label` en solo la etiqueta viola WCAG 2.5.3 (*Label in Name*): el nombre accesible debe
contener el texto visible. Regla nueva, aplicada en `BotonSeleccion`:

| Variante | Texto visible del botón | `aria-label` del radio |
|---|---|---|
| `TarjetaLista` | `Seleccionar Lista` | `Seleccionar Lista: {etiqueta}` |
| `TarjetaCandidato` | `Seleccionar Candidato` | `Seleccionar Candidato: {etiqueta}` |
| `TarjetaOpcion` | `Seleccionar esta Opción` | `Seleccionar esta Opción: {etiqueta}` |
| `TarjetaVotoBlanco` | `Votar en Blanco` | `Votar en Blanco` (ya es único, sin sufijo) |

Ediciones de test que esto obliga (lista cerrada, 6 líneas):

- `VotacionPage.spec.tsx:84` — `{ name: 'Lista A' }` → `{ name: /lista a/i }`.
- `PasoBoleta.spec.tsx:139` — idem.
- `PasoBoleta.spec.tsx:105` y `TarjetaVotoBlanco.spec.tsx:12,18,23` — `/voto en blanco/i` →
  `/votar en blanco/i` (el título visible de la tarjeta sigue siendo "Voto en Blanco", así que los
  `getByText('Voto en Blanco')` no cambian).
- `VotacionPage.spec.tsx:127` (`{ name: /blanco/i }`) sigue matcheando: no se toca.

El indicador `✓` y el `border-2 border-primary` de estado seleccionado se conservan tal cual
(`TarjetaLista.spec.tsx:76-86` pasa sin cambios); el `✓` se reubica junto a la cinta/badge de la
tarjeta, no dentro del botón.

### D2 — `periodo_lectivo` se resuelve en `construirComprobante()`, no en `ComprobanteService`

**Elección.** Una cuarta lectura dentro del `Promise.all` ya existente de
`VotosService.construirComprobante()`:

```ts
this.prisma.anioEscolar.findFirst({
  where: { activo: true },
  orderBy: { nombre: 'desc' },   // determinismo: `activo` no tiene índice único parcial
  select: { nombre: true },
}),
```

y `periodo_lectivo: anioActivo?.nombre` en el objeto de retorno.

**`comprobante.service.ts` no se modifica**, y eso es el punto: `ComprobanteService.obtener()` ya
delega el armado del DTO en `construirComprobante()` (líneas 37-43), así que el camino de relectura
autenticada hereda el campo sin lógica propia. Mismo criterio de fuente única que ya documenta su
propio comentario de cabecera ("delega … en vez de duplicarlo").

**Alternativas rechazadas**: (a) resolverlo en el controlador o en cada servicio — duplicaría la
regla en dos lugares que pueden divergir; (b) unir `AnioEscolar` con `ProcesoElectoral`/`Voto` — no
existe esa relación en el schema y el campo no depende del voto sino del año escolar vigente al
momento de consultar.

**Ausencia de año activo**: `findFirst` devuelve `null` → `periodo_lectivo` queda `undefined` → el
campo se omite del JSON y `PanelComprobante` no renderiza la fila. No se lanza excepción: un estado
de configuración inconsistente no puede impedirle a un votante ver el comprobante de un voto que ya
está emitido. `orderBy` explícito porque `activo` es `Boolean @default(false)` sin restricción de
unicidad — con dos filas activas, `findFirst` sin orden es no determinístico entre ejecuciones.

**Contrato**: `@ApiPropertyOptional({ type: String })` (mismo idioma explícito de `type` que el
resto de `comprobante.dto.ts`, por el incidente de *circular dependency* de `@nestjs/swagger`
documentado en `papeleta.dto.ts`). Requiere regenerar `packages/contracts`; el frontend recibe el
campo tipado sin escribir nada a mano (ADR-0004).

### D3 — "Estado del Sistema: Sincronizado" es decorativo y se marca como tal en el código

**Elección.** Texto fijo en `PanelComprobante`, sin campo en el DTO, sin condicional. El punto de
color va `aria-hidden="true"`; el par etiqueta/valor sí se lee ("Estado del Sistema: Sincronizado").
Comentario obligatorio en el componente: *sin fuente de verdad — no verifica conectividad ni
replicación; si algún día existe un mecanismo real, este literal debe reemplazarse, no envolverse
en un condicional falso.*

**Alternativa rechazada**: agregar un `ok: true` de conectividad al backend solo para respaldar la
palabra. Sería un dato tautológico (si la respuesta llegó, hubo conectividad) que da falsa
sensación de verificación por un costo de contrato real.

**Fundamento**: decisión de producto ya cerrada por el usuario. El riesgo de "informar un estado no
verificado" queda documentado acá y en la spec, no oculto en el código.

### D4 — Hero del Paso 1: overlay sobre `GET /configuracion/logo`, con degradado y sin desaparecer

**Elección.** Contenedor `relative` con `aspect-[4/3] overflow-hidden rounded-card`; dentro,
`<img src={urlLogo()} className="absolute inset-0 h-full w-full object-cover">`, encima un
`bg-gradient-to-t from-primary/90 via-primary/30 to-transparent` y, sobre eso, el texto
institucional en `text-on-primary`. El texto es copy estático genérico SEEI (no lleva nombre de
institución) — no hay campo de backend para él y no se agrega uno.

**Cambio respecto de hoy**: con `onError` (logo no persistido → 404), en vez de ocultar la imagen
como hace hoy `PasoInformacionProceso.tsx:47`, se **conserva el bloque** y se pinta `bg-primary`
sólido detrás del degradado. Así el hero y su texto nunca desaparecen y el layout de dos columnas
no se rompe. Se mantiene `urlLogo()` sin versión (D4 de #31: un logo cacheado tras un reemplazo es
un desvío puramente cosmético).

**Alternativa rechazada**: un campo `imagen_hero` nuevo en `ProcesoElectoral` — amplía el alcance a
schema + subida de archivo + endpoint, fuera de un change de fidelidad visual.

### D5 — Íconos: SVG inline propios, no una librería nueva

**Elección.** Nuevo archivo `apps/frontend/src/votos/piezas/iconos-reglas.tsx`, con el mismo
`baseProps` de `app/iconos-menu.tsx` (`viewBox 0 0 24 24`, `fill none`, `stroke currentColor`,
`strokeWidth 1.75`, `aria-hidden`) y firma `SVGProps<SVGSVGElement>`. Tres íconos:
`IconoVotoSecreto` (escudo con candado), `IconoUnaSolaVez` (cuadro redondeado con "1"),
`IconoIrreversible` (círculo con signo de exclamación). Un cuarto, `IconoInformacion` (círculo con
"i"), para el banner del Paso 2, y `IconoProhibido` (círculo tachado) para `TarjetaVotoBlanco`.

**Alternativa rechazada**: instalar `lucide-react`/`heroicons`. No hay ninguna librería de íconos en
`apps/frontend/package.json`; el repo ya resolvió esto dos veces con SVG inline self-hosted
(`auth/iconos.tsx`, `app/iconos-menu.tsx`) y el comentario de cabecera de `iconos-menu.tsx` lo
declara convención ("SVG inline self-hosted, sin CDN"). Agregar una dependencia por 5 glifos
contradice esa convención y suma peso de bundle.

### D6 — Banner del Paso 2: estático, sin dato de proceso

**Elección.** Pieza nueva `BannerInstrucciones` (sin props), montada por `PasoBoleta` entre el
título y el `role="radiogroup"`. Caja `rounded-card bg-primary p-4 text-on-primary` con
`IconoInformacion` a la izquierda, título `Instrucciones de Votación` (`text-label-md`) y un
párrafo `text-body-md text-on-primary/90`. No lleva `role="alert"` ni `role="status"`: es contenido
estático presente desde el montaje, no un anuncio dinámico — un live region acá interrumpiría al
lector de pantalla sin motivo.

**Fundamento de que sea estático**: el texto es la regla del dominio ("una sola opción", "revisá las
propuestas antes de confirmar"), idéntica para los 3 tipos de proceso. Parametrizarlo por `tipo`
sería inventar variación donde el dominio no la tiene. El copy usa voseo, como el resto de la UI
del módulo (`Elegí tu opción`, `Podés emitir tu voto`).

### D7 — `PanelComprobante` sigue siendo presentacional puro: las acciones entran por props

**Elección.** Dos props nuevas obligatorias, `onVolverAlInicio: () => void` y
`onCerrarSesion: () => void`. Los 2 call sites las cablean:
`VotacionPage.tsx:191` y `ComprobantePage.tsx:80` pasan
`navegar({ nombre: 'inicio' })` y `logout()` de `useSesion()`.

**Alternativa rechazada**: llamar `useSesion()`/`navegar()` dentro de `PanelComprobante`. Rompería
la pureza que su propio comentario de cabecera declara y obligaría a envolver las 6 pruebas de
`PanelComprobante.spec.tsx` en un provider de sesión y un mock de enrutador.

**Nota**: `AppShell` ya tiene "Cerrar sesión" en el header. El botón del comprobante es una
duplicación deliberada de la referencia (atajo en el punto de salida natural del flujo), no un
mecanismo nuevo: usa exactamente el mismo `contexto.logout()`.

### D8 — Tokens de `DESIGN-SYSTEM.md` por pieza

Nada fuera de la paleta ya definida. Ningún hex literal en el código.

| Pieza | Color | Tipografía | Forma / sombra |
|---|---|---|---|
| Badge "Proceso Activo" (P1) | `bg-primary-fixed text-on-primary-fixed` | `text-label-md` | `rounded-full px-3 py-1` |
| Hero (P1) | `bg-primary` de respaldo + `from-primary/90 via-primary/30`, texto `text-on-primary` | `text-title-md` | `rounded-card aspect-[4/3]` |
| Tarjeta de regla (P1) | `bg-surface-white border-border-gray`, ícono `text-primary` | `text-title-md` / `text-body-md text-on-surface-variant` | `rounded-card p-4 shadow-elevation` |
| Tarjeta "Proceso Irreversible" (P1) | ícono y título `text-secondary`, borde `border-secondary/30` | idem | idem (rojo académico de uso moderado, §"Secondary (Red) … sparingly") |
| Footer (P1) | `bg-surface-container-low text-on-surface-variant` | `text-caption` | `border-t border-border-gray` |
| Banner instrucciones (P2) | `bg-primary text-on-primary` | `text-label-md` + `text-body-md` | `rounded-card p-4` |
| Cinta "Lista N°" (P2) | `bg-secondary text-on-secondary` | `text-label-md` | `rounded-control px-2 py-1`, posicionada `absolute` sobre la foto |
| Botón outline "Ver Propuesta Completa" (P2) | `border-border-gray text-primary bg-surface-white` | `text-label-md` | `rounded-control px-4 py-3` |
| `BotonSeleccion` (P2) | `bg-primary text-on-primary hover:bg-primary-container` | `text-label-md` | `rounded-control px-4 py-3 w-full` |
| Ícono circular voto en blanco (P2) | `bg-surface-container text-on-surface-variant` | — | `rounded-card h-16 w-16` |
| Bloque "Detalles de la transacción" (P3) | `bg-surface-container-low`, etiquetas `text-on-surface-variant` | `text-caption` (etiqueta) / `text-body-md` (valor) | `rounded-card p-4` |
| Punto "Sincronizado" (P3) | `text-on-tertiary-fixed-variant`, punto `bg-tertiary-fixed-dim` | `text-body-md` | `rounded-full h-2 w-2` |
| "Volver al Inicio" (P3) | `bg-primary text-on-primary` | `text-label-md` | `rounded-control px-4 py-3` |
| "Cerrar Sesión" (P3) | `border-secondary text-secondary bg-surface-white` | `text-label-md` | `rounded-control px-4 py-3` |
| Grilla de tarjetas (P2) | — | — | `grid gap-4 md:grid-cols-3` (hoy `space-y-3`; la referencia es de 3 columnas) |

Se reusan sin cambios: `BarraProgresoVotacion`, `max-w-page`, `px-5 md:px-12`, el badge
`yaRegistrado` (`bg-secondary/10 text-secondary`) y el ícono de check `bg-tertiary-fixed`.

---

## Flujo de datos

Selección en el Paso 2 — el `id` notificado sigue siendo `opcion.id`, nunca `opcion.candidato_id`
(invariante D6 de #31, intacta):

```
usuario ─click/Space/flecha─→ <input radio sr-only>  (dentro de <label> = BotonSeleccion)
                                      │ onChange
                                      ▼
                            Tarjeta*.onSeleccionar()
                                      │
                                      ▼
                     PasoBoleta.seleccionarOpcion(opcion.id)
                                      │ onSeleccionar({tipo:'opcion', id})
                                      ▼
                        VotacionPage  ─ estado `seleccion` ─→ (vuelve como prop `seleccionada`)

"Ver Propuesta Completa": <button> HERMANO del <label> ──→ onVerPropuesta ──→ window.open(...)
                          (no propaga al radio — invariante ya cubierta por TarjetaLista.spec.tsx:57)
```

Período lectivo — los dos caminos convergen en un solo lugar:

```
POST /votos            ──→ VotosService.emitir() ──→ construirComprobante()  ┐
GET /votos/comprobante ──→ ComprobanteService.obtener() ──→ construirComprobante() ┘
                                                              │
                                       Promise.all([ derechoVoto, procesoElectoral,
                                                     voto, anioEscolar{activo:true} ])
                                                              │
                                              ComprobanteDto.periodo_lectivo?: string
                                                              │
                                          PanelComprobante ── render condicional
```

---

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/src/votos/dto/comprobante.dto.ts` | Modify | `@ApiPropertyOptional` `periodo_lectivo?: string` |
| `apps/backend/src/votos/votos.service.ts` | Modify | 4ª lectura en el `Promise.all` de `construirComprobante()` (D2) |
| `apps/backend/src/votos/comprobante.service.ts` | — | **Sin cambios** (hereda vía delegación, D2) |
| `packages/contracts/src/generated/api.ts` | Regenerate | `pnpm openapi:extract` |
| `apps/frontend/src/votos/piezas/iconos-reglas.tsx` | Create | 5 SVG inline (D5) |
| `apps/frontend/src/votos/piezas/BotonSeleccion.tsx` | Create | `<label>`-botón con el radio sr-only (D1) |
| `apps/frontend/src/votos/piezas/BannerInstrucciones.tsx` | Create | Caja azul estática (D6) |
| `apps/frontend/src/votos/piezas/PasoInformacionProceso.tsx` | Modify | Badge, hero con overlay, reglas con ícono, footer (D4/D5/D8) |
| `apps/frontend/src/votos/piezas/PasoBoleta.tsx` | Modify | Monta el banner; grilla de 3 columnas; hint junto a "Siguiente Paso" |
| `apps/frontend/src/votos/piezas/TarjetaLista.tsx` | Modify | Foto arriba + cinta "Lista" + outline + `BotonSeleccion` |
| `apps/frontend/src/votos/piezas/TarjetaCandidato.tsx` | Modify | Idem, sin botón de propuesta |
| `apps/frontend/src/votos/piezas/TarjetaOpcion.tsx` | Modify | Sin foto, con `BotonSeleccion` |
| `apps/frontend/src/votos/piezas/TarjetaVotoBlanco.tsx` | Modify | Ícono circular + `BotonSeleccion` |
| `apps/frontend/src/votos/piezas/PanelComprobante.tsx` | Modify | Período lectivo, estado estático, 2 acciones (D3/D7) |
| `apps/frontend/src/votos/VotacionPage.tsx` | Modify | Cablea `onVolverAlInicio`/`onCerrarSesion` |
| `apps/frontend/src/votos/ComprobantePage.tsx` | Modify | Idem + `useSesion()` |
| `*.spec.ts(x)` de los anteriores | Modify | Ver "Estrategia de tests" |

---

## Interfaces / Contratos

```ts
// apps/backend/src/votos/dto/comprobante.dto.ts
@ApiPropertyOptional({ type: String })
periodo_lectivo?: string;   // AnioEscolar.nombre del año activo; ausente si no hay ninguno (D2)
```

```tsx
// apps/frontend/src/votos/piezas/BotonSeleccion.tsx — único dueño del contrato ARIA (D1)
interface BotonSeleccionProps {
  texto: string;        // texto visible, p. ej. 'Seleccionar Candidato'
  etiqueta?: string;    // sufijo distintivo; omitido cuando `texto` ya es único (voto en blanco)
  seleccionada: boolean;
  onSeleccionar: () => void;
}
// render: <label class="...bg-primary... has-[:focus-visible]:outline-2 ...">
//           <input type="radio" name="eleccion" class="sr-only"
//                  aria-label={etiqueta ? `${texto}: ${etiqueta}` : texto}
//                  checked={seleccionada} onChange={onSeleccionar} />
//           {seleccionada ? 'Seleccionado' : texto}
//         </label>
```

```tsx
// PanelComprobante.tsx
interface ComprobanteResumen {
  codigo_comprobante: string;
  hora_servidor: string;
  eleccion_resumen: string;
  periodo_lectivo?: string;   // nuevo
}
interface PanelComprobanteProps {
  comprobante: ComprobanteResumen;
  yaRegistrado?: boolean;
  onVolverAlInicio: () => void;   // nuevo, obligatorio
  onCerrarSesion: () => void;     // nuevo, obligatorio
}
```

---

## Estrategia de tests (TDD activo, `rules.apply.tdd: true`)

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit backend | `construirComprobante()` puebla `periodo_lectivo` con el `nombre` del año activo | `votos.service.spec.ts`: mock de `anioEscolar.findFirst` → `{nombre:'2026'}` |
| Unit backend | Sin año activo, el campo se omite y el resto del DTO sale íntegro | `findFirst` → `null`; assert `periodo_lectivo === undefined` y `codigo_comprobante` presente |
| Unit backend | El camino de relectura autenticada trae el campo sin lógica propia | `comprobante.service.spec.ts`: assert que el DTO devuelto lo incluye (prueba la delegación, D2) |
| Unit frontend (a11y) | `BotonSeleccion` expone `role="radio"`, `name="eleccion"`, `sr-only`, dentro de `<label>` | `BotonSeleccion.spec.tsx` nuevo — RED primero |
| Unit frontend (a11y) | El nombre accesible contiene el texto visible (WCAG 2.5.3) | `getByRole('radio', { name: 'Seleccionar Candidato: Ana Pérez' })` |
| Unit frontend (a11y) | `fireEvent.click` en el radio dispara `onSeleccionar` una vez | por variante de tarjeta |
| Unit frontend (a11y) | "Ver Propuesta Completa" NO marca el radio | `TarjetaLista.spec.tsx:57-74` se conserva **verbatim** (regresión clave) |
| Unit frontend | `PasoBoleta` conserva `role="radiogroup" aria-label="Opciones de la boleta"` y monta el banner | `PasoBoleta.spec.tsx:109-122` se conserva; test nuevo para el banner |
| Unit frontend | Paso 1: badge, hero visible aun con logo 404 (`fireEvent.error` en el `<img>`), 3 reglas con ícono, footer | `PasoInformacionProceso.spec.tsx` |
| Unit frontend | Paso 3: fila "Período Lectivo" presente con valor / ausente sin valor; "Sincronizado" siempre; 2 botones invocan sus handlers | `PanelComprobante.spec.tsx` |
| Integración frontend | `VotacionPage` y `ComprobantePage` siguen renderizando el comprobante en ambos caminos, con `yaRegistrado` intacto | specs existentes + ajuste de las nuevas props |
| Regresión | `votos.service.spec.ts` de `emitir()`/idempotencia/`UNIQUE`/derecho al voto **no se modifica** | criterio de aceptación explícito del change |
| Branding | `grep -ri "san alfonso" apps/` sobre los archivos tocados, antes de cerrar cada PR | checklist manual, igual que #31 |

---

## Threat Matrix

**N/A** — el change no toca enrutamiento del servidor, comandos de shell, subprocesos, automatización
de VCS/PR, clasificación de archivos ejecutables ni integración de procesos. Notas de frontera, por
completitud:

- **Autorización**: no se agrega ningún endpoint. `GET /votos/comprobante/:votoId` conserva su
  autorización por pertenencia y su `403` idéntico para voto ajeno/inexistente (D11 de #15).
- **Exposición de datos**: `AnioEscolar.nombre` es configuración institucional pública, no vinculada
  a `Voto`/`DerechoVoto`; no abre ningún canal hacia la elección emitida (ADR-0010).
- **Enumeración**: la lectura de `AnioEscolar` no toma ningún identificador del cliente.

---

## Slicing en PRs (presupuesto 400 líneas `additions + deletions`, sin contar contratos generados)

Cadena de 5 PRs sobre la rama larga, en este orden. `packages/contracts/src/generated/api.ts` es
artefacto generado: entra en la snapshot pero no en el presupuesto de líneas de autor.

| PR | Alcance | Archivos | Estimado | Riesgo de presupuesto |
|---|---|---|---|---|
| **PR1** | Backend período lectivo (D2) | `comprobante.dto.ts`, `votos.service.ts`, `votos.service.spec.ts`, `comprobante.service.spec.ts`, contratos regenerados | ~110 | Bajo |
| **PR2** | Paso 1 completo (D4/D5/D8) | `iconos-reglas.tsx` (nuevo), `PasoInformacionProceso.tsx`, su spec | ~280 | Medio |
| **PR3** | Contrato de interacción + banner (D1/D6) — **la PR de riesgo** | `BotonSeleccion.tsx` (nuevo) + spec, `BannerInstrucciones.tsx` (nuevo) + spec, `TarjetaVotoBlanco.tsx` + spec, `PasoBoleta.tsx` (banner, grilla, hint) + spec | ~300 | Medio |
| **PR4** | Adopción del patrón en las 3 tarjetas restantes | `TarjetaLista.tsx`, `TarjetaCandidato.tsx`, `TarjetaOpcion.tsx` y sus 3 specs, + 2 líneas en `VotacionPage.spec.tsx` | ~330 | Medio-alto |
| **PR5** | Paso 3 (D3/D7) | `PanelComprobante.tsx` + spec, `VotacionPage.tsx`, `ComprobantePage.tsx` y sus specs | ~190 | Bajo |

**Por qué PR3 y PR4 se separan.** El riesgo del change es el modelo de interacción, no las tres
reescrituras de layout. PR3 aísla ese riesgo en una pieza nueva (`BotonSeleccion`) validada de punta
a punta contra la tarjeta **más simple** (`TarjetaVotoBlanco`, sin foto, sin cinta, sin botón
outline) y con el `radiogroup` de `PasoBoleta` ya migrado — si la semántica ARIA se rompe, se ve en
un diff chico y revisable. PR4 es entonces mecánico: aplicar un patrón ya probado, y ahí sí concentra
el layout (foto arriba, cinta, doble botón). Fundirlas daría ~630 líneas, sobre presupuesto y con el
riesgo de accesibilidad mezclado con ruido de estilos.

**Autonomía de cada slice**: PR1 despliega y funciona sola (`periodo_lectivo` simplemente no se
muestra todavía). PR2 es independiente de las otras cuatro. PR3 deja el Paso 2 coherente (banner +
grilla + una tarjeta con el patrón nuevo, las otras tres con el viejo — ambas funcionan porque
comparten `name="eleccion"`). PR5 depende de PR1 para que el campo exista.

**Rollback**: `git revert` por PR. Ninguna depende de migración de base de datos.

`Decision needed before apply: No`
`Chained PRs recommended: Yes`
`400-line budget risk: Medium`

---

## Migración / Despliegue

Sin migración. `AnioEscolar.activo` ya existe en `schema.prisma:95`; no hay cambio de schema ni de
datos. Requisito operativo: el despliegue de PR1 debe incluir los contratos regenerados
(`pnpm openapi:extract`) o el frontend de PR5 no compilará contra `ComprobanteDto`. El campo es
opcional, así que un backend viejo con un frontend nuevo degrada de forma limpia (la fila no se
renderiza).

---

## Preguntas abiertas

- [ ] Copy exacto del texto superpuesto del hero (Paso 1) y del footer. La referencia usa frases con
      nombre de institución; se necesita una redacción genérica SEEI equivalente. Propuesta por
      defecto si no hay indicación: *"Tu voz construye el futuro. Participar en la democracia escolar
      es el primer paso para liderar con responsabilidad."* — sin mención institucional.
- [ ] Confirmar que la grilla de 3 columnas del Paso 2 (`md:grid-cols-3`) es aceptable para procesos
      con muchas opciones; con `>6` opciones la referencia no muestra comportamiento. Se asume
      wrapping natural de la grilla, sin paginación.
