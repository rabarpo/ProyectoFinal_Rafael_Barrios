// append-only-audit-engine (design.md D7, tarea 5.1): registro aditivo de tipos de evento.
// Un ítem posterior agrega su propia clave a este objeto — nada más — salvo que su evento
// toque la identidad de un voto, caso en el que ADR-0016 le obliga a agregarse también a la
// cláusula `WHEN` del trigger `eventoauditoria_claves_eleccion_trg` (ver TM4 de design.md).
// auth-server-sessions (PR3, tarea 6.2): claves aditivas para login/logout. No tocan la cláusula
// `WHEN` del trigger `eventoauditoria_claves_eleccion_trg` (ADR-0016), que solo cubre
// `VOTO`/`RECHAZO` — LOGIN_EXITOSO/LOGIN_FALLIDO/LOGOUT quedan fuera de esa obligación versionada.
// google-oauth-y-recuperacion (PR1, tarea 4.1; design.md D3/D7, spec "Eventos de auditoría nuevos
// son aditivos"): claves aditivas para login OAuth y recuperación de contraseña. Tampoco tocan la
// cláusula `WHEN` del trigger de ADR-0016 — ninguna de las cuatro toca un `Voto`.
// bloqueo-desbloqueo-cuentas (PR1, tarea 2.1; design.md "Cambios de archivos"): claves aditivas
// para la transición automática a `bloqueado` (fuerza bruta, D2) y el desbloqueo por doble vía
// (expiración perezosa D6, manual del comité). Tampoco tocan la cláusula `WHEN` de ADR-0016.
// administracion-usuarios-apoderados (PR1, tarea 2.1; design.md D4): claves aditivas para el CRUD
// de `Usuario`/`Apoderado`. Ninguna de las siete toca un `Voto`, así que tampoco activan la
// obligación versionada de ADR-0016 — ver test/schema/auditoria.spec.ts, caso [TM4].
// administracion-academica (PR1, tarea 4.1; design.md D4): dieciocho claves aditivas para el CRUD
// de `AnioEscolar`/`Nivel`/`Grado`/`Seccion`/`Aula`/`Matricula` y la activación de año escolar.
// Ninguna de las dieciocho toca un `Voto`, así que tampoco activan la obligación versionada de
// ADR-0016 — ver test/schema/auditoria.spec.ts, caso [TM4] (tarea 4.2/29.1).
// importacion-excel (#9, PR1; design.md D6, spec "Auditoría agregada por operación de
// importación"): clave aditiva `PADRON_IMPORTADO`, un evento por importación (no uno por fila) con
// el conteo de filas válidas/inválidas. `USUARIO_CREADO`/`MATRICULA_CREADA` por fila siguen
// emitiéndose igual (comportamiento vigente de los servicios reutilizados) — el "único evento"
// aplica solo a esta clave nueva. No toca la cláusula `WHEN` del trigger de ADR-0016 (no involucra
// `Voto`) — ver test/schema/auditoria.spec.ts, caso [TM4].
// configuracion-general, PR2 (design.md D9, tarea 2.8): tres claves aditivas para el singleton
// `Configuracion`. `CONFIGURACION_ACTUALIZADA` cubre nombre/director/colores/zona_horaria con
// payload `{ campos: [...] }` (patrón `anios-escolares`); `CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO`
// es una clave separada porque ese campo controla acceso (login Google Workspace) y necesita
// payload `antes`/`después` completo, no solo el nombre del campo; `CONFIGURACION_LOGO_ACTUALIZADO`
// se declara ahora (D9 pide las tres en el mismo PR) pero se emite recién en PR3 cuando exista
// `POST /configuracion/logo`. Ninguna de las tres toca un `Voto`, así que tampoco activan la
// obligación versionada de ADR-0016 — ver test/schema/auditoria.spec.ts, caso [TM4].
// administracion-procesos-electorales, PR4 (design.md D6, tarea 10.1): tres claves aditivas para
// `ProcesoElectoral`, una por operación y nunca una por `ProcesoAula` — la creación en lote de
// `representante_aula` sigue emitiendo un único `PROCESO_CREADO` con el conteo `aulas: N` en el
// payload. Ninguna de las tres toca un `Voto`, así que tampoco activan la obligación versionada de
// ADR-0016 — ver test/schema/auditoria.spec.ts, caso [TM4].
// candidatos-listas-opciones-consulta, PR1 (design.md D9, tarea 2.1): catorce claves aditivas para
// `Lista`/`Candidato`/`OpcionConsulta`. La foto de `Candidato` viaja en el mismo `PATCH` que el
// resto de campos (D4), por lo que se reporta como `CANDIDATO_ACTUALIZADO` sin clave propia; el
// plan de trabajo de `Lista` tiene endpoint propio (`PUT /listas/:id/plan-trabajo`) y por eso sí
// tiene su clave dedicada `LISTA_PLAN_TRABAJO_ACTUALIZADO`. `OpcionConsulta` no tiene
// `estado`/`baja_en` en el schema, así que no tiene claves de baja/reactivación. Ninguna de las
// catorce toca un `Voto`, así que tampoco activan la obligación versionada de ADR-0016 — ver
// test/schema/auditoria.spec.ts, caso [TM4].
// apertura-proceso-congelamiento-padron, PR1 (design.md D11, tarea 2.2): una clave aditiva
// `PROCESO_ABIERTO`, emitida una sola vez por transición `borrador -> abierto` (nunca en el no-op
// idempotente ni por fila de `DerechoVoto` materializada), con conteos en el payload. No escribe ni
// referencia un `Voto`, así que tampoco activa la obligación versionada de ADR-0016 — ver
// test/schema/auditoria.spec.ts, caso [TM4].
// vote-casting, PR2/PR3 (design.md D11, tareas 6.7/8.5): primer emisor real de `VOTO`/`RECHAZO`
// (ambas claves ya existían desde append-only-audit-engine, cero claves nuevas aquí). `VOTO` se
// registra una sola vez por transacción exitosa de `POST /votos`, dentro de la misma transacción
// que inserta el `Voto`; `RECHAZO` se registra en su propia transacción independiente y exitosa
// para las causas 2-4 de rechazo del derecho al voto (nunca dentro de la transacción fallida del
// voto). Ninguno de los dos payloads incluye `candidato_id`/`lista_id`/`opcion_id`/`blanco`/
// `eleccion` — sí activan la cláusula `WHEN` del trigger de ADR-0016 (`ambas` ya estaban cubiertas
// desde su enmienda en #3) — ver test/schema/auditoria.spec.ts, caso [TM4].
// reportes-y-exportaciones (#18, PR3; design.md D13, tarea 7.3): una clave aditiva
// `REPORTE_GENERADO`, escrita por el worker (PR4) dentro de la misma transacción terminal que
// transiciona un `Reporte` a `estado='emitida'`. A diferencia de `ACTA_GENERADA`, el actor NO es
// `null`: `actor_usuario_id = reporte.solicitado_por`, leído de la fila dentro de la transacción,
// nunca del payload volátil de la cola (D2/D13 — corrige la regresión de `ACTA_GENERADA`). Payload
// cerrado `{ proceso_id, dimension, formato, gate_aplicado, filas, bytes }`: sólo cardinalidades,
// jamás desglose ni nombres. No toca la cláusula `WHEN` del trigger de ADR-0016 (no involucra un
// `Voto`) — ver test/schema/auditoria.spec.ts, caso [TM4].
export const AUDIT_EVENT_TYPES = {
  VOTO: 'VOTO',
  RECHAZO: 'RECHAZO',
  LOGIN_EXITOSO: 'LOGIN_EXITOSO',
  LOGIN_FALLIDO: 'LOGIN_FALLIDO',
  LOGOUT: 'LOGOUT',
  LOGIN_OAUTH_EXITOSO: 'LOGIN_OAUTH_EXITOSO',
  LOGIN_OAUTH_FALLIDO: 'LOGIN_OAUTH_FALLIDO',
  RECUPERACION_SOLICITADA: 'RECUPERACION_SOLICITADA',
  RECUPERACION_COMPLETADA: 'RECUPERACION_COMPLETADA',
  CUENTA_BLOQUEADA: 'CUENTA_BLOQUEADA',
  CUENTA_DESBLOQUEADA: 'CUENTA_DESBLOQUEADA',
  USUARIO_CREADO: 'USUARIO_CREADO',
  USUARIO_ACTUALIZADO: 'USUARIO_ACTUALIZADO',
  USUARIO_DESACTIVADO: 'USUARIO_DESACTIVADO',
  USUARIO_REACTIVADO: 'USUARIO_REACTIVADO',
  APODERADO_CREADO: 'APODERADO_CREADO',
  APODERADO_ACTUALIZADO: 'APODERADO_ACTUALIZADO',
  APODERADO_ELIMINADO: 'APODERADO_ELIMINADO',
  ANIO_ESCOLAR_CREADO: 'ANIO_ESCOLAR_CREADO',
  ANIO_ESCOLAR_ACTUALIZADO: 'ANIO_ESCOLAR_ACTUALIZADO',
  ANIO_ESCOLAR_ACTIVADO: 'ANIO_ESCOLAR_ACTIVADO',
  ANIO_ESCOLAR_ELIMINADO: 'ANIO_ESCOLAR_ELIMINADO',
  NIVEL_CREADO: 'NIVEL_CREADO',
  NIVEL_ACTUALIZADO: 'NIVEL_ACTUALIZADO',
  NIVEL_ELIMINADO: 'NIVEL_ELIMINADO',
  GRADO_CREADO: 'GRADO_CREADO',
  GRADO_ACTUALIZADO: 'GRADO_ACTUALIZADO',
  GRADO_ELIMINADO: 'GRADO_ELIMINADO',
  SECCION_CREADA: 'SECCION_CREADA',
  SECCION_ACTUALIZADA: 'SECCION_ACTUALIZADA',
  SECCION_ELIMINADA: 'SECCION_ELIMINADA',
  AULA_CREADA: 'AULA_CREADA',
  AULA_ACTUALIZADA: 'AULA_ACTUALIZADA',
  AULA_ELIMINADA: 'AULA_ELIMINADA',
  MATRICULA_CREADA: 'MATRICULA_CREADA',
  MATRICULA_ELIMINADA: 'MATRICULA_ELIMINADA',
  PADRON_IMPORTADO: 'PADRON_IMPORTADO',
  CONFIGURACION_ACTUALIZADA: 'CONFIGURACION_ACTUALIZADA',
  CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO: 'CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO',
  CONFIGURACION_LOGO_ACTUALIZADO: 'CONFIGURACION_LOGO_ACTUALIZADO',
  PROCESO_CREADO: 'PROCESO_CREADO',
  PROCESO_EDITADO: 'PROCESO_EDITADO',
  PROCESO_ELIMINADO: 'PROCESO_ELIMINADO',
  LISTA_CREADA: 'LISTA_CREADA',
  LISTA_ACTUALIZADA: 'LISTA_ACTUALIZADA',
  LISTA_ELIMINADA: 'LISTA_ELIMINADA',
  LISTA_DADA_DE_BAJA: 'LISTA_DADA_DE_BAJA',
  LISTA_REACTIVADA: 'LISTA_REACTIVADA',
  LISTA_PLAN_TRABAJO_ACTUALIZADO: 'LISTA_PLAN_TRABAJO_ACTUALIZADO',
  CANDIDATO_CREADO: 'CANDIDATO_CREADO',
  CANDIDATO_ACTUALIZADO: 'CANDIDATO_ACTUALIZADO',
  CANDIDATO_ELIMINADO: 'CANDIDATO_ELIMINADO',
  CANDIDATO_DADO_DE_BAJA: 'CANDIDATO_DADO_DE_BAJA',
  CANDIDATO_REACTIVADO: 'CANDIDATO_REACTIVADO',
  OPCION_CONSULTA_CREADA: 'OPCION_CONSULTA_CREADA',
  OPCION_CONSULTA_ACTUALIZADA: 'OPCION_CONSULTA_ACTUALIZADA',
  OPCION_CONSULTA_ELIMINADA: 'OPCION_CONSULTA_ELIMINADA',
  PROCESO_ABIERTO: 'PROCESO_ABIERTO',
  // cierre-escrutinio-actas, PR3 (design.md D14, tarea 11.5): dos claves aditivas. `PROCESO_CERRADO`
  // (actor = usuario del comité) se emite una sola vez por transición `abierto -> cerrado` (nunca en
  // el no-op idempotente), con conteos agregados en el payload — nunca `candidato_id`/`lista_id`/
  // `opcion_id`/`blanco`/`eleccion`/`empatados`. `ACTA_GENERADA` (actor `null`, escrito por el
  // worker de PR5) se emite una vez por cada una de las 4 actas al terminar su render, con `tipo`
  // en el payload. Ninguna de las dos toca un `Voto`, así que tampoco activan la obligación
  // versionada de ADR-0016 — ver test/schema/auditoria.spec.ts, caso [TM4].
  PROCESO_CERRADO: 'PROCESO_CERRADO',
  ACTA_GENERADA: 'ACTA_GENERADA',
  REPORTE_GENERADO: 'REPORTE_GENERADO',
  // notificaciones, PR4 (design.md D11, tarea 9.1): una clave aditiva `NOTIFICACIONES_EMITIDAS`,
  // escrita por `emitirNotificaciones()` (PR3, `notificaciones/emitir-notificaciones.ts`) con
  // `tx.eventoAuditoria.create()` directo — no `AuditoriaService`, porque el sweep del worker
  // (PR9/PR10) no puede importar el contenedor de DI de Nest. Un evento AGREGADO por invocación
  // (≤4 por proceso: inicio_votacion/recordatorio/cierre_proximo/resultados), nunca uno por
  // notificación ni por destinatario. Payload cerrado `{ evento, notificaciones, jobs_correo }` —
  // jamás `usuario_id` ni identidad de elección. No toca la cláusula `WHEN` del trigger de
  // ADR-0016 (no involucra un `Voto`) — ver test/schema/auditoria.spec.ts, caso [TM4].
  NOTIFICACIONES_EMITIDAS: 'NOTIFICACIONES_EMITIDAS',
} as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];
