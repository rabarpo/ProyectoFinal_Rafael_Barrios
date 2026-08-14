import { derivarComprobante } from './comprobante';

/**
 * vote-casting, PR1 (design.md D12, tareas 2.1-2.2). `derivarComprobante` es una función pura:
 * mismo `Voto.id` (UUID) produce siempre el mismo código de 16 caracteres agrupados
 * `XXXX-XXXX-XXXX-XXXX`, derivado de los primeros 80 bits del UUID en Crockford Base32.
 */
describe('derivarComprobante() — determinismo (D12, tarea 2.1)', () => {
  it('[2.1] mismo Voto.id produce siempre el mismo código de 16 caracteres agrupados', () => {
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

    const codigo1 = derivarComprobante(id);
    const codigo2 = derivarComprobante(id);

    expect(codigo1).toBe(codigo2);
    expect(codigo1).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('[2.1 triangulación] un Voto.id distinto produce un código distinto', () => {
    const idA = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    const idB = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

    expect(derivarComprobante(idA)).not.toBe(derivarComprobante(idB));
  });
});

describe('derivarComprobante() — alfabeto Crockford sin I/L/O/U (D12, tarea 2.2)', () => {
  it('[2.2] el código nunca contiene I, L, O ni U, para varios Voto.id distintos', () => {
    const ids = [
      '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '00000000-0000-0000-0000-000000000000',
      '11111111-1111-1111-1111-111111111111',
    ];

    for (const id of ids) {
      const codigo = derivarComprobante(id);
      expect(codigo).not.toMatch(/[ILOU]/);
    }
  });
});
