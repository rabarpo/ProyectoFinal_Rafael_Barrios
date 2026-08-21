/**
 * frontend-configuracion-general, PR2 (#28; design.md D7, tasks.md 7.1-7.5). `Record` TOTAL sobre
 * los 6 códigos de `apps/backend/src/configuracion/configuracion.errors.ts`
 * (`CONFIGURACION_ERROR_CODES`) — agregar un código nuevo ahí rompe la compilación de este mapa
 * en vez de degradar en silencio a un texto genérico (misma disciplina que
 * `usuarios/mensajes-error.ts` y `academico/mensajes-error.ts`, D7 de `#26`/`#27`).
 *
 * Los `BadRequestException` de este módulo backend son `{ codigo, campo, motivo }` (los tres
 * validadores: color, zona horaria, dominios) o `{ codigo }` pelado (los cuatro del logo) —
 * `mensajeDeError` interpola `campo` sólo cuando llega.
 */
export type CodigoConfiguracion =
  | 'CAMPO_INVALIDO'
  | 'LOGO_FORMATO_NO_PERMITIDO'
  | 'LOGO_TAMANIO_EXCEDIDO'
  | 'LOGO_VACIO'
  | 'LOGO_REQUERIDO'
  | 'LOGO_NO_ENCONTRADO';

const MENSAJE_POR_CODIGO: Record<CodigoConfiguracion, string> = {
  CAMPO_INVALIDO: 'Uno de los campos ingresados no es válido.',
  LOGO_FORMATO_NO_PERMITIDO: 'El formato del archivo no está permitido (usa PNG, JPG o SVG).',
  LOGO_TAMANIO_EXCEDIDO: 'El archivo supera el tamaño máximo permitido (2 MB).',
  LOGO_VACIO: 'El archivo está vacío.',
  LOGO_REQUERIDO: 'Debes seleccionar un archivo para subir.',
  LOGO_NO_ENCONTRADO: 'No hay un logo institucional persistido.',
};

const MENSAJE_POR_STATUS: Record<number, string> = {
  403: 'Tu rol no permite esta acción.',
  404: 'El registro ya no existe.',
};

const MENSAJE_GENERICO = 'Ocurrió un error inesperado. Intentalo de nuevo.';

export function mensajeDeError(e: {
  codigo?: CodigoConfiguracion;
  campo?: string;
  status?: number;
}): string {
  if (!e.codigo) {
    if (e.status && MENSAJE_POR_STATUS[e.status]) {
      return MENSAJE_POR_STATUS[e.status];
    }
    return MENSAJE_GENERICO;
  }

  if (e.codigo === 'CAMPO_INVALIDO' && e.campo) {
    return `El campo ${e.campo} no es válido.`;
  }

  return MENSAJE_POR_CODIGO[e.codigo];
}
