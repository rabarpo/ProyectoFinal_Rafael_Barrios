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

### Requirement: Boleta mobile-first de 3 pasos con voto en blanco explícito

El sistema MUST implementar los pasos información → boleta → confirmación. El paso 2 MUST ofrecer
el voto en blanco como opción marcable explícita; "Continuar" MUST permanecer deshabilitado sin
selección. El sistema MUST NOT inferir voto en blanco de la ausencia de selección.

#### Scenario: Voto en blanco explícito
- GIVEN un votante que marca la opción de voto en blanco en el paso 2
- WHEN confirma en el paso 3
- THEN se crea `Voto` con `blanco = true` y el resto de columnas de elección en `null`

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
