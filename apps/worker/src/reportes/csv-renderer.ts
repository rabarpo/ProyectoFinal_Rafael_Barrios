import type { RendererReporte } from '../processors/reportes.processor';
import type { ModeloReporte } from './modelo-reporte';
import { serializarSeccionCsv } from './csv';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D10). Emite SÓLO `secciones[0]` tras la poda:
 * cabecera + filas, uniforme y RFC 4180 estricto, BOM UTF-8, `\r\n`, escape y neutralización
 * anti-fórmula (`csv.ts`, D11). `meta`/`notas` se omiten por diseño: CSV es un formato de datos
 * para reprocesar, no un documento. Por eso los constructores de `dimensiones.ts` ordenan siempre
 * la tabla principal en `secciones[0]`. Función pura sobre strings — sin streams, sin eventos.
 */
export class RendererCsv implements RendererReporte {
  readonly mime = 'text/csv; charset=utf-8';
  readonly extension = '.csv';

  async render(modelo: ModeloReporte): Promise<Buffer> {
    const [primera] = modelo.secciones;
    const seccion = primera ?? { columnas: [], filas: [] };
    const texto = serializarSeccionCsv(seccion);
    return Buffer.from(texto, 'utf-8');
  }
}
