# Notificaciones — Specification

## Purpose

Define los 4 eventos de notificación del ciclo de vida de un proceso electoral (inicio de
votación, recordatorio, cierre próximo, publicación de resultados), reutilizando el outbox
`JobCorreo`/worker de #15 para el envío de correo y ampliando `Notificacion` para que sirva como
bandeja interna real. Inicio y resultados se insertan dentro de las transacciones existentes de
apertura (#13) y cierre (#17); recordatorio y cierre próximo dependen de un sweep periódico nuevo
en el worker, idempotente por proceso+tipo. No cubre UI de frontend, preferencias de notificación
por usuario, canales push/SMS, ni UI de administración de umbrales (diferido a un change
posterior).

## Requirements

### Requirement: Notificación de inicio de votación dentro de la transacción de apertura
El sistema MUST insertar, dentro de la misma transacción que abre un `ProcesoElectoral` (#13),
exactamente una fila `JobCorreo` y una fila `Notificacion` (tipo `interna`) por cada usuario
habilitado para votar en ese proceso. El sistema MUST NOT generar esta notificación desde un
dispatcher externo a esa transacción (ADR-0018).

#### Scenario: Apertura exitosa notifica a todos los habilitados
- GIVEN un proceso en `estado='borrador'` con N usuarios habilitados para votar
- WHEN el comité abre el proceso y la transacción confirma
- THEN existen exactamente N `JobCorreo` y N `Notificacion` de tipo inicio, una por usuario

#### Scenario: Fallo en la transacción de apertura no deja notificaciones parciales
- GIVEN una apertura que falla después de insertar algunas notificaciones
- WHEN la transacción hace rollback
- THEN cero `JobCorreo` y cero `Notificacion` de inicio quedan persistidas para ese intento

### Requirement: Notificación de publicación de resultados dentro de la transacción de cierre
El sistema MUST insertar, dentro de la misma transacción que cierra un `ProcesoElectoral` y
calcula el escrutinio (#17), exactamente una fila `JobCorreo` y una fila `Notificacion` (tipo
`interna`) por cada usuario habilitado, notificando la publicación de resultados. El sistema MUST
NOT depender de un dispatcher reactivo posterior al commit.

#### Scenario: Cierre exitoso notifica resultados a todos los habilitados
- GIVEN un proceso `abierto` con N usuarios habilitados que se cierra
- WHEN la transacción de cierre confirma
- THEN existen exactamente N `JobCorreo` y N `Notificacion` de tipo resultados, una por usuario

#### Scenario: Doble cierre idempotente no duplica notificaciones
- GIVEN un proceso ya `cerrado`/`acta_emitida`
- WHEN se repite la operación de cierre (no-op, ver `cierre-escrutinio-actas`)
- THEN no se crean notificaciones de resultados adicionales

### Requirement: Sweep periódico idempotente para recordatorio y cierre próximo
El sistema MUST implementar un poller periódico en `apps/worker/` que escanee
`ProcesoElectoral WHERE estado='abierto'` y compare `fecha_cierre_prevista` contra umbrales
configurables por variable de entorno (con defaults razonables si no están definidas). El sistema
MUST insertar como máximo una `Notificacion`/`JobCorreo` de tipo recordatorio y una de tipo cierre
próximo por proceso, usando una restricción de unicidad (`proceso_id`, `tipo_notificacion`) e
inserción idempotente (`ON CONFLICT DO NOTHING`) para que ejecuciones repetidas del sweep no
produzcan duplicados.

#### Scenario: Primer sweep dentro del umbral crea la notificación
- GIVEN un proceso `abierto` cuya `fecha_cierre_prevista` cae dentro del umbral de recordatorio
- WHEN el sweep se ejecuta
- THEN se crea exactamente una `Notificacion`/`JobCorreo` de tipo recordatorio para ese proceso

#### Scenario: Sweep repetido no duplica
- GIVEN un proceso que ya tiene una notificación de recordatorio creada por un sweep anterior
- WHEN el sweep vuelve a ejecutarse y el proceso sigue dentro del umbral
- THEN no se crea una segunda notificación de recordatorio para ese proceso

#### Scenario: Cierre próximo y recordatorio son independientes
- GIVEN un proceso dentro de ambos umbrales (recordatorio y cierre próximo) en el mismo sweep
- WHEN el sweep se ejecuta
- THEN se crea como máximo una notificación de cada tipo para ese proceso, sin interferir entre sí

### Requirement: Esquema aditivo de `Notificacion` como bandeja interna
El sistema MUST ampliar `Notificacion` con columnas aditivas `usuario_id` (FK requerida a
`Usuario`), `titulo` (string), `cuerpo` (string) y `leido_en` (timestamp nullable). El sistema
MUST convertir `job_correo_id` a nullable (una notificación interna puede existir sin correo
asociado). El sistema MUST agregar el valor `interna` al enum `TipoNotificacion` de forma aditiva
(`ALTER TYPE ... ADD VALUE`). El sistema MUST NOT reordenar ni renombrar valores existentes del
enum ni columnas existentes de `Notificacion`.

#### Scenario: Migración no toca columnas ni valores existentes
- GIVEN el schema `Notificacion` previo (`job_correo_id` requerido, enum con solo `correo`)
- WHEN se aplica la migración de este change
- THEN el valor `correo` del enum y las columnas previas conservan nombre, orden y tipo; las
  columnas nuevas son las especificadas y `job_correo_id` pasa a nullable

#### Scenario: Notificación interna sin correo asociado
- GIVEN un evento de notificación que solo requiere bandeja interna
- WHEN se inserta la fila `Notificacion` con `tipo='interna'`
- THEN `job_correo_id` puede ser `NULL` sin violar ninguna restricción de esquema

### Requirement: Motor de plantillas sin tabla en base de datos
El sistema MUST implementar el contenido de cada uno de los 4 tipos de notificación mediante
funciones puras parametrizadas por tipo (mismo patrón que `construirCorreoComprobante()` de #15).
El sistema MUST NOT introducir una tabla de plantillas en base de datos.

#### Scenario: Cada tipo produce un contenido determinista
- GIVEN los mismos parámetros de entrada (usuario, proceso, tipo de notificación)
- WHEN se invoca la función de plantilla correspondiente
- THEN produce el mismo `titulo`/`cuerpo` (o `asunto`/`cuerpo` de correo) de forma determinista,
  sin consultar una tabla de plantillas

### Requirement: Cola BullMQ dedicada `notificaciones`
El sistema MUST procesar los `JobCorreo` originados por eventos de notificación en una cola BullMQ
propia llamada `notificaciones`, separada de la cola `correo` usada por comprobantes de voto
(#15). El sistema MUST NOT compartir la misma cola entre comprobantes de voto y notificaciones.

#### Scenario: Ráfaga de recordatorios no retrasa comprobantes de voto
- GIVEN una ráfaga grande de `JobCorreo` de recordatorio encolados en `notificaciones`
- WHEN se emiten votos en paralelo generando `JobCorreo` de comprobante en la cola `correo`
- THEN los comprobantes de voto se procesan sin esperar a que la cola `notificaciones` se vacíe

### Requirement: Lectura y marcado de bandeja interna vía API
El sistema MUST exponer `GET /notificaciones` que devuelve, paginado, únicamente las
`Notificacion` cuyo `usuario_id` corresponde al usuario autenticado. El sistema MUST exponer
`PATCH /notificaciones/:id/leido` que marca `leido_en` con la hora actual solo si la notificación
pertenece al usuario autenticado. El sistema MUST responder `404` (o `403`) cuando el `id` no
pertenece al usuario autenticado, sin revelar si el registro existe para otro usuario.

#### Scenario: Listado scoped al usuario autenticado
- GIVEN dos usuarios con notificaciones propias distintas
- WHEN el usuario A invoca `GET /notificaciones`
- THEN recibe únicamente sus propias notificaciones, paginadas, nunca las del usuario B

#### Scenario: Marcado de lectura exitoso
- GIVEN una `Notificacion` propia del usuario autenticado con `leido_en=NULL`
- WHEN invoca `PATCH /notificaciones/:id/leido`
- THEN `leido_en` queda poblado con la hora de la petición

#### Scenario: Marcado de lectura de notificación ajena
- GIVEN una `Notificacion` que pertenece a otro usuario
- WHEN el usuario autenticado invoca `PATCH /notificaciones/:id/leido` con ese `id`
- THEN responde `404` (o `403`), y `leido_en` de esa fila permanece sin cambios
