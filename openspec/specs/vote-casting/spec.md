# Emisión del voto — Specification

## Purpose

Define el camino de escritura del voto: la transacción atómica de `POST /votos`, sus dos
mecanismos de idempotencia, las causas de rechazo del derecho al voto, la boleta mobile-first de 3
pasos y el secreto del voto en auditoría. No cubre la materialización del padrón (#13) ni el
outbox de correo (#15).

## Requirements

### Requirement: Transacción atómica única de emisión del voto

El sistema MUST ejecutar `POST /votos` como una única transacción interactiva Prisma
(`$transaction(async (tx) => ...)`) que, en orden, resuelve y bloquea el `DerechoVoto`
(`SELECT ... FOR UPDATE`), valida el derecho, e inserta `Voto` (protegido por `UNIQUE
(proceso_id, derecho_voto_id)` y el `CHECK` de exactamente una elección), lo que hace que el
derecho quede `ejercido`, y registra el evento de auditoría `VOTO` — todo o nada. El estado
`ejercido` MUST derivarse de la existencia de la fila `Voto` asociada (no MUST NOT persistirse
como columna nueva en `DerechoVoto`), ya que esa fila ya está protegida por el `UNIQUE` anterior.
El sistema MUST NOT decomponer esta garantía (validación + `UNIQUE` + idempotencia) en operaciones
independientes que puedan desplegarse por separado. Un fallo en cualquiera de estos pasos MUST
revertir la transacción completa, sin fila `Voto` y sin evento `VOTO`.

#### Scenario: Camino feliz
- GIVEN un `DerechoVoto` propio, pendiente (sin `Voto` asociado), de un proceso abierto
- WHEN se invoca `POST /votos` con una elección válida
- THEN responde `201` con comprobante; existe una fila `Voto`; el derecho queda `ejercido` (derivado
  de esa fila); existe un evento `VOTO` sin la elección

#### Scenario: Fallo intermedio revierte todo
- GIVEN una transacción de voto donde el registro de auditoría falla (payload malformado)
- WHEN se invoca `POST /votos`
- THEN la transacción completa hace rollback: cero filas `Voto`, `DerechoVoto` permanece
  `pendiente`, ningún evento `VOTO`

### Requirement: Idempotencia por clave de cliente

El sistema MUST aceptar una `clave_idempotencia` generada por el cliente y buscarla antes de
intentar el `INSERT`. Un reintento con la misma clave MUST devolver el comprobante ya existente
sin crear una segunda fila `Voto`.

#### Scenario: Reintento con misma clave
- GIVEN un voto ya confirmado con `clave_idempotencia = K`
- WHEN se reenvía `POST /votos` con la misma `K` y el mismo derecho
- THEN responde con el mismo comprobante; sigue existiendo exactamente una fila `Voto`

### Requirement: Colisión de `UNIQUE` nunca burbujea como error

El sistema MUST capturar explícitamente el error `23505` de Postgres al insertar `Voto`, hacer
rollback de esa transacción, volver a consultar el `Voto` existente por `(proceso_id,
derecho_voto_id)` y responder con su comprobante. El sistema MUST NOT responder `500` ante esta
colisión.

#### Scenario: Segundo voto genuino con clave distinta
- GIVEN un derecho ya ejercido y una segunda petición con clave de idempotencia distinta
- WHEN ambas transacciones compiten en el `INSERT`
- THEN la segunda recibe `23505`, se captura, y responde con el comprobante ya emitido

#### Scenario: Concurrencia real de dos conexiones
- GIVEN dos transacciones independientes que pasan la validación en paralelo para el mismo derecho
- WHEN ambas ejecutan su `INSERT` casi simultáneamente
- THEN Postgres serializa y solo una fila `Voto` sobrevive; la otra transacción recibe `23505`

### Requirement: Validación del derecho al voto dentro de la transacción

El sistema MUST validar el derecho al voto usando `now()`/`clock_timestamp()` de Postgres, sellado
dentro de la misma transacción del `INSERT` — nunca una consulta previa ni `Date.now()` de Node.
El sistema MUST rechazar, en orden: (1) `derecho_voto_id` que no pertenece al usuario autenticado
(`403`, sin evento `RECHAZO`); (2) ausencia de `DerechoVoto` para el usuario/proceso; (3) proceso
cerrado o `now()` fuera de `[apertura, cierre)`; (4) derecho ya `ejercido` (existe una fila `Voto`
asociada). Las causas
2–4 MUST registrar un evento `RECHAZO` en su propia transacción exitosa e independiente —
NUNCA dentro de la transacción fallida del voto.

#### Scenario: Proceso cerrado
- GIVEN un `DerechoVoto` pendiente cuyo proceso tiene `now() >= cierre`
- WHEN se invoca `POST /votos`
- THEN responde con la pantalla de votación cerrada; existe un evento `RECHAZO` propio; cero filas
  `Voto`

#### Scenario: Derecho ya ejercido
- GIVEN un `DerechoVoto` que ya tiene una fila `Voto` asociada (`ejercido`)
- WHEN se invoca `POST /votos` sobre ese derecho
- THEN responde con la pantalla "ya votaste"; existe un evento `RECHAZO` propio; cero filas nuevas
  `Voto`

### Requirement: Secreto del voto en auditoría

El sistema MUST NOT incluir `candidato_id`, `lista_id`, `opcion_id`, `blanco` ni `eleccion` en el
payload de ningún evento `VOTO` o `RECHAZO`.

#### Scenario: Payload sin elección
- GIVEN cualquier evento `VOTO` o `RECHAZO` generado por este flujo
- WHEN se inspecciona su payload
- THEN no contiene ninguna de las claves prohibidas

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

### Requirement: Doble derecho ADR-0011 sin salto a mitad de flujo

Cuando el usuario porta dos filas `DerechoVoto` (`estudiante`/`padre`) para el mismo proceso, el
sistema MUST mostrar la banda "Votando como…" declarando la calidad activa y MUST NOT permitir
cambiar de derecho dentro del flujo de 3 pasos.

#### Scenario: Cada derecho se ejerce de forma independiente
- GIVEN dos `DerechoVoto` del mismo usuario en un proceso `comunidad`
- WHEN se ejerce uno de ellos vía `POST /votos`
- THEN el otro permanece `pendiente`, sin afectar su propio `UNIQUE`

### Requirement: Comprobante y punto de extensión para `JobCorreo`

El sistema MUST derivar el código de comprobante de `Voto.id` y sellar la hora con
`now()`/`clock_timestamp()` de Postgres. La transacción MUST dejar un punto de extensión evidente
inmediatamente antes del commit, después del evento `VOTO`, donde #15 pueda insertar `JobCorreo`
sin reescribir la transacción.

#### Scenario: Hora de cierre y de comprobante coinciden
- GIVEN una confirmación aceptada a `hh:cierre - 1s`
- WHEN se valida el cierre y se sella la hora del comprobante
- THEN ambos usan el mismo `now()` transaccional
