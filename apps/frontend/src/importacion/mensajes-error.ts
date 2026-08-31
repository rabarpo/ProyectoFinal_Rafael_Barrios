/**
 * frontend-importacion-excel, PR2 (#29; design.md D7, tasks.md 2.3-2.4). `Record` TOTAL sobre los
 * 5 códigos de `apps/backend/src/importacion/importacion.errors.ts` (`IMPORTACION_ERROR_CODES`) —
 * agregar un código nuevo ahí rompe la compilación de este mapa en vez de degradar en silencio a
 * un texto genérico (misma disciplina que `configuracion/mensajes-error.ts`, D7 de `#26`/`#27`/`#28`).
 *
 * DUPLICACIÓN CONTROLADA: `CodigoImportacion` se copia literal de `importacion.errors.ts` porque
 * los catálogos de código son locales a su módulo backend (decisión de `#7`) y no hay un tipo
 * compartido en `packages/contracts` para ellos. Si el backend agrega un código, este union y su
 * `Record` fallan a compilar.
 *
 * El fallback por `status` es obligatorio: `filtroArchivoPadron` corre en Multer y su
 * `BadRequestException` puede llegar antes de cualquier `codigo` propio, y el `413`/error de red
 * no trae `codigo`.
 */
export type CodigoImportacion =
  | 'CABECERA_INVALIDA'
  | 'LIMITE_FILAS_EXCEDIDO'
  | 'EXTENSION_NO_PERMITIDA'
  | 'ARCHIVO_REQUERIDO'
  | 'REPORTE_NO_ENCONTRADO';

const MENSAJE_POR_CODIGO: Record<CodigoImportacion, string> = {
  CABECERA_INVALIDA:
    'La cabecera del archivo no coincide con el formato de columnas esperado del padrón.',
  LIMITE_FILAS_EXCEDIDO: 'El archivo supera el máximo de 2000 filas permitidas por importación.',
  EXTENSION_NO_PERMITIDA: 'El formato del archivo no está permitido (usa .xlsx o .csv).',
  ARCHIVO_REQUERIDO: 'Debes seleccionar un archivo para importar.',
  REPORTE_NO_ENCONTRADO: 'El reporte de errores expiró o ya no está disponible.',
};

const MENSAJE_POR_STATUS: Record<number, string> = {
  403: 'Tu rol no permite esta acción.',
  404: 'El recurso solicitado ya no existe.',
};

const MENSAJE_GENERICO = 'Ocurrió un error inesperado. Intentalo de nuevo.';

export function mensajeDeError(e: { codigo?: CodigoImportacion; status?: number }): string {
  if (e.codigo) {
    return MENSAJE_POR_CODIGO[e.codigo];
  }

  if (e.status && MENSAJE_POR_STATUS[e.status]) {
    return MENSAJE_POR_STATUS[e.status];
  }

  return MENSAJE_GENERICO;
}
