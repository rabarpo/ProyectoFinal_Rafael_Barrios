// notificaciones (backlog #19), PR5 (design.md D9, tarea 12.2). Catálogo local a
// `NotificacionesModule` — mismo formato `as const` + union type que `votos.errors.ts`/
// `procesos.errors.ts`. La causa "notificación ajena o inexistente" NO tiene código propio:
// responde `403` sin cuerpo discriminante (D9) para cerrar el oráculo de enumeración de `id`.
export const NOTIFICACIONES_ERROR_CODES = {
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
} as const;

export type NotificacionesErrorCode = (typeof NOTIFICACIONES_ERROR_CODES)[keyof typeof NOTIFICACIONES_ERROR_CODES];
