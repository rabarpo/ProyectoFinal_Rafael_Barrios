// administracion-procesos-electorales, PR5 (design.md D5, tarea 12.2). Catálogo local a
// `ProcesosModule` — mismo formato que `users.errors.ts`/`academico.errors.ts`: objeto `as const`
// + union type, body con `codigo` solo cuando el cliente necesita discriminar el error.
export const PROCESOS_ERROR_CODES = {
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
  REFERENCIA_INEXISTENTE: 'REFERENCIA_INEXISTENTE',
  SEGMENTACION_INVALIDA: 'SEGMENTACION_INVALIDA',
  SEGMENTACION_SIN_ELEGIBLES: 'SEGMENTACION_SIN_ELEGIBLES',
  PROCESO_NO_EDITABLE: 'PROCESO_NO_EDITABLE',
  SIN_ANIO_ESCOLAR_ACTIVO: 'SIN_ANIO_ESCOLAR_ACTIVO',
  // apertura-proceso-congelamiento-padron (#13, PR1; design.md D5): única clave nueva de este
  // change. Cubre la relectura post-guarda cuando el estado ya no es 'borrador' y tampoco es el
  // no-op idempotente de 'abierto' (cerrado/acta_emitida) — el cliente discrimina por `estado`.
  PROCESO_NO_ABRIBLE: 'PROCESO_NO_ABRIBLE',
  // cierre-escrutinio-actas (#17, PR3; design.md D4): relectura post-guarda de `cerrar()` cuando el
  // estado no es 'abierto' y tampoco es el no-op idempotente ('cerrado'/'acta_emitida') — el
  // cliente discrimina por `estado`.
  PROCESO_NO_CERRABLE: 'PROCESO_NO_CERRABLE',
  // cierre-escrutinio-actas (#17, PR3/PR4; design.md D13): 409 al pedir el PDF de una acta que
  // aún está en 'borrador' o 'fallido' — se declara en este PR junto al resto del catálogo
  // aditivo, aunque el endpoint de descarga que la usa llega recién en PR4.
  ACTA_NO_EMITIDA: 'ACTA_NO_EMITIDA',
} as const;

export type ProcesosErrorCode = (typeof PROCESOS_ERROR_CODES)[keyof typeof PROCESOS_ERROR_CODES];
