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
  // rediseno-boleta-votacion, PR2 (design.md D3, tarea 5.7/5.8). Pertenencia válida pero binario no
  // persistido — mismo código que `CANDIDATOS_ERROR_CODES.ARCHIVO_NO_ENCONTRADO` (404, no 403).
  ARCHIVO_NO_ENCONTRADO: 'ARCHIVO_NO_ENCONTRADO',
} as const;

export type VotosErrorCode = (typeof VOTOS_ERROR_CODES)[keyof typeof VOTOS_ERROR_CODES];
