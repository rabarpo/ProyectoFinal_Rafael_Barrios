import { describe, expect, it } from 'vitest';
import { RendererCsv } from './csv-renderer';
import type { ModeloReporte } from './modelo-reporte';

function modeloDe(filas: (string | number | null)[][]): ModeloReporte {
  return {
    version: 1,
    dimension: 'votantes',
    formato: 'csv',
    titulo: 'Votantes',
    generado_en: '2026-08-01T00:00:00.000Z',
    meta: [{ clave: 'proceso', valor: 'Proceso 1' }],
    secciones: [{ clave: 'votantes', titulo: 'Votantes', columnas: ['nombre', 'codigo'], filas, sensible: false }],
    notas: ['nota al pie'],
  };
}

describe('RendererCsv [15.3]', () => {
  it('emite BOM UTF-8, cabecera de secciones[0] y filas separadas por \\r\\n', async () => {
    const renderer = new RendererCsv();
    const modelo = modeloDe([['Ana', 'A1'], ['Beto', 'B2']]);

    const buffer = await renderer.render(modelo);
    const texto = buffer.toString('utf-8');

    expect(texto.charCodeAt(0)).toBe(0xfeff);
    expect(texto).toContain('nombre,codigo\r\n');
    expect(texto).toContain('Ana,A1\r\n');
    expect(texto).toContain('Beto,B2\r\n');
  });

  it('meta y notas se omiten por diseño', async () => {
    const renderer = new RendererCsv();
    const modelo = modeloDe([['Ana', 'A1']]);

    const buffer = await renderer.render(modelo);
    const texto = buffer.toString('utf-8');

    expect(texto).not.toContain('nota al pie');
    expect(texto).not.toContain('Proceso 1');
  });

  it('celdas que empiezan en =/+/-/@ quedan neutralizadas [15.4]', async () => {
    const renderer = new RendererCsv();
    const modelo = modeloDe([["=cmd|'/c calc'!A1", '@etiqueta']]);

    const buffer = await renderer.render(modelo);
    const texto = buffer.toString('utf-8');

    expect(texto).toContain("'=cmd");
    expect(texto).toContain("'@etiqueta");
  });

  it('modelo de 2000 filas rinde sin lanzar [15.5]', async () => {
    const renderer = new RendererCsv();
    const filas = Array.from({ length: 2000 }, (_, i) => [`Votante ${i}`, `C${i}`]);
    const modelo = modeloDe(filas);

    const buffer = await renderer.render(modelo);

    expect(buffer.length).toBeGreaterThan(0);
  });
});
