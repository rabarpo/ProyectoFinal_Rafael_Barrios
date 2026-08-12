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
} as const;

export type ProcesosErrorCode = (typeof PROCESOS_ERROR_CODES)[keyof typeof PROCESOS_ERROR_CODES];
