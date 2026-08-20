/**
 * administracion-academica, PR1 (#26; design.md D7). `Record` TOTAL sobre los 7 códigos de
 * `apps/backend/src/academico/academico.errors.ts` (`ACADEMICO_ERROR_CODES`) — agregar un
 * código nuevo ahí rompe la compilación de este mapa en vez de degradar en silencio a un texto
 * genérico (misma disciplina que `MENU_POR_ROL`, D3 de #25). `mensajeDeError` interpola
 * `relacion` para `ENTIDAD_CON_DEPENDIENTES` cuando el backend la manda (`niveles.service.ts` y
 * sus cinco pares), y cae a un fallback genérico por `status` cuando no hay `codigo` reconocido.
 */
export type CodigoAcademico =
  | 'RESTRICCION_UNICA'
  | 'REFERENCIA_INEXISTENTE'
  | 'ENTIDAD_CON_DEPENDIENTES'
  | 'ACTIVACION_CONCURRENTE'
  | 'CAMPO_INVALIDO'
  | 'COHERENCIA_JERARQUICA'
  | 'USUARIO_NO_ES_ESTUDIANTE';

const MENSAJE_POR_CODIGO: Record<CodigoAcademico, string> = {
  RESTRICCION_UNICA: 'Ya existe un registro con esos mismos datos.',
  REFERENCIA_INEXISTENTE: 'Uno de los elementos relacionados ya no existe.',
  ENTIDAD_CON_DEPENDIENTES: 'No se puede eliminar: todavía tiene elementos relacionados.',
  ACTIVACION_CONCURRENTE: 'Otro cambio de activación ya está en curso. Intentalo de nuevo.',
  CAMPO_INVALIDO: 'Uno de los campos ingresados no es válido.',
  COHERENCIA_JERARQUICA: 'Los elementos seleccionados no son coherentes entre sí.',
  USUARIO_NO_ES_ESTUDIANTE: 'El usuario seleccionado no tiene rol de estudiante.',
};

const MENSAJE_GENERICO = 'Ocurrió un error inesperado. Intentalo de nuevo.';

export function mensajeDeError(e: { codigo?: CodigoAcademico; relacion?: string; status?: number }): string {
  if (!e.codigo) {
    return MENSAJE_GENERICO;
  }

  if (e.codigo === 'ENTIDAD_CON_DEPENDIENTES' && e.relacion) {
    return `No se puede eliminar: todavía tiene ${e.relacion} asociados.`;
  }

  return MENSAJE_POR_CODIGO[e.codigo];
}
