/**
 * reportes-y-exportaciones (#18, PR2; design.md D5/D7.2/D8). Modelo tabular canónico por
 * secciones: 6 constructores (`dimensiones.ts`) × 3 renderizadores (worker, D10), sin que ninguno
 * conozca la forma del otro. PURO: sin Prisma, sin Nest.
 *
 * D8 — regla de sensibilidad de una sección: `sensible: true` SI Y SÓLO SI su contenido no
 * aparecería en la respuesta de `GET /procesos/:id/resultados` con `ocultar_resultados=true`. El
 * corte está anclado a `calcularParticipacion()` vs `calcularEscrutinio()` (`#17` D5): sólo
 * `participacion`/`resultados` pueden tener secciones sensibles.
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
  /**
   * D8: true SI Y SÓLO SI el contenido no aparecería en GET /procesos/:id/resultados con
   * ocultar_resultados=true. El corte es calcularEscrutinio() vs calcularParticipacion().
   */
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

/**
 * Sólo `participacion`/`resultados` pueden tener secciones `sensible: true` (D6/D8) — el resto
 * de dimensiones nunca pasa por `calcularEscrutinio()`.
 */
export function esSensible(dimension: string): boolean {
  return DIMENSIONES_SENSIBLES.has(dimension);
}

/**
 * D7.2 — única regla de poda de todo el change, genérica a propósito: con `gate=true` descarta
 * TODA sección `sensible: true`, sin importar la dimensión. Con `gate=false` es identidad.
 */
export function podar(modelo: ModeloReporte, gate: boolean): ModeloReporte {
  if (!gate) {
    return modelo;
  }
  return {
    ...modelo,
    secciones: modelo.secciones.filter((seccion) => !seccion.sensible),
  };
}
