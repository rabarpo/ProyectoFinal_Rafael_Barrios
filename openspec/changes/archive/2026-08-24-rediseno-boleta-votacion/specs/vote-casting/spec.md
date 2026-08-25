# Delta for vote-casting

Cross-referencia: `PRD.md` §Votación, `Design.md` §Boleta de 3 pasos, `DESIGN-SYSTEM.md`
§Candidate Cards / Voting Progress Indicator.

## ADDED Requirements

### Requirement: Barra de progreso lineal compartida entre los 3 pasos

El sistema MUST renderizar `BarraProgresoVotacion` (componente presentacional puro, props
`pasoActual`/`totalPasos`) en los 3 pasos del flujo de votación, controlado exclusivamente por el
componente padre (`VotacionPage`) — nunca por estado local de cada paso. El sistema MUST NOT
duplicar la lógica de progreso entre pasos.

#### Scenario: La barra refleja el paso actual en cada uno de los 3 pasos
- GIVEN el votante en el paso 2 de 3 del flujo de votación
- WHEN se renderiza `PasoBoleta`
- THEN `BarraProgresoVotacion` recibe `pasoActual=2`, `totalPasos=3` desde `VotacionPage`

#### Scenario: El mismo componente se reutiliza en los 3 pasos
- GIVEN los 3 componentes de paso (`PasoInformacionProceso`, `PasoBoleta`, `PanelComprobante`)
- WHEN se inspecciona su árbol renderizado
- THEN los 3 instancian `BarraProgresoVotacion`, sin una implementación de progreso alternativa
  en ninguno de ellos

### Requirement: Paso 1 con reglas de votación e imagen institucional

El sistema MUST mostrar en `PasoInformacionProceso` 3 tarjetas de reglas (voto secreto, una sola
vez, proceso irreversible), la imagen institucional obtenida de `GET /configuracion/logo`, y un
botón "Comenzar Votación" que avanza al paso 2. El sistema MUST NOT agregar un campo nuevo de
portada a `ProcesoElectoral` — la imagen proviene exclusivamente de Configuración General (#10).

#### Scenario: Paso 1 muestra las 3 reglas y el logo institucional
- GIVEN un votante que ingresa al flujo de votación de un proceso abierto
- WHEN se renderiza `PasoInformacionProceso`
- THEN se muestran exactamente 3 tarjetas de reglas (secreto, única vez, irreversible)
- AND se muestra la imagen obtenida de `GET /configuracion/logo`

#### Scenario: Sin logo institucional configurado, el paso 1 no rompe
- GIVEN un proceso cuya institución no tiene logo persistido (`GET /configuracion/logo` responde
  `404`)
- WHEN se renderiza `PasoInformacionProceso`
- THEN el paso se renderiza sin la imagen, sin error visible, y el botón "Comenzar Votación"
  permanece funcional

### Requirement: Variantes de tarjeta del Paso 2 según tipo de proceso

El sistema MUST renderizar en `PasoBoleta` una de 3 variantes de tarjeta según `tipo` del proceso
electoral (recibido en `PapeletaDto.proceso.tipo`): tarjeta de Lista (`municipio`) con foto del
candidato cabeza de lista, símbolo, lema, propuesta corta y botón "Ver Propuesta Completa"
condicionado a `plan_trabajo_presente`; tarjeta de Candidato (`representante_aula`/`padres`) con
foto, nombres y cargo, sin botón de propuesta; tarjeta de Opción simple (`consulta`) con etiqueta
y descripción, sin foto. El sistema MUST mostrar la tarjeta de "Voto en Blanco" como opción
adicional distintiva en las 3 variantes.

#### Scenario: Proceso `municipio` renderiza tarjetas de Lista
- GIVEN un `PapeletaDto` con `proceso.tipo = 'municipio'` y sus opciones de tipo `Lista`
- WHEN se renderiza `PasoBoleta`
- THEN cada tarjeta muestra la foto del candidato cabeza de lista, símbolo, lema y propuesta corta
- AND el botón "Ver Propuesta Completa" aparece únicamente cuando `plan_trabajo_presente = true`

#### Scenario: Proceso `representante_aula`/`padres` renderiza tarjetas de Candidato
- GIVEN un `PapeletaDto` con `proceso.tipo = 'representante_aula'` (o `padres`)
- WHEN se renderiza `PasoBoleta`
- THEN cada tarjeta muestra foto, nombres y cargo del candidato
- AND ninguna tarjeta ofrece el botón "Ver Propuesta Completa"

#### Scenario: Proceso `consulta` renderiza tarjetas de Opción simple
- GIVEN un `PapeletaDto` con `proceso.tipo = 'consulta'`
- WHEN se renderiza `PasoBoleta`
- THEN cada tarjeta muestra únicamente etiqueta y descripción, sin foto

#### Scenario: Voto en Blanco presente en las 3 variantes, nunca preseleccionado
- GIVEN cualquiera de las 3 variantes de proceso
- WHEN se renderiza `PasoBoleta`
- THEN existe una tarjeta adicional distintiva de "Voto en Blanco"
- AND ninguna tarjeta (incluida la de Voto en Blanco) aparece marcada como seleccionada al cargar
  el paso (D14 de #14: sin estado inicial implícito)

### Requirement: Convención determinística de candidato cabeza de lista

El sistema MUST derivar el candidato cabeza de lista mostrado en la tarjeta de Lista como el
primer `Candidato` activo de esa `Lista` ordenado por `nombres asc` (mismo criterio de
`CandidatosService.listar()`). Esta convención de desempate estable MUST NOT interpretarse ni
documentarse como una designación real de "líder de lista" en el dominio — es exclusivamente un
criterio de selección de imagen para la tarjeta.

#### Scenario: Selección determinística entre varios candidatos activos
- GIVEN una `Lista` con 3 `Candidato` activos con nombres "Beltrán", "Ana", "Carlos"
- WHEN `PapeletaService` construye la opción de esa lista
- THEN el candidato mostrado como cabeza de lista es "Ana" (primer `nombres asc`)

#### Scenario: Lista sin candidatos activos no rompe la tarjeta
- GIVEN una `Lista` sin ningún `Candidato` activo asociado
- WHEN `PapeletaService` construye la opción de esa lista
- THEN la tarjeta se renderiza sin foto de candidato, sin error

## MODIFIED Requirements

### Requirement: Boleta mobile-first de 3 pasos con voto en blanco explícito

El sistema MUST implementar los pasos información → boleta → confirmación. El paso 2 MUST ofrecer
el voto en blanco como opción marcable explícita, presentada como tarjeta adicional distintiva
junto a las tarjetas de Lista/Candidato/Opción según el `tipo` del proceso; "Continuar" MUST
permanecer deshabilitado sin selección. El sistema MUST NOT inferir voto en blanco de la ausencia
de selección.
(Previously: sin especificar la presentación visual de "Voto en Blanco" como tarjeta ni las
variantes de tarjeta por tipo de proceso.)

#### Scenario: Voto en blanco explícito
- GIVEN un votante que marca la opción de voto en blanco en el paso 2
- WHEN confirma en el paso 3
- THEN se crea `Voto` con `blanco = true` y el resto de columnas de elección en `null`

### Requirement: Ningún cambio de comportamiento en la escritura del voto

El sistema MUST mantener sin modificar la transacción de `VotosService.emitir()`, sus mecanismos
de idempotencia, la restricción `UNIQUE (proceso_id, derecho_voto_id)` y la validación del derecho
al voto ya especificados en este mismo spec (Requirements de escritura arriba). Este change es
exclusivamente de datos de lectura enriquecidos (`PapeletaOpcionDto`) y presentación; MUST NOT
alterar ningún test existente de `VotosService.emitir()`.

#### Scenario: Los 19 tests de `emitir()` pasan sin modificación
- GIVEN la suite existente de `VotosService.emitir()` (19 tests, backlog #14)
- WHEN se aplican los cambios de este change
- THEN los 19 tests pasan sin que se haya modificado su código de test ni el de `emitir()`
