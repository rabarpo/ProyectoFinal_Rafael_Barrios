// candidatos-listas-opciones-consulta, PR2 (design.md D5/D6/D7/D8, tarea 4.2). Catálogo local a
// `CandidatosModule` — mismo formato que `procesos.errors.ts`/`academico.errors.ts`: objeto
// `as const` + union type, body con `codigo` cuando el cliente necesita discriminar el error.
// `COHERENCIA_JERARQUICA`/`FOTO_REQUERIDA` agregados en PR4 (tarea 11.1) para
// `CandidatosController`; `ARCHIVO_NO_ENCONTRADO` agregado en PR5 (tarea 14.1) para `GET
// /candidatos/:id/foto`.
export const CANDIDATOS_ERROR_CODES = {
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
  REFERENCIA_INEXISTENTE: 'REFERENCIA_INEXISTENTE',
  COHERENCIA_JERARQUICA: 'COHERENCIA_JERARQUICA',
  RESTRICCION_UNICA: 'RESTRICCION_UNICA',
  ENTIDAD_CON_DEPENDIENTES: 'ENTIDAD_CON_DEPENDIENTES',
  ESTADO_INVALIDO: 'ESTADO_INVALIDO',
  FOTO_REQUERIDA: 'FOTO_REQUERIDA',
  ARCHIVO_VACIO: 'ARCHIVO_VACIO',
  FORMATO_NO_PERMITIDO: 'FORMATO_NO_PERMITIDO',
  ARCHIVO_DEMASIADO_GRANDE: 'ARCHIVO_DEMASIADO_GRANDE',
  ARCHIVO_NO_ENCONTRADO: 'ARCHIVO_NO_ENCONTRADO',
} as const;

export type CandidatosErrorCode = (typeof CANDIDATOS_ERROR_CODES)[keyof typeof CANDIDATOS_ERROR_CODES];
