# Comprobante autenticado — Specification

## Purpose

Define el endpoint y la página que exponen el comprobante completo de un voto ya emitido
(incluyendo `eleccion_resumen`) únicamente tras autenticación, satisfaciendo el enlace de
ADR-0009. Cubre exclusivamente el acceso a un comprobante único vía enlace directo o URL
equivalente. No cubre la vista agregada "Mis votaciones" con todos los procesos de un usuario
(diferida a #16/#20 por decisión explícita del usuario) ni el envío del correo que contiene el
enlace (`outbox-correo`).

## Requirements

### Requirement: Endpoint autenticado de comprobante completo
El sistema MUST exponer un endpoint que, solo tras autenticación, devuelva el comprobante
completo de un voto (incluyendo `eleccion_resumen`) para un `voto_id`/`codigo_comprobante`
específico. El sistema MUST rechazar la petición si el usuario no está autenticado. El sistema
MUST restringir la respuesta al comprobante que pertenece al usuario autenticado (o a su derecho
al voto), sin permitir enumerar comprobantes ajenos.

#### Scenario: Usuario autenticado consulta su propio comprobante
- GIVEN un usuario autenticado con un `Voto` propio ya emitido
- WHEN consulta el endpoint con el `voto_id`/`codigo_comprobante` de ese voto
- THEN responde `200` con el comprobante completo, incluyendo `eleccion_resumen`

#### Scenario: Petición sin autenticación es rechazada
- GIVEN una petición al endpoint sin sesión válida
- WHEN se invoca con cualquier `voto_id`/`codigo_comprobante`
- THEN responde con rechazo de autenticación (`401`), sin exponer datos del comprobante

#### Scenario: Comprobante de otro usuario es rechazado
- GIVEN un usuario autenticado y un `voto_id` que pertenece a otro usuario
- WHEN consulta el endpoint con ese `voto_id`
- THEN responde con rechazo de autorización, sin exponer el comprobante ajeno

### Requirement: Página de comprobante único, sin listado agregado
El sistema MUST proveer una página frontend que muestre el comprobante completo de un voto
específico, accesible desde el enlace del correo de confirmación y/o una URL directa
equivalente. El sistema MUST NOT ofrecer en esta página (ni en ningún endpoint de este change)
un listado agregado de todos los procesos/votos de un usuario ("Mis votaciones").

#### Scenario: Acceso vía enlace del correo
- GIVEN un usuario que recibió el correo de confirmación con el enlace al comprobante
- WHEN autentica y sigue el enlace
- THEN ve el comprobante completo de ese voto específico, incluyendo la elección

#### Scenario: Acceso vía URL directa equivalente
- GIVEN un usuario autenticado que conoce la URL directa de su comprobante
- WHEN navega a esa URL
- THEN ve el mismo comprobante que mostraría el enlace del correo, sin pasar por un listado

#### Scenario: No existe listado agregado en el alcance de este change
- GIVEN la funcionalidad entregada por este change
- WHEN se busca una vista de "Mis votaciones" con todos los procesos del usuario
- THEN no existe tal vista; queda diferida a #16/#20

### Requirement: Jerarquía visual de éxito en el comprobante, sin campos fabricados

El sistema MUST mostrar en `PanelComprobante` un ícono/badge de éxito y el mensaje "¡Voto emitido
correctamente!" junto con los detalles reales del comprobante (fecha/hora, código de comprobante,
resumen de elección). El sistema MUST mostrar un badge condicional "Ya has votado" únicamente
cuando el votante reintenta acceder tras ya haber emitido su voto. El sistema MUST NOT introducir
"periodo lectivo" ni "estado de sincronización" en el comprobante, ni ningún otro campo sin
respaldo real en `ComprobanteDto`.

#### Scenario: Comprobante recién emitido muestra ícono de éxito
- GIVEN un votante que acaba de emitir su voto
- WHEN se renderiza `PanelComprobante`
- THEN muestra el ícono/badge de éxito, "¡Voto emitido correctamente!" y los datos reales del
  comprobante (fecha/hora, código, resumen de elección)
- AND no muestra el badge "Ya has votado"

#### Scenario: Reintento tras voto ya emitido muestra el badge "Ya has votado"
- GIVEN un votante que ya ejerció su derecho y vuelve a acceder al flujo de votación
- WHEN se renderiza `PanelComprobante` para ese derecho ya `ejercido`
- THEN muestra el badge condicional "Ya has votado" junto al comprobante existente

#### Scenario: El comprobante nunca muestra periodo lectivo ni estado de sincronización
- GIVEN cualquier estado de `PanelComprobante` (recién emitido o reintento)
- WHEN se inspecciona el contenido renderizado
- THEN no aparece ningún elemento etiquetado como "periodo lectivo" ni "estado de sincronización"
  ni ningún campo ausente en `ComprobanteDto`

### Requirement: Sin campos nuevos en `ComprobanteDto`

El rediseño visual de `PanelComprobante` MUST reutilizar exclusivamente los campos ya expuestos
por `ComprobanteDto` (fecha/hora, código de comprobante, `eleccion_resumen`). El sistema MUST NOT
agregar campos nuevos al DTO del comprobante para soportar este cambio de layout.

#### Scenario: El contrato de `ComprobanteDto` no cambia
- GIVEN el `ComprobanteDto` existente antes de este change
- WHEN se compara con el `ComprobanteDto` usado por el `PanelComprobante` rediseñado
- THEN el conjunto de campos es idéntico — ningún campo nuevo se agregó
