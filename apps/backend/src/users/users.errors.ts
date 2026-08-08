// administracion-usuarios-apoderados, PR1 (design.md D2, tarea 3.1). Catálogo local a
// `UsersModule`: no se refactoriza `auth` ni se crea un catálogo global de errores. Mismo idioma
// que `throw new ConflictException({ codigo: 'VINCULACION_REQUERIDA' })` de
// `google-oauth-y-recuperacion` — cuando el cliente necesita discriminar el error, el body es un
// objeto con `codigo`; cuando no, se mantiene el body por defecto de Nest (ver design.md D2).
export const USERS_ERROR_CODES = {
  CAMPO_DUPLICADO: 'CAMPO_DUPLICADO',
  ESTADO_DESTINO_NO_PERMITIDO: 'ESTADO_DESTINO_NO_PERMITIDO',
  TRANSICION_DESDE_BLOQUEADO: 'TRANSICION_DESDE_BLOQUEADO',
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
  USUARIO_NO_ES_ESTUDIANTE: 'USUARIO_NO_ES_ESTUDIANTE',
} as const;

export type UsersErrorCode = (typeof USERS_ERROR_CODES)[keyof typeof USERS_ERROR_CODES];
