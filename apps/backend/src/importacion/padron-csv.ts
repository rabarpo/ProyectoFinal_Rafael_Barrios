// importacion-excel, PR2 (design.md D7, Interfaces/Contracts, tarea 2.2). Cabecera fija esperada
// (spec "Subida de archivo de padrón con formato de columnas fijo"). `Aula` no tiene un campo de
// código propio en el esquema (student-enrollment delta), así que la fila trae la clave compuesta
// `(grado_nombre, seccion_nombre, turno, anio_escolar_codigo)` en vez de un `aula_codigo` directo.
export const CABECERA_PADRON = [
  'nombres',
  'dni',
  'codigo',
  'correo',
  'grado_nombre',
  'seccion_nombre',
  'turno',
  'anio_escolar_codigo',
] as const;

export interface FilaPadron {
  nombres: string;
  dni: string;
  codigo: string;
  correo: string;
  grado_nombre: string;
  seccion_nombre: string;
  turno: string;
  anio_escolar_codigo: string;
}

export interface ResultadoParseoFila {
  vacia: boolean;
  datos: FilaPadron | null;
}

function normalizarCabecera(valor: unknown): string {
  return String(valor ?? '').trim().toLowerCase();
}

/**
 * D7: cabecera exacta (trim + case-insensitive), rechazo temprano antes de procesar cualquier
 * fila (spec "Cabecera de columnas incorrecta se rechaza sin procesar filas").
 */
export function validarCabecera(cabecera: readonly unknown[]): boolean {
  if (cabecera.length !== CABECERA_PADRON.length) {
    return false;
  }
  return CABECERA_PADRON.every((columnaEsperada, indice) => normalizarCabecera(cabecera[indice]) === columnaEsperada);
}

function normalizarCelda(valor: unknown): string {
  if (valor === undefined || valor === null) {
    return '';
  }
  return String(valor).trim();
}

/**
 * Spec "Fila vacía se reporta sin abortar el archivo": una fila con todas las celdas en blanco se
 * marca `vacia: true` para que el llamador la reporte con `motivo = 'fila_vacia'` sin invocar
 * ningún servicio de dominio.
 */
export function parsearFila(valores: readonly unknown[]): ResultadoParseoFila {
  const celdas = CABECERA_PADRON.map((_, indice) => normalizarCelda(valores[indice]));

  if (celdas.every((celda) => celda === '')) {
    return { vacia: true, datos: null };
  }

  const [nombres, dni, codigo, correo, grado_nombre, seccion_nombre, turno, anio_escolar_codigo] = celdas;

  return {
    vacia: false,
    datos: { nombres, dni, codigo, correo, grado_nombre, seccion_nombre, turno, anio_escolar_codigo },
  };
}
