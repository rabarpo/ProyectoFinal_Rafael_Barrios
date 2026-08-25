# Delta for Emisión del voto

## ADDED Requirements

### Requirement: Campo `periodo_lectivo` en el comprobante

El sistema MUST agregar `periodo_lectivo?: string` a `ComprobanteDto`, poblado por
`VotosService.construirComprobante()` y `ComprobanteService.obtener()` con el `nombre` del
`AnioEscolar` que tenga `activo = true`. El sistema MUST NOT unir esta lectura con `Voto` ni
`DerechoVoto` — depende únicamente del año escolar vigente al momento de la consulta. Si no existe
ningún `AnioEscolar` activo, el sistema MUST omitir el campo (`undefined`) en vez de fallar la
respuesta del comprobante.

#### Scenario: Existe un `AnioEscolar` activo
- GIVEN un `AnioEscolar` con `activo = true` y `nombre = "2026"`
- WHEN se construye el comprobante de un voto emitido
- THEN `ComprobanteDto.periodo_lectivo` es `"2026"`

#### Scenario: Ningún `AnioEscolar` activo no rompe el comprobante
- GIVEN que ningún `AnioEscolar` tiene `activo = true`
- WHEN se construye el comprobante de un voto emitido
- THEN la respuesta sigue siendo `201`/`200` con el resto de campos completos
- AND `periodo_lectivo` está ausente (`undefined`), no `null` fabricado

### Requirement: Banner de instrucciones en el Paso 2

El sistema MUST mostrar en `PasoBoleta` un banner estático de instrucciones (caja destacada) sobre
la grilla de tarjetas, previo a cualquier selección. El banner MUST NOT condicionar ni bloquear la
interacción con las tarjetas ni con "Continuar".

#### Scenario: El banner se muestra al entrar al paso 2
- GIVEN un votante que avanza del paso 1 al paso 2
- WHEN se renderiza `PasoBoleta`
- THEN el banner de instrucciones se muestra sobre la grilla de tarjetas
- AND ninguna tarjeta ni el botón "Continuar" quedan bloqueados por su presencia

### Requirement: Modelo de interacción foto+cinta+doble botón con semántica ARIA preservada

El sistema MUST renderizar `TarjetaLista`, `TarjetaCandidato`, `TarjetaOpcion` y
`TarjetaVotoBlanco` con el patrón: foto/ícono grande arriba, cinta de identificación (lista/badge),
botón outline "Ver Propuesta Completa" (cuando aplique) y botón sólido explícito de selección. El
`radiogroup` que envuelve la grilla MUST mantenerse. El botón sólido de selección de cada tarjeta
MUST llevar el rol `radio` (o disparar el mismo cambio de estado que hoy dispara el click sobre el
`<label>`) y MUST ser el único elemento enfocable por la navegación de flechas del grupo. El botón
"Ver Propuesta Completa" MUST NOT llevar el rol `radio` ni ser alcanzable por esa navegación de
flechas — se activa solo por tab/click independiente, sin alterar la opción seleccionada.

#### Scenario: El botón sólido dispara la selección igual que antes el click en la tarjeta
- GIVEN una tarjeta sin seleccionar dentro del `radiogroup` del paso 2
- WHEN el votante activa (click o Enter/Espacio) el botón sólido de selección de esa tarjeta
- THEN esa tarjeta queda marcada como seleccionada, igual que antes lo hacía el click en el `<label>`

#### Scenario: "Ver Propuesta Completa" no interfiere con la navegación de flechas del grupo
- GIVEN el foco posicionado en el botón sólido de selección de una tarjeta del `radiogroup`
- WHEN el votante presiona la flecha derecha/abajo
- THEN el foco avanza al botón sólido de selección de la siguiente tarjeta del grupo
- AND el botón "Ver Propuesta Completa" nunca recibe el foco por esa navegación

#### Scenario: `TarjetaVotoBlanco` con ícono circular y botón dedicado
- GIVEN cualquiera de las 3 variantes de proceso en el paso 2
- WHEN se renderiza la tarjeta de Voto en Blanco
- THEN muestra un ícono circular distintivo y un botón dedicado "Votar en Blanco" que participa del
  mismo `radiogroup` con rol `radio`

## MODIFIED Requirements

### Requirement: Paso 1 con reglas de votación e imagen institucional

El sistema MUST mostrar en `PasoInformacionProceso` un badge de estado del proceso, una imagen hero
grande con texto superpuesto (obtenida de `GET /configuracion/logo`, misma fuente ya usada — MUST
NOT agregar un campo nuevo de portada a `ProcesoElectoral`), 3 tarjetas de reglas con ícono (voto
secreto, una sola vez, proceso irreversible), un footer, y un botón "Comenzar Votación" que avanza
al paso 2.
(Previously: solo mostraba las 3 tarjetas de reglas sin ícono, la imagen institucional como logo
chico centrado, sin badge de estado ni footer.)

#### Scenario: Paso 1 muestra badge, hero con texto superpuesto, reglas con ícono y footer
- GIVEN un votante que ingresa al flujo de votación de un proceso abierto
- WHEN se renderiza `PasoInformacionProceso`
- THEN se muestra el badge de estado del proceso, la imagen hero con texto superpuesto obtenida de
  `GET /configuracion/logo`, exactamente 3 tarjetas de reglas con ícono, y el footer

#### Scenario: Sin logo institucional configurado, el paso 1 no rompe
- GIVEN un proceso cuya institución no tiene logo persistido (`GET /configuracion/logo` responde
  `404`)
- WHEN se renderiza `PasoInformacionProceso`
- THEN el paso se renderiza sin la imagen hero, sin error visible, y el botón "Comenzar Votación"
  permanece funcional

### Requirement: Variantes de tarjeta del Paso 2 según tipo de proceso

El sistema MUST renderizar en `PasoBoleta` una de 3 variantes de tarjeta según `tipo` del proceso
electoral (recibido en `PapeletaDto.proceso.tipo`), todas siguiendo el patrón foto+cinta+doble
botón: tarjeta de Lista (`municipio`) con foto del candidato cabeza de lista, cinta "Lista N°",
símbolo, lema, propuesta corta y botón outline "Ver Propuesta Completa" condicionado a
`plan_trabajo_presente`; tarjeta de Candidato (`representante_aula`/`padres`) con foto, cinta con
cargo, nombres, sin botón de propuesta; tarjeta de Opción simple (`consulta`) con cinta de
etiqueta y descripción, sin foto. Todas las variantes MUST incluir el botón sólido explícito de
selección. El sistema MUST mostrar la tarjeta de "Voto en Blanco" como opción adicional distintiva
en las 3 variantes.
(Previously: mismo contenido por variante, pero sin cinta de identificación ni botón sólido
explícito de selección — la tarjeta completa era el `<label>` del radio.)

#### Scenario: Proceso `municipio` renderiza tarjetas de Lista con cinta y doble botón
- GIVEN un `PapeletaDto` con `proceso.tipo = 'municipio'` y sus opciones de tipo `Lista`
- WHEN se renderiza `PasoBoleta`
- THEN cada tarjeta muestra foto, cinta "Lista N°", símbolo, lema y propuesta corta
- AND el botón outline "Ver Propuesta Completa" aparece únicamente cuando
  `plan_trabajo_presente = true`, y el botón sólido de selección siempre está presente

#### Scenario: Proceso `representante_aula`/`padres` renderiza tarjetas de Candidato
- GIVEN un `PapeletaDto` con `proceso.tipo = 'representante_aula'` (o `padres`)
- WHEN se renderiza `PasoBoleta`
- THEN cada tarjeta muestra foto, cinta con cargo y nombres del candidato
- AND ninguna tarjeta ofrece el botón outline "Ver Propuesta Completa"

#### Scenario: Proceso `consulta` renderiza tarjetas de Opción simple
- GIVEN un `PapeletaDto` con `proceso.tipo = 'consulta'`
- WHEN se renderiza `PasoBoleta`
- THEN cada tarjeta muestra cinta de etiqueta y descripción, sin foto

#### Scenario: Voto en Blanco presente en las 3 variantes, nunca preseleccionado
- GIVEN cualquiera de las 3 variantes de proceso
- WHEN se renderiza `PasoBoleta`
- THEN existe una tarjeta adicional distintiva de "Voto en Blanco"
- AND ninguna tarjeta (incluida la de Voto en Blanco) aparece marcada como seleccionada al cargar
  el paso (D14 de #14: sin estado inicial implícito)

### Requirement: Boleta mobile-first de 3 pasos con voto en blanco explícito

El sistema MUST implementar los pasos información → boleta → confirmación. El paso 2 MUST ofrecer
el voto en blanco como opción marcable explícita, presentada como tarjeta con ícono circular y
botón dedicado "Votar en Blanco" (patrón foto/ícono+cinta+botón compartido con las demás
variantes), junto a las tarjetas de Lista/Candidato/Opción según el `tipo` del proceso;
"Continuar" MUST permanecer deshabilitado sin selección. El sistema MUST NOT inferir voto en
blanco de la ausencia de selección.
(Previously: "Voto en Blanco" era una fila con borde punteado, sin ícono circular ni botón
dedicado.)

#### Scenario: Voto en blanco explícito
- GIVEN un votante que marca la opción de voto en blanco en el paso 2
- WHEN confirma en el paso 3
- THEN se crea `Voto` con `blanco = true` y el resto de columnas de elección en `null`
