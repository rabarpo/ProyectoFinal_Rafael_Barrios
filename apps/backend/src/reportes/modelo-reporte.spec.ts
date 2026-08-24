import { esSensible, podar } from './modelo-reporte';
import type { ModeloReporte, Seccion } from './modelo-reporte';

/**
 * reportes-y-exportaciones (#18, PR2; design.md D5/D7.2/D8, tareas 4.1-4.4). Puro, sin base —
 * única regla de poda de todo el change: descartar toda sección `sensible: true` (D7.2).
 */

function seccion(overrides: Partial<Seccion> = {}): Seccion {
  return {
    clave: 'resumen',
    titulo: 'Resumen',
    columnas: ['padron_total', 'votos_emitidos'],
    filas: [[10, 7]],
    sensible: false,
    ...overrides,
  };
}

function modelo(secciones: Seccion[]): ModeloReporte {
  return {
    version: 1,
    dimension: 'resultados',
    formato: 'pdf',
    titulo: 'Reporte de resultados',
    generado_en: '2026-08-23T10:00:00.000Z',
    meta: [{ clave: 'proceso', valor: 'Elección de representantes' }],
    secciones,
    notas: ['nota de ejemplo'],
  };
}

describe('modelo-reporte.ts (D5/D7.2/D8)', () => {
  // 4.1
  it('podar(modelo, true) descarta todas las secciones sensible:true y conserva las demás intactas', () => {
    const noSensible = seccion({ clave: 'resumen', sensible: false });
    const sensible1 = seccion({ clave: 'desglose', sensible: true });
    const sensible2 = seccion({ clave: 'cuadre', sensible: true });
    const m = modelo([noSensible, sensible1, sensible2]);

    const podado = podar(m, true);

    expect(podado.secciones).toEqual([noSensible]);
    expect(podado.secciones.some((s) => s.sensible)).toBe(false);
  });

  // 4.2
  it('podar(modelo, false) es identidad', () => {
    const m = modelo([seccion({ clave: 'resumen', sensible: false }), seccion({ clave: 'desglose', sensible: true })]);

    const resultado = podar(m, false);

    expect(resultado).toEqual(m);
  });

  // 4.3
  it.each(['participacion', 'resultados'])('esSensible(%s) es true', (dimension) => {
    expect(esSensible(dimension)).toBe(true);
  });

  it.each(['votantes', 'abstenciones', 'candidatos', 'consultas'])('esSensible(%s) es false', (dimension) => {
    expect(esSensible(dimension)).toBe(false);
  });

  // 4.4 — contrato del renderizador CSV (D10): secciones[0] siempre no-sensible tras podar
  it('podar deja la siguiente sección no-sensible en la posición 0 cuando secciones[0] era sensible', () => {
    const sensible = seccion({ clave: 'desglose', sensible: true });
    const noSensible = seccion({ clave: 'resumen', sensible: false });
    const m = modelo([sensible, noSensible]);

    const podado = podar(m, true);

    expect(podado.secciones[0]).toEqual(noSensible);
    expect(podado.secciones).toHaveLength(1);
  });
});
