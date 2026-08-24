import ExcelJS from 'exceljs';
import type { RendererReporte } from '../processors/reportes.processor';
import type { ModeloReporte } from './modelo-reporte';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D10/D14). Único archivo de este paquete que
 * importa `exceljs` (misma versión exacta que el backend, `^4.4.0`). Una hoja por sección (cabecera
 * en negrita) + una hoja `Metadatos` con `meta`/`notas`. Valores escritos como `string`/`number`
 * planos: `exceljs` sólo interpreta fórmula ante `{ formula: … }`, así que escribir celdas planas
 * ya es la neutralización — sin necesidad de prefijo `'` (a diferencia de CSV/D11).
 */

const NOMBRE_HOJA_METADATOS = 'Metadatos';

function nombreHojaValido(clave: string): string {
  // Excel prohíbe : \ / ? * [ ] y limita a 31 caracteres.
  return clave.replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Seccion';
}

export class RendererExcel implements RendererReporte {
  readonly mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly extension = '.xlsx';

  async render(modelo: ModeloReporte): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    for (const seccion of modelo.secciones) {
      const hoja = workbook.addWorksheet(nombreHojaValido(seccion.titulo || seccion.clave));
      const filaCabecera = hoja.addRow(seccion.columnas);
      filaCabecera.font = { bold: true };
      for (const fila of seccion.filas) {
        // Celdas planas (string/number/null): exceljs sólo evalúa `{ formula: … }`, nunca un
        // string que empiece con `=` — sin superficie de inyección de fórmulas (D10, threat matrix).
        hoja.addRow(fila);
      }
    }

    const metadatos = workbook.addWorksheet(NOMBRE_HOJA_METADATOS);
    metadatos.addRow(['clave', 'valor']).font = { bold: true };
    for (const par of modelo.meta) {
      metadatos.addRow([par.clave, par.valor]);
    }
    if (modelo.notas.length > 0) {
      metadatos.addRow([]);
      metadatos.addRow(['notas']);
      for (const nota of modelo.notas) {
        metadatos.addRow([nota]);
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}
