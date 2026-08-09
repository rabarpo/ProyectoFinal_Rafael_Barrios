// administracion-academica, PR1 (design.md D5, tarea 2.1). Catálogo local a `AcademicoModule`:
// compartido por las seis entidades (`AnioEscolar`, `Nivel`, `Grado`, `Seccion`, `Aula`,
// `Matricula`) por ser un solo contexto acotado (D0) — mismo formato que `users.errors.ts` de
// `administracion-usuarios-apoderados`: cuando el cliente necesita discriminar el error, el body
// es un objeto con `codigo`; cuando no, se mantiene el body por defecto de Nest (ver design.md D5).
export const ACADEMICO_ERROR_CODES = {
  RESTRICCION_UNICA: 'RESTRICCION_UNICA',
  REFERENCIA_INEXISTENTE: 'REFERENCIA_INEXISTENTE',
  ENTIDAD_CON_DEPENDIENTES: 'ENTIDAD_CON_DEPENDIENTES',
  ACTIVACION_CONCURRENTE: 'ACTIVACION_CONCURRENTE',
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
  COHERENCIA_JERARQUICA: 'COHERENCIA_JERARQUICA',
  USUARIO_NO_ES_ESTUDIANTE: 'USUARIO_NO_ES_ESTUDIANTE',
} as const;

export type AcademicoErrorCode = (typeof ACADEMICO_ERROR_CODES)[keyof typeof ACADEMICO_ERROR_CODES];
