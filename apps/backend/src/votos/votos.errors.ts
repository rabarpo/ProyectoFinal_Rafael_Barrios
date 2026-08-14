// vote-casting, PR1 (design.md D9, tarea 1.2). Catálogo local a `VotosModule` — mismo formato
// `as const` + union type que `procesos.errors.ts`. La causa 1 (derecho ajeno o inexistente) NO
// tiene código propio: responde `403` sin cuerpo discriminante (D9) para cerrar el oráculo de
// enumeración de `derecho_voto_id` (Threat Matrix "IDOR / enumeración").
export const VOTOS_ERROR_CODES = {
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
  SIN_DERECHO: 'SIN_DERECHO',
  VOTACION_CERRADA: 'VOTACION_CERRADA',
  DERECHO_YA_EJERCIDO: 'DERECHO_YA_EJERCIDO',
  ELECCION_INVALIDA: 'ELECCION_INVALIDA',
} as const;

export type VotosErrorCode = (typeof VOTOS_ERROR_CODES)[keyof typeof VOTOS_ERROR_CODES];
