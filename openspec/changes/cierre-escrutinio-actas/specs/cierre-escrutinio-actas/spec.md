# Cierre, escrutinio y actas — Specification

## Purpose

Define el cierre manual de un `ProcesoElectoral` (`POST /procesos/:id/cerrar`), el escrutinio
oficial calculado dentro de esa transacción, la creación atómica de las 4 `Acta` (`apertura`,
`cierre`, `escrutinio`, `oficial`) en `borrador`, su render a PDF por el worker, la transición
`cerrado → acta_emitida`, y la lectura/descarga de actas. No cubre cierre automático por hora,
firma digital, ni agrupación por múltiples cargos (fuera de alcance, ver proposal.md decisión 6).

## Requirements

### Requirement: Cierre manual, idempotente y concurrency-safe
El sistema MUST exponer `POST /procesos/:id/cerrar` que transiciona `estado` de `abierto` a
`cerrado` mediante `UPDATE … WHERE estado='abierto'`, en el mismo patrón que `abrir()`. MUST
responder `200` no-op si el proceso ya está `cerrado`/`acta_emitida` (idempotente). MUST responder
`409 PROCESO_NO_CERRABLE` con el `estado` actual si el proceso está en `borrador`. MUST responder
`404` si el proceso no existe. MUST NOT disparar el cierre automáticamente por
`fecha_cierre_prevista`.

#### Scenario: Cierre exitoso de un proceso abierto
- GIVEN un proceso en `estado='abierto'`
- WHEN el comité envía `POST /procesos/:id/cerrar` con `CerrarProcesoDto` válido
- THEN responde `200`, `estado='cerrado'`, `cierre_real` queda sellado

#### Scenario: Doble cierre es idempotente
- GIVEN un proceso ya `cerrado`
- WHEN se repite `POST /procesos/:id/cerrar`
- THEN responde `200` no-op con el mismo estado, sin crear actas adicionales

#### Scenario: Cierre de un proceso en borrador
- GIVEN un proceso en `estado='borrador'`
- WHEN se invoca `POST /procesos/:id/cerrar`
- THEN responde `409` con código `PROCESO_NO_CERRABLE` y el `estado` en el cuerpo

### Requirement: Validación de `CerrarProcesoDto`
El sistema MUST requerir `confirmar: true` y `firmantes: {nombre, cargo}[]` con al menos 1
elemento. MUST rechazar con `400 CAMPO_INVALIDO` antes de abrir la transacción cuando `confirmar`
no es `true`, o `firmantes` está vacío, tiene más de 10 elementos, o algún `nombre`/`cargo` queda
vacío tras `trim()`.

#### Scenario: Firmantes vacío
- GIVEN una petición de cierre con `firmantes: []`
- WHEN se invoca el endpoint
- THEN responde `400 CAMPO_INVALIDO {campo:'firmantes'}` sin abrir transacción

### Requirement: Creación atómica de las 4 actas en `borrador`
El sistema MUST crear, dentro de la misma transacción que el `UPDATE` de cierre, exactamente 4
filas `Acta` (`apertura`, `cierre`, `escrutinio`, `oficial`) con `estado='borrador'` y `contenido`
= snapshot JSON (padrón, participación, escrutinio, firmantes congelados).

#### Scenario: Cierre crea las 4 actas atómicamente
- GIVEN un proceso `abierto` que se cierra
- WHEN la transacción confirma
- THEN existen exactamente 4 `Acta` con `estado='borrador'` para ese `proceso_id`

### Requirement: Escrutinio recalculado sin caché ni gate de visibilidad
El sistema MUST calcular el escrutinio (participación, desglose, cuadre, empate) una sola vez
dentro de la transacción de cierre, reutilizando la lógica de agregación de `resultados-en-vivo`
(#16), sin pasar por su caché ni por el gate `ocultar_resultados`.

#### Scenario: Escrutinio con resultados ocultos
- GIVEN un proceso con `ocultar_resultados=true`
- WHEN se cierra
- THEN el acta de escrutinio incluye el desglose completo, sin ocultarlo

### Requirement: Cuadre y participación cero
El sistema MUST reportar `cuadre = padron_total = votos_por_opcion + blancos + nulos +
abstenciones` con `nulos` siempre `0` y la nota fija: "Los votos nulos se reportan en 0: el
sistema no permite emitir un voto nulo; toda boleta enviada es válida o en blanco." MUST NOT
bloquear el cierre cuando `cuadra=false`. MUST calcular porcentajes con guarda de división por
cero cuando `padron_total=0`.

#### Scenario: Proceso con cero votos emitidos
- GIVEN un proceso `abierto` sin ningún `Voto`
- WHEN se cierra
- THEN responde `200`, las 4 actas se generan reportando abstención total y `0%`, sin error

#### Scenario: Candidato/lista dado de baja en el desglose
- GIVEN una lista o candidato con `estado='baja'`
- WHEN se calcula el escrutinio
- THEN el acta de escrutinio incluye esa fila con su `estado` y `baja_en`

### Requirement: Empate del único desglose del proceso
El sistema MUST declarar `empate=true` cuando 2 o más filas del único desglose del proceso
comparten el conteo máximo, listando sus IDs. MUST NOT agrupar por `cargo` ni por ninguna otra
dimensión intra-proceso (fuera de alcance). MUST NOT declarar empate cuando el máximo es `0`
(participación cero). MUST NOT resolver ni bloquear el cierre por empate: la resolución queda en
el comité.

#### Scenario: Empate real en el desglose
- GIVEN 2 candidatos que comparten el máximo de votos del proceso
- WHEN se cierra
- THEN el acta de escrutinio reporta `empate:true` con ambos IDs

#### Scenario: Sin votos no es empate
- GIVEN un proceso con `votos_emitidos=0`
- WHEN se calcula el escrutinio
- THEN `empate=false`, se reporta `sin_votos:true` en su lugar

### Requirement: Quórum informativo
El sistema MUST incluir `quorum` (`votos_emitidos / padron_total`) en el acta de cierre como dato
puramente informativo. MUST NOT usarlo como condición que bloquee o invalide el cierre.

#### Scenario: Quórum bajo no bloquea el cierre
- GIVEN un proceso con participación menor a cualquier umbral hipotético
- WHEN se cierra
- THEN responde `200`, `quorum` se reporta en el acta de cierre sin impedir la transición

### Requirement: Render de actas por el worker y estado `fallido`
El sistema MUST procesar de forma asíncrona cada `Acta` en `borrador` mediante un worker
dedicado, renderizar el PDF y persistir `pdf`/`pdf_mime`, marcando `estado='emitida'`. MUST marcar
`estado='fallido'` solo cuando se agotan los reintentos configurados de la cola, nunca antes.

#### Scenario: Render exitoso
- GIVEN una `Acta` en `borrador`
- WHEN el worker la procesa
- THEN persiste el PDF y marca `estado='emitida'`

#### Scenario: Render falla tras agotar reintentos
- GIVEN una `Acta` cuyo render falla repetidamente
- WHEN se agotan los reintentos de la cola
- THEN `estado='fallido'`, visible por consulta directa sin inspeccionar la cola

### Requirement: Transición `cerrado → acta_emitida` sin condición de carrera
El sistema MUST transicionar `ProcesoElectoral.estado` a `acta_emitida` únicamente cuando las 4
`Acta` del proceso están `estado='emitida'`. MUST serializar la verificación de conteo y la
transición (bloqueo del proceso) para que dos workers terminando actas en paralelo no dejen el
proceso atascado en `cerrado` con las 4 actas emitidas.

#### Scenario: Transición tras la 4ª acta
- GIVEN 3 actas ya `emitida` y la 4ª terminando de emitirse
- WHEN el worker marca la 4ª como `emitida`
- THEN `ProcesoElectoral.estado` pasa a `acta_emitida` en la misma transacción

#### Scenario: Carrera entre dos workers
- GIVEN dos workers finalizando la 3ª y la 4ª acta en paralelo
- WHEN ambas transacciones terminan
- THEN el proceso llega a `acta_emitida` de forma determinista, sin quedar atascado en `cerrado`

### Requirement: Lectura y descarga de actas
El sistema MUST exponer un endpoint de listado de actas por proceso (metadatos, sin bytes ni
`contenido`) y un endpoint de descarga del PDF, ambos restringidos a roles
`administrador|director|comite`. MUST responder `409` cuando se solicita el PDF de una acta que
aún no está `emitida`.

#### Scenario: Descarga de acta emitida
- GIVEN una `Acta` en `estado='emitida'` con PDF persistido
- WHEN un usuario con rol `comite` la descarga
- THEN responde `200 application/pdf`

#### Scenario: Descarga antes de emitir
- GIVEN una `Acta` aún en `borrador`
- WHEN se solicita su PDF
- THEN responde `409` con el `estado` actual

#### Scenario: Rol sin acceso
- GIVEN un usuario con rol `estudiante` o `docente`
- WHEN intenta listar o descargar actas de cualquier proceso
- THEN responde `403`, incluso si tiene `DerechoVoto` en ese proceso

### Requirement: Auditoría de cierre y generación de actas
El sistema MUST registrar un evento `PROCESO_CERRADO` (actor = usuario del comité) al cerrar,
con conteos agregados en el payload (nunca IDs de voto individuales). MUST registrar un evento
`ACTA_GENERADA` (actor `null`, escrito por el worker) por cada acta emitida, con `tipo` en el
payload. MUST NOT incluir `empatados` ni ningún `candidato_id`/`lista_id`/`opcion_id` en ninguno
de los dos payloads.

#### Scenario: Auditoría de cierre
- GIVEN un cierre exitoso
- WHEN se confirma la transacción
- THEN existe un evento `PROCESO_CERRADO` con conteos, sin identificadores de voto individual

#### Scenario: Auditoría de emisión de acta
- GIVEN una `Acta` que el worker termina de emitir
- WHEN se confirma su transacción terminal
- THEN existe un evento `ACTA_GENERADA` con `tipo` en el payload y actor `null`
