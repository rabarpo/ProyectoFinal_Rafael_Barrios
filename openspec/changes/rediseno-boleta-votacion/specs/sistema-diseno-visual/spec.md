# Delta for sistema-diseno-visual

Cross-referencia: `DESIGN-SYSTEM.md` §Voting Progress Indicator, §Candidate Cards.

## ADDED Requirements

### Requirement: Instanciación del Voting Progress Indicator anticipado en el design system

El sistema MUST instanciar el "Voting Progress Indicator" ya anticipado en `DESIGN-SYSTEM.md`
como el componente concreto reutilizable `BarraProgresoVotacion` (barra lineal, sin etiquetas por
paso), estilizado únicamente con tokens ya definidos en `@theme` (color primario, tipografía,
espaciado, radios). El alcance de este requerimiento se limita al flujo de votación de 3 pasos; no
modifica el indicador textual ("Paso N de 4") ya especificado para `ProcesoWizardPage.tsx`.

#### Scenario: `BarraProgresoVotacion` usa únicamente tokens existentes
- GIVEN `BarraProgresoVotacion` renderizada en cualquiera de los 3 pasos del flujo de votación
- WHEN se inspeccionan sus clases Tailwind
- THEN todas mapean a tokens ya definidos en `@theme` (color primario, tipografía, espaciado o
  radios), sin introducir tokens nuevos

#### Scenario: El indicador del asistente de procesos (#11) no se modifica
- GIVEN `ProcesoWizardPage.tsx` con su indicador textual "Paso N de 4"
- WHEN se aplican los cambios de este change
- THEN el indicador textual del asistente permanece sin cambios — `BarraProgresoVotacion` es
  exclusiva del flujo de votación

### Requirement: Tarjetas de opción del Paso 2 siguen el patrón Candidate Cards

El sistema MUST aplicar el patrón "Candidate Cards" ya documentado en `DESIGN-SYSTEM.md` (borde
que engrosa + check al seleccionar) a las 4 tarjetas nuevas del Paso 2 (`TarjetaLista`,
`TarjetaCandidato`, `TarjetaOpcion`, `TarjetaVotoBlanco`), sin introducir un patrón de selección
visual alternativo.

#### Scenario: Selección de tarjeta usa el patrón Candidate Cards
- GIVEN cualquiera de las 4 tarjetas del Paso 2
- WHEN el votante la selecciona
- THEN el borde se engruesa y aparece el check, igual que el patrón "Candidate Cards" documentado

### Requirement: Sin filtración del nombre institucional del front-matter

El sistema MUST NOT filtrar el nombre `San Alfonso Academic Voting System` (front-matter de
`DESIGN-SYSTEM.md`) a ningún componente ni copy de los 3 pasos rediseñados — únicamente se
reutilizan paleta, tipografía y tokens genéricos.

#### Scenario: Ningún componente del flujo de votación menciona "San Alfonso"
- GIVEN los 3 componentes rediseñados (`PasoInformacionProceso`, `PasoBoleta`, `PanelComprobante`)
- WHEN se inspecciona su código y copy renderizado
- THEN no aparece la cadena "San Alfonso" en ningún texto ni atributo visible
