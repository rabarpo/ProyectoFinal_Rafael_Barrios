# Especificación: append-only-audit-engine

## Purpose

Define la tabla `EventoAuditoría`, sus garantías estructurales append-only impuestas por el motor
de base de datos (triggers + permisos) y el servicio de registro transaccional mínimo que otros
módulos del backend invocan. Cubre solo el camino de escritura y su imposición estructural — el
camino de lectura/consulta (Backlog #21), la retención/anonimización y la evidencia de
manipulación (hash chaining) quedan fuera de alcance. Capacidad greenfield — no hay spec previa
que modificar.

## Requirements

### Requirement: Esquema de `EventoAuditoría`
El sistema MUST modelar `EventoAuditoría` (SQL raw, según ADR-0003) con `id`, `actor_usuario_id`
(FK nulable a `Usuario`), `event_type` (`TEXT`), `entity_type` (`TEXT`), `entity_id` (`TEXT`/UUID
nulable), `occurred_at` (`TIMESTAMPTZ NOT NULL DEFAULT now()`, solo hora del servidor), `ip_address`
(`INET` nulable), `user_agent` (`TEXT` nulable) y `payload` (`JSONB`).

#### Scenario: La tabla existe con el conjunto completo de columnas
- GIVEN la migración de este change aplicada
- WHEN se inspecciona `EventoAuditoría` en el esquema
- THEN existen todas las columnas listadas, con `occurred_at` no nulable y default `now()`

#### Scenario: `occurred_at` ignora un valor provisto por el cliente
- GIVEN un insert de `EventoAuditoría` que intenta establecer `occurred_at` explícitamente a un valor pasado
- WHEN la fila se inserta a través de `AuditoriaService`
- THEN `occurred_at` refleja la hora del servidor en el momento del insert, no el valor provisto

### Requirement: Rechazo estructural de `UPDATE`
El sistema MUST rechazar todo `UPDATE` sobre `EventoAuditoría` mediante un trigger `BEFORE UPDATE`
con `RAISE EXCEPTION`, sin excepción temporal ni bandera de desactivación en la lógica del trigger.

#### Scenario: Un `UPDATE` directo es rechazado
- GIVEN una fila de `EventoAuditoría` existente
- WHEN se ejecuta `UPDATE "EventoAuditoria" SET event_type = 'X' WHERE id = $1`
- THEN Postgres lanza un error y el `event_type` de la fila queda sin cambios

### Requirement: Rechazo estructural de `DELETE`
El sistema MUST rechazar todo `DELETE` sobre `EventoAuditoría` mediante un trigger `BEFORE DELETE`
con `RAISE EXCEPTION`, sin excepción temporal ni bandera de desactivación en la lógica del trigger.

#### Scenario: Un `DELETE` directo es rechazado
- GIVEN una fila de `EventoAuditoría` existente
- WHEN se ejecuta `DELETE FROM "EventoAuditoria" WHERE id = $1`
- THEN Postgres lanza un error y la fila sigue existiendo después del intento

### Requirement: Capa de permisos independiente del trigger
El sistema MUST revocar `UPDATE`, `DELETE` y `TRUNCATE` sobre `EventoAuditoría` al rol de
aplicación de runtime (`seei_app`, aprovisionado por system-scaffolding/ADR-0015), de modo que la
imposición a nivel de permisos sea verificable de forma aislada de la capa de trigger.

#### Scenario: `seei_app` no puede modificar ni borrar mediante SQL directo
- GIVEN una conexión establecida con las credenciales del rol `seei_app`
- WHEN se intenta `UPDATE` o `DELETE` directamente sobre `EventoAuditoría`, evitando la capa de servicio
- THEN Postgres rechaza la operación con el código de error `42501` (`insufficient_privilege`)

### Requirement: Bloqueo estructural de identidad↔elección en el payload
El sistema MUST rechazar, mediante un trigger `BEFORE INSERT`, todo evento de la familia `VOTO`
(tipos `VOTO` y `RECHAZO`) cuyo `payload` JSONB contenga alguna de las claves `candidato_id`,
`lista_id`, `opcion_id`, `blanco` o `eleccion`, independientemente de qué módulo del backend emita
el insert (ADR-0010 §1; decisión nueva de este change, ver proposal.md).

#### Scenario: Un payload de `VOTO` con clave prohibida es rechazado
- GIVEN un insert de `EventoAuditoría` con `event_type = 'VOTO'` y `payload` conteniendo `candidato_id`
- WHEN el insert se ejecuta, directo o vía `AuditoriaService`
- THEN el trigger `BEFORE INSERT` rechaza la fila y ninguna fila queda registrada

#### Scenario: Un payload de `RECHAZO` con clave prohibida es rechazado
- GIVEN un insert de `EventoAuditoría` con `event_type = 'RECHAZO'` y `payload` conteniendo `opcion_id`
- WHEN el insert se ejecuta
- THEN el trigger `BEFORE INSERT` rechaza la fila por la misma razón que un evento `VOTO`

#### Scenario: Un payload de `VOTO` sin claves prohibidas es aceptado
- GIVEN un insert de `EventoAuditoría` con `event_type = 'VOTO'` y `payload` que solo contiene `proceso_id`, `derecho_voto_id` y código de comprobante
- WHEN el insert se ejecuta
- THEN Postgres acepta la fila

### Requirement: Registro transaccional atómico
El sistema MUST proveer `AuditoriaService.log(tx, eventType, actorId, entityType, entityId,
payload)`, un método que otros módulos invocan dentro de su propia transacción de negocio
(`prisma.$transaction`), de modo que la escritura de auditoría y la escritura de negocio compartan
la misma transacción de Postgres.

#### Scenario: Un rollback de negocio no deja fila de auditoría
- GIVEN una escritura de negocio y `AuditoriaService.log(...)` invocados dentro del mismo `$transaction`
- WHEN la transacción hace rollback tras un error posterior a ambas escrituras
- THEN no existe fila ni en la tabla de negocio ni en `EventoAuditoría` para esa operación

#### Scenario: Una transacción confirmada deja exactamente una fila de auditoría
- GIVEN el mismo envoltorio sin error forzado
- WHEN la transacción se confirma
- THEN existe exactamente una fila de negocio y exactamente una fila de auditoría, con `entity_id` coincidiendo con el id de la fila de negocio

### Requirement: Fallo de auditoría aborta la operación de negocio
El sistema MUST hacer que un fallo en la escritura de auditoría (p. ej. rechazo por el trigger de
claves prohibidas) provoque el rollback de la escritura de negocio que la acompaña dentro de la
misma transacción — ninguna de las dos partes se considera ocurrida si la otra falla.

#### Scenario: Un payload de `VOTO` malformado aborta la escritura de negocio
- GIVEN una escritura de negocio y un `AuditoriaService.log(...)` con `event_type = 'VOTO'` y payload conteniendo `candidato_id`, en el mismo `$transaction`
- WHEN la transacción se ejecuta
- THEN el trigger `BEFORE INSERT` rechaza el evento de auditoría y la escritura de negocio también hace rollback

### Requirement: Registro aditivo de tipos de evento
El sistema MUST restringir `event_type` solo con un `CHECK` liviano (no vacío, convención de
nombres) en vez de un `ENUM` de Postgres, y MUST proveer una unión de literales de cadena
`AuditEventType` en una ubicación compartida que los ítems posteriores (#4–#20) extienden
agregando su propio literal, sin modificar ningún archivo del que este change sea dueño.

#### Scenario: Un `event_type` que no cumple la convención es rechazado
- GIVEN un insert de `EventoAuditoría` con `event_type = ''` o con caracteres fuera de la convención `^[A-Z_]+$`
- WHEN el insert se ejecuta
- THEN Postgres rechaza el insert con violación de `CHECK` (`23514`)

#### Scenario: Un ítem posterior agrega un tipo de evento nuevo sin tocar archivos de este change
- GIVEN la unión `AuditEventType` existente tras este change
- WHEN un módulo de un ítem posterior agrega un literal nuevo a esa unión y registra un evento con ese `event_type`
- THEN el insert se acepta sin requerir cambios en ningún archivo del que este change sea dueño
