import { CABECERA_PADRON, parsearFila, serializarErroresCsv, validarCabecera } from './padron-csv';

/**
 * importacion-excel, PR2 (design.md D7, tarea 2.1). Unit tests puros sobre el núcleo de
 * parseo/validación de fila y cabecera — sin `exceljs` ni Prisma involucrados (esos entran vía
 * `importacion.service.spec.ts`, tarea 2.4).
 */
describe('validarCabecera() (D7, spec "Subida de archivo de padrón con formato de columnas fijo")', () => {
  it('cabecera exacta responde true', () => {
    expect(validarCabecera([...CABECERA_PADRON])).toBe(true);
  });

  it('cabecera con espacios y mayúsculas distintas responde true (trim + case-insensitive)', () => {
    const cabeceraConRuido = CABECERA_PADRON.map((columna) => `  ${columna.toUpperCase()}  `);
    expect(validarCabecera(cabeceraConRuido)).toBe(true);
  });

  it('cabecera con una columna distinta responde false', () => {
    const cabeceraInvalida: string[] = [...CABECERA_PADRON];
    cabeceraInvalida[0] = 'nombre'; // falta la 's' final
    expect(validarCabecera(cabeceraInvalida)).toBe(false);
  });

  it('cabecera con menos columnas que las esperadas responde false', () => {
    expect(validarCabecera(CABECERA_PADRON.slice(0, 3))).toBe(false);
  });

  it('cabecera con más columnas que las esperadas responde false', () => {
    expect(validarCabecera([...CABECERA_PADRON, 'columna_extra'])).toBe(false);
  });

  it('cabecera vacía responde false', () => {
    expect(validarCabecera([])).toBe(false);
  });
});

describe('parsearFila() (spec "Fila vacía se reporta sin abortar el archivo")', () => {
  it('fila con todos los valores presentes se parsea sin marcarse vacía', () => {
    const resultado = parsearFila([
      'Ana Pérez',
      '12345678',
      'COD-1',
      'ana@example.com',
      '1°',
      'A',
      'manana',
      '2026',
    ]);

    expect(resultado.vacia).toBe(false);
    expect(resultado.datos).toEqual({
      nombres: 'Ana Pérez',
      dni: '12345678',
      codigo: 'COD-1',
      correo: 'ana@example.com',
      grado_nombre: '1°',
      seccion_nombre: 'A',
      turno: 'manana',
      anio_escolar_codigo: '2026',
    });
  });

  it('fila completamente vacía (arreglo vacío) se marca vacia:true, datos:null', () => {
    const resultado = parsearFila([]);
    expect(resultado).toEqual({ vacia: true, datos: null });
  });

  it('fila con todas las celdas en blanco/undefined se marca vacia:true, datos:null', () => {
    const resultado = parsearFila(['', undefined, null, '   ', undefined, undefined, undefined, undefined]);
    expect(resultado).toEqual({ vacia: true, datos: null });
  });

  it('recorta espacios en cada celda no vacía', () => {
    const resultado = parsearFila([
      '  Ana Pérez  ',
      ' 12345678 ',
      ' COD-1 ',
      ' ana@example.com ',
      ' 1° ',
      ' A ',
      ' manana ',
      ' 2026 ',
    ]);

    expect(resultado.datos).toEqual({
      nombres: 'Ana Pérez',
      dni: '12345678',
      codigo: 'COD-1',
      correo: 'ana@example.com',
      grado_nombre: '1°',
      seccion_nombre: 'A',
      turno: 'manana',
      anio_escolar_codigo: '2026',
    });
  });
});

/**
 * importacion-excel, PR3 (design.md D5, tarea 3.1, spec "Reporte de errores descargable en CSV").
 */
describe('serializarErroresCsv() (D5)', () => {
  it('inicia con BOM UTF-8 y termina con la cabecera fija fila,campo,motivo,valor_recibido', () => {
    const csv = serializarErroresCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('fila,campo,motivo,valor_recibido\r\n');
  });

  it('una fila de error se serializa en el orden fila,campo,motivo,valor_recibido separada por \\r\\n', () => {
    const csv = serializarErroresCsv([{ fila: 3, campo: 'correo', motivo: 'formato', valor_recibido: 'no-es-correo' }]);
    expect(csv).toBe('﻿fila,campo,motivo,valor_recibido\r\n3,correo,formato,no-es-correo\r\n');
  });

  it('escapa (RFC 4180) un valor con coma envolviéndolo entre comillas dobles', () => {
    const csv = serializarErroresCsv([{ fila: 1, campo: 'nombres', motivo: 'formato', valor_recibido: 'Ana, Pérez' }]);
    expect(csv).toContain('"Ana, Pérez"');
  });

  it('escapa (RFC 4180) un valor con comillas dobles internas duplicándolas', () => {
    const csv = serializarErroresCsv([
      { fila: 1, campo: 'nombres', motivo: 'formato', valor_recibido: 'Apodo "El Loco"' },
    ]);
    expect(csv).toContain('"Apodo ""El Loco"""');
  });

  it('escapa (RFC 4180) un valor con salto de línea envolviéndolo entre comillas', () => {
    const csv = serializarErroresCsv([{ fila: 1, campo: 'nombres', motivo: 'formato', valor_recibido: 'Ana\nPérez' }]);
    expect(csv).toContain('"Ana\nPérez"');
  });

  it('neutraliza un valor que empieza con = anteponiendo comilla simple (anti-inyección de fórmulas)', () => {
    const csv = serializarErroresCsv([{ fila: 1, campo: 'correo', motivo: 'formato', valor_recibido: '=SUM(A1:A9)' }]);
    expect(csv).toContain("'=SUM(A1:A9)");
  });

  it('neutraliza valores que empiezan con +, - o @ anteponiendo comilla simple', () => {
    const csv = serializarErroresCsv([
      { fila: 1, campo: 'dni', motivo: 'formato', valor_recibido: '+1234' },
      { fila: 2, campo: 'dni', motivo: 'formato', valor_recibido: '-1234' },
      { fila: 3, campo: 'correo', motivo: 'formato', valor_recibido: '@evil.com' },
    ]);
    expect(csv).toContain("'+1234");
    expect(csv).toContain("'-1234");
    expect(csv).toContain("'@evil.com");
  });

  it('múltiples errores se serializan en una fila CSV cada uno, en el mismo orden recibido', () => {
    const csv = serializarErroresCsv([
      { fila: 2, campo: '', motivo: 'fila_vacia', valor_recibido: '' },
      { fila: 5, campo: 'aula', motivo: 'referencia_inexistente', valor_recibido: '1°/A/manana' },
    ]);
    const lineas = csv.slice(1).split('\r\n');
    expect(lineas).toEqual([
      'fila,campo,motivo,valor_recibido',
      '2,,fila_vacia,',
      '5,aula,referencia_inexistente,1°/A/manana',
      '',
    ]);
  });
});
