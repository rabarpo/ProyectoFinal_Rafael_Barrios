import { describe, expect, it } from 'vitest';
import { PdfkitRendererActa } from './pdfkit-renderer';

/**
 * Extractor de texto mínimo sobre un PDF sin compresión (`compress: false` en el renderer): para
 * fuentes estándar `pdfkit` escribe el texto como arreglos `TJ` de cadenas HEX (`<...>`, WinAnsi de
 * 1 byte/glifo), no como literales `(...)`. Decodificar cada cadena hex y unir los fragmentos de
 * un mismo bloque `[...] TJ` alcanza para el aserto de estructura de D12 — sin sumar una
 * dependencia de parseo de PDF sólo para pruebas.
 */
function extraerTexto(buffer: Buffer): string {
  const contenido = buffer.toString('latin1');
  const bloques = contenido.match(/\[((?:<[0-9a-fA-F]*>|-?\d+(?:\.\d+)?|\s)*)\]\s*TJ/g) ?? [];
  const fragmentos = bloques.map((bloque) => {
    const hexes = bloque.match(/<([0-9a-fA-F]*)>/g) ?? [];
    return hexes
      .map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1'))
      .join('');
  });
  return fragmentos.join(' ');
}

function snapshotEscrutinio(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tipo: 'escrutinio',
    generado_en: '2026-09-05T18:00:00.000Z',
    proceso: { id: 'p-1', nombre: 'Proceso de prueba', tipo: 'municipio' },
    institucion: { nombre: 'Colegio E2E', director: 'Directora E2E' },
    firmantes: [{ nombre: 'Ana Presidenta', cargo: 'Presidenta del comité' }],
    notas: ['Los votos nulos se reportan en 0.'],
    escrutinio: {
      dimension: 'lista',
      desglose: [{ id: 'l-1', etiqueta: 'Lista Naranja', votos: 42, porcentaje: 100, estado: 'activo', baja_en: null }],
      blancos: 3,
      cuadre: { padron_total: 50, votos_por_opcion: 42, blancos: 3, nulos: 0, abstenciones: 5, cuadra: true },
      empate: { empate: false, votos_maximos: 42, empatados: ['l-1'] },
      sin_votos: false,
    },
    ...overrides,
  };
}

describe('PdfkitRendererActa', () => {
  it('produce un Buffer que empieza en %PDF- y cuyo texto extraído contiene los conteos del snapshot [21.1]', async () => {
    const renderer = new PdfkitRendererActa();
    const contenido = snapshotEscrutinio();

    const buffer = await renderer.render(contenido, 'escrutinio');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const texto = extraerTexto(buffer);
    expect(texto).toContain('Lista Naranja');
    expect(texto).toContain('42');
    expect(texto).toContain('Ana Presidenta');
  });

  it('snapshot con 0 votos no lanza [21.2]', async () => {
    const renderer = new PdfkitRendererActa();
    const contenido = snapshotEscrutinio({
      escrutinio: {
        dimension: 'lista',
        desglose: [{ id: 'l-1', etiqueta: 'Lista Naranja', votos: 0, porcentaje: 0, estado: 'activo', baja_en: null }],
        blancos: 0,
        cuadre: { padron_total: 10, votos_por_opcion: 0, blancos: 0, nulos: 0, abstenciones: 10, cuadra: true },
        empate: { empate: false, votos_maximos: 0, empatados: [] },
        sin_votos: true,
      },
    });

    const buffer = await renderer.render(contenido, 'escrutinio');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('snapshot con 10 firmantes (límite D9) no lanza [21.2]', async () => {
    const renderer = new PdfkitRendererActa();
    const firmantes = Array.from({ length: 10 }, (_, i) => ({
      nombre: `Firmante ${i + 1}`,
      cargo: 'Miembro del comité electoral',
    }));
    const contenido = snapshotEscrutinio({ firmantes });

    const buffer = await renderer.render(contenido, 'escrutinio');

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const texto = extraerTexto(buffer);
    expect(texto).toContain('Firmante 10');
  });
});
