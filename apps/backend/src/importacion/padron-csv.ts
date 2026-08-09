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

// importacion-excel, PR3 (design.md D5, "Interfaces/Contracts", tarea 3.1, spec "Reporte de
// errores descargable en CSV"). Fila mínima serializable: exactamente las cuatro columnas del CSV
// (`fila, campo, motivo, valor_recibido`), sin acoplar `padron-csv.ts` al DTO de Nest/Swagger.
export interface FilaErrorCsv {
  fila: number;
  campo: string;
  motivo: string;
  valor_recibido: string;
}

const CABECERA_CSV_ERRORES = ['fila', 'campo', 'motivo', 'valor_recibido'] as const;

// D5: BOM UTF-8 al inicio del archivo, requerido para que Excel detecte la codificación y no
// corrompa tildes/ñ al abrir el CSV directamente (sin import manual de codificación).
const BOM_UTF8 = '﻿';

// D5: neutraliza inyección de fórmulas (CSV injection) — un valor que empieza con `=`, `+`, `-` o
// `@` se interpretaría como fórmula al abrir el archivo en Excel/Sheets. Prefijo `'` fuerza texto
// literal, mismo criterio que OWASP CSV Injection.
const PREFIJO_FORMULA = /^[=+\-@]/;

function neutralizarFormula(valor: string): string {
  return PREFIJO_FORMULA.test(valor) ? `'${valor}` : valor;
}

// D5: escape RFC 4180 — una celda que contiene coma, comilla doble o salto de línea se envuelve
// entre comillas dobles, duplicando cualquier comilla doble interna.
function escaparCeldaCsv(valor: string): string {
  const neutralizado = neutralizarFormula(valor);
  if (/["\n\r,]/.test(neutralizado)) {
    return `"${neutralizado.replace(/"/g, '""')}"`;
  }
  return neutralizado;
}

function filaCsv(celdas: readonly string[]): string {
  return celdas.map(escaparCeldaCsv).join(',');
}

/**
 * Serializa el reporte de errores fila a fila en CSV (D5, spec "Reporte de errores descargable en
 * CSV"): cabecera fija + una fila por error, BOM UTF-8 al inicio, `\r\n` como separador de línea
 * (RFC 4180), escape de comillas/comas/saltos de línea y neutralización anti-fórmula en
 * `campo`/`motivo`/`valor_recibido` (el único origen de datos de usuario en estas columnas).
 */
export function serializarErroresCsv(errores: readonly FilaErrorCsv[]): string {
  const filas = [
    filaCsv(CABECERA_CSV_ERRORES),
    ...errores.map((error) => filaCsv([String(error.fila), error.campo, error.motivo, error.valor_recibido])),
  ];
  return BOM_UTF8 + filas.join('\r\n') + '\r\n';
}
