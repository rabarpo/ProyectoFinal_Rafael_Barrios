# Outbox de correo — Specification

## Purpose

Define la inserción transaccional de `JobCorreo` en el marcador `[#15]` de
`VotosService.emitir()`, el schema aditivo que la habilita, y el worker de envío por lotes con
reintentos idempotentes que consume esos jobs reutilizando `EmailSender` sin modificar su
contrato. Cierra la ventana temporal de ADR-0018. No cubre notificaciones no ligadas a un voto
(#19: recordatorios, cierre próximo, publicación de resultados) ni la vista agregada "Mis
votaciones" (`comprobante-autenticado` cubre el comprobante único).

## Requirements

### Requirement: Inserción de `JobCorreo` dentro de la transacción del voto
El sistema MUST insertar la fila `JobCorreo` exactamente en el marcador
`// [#15] Punto de extensión JobCorreo` de `VotosService.emitir()`, dentro del mismo
`$transaction` que crea `Voto` y el evento `VOTO`. El sistema MUST NOT leer votos confirmados
desde un dispatcher externo a esa transacción para generar el job (patrón vetado
permanentemente por ADR-0018).

#### Scenario: Voto y `JobCorreo` nacen juntos
- GIVEN una emisión de voto válida
- WHEN `POST /votos` confirma la transacción
- THEN existe una fila `Voto` y una fila `JobCorreo` asociada por `voto_id`, ambas del mismo commit

#### Scenario: Fallo en cualquier paso revierte ambas filas
- GIVEN una transacción de voto que falla después del punto de extensión (p. ej. el propio insert
  de `JobCorreo`)
- WHEN `POST /votos` se invoca
- THEN la transacción hace rollback completo: cero filas `Voto`, cero filas `JobCorreo` para ese
  intento

### Requirement: Columnas estructuradas aditivas en `JobCorreo`
El sistema MUST agregar `voto_id` (FK nullable a `Voto`), `proceso_id` (FK nullable a
`ProcesoElectoral`) y `codigo_comprobante` (string nullable) a `JobCorreo` mediante migración
aditiva. El sistema MUST NOT reordenar ni renombrar columnas existentes de `JobCorreo`.

#### Scenario: Migración no toca columnas existentes
- GIVEN el schema `JobCorreo` previo (`asunto`, `cuerpo`, etc.)
- WHEN se aplica la migración de este change
- THEN las columnas previas conservan nombre, orden y tipo; las tres columnas nuevas son
  nullable

### Requirement: Worker de outbox por lotes, idempotente por `id` de job
El sistema MUST implementar el envío en `apps/worker/` con código nuevo — MUST NOT basarse en
`system-ping.processor.ts` ni importar `PrismaClient` directamente ahí. El worker MUST procesar
jobs `pendiente` por lotes, reintentar fallos transitorios con un límite acotado, y ser
idempotente por `id` de job (reintentar un job ya `enviado` MUST ser un no-op seguro), cumpliendo
entrega at-least-once (ADR-0012).

#### Scenario: Envío exitoso marca el job como enviado
- GIVEN un `JobCorreo` en estado `pendiente` con `voto_id`/`codigo_comprobante` poblados
- WHEN el worker lo procesa
- THEN invoca `EmailSender.send()` y marca el job `enviado`

#### Scenario: Reintento de un job ya enviado es no-op
- GIVEN un `JobCorreo` en estado `enviado`
- WHEN el worker lo vuelve a procesar (reentrega at-least-once)
- THEN no se envía un segundo correo y el estado permanece `enviado`

#### Scenario: Fallo transitorio agota reintentos y marca `fallido`
- GIVEN un `JobCorreo` cuyo envío falla repetidamente por error transitorio
- WHEN el worker alcanza el límite de reintentos acotado
- THEN el job queda `fallido`, sin bloquear el procesamiento de otros jobs del lote

### Requirement: Contenido del correo nunca revela la elección
El sistema MUST componer el correo únicamente con `codigo_comprobante`, hora y enlace autenticado
al comprobante. El sistema MUST NOT incluir candidato, lista, opción, voto en blanco ni cualquier
dato de elección en el asunto o cuerpo del correo.

#### Scenario: Contenido del correo verificado
- GIVEN un `JobCorreo` enviado
- WHEN se inspecciona el asunto y cuerpo efectivamente enviados
- THEN no contienen ninguna referencia a la elección del votante

### Requirement: Mecanismo de reconciliación disponible sin ejecución contra datos reales
El sistema MUST proveer un script/consulta que identifique filas `Voto` sin `JobCorreo` asociado
vía `voto_id`, disponible como utilidad para entornos de staging/QA. El sistema MUST NOT
ejecutarlo contra datos de producción como parte de este change (proyecto greenfield, sin votos
reales).

#### Scenario: Consulta de reconciliación vía JOIN
- GIVEN un entorno con votos de prueba sin `JobCorreo`
- WHEN se ejecuta la consulta de reconciliación
- THEN devuelve exactamente esos `Voto` sin necesidad de parsear texto libre

### Requirement: Cierre de ADR-0018 condicionado a prueba verde
El sistema MUST considerar cerrado ADR-0018 (estado "Superado por #15") únicamente cuando la
suite e2e que prueba atomicidad `Voto`+`JobCorreo` esté verde.

#### Scenario: Actualización de estado tras suite verde
- GIVEN la suite e2e de atomicidad `Voto`+`JobCorreo` en verde
- WHEN se completa este change
- THEN el campo "Estado" de `adrs/0018-ventana-temporal-jobcorreo-diferido.md` pasa a
  "Superado por #15"
