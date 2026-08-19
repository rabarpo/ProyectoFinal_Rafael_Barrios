import PDFDocument from 'pdfkit';
import type { RendererActa } from '../processors/actas.processor';

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D12). Único archivo de este paquete que importa
 * `pdfkit` — el puerto `RendererActa` mantiene el processor indiferente a la elección de librería
 * (decisión 4 de la propuesta, la marcada como más revisable). Sólo fuentes estándar
 * (`Helvetica`/`Helvetica-Bold`), ningún TTF ni recurso externo: huella mínima (ADR-0007).
 *
 * Determinismo declarado (D12): fijar `CreationDate` desde `contenido.generado_en` elimina la
 * fuente de variación obvia, pero `pdfkit` escribe un identificador de documento propio, así que
 * el PDF NO es byte-determinista. Las pruebas asertan estructura, nunca igualdad de bytes.
 */

const MARGEN = 50;

interface RaizConGeneradoEn {
  generado_en?: unknown;
  proceso?: { nombre?: unknown };
  institucion?: { nombre?: unknown; director?: unknown };
  firmantes?: { nombre?: unknown; cargo?: unknown }[];
  notas?: unknown[];
  padron?: Record<string, unknown>;
  participacion?: Record<string, unknown>;
  escrutinio?: {
    dimension?: unknown;
    desglose?: { etiqueta?: unknown; votos?: unknown; porcentaje?: unknown; estado?: unknown }[];
    blancos?: unknown;
    cuadre?: Record<string, unknown>;
    empate?: { empate?: unknown; votos_maximos?: unknown };
    sin_votos?: unknown;
  };
}

function tituloDe(tipo: string): string {
  const titulos: Record<string, string> = {
    apertura: 'Acta de apertura',
    cierre: 'Acta de cierre',
    escrutinio: 'Acta de escrutinio',
    oficial: 'Acta oficial de resultados',
  };
  return titulos[tipo] ?? `Acta (${tipo})`;
}

function generadoEnDe(contenido: unknown): Date {
  const raiz = contenido as RaizConGeneradoEn;
  const valor = typeof raiz?.generado_en === 'string' ? raiz.generado_en : undefined;
  return valor ? new Date(valor) : new Date();
}

function dibujarClaveValor(doc: PDFKit.PDFDocument, clave: string, valor: string): void {
  doc.font('Helvetica-Bold').fontSize(10).text(`${clave}: `, { continued: true });
  doc.font('Helvetica').text(valor);
}

function dibujarContenido(doc: PDFKit.PDFDocument, contenido: unknown, tipo: string): void {
  const raiz = contenido as RaizConGeneradoEn;

  doc.font('Helvetica-Bold').fontSize(18).text(tituloDe(tipo));
  doc.moveDown();

  if (raiz.proceso?.nombre) {
    dibujarClaveValor(doc, 'Proceso', String(raiz.proceso.nombre));
  }
  if (raiz.institucion?.nombre) {
    dibujarClaveValor(doc, 'Institución', String(raiz.institucion.nombre));
  }
  doc.moveDown();

  if (raiz.padron) {
    doc.font('Helvetica-Bold').fontSize(12).text('Padrón');
    for (const [clave, valor] of Object.entries(raiz.padron)) {
      dibujarClaveValor(doc, clave, String(valor));
    }
    doc.moveDown();
  }

  if (raiz.participacion) {
    doc.font('Helvetica-Bold').fontSize(12).text('Participación');
    for (const [clave, valor] of Object.entries(raiz.participacion)) {
      dibujarClaveValor(doc, clave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
    }
    doc.moveDown();
  }

  if (raiz.escrutinio) {
    const esc = raiz.escrutinio;
    doc.font('Helvetica-Bold').fontSize(12).text('Escrutinio');
    dibujarClaveValor(doc, 'dimension', String(esc.dimension));
    dibujarClaveValor(doc, 'blancos', String(esc.blancos));
    dibujarClaveValor(doc, 'sin_votos', String(esc.sin_votos));
    if (esc.empate) {
      dibujarClaveValor(doc, 'empate', String(esc.empate.empate));
      dibujarClaveValor(doc, 'votos_maximos', String(esc.empate.votos_maximos));
    }
    if (esc.cuadre) {
      doc.font('Helvetica-Bold').fontSize(11).text('Cuadre');
      for (const [clave, valor] of Object.entries(esc.cuadre)) {
        dibujarClaveValor(doc, clave, String(valor));
      }
    }
    if (esc.desglose && esc.desglose.length > 0) {
      doc.font('Helvetica-Bold').fontSize(11).text('Desglose');
      for (const fila of esc.desglose) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .text(`${String(fila.etiqueta)}: ${String(fila.votos)} votos (${String(fila.porcentaje)}%) [${String(fila.estado)}]`);
      }
    }
    doc.moveDown();
  }

  if (raiz.notas && raiz.notas.length > 0) {
    doc.font('Helvetica-Bold').fontSize(12).text('Notas');
    for (const nota of raiz.notas) {
      doc.font('Helvetica').fontSize(9).text(String(nota));
    }
    doc.moveDown();
  }

  if (raiz.firmantes && raiz.firmantes.length > 0) {
    doc.font('Helvetica-Bold').fontSize(12).text('Firmantes');
    for (const firmante of raiz.firmantes) {
      doc.font('Helvetica').fontSize(10).text(`${String(firmante.nombre)} — ${String(firmante.cargo)}`);
    }
  }
}

export class PdfkitRendererActa implements RendererActa {
  async render(contenido: unknown, tipo: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGEN,
        // `compress: false` es una desviación declarada de D12 (no está en el snippet literal del
        // design): sin ella, los content streams van con FlateDecode y ninguna prueba puede
        // extraer texto del buffer sin sumar una dependencia de parseo de PDF. El acta es un
        // documento corto (no cientos de páginas), así que el costo de tamaño es despreciable.
        compress: false,
        info: {
          Title: tituloDe(tipo),
          CreationDate: generadoEnDe(contenido),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));

      dibujarContenido(doc, contenido, tipo);

      doc.end();
    });
  }
}
