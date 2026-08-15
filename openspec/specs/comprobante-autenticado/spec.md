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
