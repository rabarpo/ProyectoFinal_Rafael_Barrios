import { CABECERA_PADRON, parsearFila, validarCabecera } from './padron-csv';

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
