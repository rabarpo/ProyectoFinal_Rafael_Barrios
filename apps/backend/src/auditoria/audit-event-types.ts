// append-only-audit-engine (design.md D7, tarea 5.1): registro aditivo de tipos de evento.
// Un ítem posterior agrega su propia clave a este objeto — nada más — salvo que su evento
// toque la identidad de un voto, caso en el que ADR-0016 le obliga a agregarse también a la
// cláusula `WHEN` del trigger `eventoauditoria_claves_eleccion_trg` (ver TM4 de design.md).
// auth-server-sessions (PR3, tarea 6.2): claves aditivas para login/logout. No tocan la cláusula
// `WHEN` del trigger `eventoauditoria_claves_eleccion_trg` (ADR-0016), que solo cubre
// `VOTO`/`RECHAZO` — LOGIN_EXITOSO/LOGIN_FALLIDO/LOGOUT quedan fuera de esa obligación versionada.
export const AUDIT_EVENT_TYPES = {
  VOTO: 'VOTO',
  RECHAZO: 'RECHAZO',
  LOGIN_EXITOSO: 'LOGIN_EXITOSO',
  LOGIN_FALLIDO: 'LOGIN_FALLIDO',
  LOGOUT: 'LOGOUT',
} as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[keyof typeof AUDIT_EVENT_TYPES];
