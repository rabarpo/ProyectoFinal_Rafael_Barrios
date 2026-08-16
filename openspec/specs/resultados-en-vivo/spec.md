# Resultados en vivo — Specification

## Purpose

Define `GET /procesos/:id/resultados`: participación y (según configuración) desglose por
candidato/lista/opción de un `ProcesoElectoral` durante la jornada, respetando
`ocultar_resultados` (congelado por #13) y basado solo en el padrón congelado (`DerechoVoto`). No
cubre cálculo final, empates ni actas (#17).

## Requirements

### Requirement: Autorización por pertenencia, sin restricción de rol
El sistema MUST exponer el endpoint bajo `AuthGuard` sin `@Roles()`. MUST autorizar solo si el
usuario tiene al menos un `DerechoVoto` en `proceso_id`. MUST responder `403` idéntico (sin cuerpo
discriminante) tanto si el proceso no existe como si el usuario no tiene `DerechoVoto` allí
(extiende el criterio "sin oráculo" de #15 a nivel de membresía de grupo, no de voto individual).

#### Scenario: Usuario con derecho de voto consulta resultados
- GIVEN un usuario con `DerechoVoto` vigente en `proceso_id`
- WHEN consulta el endpoint
- THEN responde `200` según el estado de visibilidad del proceso

#### Scenario: Usuario sin derecho de voto o proceso inexistente
- GIVEN un usuario sin `DerechoVoto` en `proceso_id`, o un `proceso_id` inexistente
- WHEN consulta el endpoint
- THEN responde `403`, mismo cuerpo en ambos casos

#### Scenario: Sin sesión válida
- GIVEN una petición sin cookie de sesión
- WHEN se invoca el endpoint
- THEN responde `401`

### Requirement: Desglose completo cuando `ocultar_resultados = false`
El sistema MUST responder con `votos_emitidos`, `padron_total`, `estado_visibilidad`, desglose por
candidato/lista/opción, y `hora_servidor` (ISO, sellada por el servidor de datos).

#### Scenario: Proceso visible
- GIVEN un proceso con `ocultar_resultados = false`
- WHEN un usuario autorizado consulta resultados
- THEN responde `200` con participación, desglose y `hora_servidor`

### Requirement: Payload mínimo cuando `ocultar_resultados = true`
El sistema MUST responder, para cualquier rol, solo con `votos_emitidos`, `padron_total`,
`estado_visibilidad = "oculto"`, `hora_servidor` y `resultados_ocultos_por_configuracion`. MUST NOT
incluir desglose por candidato/lista/opción/aula ni porcentajes derivados. El flag adicional MUST
ser idéntico para todos los roles, incluido comité.

#### Scenario: Votante consulta proceso oculto
- GIVEN un proceso con `ocultar_resultados = true`
- WHEN un estudiante o docente autorizado consulta resultados
- THEN responde `200` solo con participación agregada, sin desglose

#### Scenario: Comité consulta proceso oculto
- GIVEN el mismo proceso oculto
- WHEN un usuario con rol comité consulta resultados
- THEN recibe el mismo payload que cualquier otro rol, con `resultados_ocultos_por_configuracion:
  true`

### Requirement: Base de cálculo es el padrón congelado
El sistema MUST derivar `padron_total` de `count(DerechoVoto)` y `votos_emitidos` de `count(Voto)`
para `proceso_id`. MUST NOT recalcular el denominador desde `Matricula`/`Usuario` en vivo.

#### Scenario: Cambio de aula posterior a la apertura no afecta el cálculo
- GIVEN un proceso con padrón ya congelado
- WHEN un votante cambia de aula/sección tras la apertura
- THEN `padron_total` no varía

### Requirement: Sin categoría de nulos; abstención derivada
El sistema MUST NOT exponer una categoría "nulos" separada (ADR-0008). MUST calcular abstención
como `padron_total - votos_emitidos`, nunca como categoría aparte.

#### Scenario: Desglose sin categoría de nulos
- GIVEN un proceso visible con votos y abstenciones
- WHEN se consulta el desglose
- THEN no hay campo "nulos" distinto de cero; la abstención se deriva aritméticamente

### Requirement: Comportamiento según estado del proceso
El sistema MUST usar la misma lógica de agregación para `abierto`, `cerrado` y `acta_emitida`. MUST
NOT requerir verificación explícita de `estado = borrador`: al no existir `DerechoVoto` antes de la
apertura, la autorización por pertenencia ya rechaza esas consultas.

#### Scenario: Proceso cerrado con derecho de voto vigente
- GIVEN un proceso `cerrado` donde el usuario tuvo `DerechoVoto`
- WHEN consulta resultados
- THEN responde `200` con el mismo cálculo que en `abierto`

#### Scenario: Proceso en borrador
- GIVEN un proceso en `borrador` (sin `DerechoVoto` para nadie)
- WHEN cualquier usuario consulta resultados
- THEN responde `403` (mismo caso de la sección de autorización)

### Requirement: Consistencia observable de lecturas repetidas en ventana corta
El sistema MUST servir lecturas repetidas del mismo `proceso_id` dentro de una ventana corta
(segundos de un dígito) con el mismo valor, sin degradar latencia bajo ráfaga. MUST NOT servir datos
de un `proceso_id` distinto al solicitado. Tras vencer la ventana, una lectura posterior MUST
reflejar los votos emitidos hasta ese momento.

#### Scenario: Ráfaga de lecturas del mismo proceso
- GIVEN varios usuarios consultando el mismo `proceso_id` casi simultáneamente
- WHEN todos consultan dentro de la misma ventana corta
- THEN todos reciben el mismo valor de participación/desglose

#### Scenario: Lecturas de procesos distintos nunca se mezclan
- GIVEN dos procesos abiertos distintos, `A` y `B`
- WHEN se consultan en sucesión inmediata
- THEN la respuesta de `A` nunca refleja datos de `B`, ni viceversa

### Requirement: Vista frontend de resultados en vivo
El sistema MUST mostrar participación siempre. MUST mostrar el desglose (gráficos) solo cuando
`estado_visibilidad = "visible"`. MUST mostrar un mensaje de "resultados ocultos" cuando sea
`"oculto"`, sin intentar renderizar un desglose inexistente. MUST refrescar por sondeo periódico
dentro de 10-30 s (ADR-0005).

#### Scenario: Vista con resultados visibles
- GIVEN un proceso con `estado_visibilidad = "visible"`
- WHEN el usuario abre la vista
- THEN ve participación y gráficos de desglose, actualizados por sondeo

#### Scenario: Vista con resultados ocultos
- GIVEN un proceso con `estado_visibilidad = "oculto"`
- WHEN el usuario abre la vista
- THEN ve solo participación y el mensaje de resultados ocultos, sin gráficos
