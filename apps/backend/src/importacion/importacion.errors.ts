// importacion-excel, PR2 (design.md "File Changes", tarea 2.3). `MOTIVOS_FILA` es el vocabulario
// de motivo para el reporte fila a fila (spec "Procesamiento fila a fila sin abortar el archivo
// ante filas inválidas"), reutilizando el mismo lenguaje que `USERS_ERROR_CODES`/
// `ACADEMICO_ERROR_CODES` (p. ej. `formato`, `campo_duplicado`, `referencia_inexistente`) — design
// D5. `IMPORTACION_ERROR_CODES` cubre los dos rechazos tempranos de archivo completo (cabecera
// inválida, tope de filas excedido, spec "Subida de archivo de padrón con formato de columnas
// fijo") — catálogo local, mismo criterio que `academico.errors.ts`/`users.errors.ts`.
export const MOTIVOS_FILA = {
  FILA_VACIA: 'fila_vacia',
  FORMATO: 'formato',
  CAMPO_DUPLICADO: 'campo_duplicado',
  REFERENCIA_INEXISTENTE: 'referencia_inexistente',
} as const;

export type MotivoFila = (typeof MOTIVOS_FILA)[keyof typeof MOTIVOS_FILA];

export const IMPORTACION_ERROR_CODES = {
  CABECERA_INVALIDA: 'CABECERA_INVALIDA',
  LIMITE_FILAS_EXCEDIDO: 'LIMITE_FILAS_EXCEDIDO',
  EXTENSION_NO_PERMITIDA: 'EXTENSION_NO_PERMITIDA',
  ARCHIVO_REQUERIDO: 'ARCHIVO_REQUERIDO',
} as const;

export type ImportacionErrorCode = (typeof IMPORTACION_ERROR_CODES)[keyof typeof IMPORTACION_ERROR_CODES];
