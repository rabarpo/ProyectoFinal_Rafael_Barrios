/**
 * administracion-usuarios-apoderados, PR2 (#27; design.md D7). `Record` TOTAL sobre los 5
 * códigos de `apps/backend/src/users/users.errors.ts` (`USERS_ERROR_CODES`) — agregar un código
 * nuevo ahí rompe la compilación de este mapa en vez de degradar en silencio a un texto genérico
 * (misma disciplina que `MENU_POR_ROL`, D3 de #25, y `academico/mensajes-error.ts`, D7 de #26).
 * `mensajeDeError` interpola `campo` (no `relacion`, a diferencia de académica) cuando el backend
 * lo manda, y cae a un fallback por `status` cuando no hay `codigo` reconocido — obligatorio acá
 * porque `NotFoundException` de `users.service.ts`/`apoderados.service.ts` son texto plano sin
 * `codigo` (design.md D7, "Learned" #5).
 */
export type CodigoUsuarios =
  | 'CAMPO_DUPLICADO'
  | 'ESTADO_DESTINO_NO_PERMITIDO'
  | 'TRANSICION_DESDE_BLOQUEADO'
  | 'CAMPO_INVALIDO'
  | 'USUARIO_NO_ES_ESTUDIANTE';

const MENSAJE_POR_CODIGO: Record<CodigoUsuarios, string> = {
  CAMPO_DUPLICADO: 'Ya existe otro usuario con ese dato.',
  ESTADO_DESTINO_NO_PERMITIDO: 'Ese cambio de estado no está permitido.',
  TRANSICION_DESDE_BLOQUEADO: 'No se puede cambiar el estado de una cuenta bloqueada.',
  CAMPO_INVALIDO: 'Uno de los campos ingresados no es válido.',
  USUARIO_NO_ES_ESTUDIANTE: 'El usuario seleccionado no tiene rol de estudiante.',
};

const MENSAJE_POR_STATUS: Record<number, string> = {
  403: 'Tu rol no permite esta acción.',
  404: 'El registro ya no existe.',
};

const MENSAJE_GENERICO = 'Ocurrió un error inesperado. Intentalo de nuevo.';

export function mensajeDeError(e: { codigo?: CodigoUsuarios; campo?: string; status?: number }): string {
  if (!e.codigo) {
    if (e.status && MENSAJE_POR_STATUS[e.status]) {
      return MENSAJE_POR_STATUS[e.status];
    }
    return MENSAJE_GENERICO;
  }

  if ((e.codigo === 'CAMPO_DUPLICADO' || e.codigo === 'CAMPO_INVALIDO') && e.campo) {
    return e.codigo === 'CAMPO_DUPLICADO'
      ? `Ya existe otro usuario con ese ${e.campo}.`
      : `El campo ${e.campo} no es válido.`;
  }

  return MENSAJE_POR_CODIGO[e.codigo];
}
