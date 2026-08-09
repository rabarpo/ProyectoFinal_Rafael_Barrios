import { esP2002, esP2003, objetivoContiene, traducirRestriccion } from './prisma-errores';

/**
 * administracion-academica, PR1 (design.md D1/D2, tareas 3.1-3.3). Unit tests puros sobre el
 * traductor de errores de Prisma compartido por las seis entidades — sin base, mismo criterio que
 * `esP2002()`/`campoDesdeTarget()` de `users.service.spec.ts` en `administracion-usuarios-
 * apoderados`.
 */

describe('esP2002() / esP2003() (D2, tarea 3.1)', () => {
  it('[3.1] esP2002 reconoce un error con code P2002', () => {
    expect(esP2002({ code: 'P2002', meta: { target: ['nombre'] } })).toBe(true);
  });

  it('[3.1] esP2002 rechaza un error con code distinto', () => {
    expect(esP2002({ code: 'P2003' })).toBe(false);
  });

  it('[3.1] esP2002 rechaza valores sin base (null, undefined, string, objeto sin code)', () => {
    expect(esP2002(null)).toBe(false);
    expect(esP2002(undefined)).toBe(false);
    expect(esP2002('P2002')).toBe(false);
    expect(esP2002({})).toBe(false);
  });

  it('[3.1] esP2003 reconoce un error con code P2003', () => {
    expect(esP2003({ code: 'P2003', meta: { field_name: 'Grado_nivel_id_fkey (index)' } })).toBe(true);
  });

  it('[3.1] esP2003 rechaza un error con code distinto', () => {
    expect(esP2003({ code: 'P2002' })).toBe(false);
  });

  it('[3.1] esP2003 rechaza valores sin base', () => {
    expect(esP2003(null)).toBe(false);
    expect(esP2003(undefined)).toBe(false);
    expect(esP2003(42)).toBe(false);
  });
});

describe('traducirRestriccion() (D2, tarea 3.2 — campos desde meta.target)', () => {
  it('[3.2] deriva un único campo desde un target de arreglo de un elemento', () => {
    expect(traducirRestriccion(['nombre'])).toEqual(['nombre']);
  });

  it('[3.2] deriva varios campos preservando el orden para una restricción compuesta', () => {
    expect(traducirRestriccion(['nivel_id', 'nombre'])).toEqual(['nivel_id', 'nombre']);
    expect(traducirRestriccion(['grado_id', 'seccion_id', 'anio_escolar_id'])).toEqual([
      'grado_id',
      'seccion_id',
      'anio_escolar_id',
    ]);
  });

  it('[3.2] deriva un campo único desde un target de tipo string', () => {
    expect(traducirRestriccion('nombre')).toEqual(['nombre']);
  });

  it('[3.2] target no parseable (undefined, número, objeto) devuelve arreglo vacío', () => {
    expect(traducirRestriccion(undefined)).toEqual([]);
    expect(traducirRestriccion(42)).toEqual([]);
    expect(traducirRestriccion({})).toEqual([]);
  });
});

describe('objetivoContiene() (D1/D2, tarea 3.3 — distingue índice parcial de @unique)', () => {
  it("[3.3] target ['activo'] (índice parcial de año activo) contiene 'activo'", () => {
    expect(objetivoContiene(['activo'], 'activo')).toBe(true);
  });

  it("[3.3] target ['nombre'] (colisión de @unique nombre) NO contiene 'activo'", () => {
    expect(objetivoContiene(['nombre'], 'activo')).toBe(false);
  });

  it('[3.3] target string exacto es tratado igual que un arreglo de un elemento', () => {
    expect(objetivoContiene('activo', 'activo')).toBe(true);
    expect(objetivoContiene('nombre', 'activo')).toBe(false);
  });

  it('[3.3] target no parseable nunca contiene la columna buscada', () => {
    expect(objetivoContiene(undefined, 'activo')).toBe(false);
    expect(objetivoContiene(null, 'activo')).toBe(false);
    expect(objetivoContiene(42, 'activo')).toBe(false);
  });
});

describe('relacionDesdeFieldName() (D2, tarea 3.2 — relación desde meta.field_name, best-effort)', () => {
  it('[3.2] extrae la relación de un field_name con formato "Entidad_columna_fkey (index)"', async () => {
    const { relacionDesdeFieldName } = await import('./prisma-errores');
    expect(relacionDesdeFieldName('Grado_nivel_id_fkey (index)')).toBe('Grado');
  });

  it('[3.2] extrae la relación de un field_name simple "Seccion_grado_id_fkey"', async () => {
    const { relacionDesdeFieldName } = await import('./prisma-errores');
    expect(relacionDesdeFieldName('Seccion_grado_id_fkey')).toBe('Seccion');
  });

  it('[3.2] field_name no parseable devuelve un valor genérico de reserva', async () => {
    const { relacionDesdeFieldName } = await import('./prisma-errores');
    expect(relacionDesdeFieldName(undefined)).toBe('desconocida');
    expect(relacionDesdeFieldName('')).toBe('desconocida');
    expect(relacionDesdeFieldName(42)).toBe('desconocida');
  });
});
