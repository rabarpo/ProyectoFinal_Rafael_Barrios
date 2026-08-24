import { describe, expect, it } from 'vitest';
import { RendererPdf } from './pdfkit-renderer-reporte';
import type { ModeloReporte } from './modelo-reporte';

/** Mismo extractor mínimo de `apps/worker/src/actas/pdfkit-renderer.spec.ts` (D12/#17). */
function extraerTexto(buffer: Buffer): string {
  const contenido = buffer.toString('latin1');
  const bloques = contenido.match(/\[((?:<[0-9a-fA-F]*>|-?\d+(?:\.\d+)?|\s)*)\]\s*TJ/g) ?? [];
  const fragmentos = bloques.map((bloque) => {
    const hexes = bloque.match(/<([0-9a-fA-F]*)>/g) ?? [];
    return hexes.map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1')).join('');
  });
  return fragmentos.join(' ');
}

function modeloDe(filas: (string | number | null)[][]): ModeloReporte {
  return {
    version: 1,
    dimension: 'resultados',
    formato: 'pdf',
    titulo: 'Resultados de prueba',
    generado_en: '2026-08-01T00:00:00.000Z',
    meta: [{ clave: 'proceso', valor: 'Proceso E2E' }],
    secciones: [{ clave: 'desglose', titulo: 'Desglose', columnas: ['etiqueta', 'votos'], filas, sensible: true }],
    notas: ['Nota de pie de página'],
  };
}

describe('RendererPdf [15.2]', () => {
  it('produce un Buffer que empieza en %PDF- con título, meta, secciones y notas en el texto', async () => {
    const renderer = new RendererPdf();
    const modelo = modeloDe([['Lista Naranja', 42]]);

    const buffer = await renderer.render(modelo);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const texto = extraerTexto(buffer);
    expect(texto).toContain('Resultados de prueba');
    expect(texto).toContain('Proceso E2E');
    expect(texto).toContain('Lista Naranja');
    expect(texto).toContain('42');
    expect(texto).toContain('Nota de pie');
  });

  it('celdas que empiezan en =/+/-/@ no se interpretan como fórmula (pdfkit dibuja texto) [15.4]', async () => {
    const renderer = new RendererPdf();
    const modelo = modeloDe([["=cmd|'/c calc'!A1", 0]]);

    const buffer = await renderer.render(modelo);
    const texto = extraerTexto(buffer);

    expect(texto).toContain('=cmd');
  });

  it('modelo de 2000 filas rinde sin lanzar [15.5]', async () => {
    const renderer = new RendererPdf();
    const filas = Array.from({ length: 2000 }, (_, i) => [`Fila ${i}`, i]);
    const modelo = modeloDe(filas);

    const buffer = await renderer.render(modelo);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 20_000);
});
