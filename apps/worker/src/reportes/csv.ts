/**
 * reportes-y-exportaciones (#18, PR4; design.md D11). Duplicación DECLARADA: reimplementa
 * `escaparCeldaCsv`/`neutralizarFormula`/BOM UTF-8/CRLF de
 * `apps/backend/src/importacion/padron-csv.ts` — el worker no puede importar ese módulo
 * (`rootDir` de `apps/worker/tsconfig.json`, mismo hallazgo de D4). `apps/backend/src/importacion/
 * padron-csv.ts` es la FUENTE DE VERDAD; cualquier cambio ahí debe reflejarse aquí, y
 * `csv.spec.ts` (16.1) contiene la tabla de casos duplicada a propósito para detectar deriva.
 */

// D11: BOM UTF-8 al inicio del archivo, requerido para que Excel detecte la codificación y no
// corrompa tildes/ñ al abrir el CSV directamente (sin import manual de codificación).
export const BOM_UTF8 = '﻿';

// D11: neutraliza inyección de fórmulas (CSV injection) — un valor que empieza con `=`, `+`, `-` o
// `@` se interpretaría como fórmula al abrir el archivo en Excel/Sheets. Prefijo `'` fuerza texto
// literal, mismo criterio que OWASP CSV Injection.
const PREFIJO_FORMULA = /^[=+\-@]/;

export function neutralizarFormula(valor: string): string {
  return PREFIJO_FORMULA.test(valor) ? `'${valor}` : valor;
}

// D11: escape RFC 4180 — una celda que contiene coma, comilla doble o salto de línea se envuelve
// entre comillas dobles, duplicando cualquier comilla doble interna.
export function escaparCeldaCsv(valor: string): string {
  const neutralizado = neutralizarFormula(valor);
  if (/["\n\r,]/.test(neutralizado)) {
    return `"${neutralizado.replace(/"/g, '""')}"`;
  }
  return neutralizado;
}

export function filaCsv(celdas: readonly string[]): string {
  return celdas.map(escaparCeldaCsv).join(',');
}

function celdaAString(valor: string | number | null): string {
  return valor === null ? '' : String(valor);
}

/**
 * Serializa `secciones[0]` (tras la poda) en CSV: cabecera + filas, BOM UTF-8 al inicio, `\r\n`
 * como separador de línea (RFC 4180), escape y neutralización anti-fórmula. `meta`/`notas` se
 * omiten por diseño — CSV es un formato de datos para reprocesar, no un documento (D10).
 */
export function serializarSeccionCsv(seccion: { columnas: string[]; filas: (string | number | null)[][] }): string {
  const filas = [
    filaCsv(seccion.columnas),
    ...seccion.filas.map((fila) => filaCsv(fila.map(celdaAString))),
  ];
  return BOM_UTF8 + filas.join('\r\n') + '\r\n';
}
