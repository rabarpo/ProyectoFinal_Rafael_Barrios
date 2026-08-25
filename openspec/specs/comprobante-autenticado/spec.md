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

### Requirement: Jerarquía visual de éxito en el comprobante con campos condicionales reales

El sistema MUST mostrar en `PanelComprobante` un ícono/badge de éxito y el mensaje "¡Voto emitido
correctamente!" junto con los detalles reales del comprobante (fecha/hora, código de comprobante,
resumen de elección). El sistema MUST mostrar un badge condicional "Ya has votado" únicamente
cuando el votante reintenta acceder tras ya haber emitido su voto. El sistema MUST mostrar
"Período Lectivo" únicamente cuando `ComprobanteDto.periodo_lectivo` viene definido (renderizado
condicional, mismo criterio que el resto de campos opcionales del comprobante) — MUST NOT romper
el resto del comprobante si el campo está ausente. El sistema MUST mostrar un indicador estático
"Estado del Sistema: Sincronizado", puramente decorativo y sin condicional sobre ningún dato real
del comprobante ni del sistema.
(Previously: prohibía explícitamente "periodo lectivo" y "estado de sincronización" por falta de
respaldo real en `ComprobanteDto`; ahora `periodo_lectivo` tiene respaldo real vía `AnioEscolar
.activo` y "Sincronizado" queda como decisión de producto explícita, decorativa.)

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

#### Scenario: "Período Lectivo" se muestra cuando el DTO lo trae
- GIVEN un `ComprobanteDto` con `periodo_lectivo = "2026"`
- WHEN se renderiza `PanelComprobante`
- THEN se muestra el campo "Período Lectivo" con ese valor, sin afectar el resto del comprobante

#### Scenario: Sin `periodo_lectivo`, el comprobante no rompe
- GIVEN un `ComprobanteDto` sin `periodo_lectivo` (`undefined`)
- WHEN se renderiza `PanelComprobante`
- THEN el campo "Período Lectivo" no se renderiza y el resto del comprobante se muestra completo

#### Scenario: "Estado del Sistema: Sincronizado" siempre estático
- GIVEN cualquier estado de `PanelComprobante` (con o sin `periodo_lectivo`, recién emitido o
  reintento)
- WHEN se renderiza el panel
- THEN el indicador "Estado del Sistema: Sincronizado" se muestra igual, sin condicionarse a
  ningún dato del comprobante ni verificación real de sincronización

### Requirement: Botón "Cerrar Sesión" en el comprobante

El sistema MUST mostrar en `PanelComprobante` un botón "Cerrar Sesión" junto al botón "Volver al
Inicio", usando el mismo mecanismo de logout ya expuesto por `AppShell`. El sistema MUST mostrar
este botón en los dos caminos que reusan `PanelComprobante` — post-voto (`VotacionPage`) y
relectura autenticada (`ComprobantePage`) — sin duplicar la lógica de logout.

#### Scenario: "Cerrar Sesión" disponible en el camino post-voto
- GIVEN un votante que acaba de emitir su voto y ve `PanelComprobante` dentro de `VotacionPage`
- WHEN se renderiza el paso 3
- THEN el botón "Cerrar Sesión" aparece junto a "Volver al Inicio" y usa el mismo mecanismo de
  logout de `AppShell`

#### Scenario: "Cerrar Sesión" disponible en la relectura autenticada
- GIVEN un usuario autenticado que accede a `ComprobantePage` vía enlace o URL directa
- WHEN se renderiza `PanelComprobante` en ese camino
- THEN el botón "Cerrar Sesión" aparece igual que en el camino post-voto, sin romper el badge
  `yaRegistrado` existente

## REMOVED Requirements

### Requirement: Sin campos nuevos en `ComprobanteDto`

(Reason: `periodo_lectivo` se agrega como campo opcional real, poblado desde `AnioEscolar.activo`
— ya no aplica la restricción de "ningún campo nuevo" que bloqueaba la brecha de fidelidad visual
frente a las capturas de referencia.)
(Migration: ver requirement "Campo `periodo_lectivo` en el comprobante" en el spec `vote-casting`
de este mismo change, y el requirement MODIFIED "Jerarquía visual de éxito en el comprobante con
campos condicionales reales" arriba, que reemplaza la prohibición por el renderizado condicional.)
