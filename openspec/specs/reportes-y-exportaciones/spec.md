# Reportes y exportaciones — Specification

## Purpose

Define la solicitud, generación asíncrona y descarga de reportes de un `ProcesoElectoral` por
dimensión (participación, votantes, abstenciones, resultados, candidatos, consultas) y formato
(Excel, PDF, CSV), con el patrón worker-genera-archivo-y-audita de `cierre-escrutinio-actas`
(#17): 1 solicitud = 1 dimensión + 1 formato = 1 registro `Reporte` = 1 job en cola `reportes`. No
cubre UI de reportes, reportes compuestos multi-dimensión/formato, ni retención/purga (fuera de
alcance, ver proposal.md).

## Requirements

### Requirement: Solicitud de reporte
El sistema MUST exponer un endpoint que reciba `proceso_id`, `dimension` (una de `participacion`,
`votantes`, `abstenciones`, `resultados`, `candidatos`, `consultas`) y `formato` (una de `excel`,
`pdf`, `csv`), y que, ante una combinación válida, cree una fila `Reporte` en `estado='borrador'`
con `solicitado_por` poblado (patrón outbox de #17/ADR-0012: el endpoint persiste la fila, un
dispatcher del worker la recoge por polling y la encola en `reportes` en ≤ 5 s — el endpoint MUST
NOT encolar directamente). MUST responder `401` sin sesión autenticada, `403` fuera de los roles
`administrador|director|comite`, `404` si el proceso no existe, y `400` si `dimension` o `formato`
no pertenecen a los valores válidos.

#### Scenario: Solicitud válida
- GIVEN un proceso existente y un usuario con rol `director`
- WHEN solicita un reporte `dimension='resultados'`, `formato='pdf'`
- THEN responde `2xx`, existe un `Reporte` en `estado='borrador'` con `solicitado_por` = ese
  usuario, listo para que el dispatcher del worker lo recoja en ≤ 5 s

#### Scenario: Dimensión inválida
- GIVEN un usuario autorizado
- WHEN solicita `dimension='auditoria'` (no soportada)
- THEN responde `400`, no se crea ninguna fila `Reporte`

#### Scenario: Formato inválido
- GIVEN un usuario autorizado
- WHEN solicita `formato='word'` (no soportado)
- THEN responde `400`, no se crea ninguna fila `Reporte`

#### Scenario: Proceso inexistente
- GIVEN un `proceso_id` que no existe
- WHEN se solicita cualquier reporte válido para ese ID
- THEN responde `404`, no se crea ninguna fila `Reporte`

#### Scenario: Rol no autorizado
- GIVEN un usuario con rol `estudiante` o `docente`
- WHEN intenta solicitar cualquier reporte
- THEN responde `403`, no se crea ninguna fila `Reporte`

#### Scenario: Sin sesión
- GIVEN una petición sin credenciales de sesión válidas
- WHEN intenta solicitar cualquier reporte
- THEN responde `401`

### Requirement: Gate de visibilidad en dimensiones sensibles
El sistema MUST aplicar la misma condición `ocultar_resultados` de `resultados-en-vivo` (#16) al
generar reportes de `dimension='participacion'` o `dimension='resultados'`: cuando el proceso
tiene `ocultar_resultados=true`, el archivo generado (Excel/PDF/CSV) MUST NOT exponer el
desglose de votos, para ninguno de los 3 roles permitidos (`administrador|director|comite`). El
gate MUST NOT aplicarse a las dimensiones `votantes`, `abstenciones`, `candidatos` ni `consultas`.

#### Scenario: Resultados ocultos para administrador
- GIVEN un proceso con `ocultar_resultados=true`
- WHEN un `administrador` solicita `dimension='resultados'`
- THEN el archivo generado no incluye desglose de votos por candidato/lista/opción

#### Scenario: Resultados ocultos para director
- GIVEN un proceso con `ocultar_resultados=true`
- WHEN un `director` solicita `dimension='participacion'`
- THEN el archivo generado no incluye desglose, solo agregados permitidos por el gate

#### Scenario: Resultados ocultos para comité
- GIVEN un proceso con `ocultar_resultados=true`
- WHEN un `comite` solicita `dimension='resultados'`
- THEN el archivo generado no incluye desglose de votos, igual que para los otros 2 roles

#### Scenario: Dimensión no sensible ignora el gate
- GIVEN un proceso con `ocultar_resultados=true`
- WHEN cualquier rol autorizado solicita `dimension='candidatos'`
- THEN el archivo generado incluye el catálogo completo, sin aplicar el gate

### Requirement: Snapshot inmutable por solicitud
El sistema MUST tratar cada solicitud como un snapshot independiente: un `Reporte` ya
`estado='emitida'` MUST NOT regenerarse ni sobrescribirse. Una nueva solicitud con la misma
`dimension` y `formato` para el mismo proceso MUST crear un nuevo registro `Reporte` con su
propio job, sin referencia a los anteriores.

#### Scenario: Reintento crea un registro nuevo
- GIVEN un `Reporte` ya `emitida` para `proceso_id=X`, `dimension='votantes'`, `formato='csv'`
- WHEN se solicita de nuevo la misma combinación
- THEN se crea un segundo `Reporte` distinto, y el primero permanece sin cambios

### Requirement: Generación por worker y transición de estados
El sistema MUST procesar cada `Reporte` en `estado='borrador'` mediante un dispatcher que hace
polling y un processor puro con puertos (repo, renderer por formato), análogo a
`actas-dispatcher.ts`/`actas.processor.ts`. El worker MUST transicionar el estado con CAS
(`UPDATE … WHERE estado='borrador'`) a `emitida` tras persistir el archivo generado, o a
`fallido` solo tras agotar los reintentos configurados de la cola, nunca antes.

#### Scenario: Generación exitosa
- GIVEN un `Reporte` en `estado='borrador'`
- WHEN el worker lo procesa y persiste el archivo
- THEN transiciona a `estado='emitida'` en la misma transacción que escribe el archivo

#### Scenario: Falla tras agotar reintentos
- GIVEN un `Reporte` cuyo render falla repetidamente
- WHEN se agotan los reintentos de la cola
- THEN transiciona a `estado='fallido'`, consultable directamente sin inspeccionar la cola

### Requirement: Auditoría con actor poblado
El sistema MUST registrar un evento `REPORTE_GENERADO` por cada `Reporte` que llega a
`estado='emitida'`, con `actor_usuario_id` igual al `solicitado_por` de esa fila (a diferencia de
`ACTA_GENERADA`, que usa actor `null`). El worker MUST leer `solicitado_por` de la fila `Reporte`,
no de un payload volátil de cola, y escribir el evento dentro de la misma transacción terminal
que transiciona el estado.

#### Scenario: Auditoría con actor correcto
- GIVEN un `Reporte` solicitado por el usuario `U`
- WHEN el worker lo emite exitosamente
- THEN existe un evento `REPORTE_GENERADO` con `actor_usuario_id = U`, en la misma transacción
  que la transición a `emitida`

#### Scenario: Sin evento en fallo
- GIVEN un `Reporte` que transiciona a `estado='fallido'`
- WHEN se agotan los reintentos
- THEN no se registra ningún evento `REPORTE_GENERADO` para ese registro
