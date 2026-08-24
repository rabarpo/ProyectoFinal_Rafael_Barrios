// reportes-y-exportaciones (#18, PR3; design.md D8, "Interfaces / Contratos"). Catálogo local a
// `ReportesModule` — mismo formato que `procesos.errors.ts`: objeto `as const` + union type, body
// con `codigo` solo cuando el cliente necesita discriminar el error.
export const REPORTES_ERROR_CODES = {
  // 400: dimension/formato fuera del enum, proceso_id no-UUID.
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
  // 404: proceso_id inexistente.
  PROCESO_NO_ENCONTRADO: 'PROCESO_NO_ENCONTRADO',
  // 409: descarga con estado 'borrador' o 'fallido' (D7.3 general).
  REPORTE_NO_EMITIDO: 'REPORTE_NO_EMITIDO',
  // 409: gate vigente en la descarga — archivo emitido con gate_aplicado=false y la política
  // vigente ya es oculta (D7.3, capa 3).
  REPORTE_NO_DISPONIBLE: 'REPORTE_NO_DISPONIBLE',
} as const;

export type ReportesErrorCode = (typeof REPORTES_ERROR_CODES)[keyof typeof REPORTES_ERROR_CODES];
