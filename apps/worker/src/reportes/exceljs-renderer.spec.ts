import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { RendererExcel } from './exceljs-renderer';
import type { ModeloReporte } from './modelo-reporte';

function modeloDe(filas: (string | number | null)[][]): ModeloReporte {
  return {
    version: 1,
    dimension: 'candidatos',
    formato: 'excel',
    titulo: 'Candidatos',
    generado_en: '2026-08-01T00:00:00.000Z',
    meta: [{ clave: 'proceso', valor: 'Proceso 1' }],
    secciones: [{ clave: 'candidatos', titulo: 'Candidatos', columnas: ['nombre'], filas, sensible: false }],
    notas: ['nota al pie'],
  };
}

describe('RendererExcel [15.1]', () => {
  it('produce un Buffer que empieza con la firma PK y una hoja por sección + Metadatos', async () => {
    const renderer = new RendererExcel();
    const modelo = modeloDe([['Ana']]);

    const buffer = await renderer.render(modelo);

    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK');

    const workbook = new ExcelJS.Workbook();
    // `exceljs` declara `xlsx.load(buffer: Buffer)` contra una instancia de `@types/node`
    // duplicada en el árbol de `pnpm` — mismo cast que `importacion.service.ts`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const nombresHojas = workbook.worksheets.map((hoja) => hoja.name);
    expect(nombresHojas).toContain('Candidatos');
    expect(nombresHojas).toContain('Metadatos');
  });

  it('valores escritos planos: ninguna celda es un objeto {formula: …}', async () => {
    const renderer = new RendererExcel();
    const modelo = modeloDe([["=cmd|'/c calc'!A1"]]);

    const buffer = await renderer.render(modelo);
    const workbook = new ExcelJS.Workbook();
    // `exceljs` declara `xlsx.load(buffer: Buffer)` contra una instancia de `@types/node`
    // duplicada en el árbol de `pnpm` — mismo cast que `importacion.service.ts`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const hoja = workbook.getWorksheet('Candidatos')!;
    const celda = hoja.getRow(2).getCell(1);

    expect(celda.type).not.toBe(ExcelJS.ValueType.Formula);
    expect(String(celda.value)).toContain('=cmd');
  });

  it('modelo de 2000 filas rinde sin lanzar [15.5]', async () => {
    const renderer = new RendererExcel();
    const filas = Array.from({ length: 2000 }, (_, i) => [`Votante ${i}`]);
    const modelo = modeloDe(filas);

    const buffer = await renderer.render(modelo);

    expect(buffer.length).toBeGreaterThan(0);
  });
});
