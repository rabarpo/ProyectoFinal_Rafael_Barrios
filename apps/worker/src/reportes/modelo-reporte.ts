/**
 * reportes-y-exportaciones (#18, PR4; design.md D4/D7.2/D5). Duplicación DECLARADA: el worker no
 * puede importar `apps/backend/src/reportes/modelo-reporte.ts` — `apps/worker/tsconfig.json` fija
 * `rootDir: ./src` e `include: src/[**]/*.ts` (mismo hallazgo de D4 que ya bloquea el import de
 * `escrutinio.ts`). Este archivo es una copia estructural de los tipos y de la única regla de poda
 * (D7.2), con el backend como fuente de verdad — cualquier cambio de forma en
 * `apps/backend/src/reportes/modelo-reporte.ts` debe reflejarse aquí.
 */

export interface Par {
  clave: string;
  valor: string;
}

export type Celda = string | number | null;

export interface Seccion {
  clave: string;
  titulo: string;
  columnas: string[];
  filas: Celda[][];
  sensible: boolean;
}

export interface ModeloReporte {
  version: 1;
  dimension: string;
  formato: string;
  titulo: string;
  generado_en: string;
  meta: Par[];
  secciones: Seccion[];
  notas: string[];
}

const DIMENSIONES_SENSIBLES = new Set(['participacion', 'resultados']);

export function esSensible(dimension: string): boolean {
  return DIMENSIONES_SENSIBLES.has(dimension);
}

/** D7.2 — única regla de poda de todo el change, genérica a propósito. */
export function podar(modelo: ModeloReporte, gate: boolean): ModeloReporte {
  if (!gate) {
    return modelo;
  }
  return {
    ...modelo,
    secciones: modelo.secciones.filter((seccion) => !seccion.sensible),
  };
}
