import PDFDocument from 'pdfkit';
import type { RendererReporte } from '../processors/reportes.processor';
import type { ModeloReporte } from './modelo-reporte';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D10/D14). Título, `meta`, todas las secciones como
 * tablas de ancho fijo, `notas` al pie. Sólo `Helvetica`/`Helvetica-Bold`, `compress: false`,
 * `CreationDate` desde `generado_en` — mismas decisiones de `#17` D12 (`pdfkit-renderer.ts`), mismo
 * determinismo declarado (estructura, nunca bytes). `pdfkit` dibuja texto, no interpreta marcado:
 * una celda que empieza en `=`/`+`/`-`/`@` no representa ningún riesgo de inyección en PDF (D10,
 * threat matrix) — se escribe literal, sin neutralizar.
 */

const MARGEN = 50;

function celdaAString(valor: string | number | null): string {
  return valor === null ? '' : String(valor);
}

export class RendererPdf implements RendererReporte {
  readonly mime = 'application/pdf';
  readonly extension = '.pdf';

  async render(modelo: ModeloReporte): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGEN,
        // `compress: false`, mismo argumento que `pdfkit-renderer.ts` de `#17` D12: sin ella, los
        // content streams van con FlateDecode y ninguna prueba puede extraer texto del buffer.
        compress: false,
        info: {
          Title: modelo.titulo,
          CreationDate: new Date(modelo.generado_en),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));

      doc.font('Helvetica-Bold').fontSize(18).text(modelo.titulo);
      doc.moveDown();

      if (modelo.meta.length > 0) {
        doc.font('Helvetica-Bold').fontSize(12).text('Metadatos');
        for (const par of modelo.meta) {
          doc.font('Helvetica-Bold').fontSize(10).text(`${par.clave}: `, { continued: true });
          doc.font('Helvetica').text(par.valor);
        }
        doc.moveDown();
      }

      for (const seccion of modelo.secciones) {
        doc.font('Helvetica-Bold').fontSize(13).text(seccion.titulo);
        doc.font('Helvetica-Bold').fontSize(9).text(seccion.columnas.join(' | '));
        for (const fila of seccion.filas) {
          doc.font('Helvetica').fontSize(9).text(fila.map(celdaAString).join(' | '));
        }
        doc.moveDown();
      }

      if (modelo.notas.length > 0) {
        doc.font('Helvetica-Bold').fontSize(12).text('Notas');
        for (const nota of modelo.notas) {
          doc.font('Helvetica').fontSize(9).text(nota);
        }
      }

      doc.end();
    });
  }
}
