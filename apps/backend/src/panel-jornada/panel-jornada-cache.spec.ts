import { clavePanel, deserializar, serializar } from './panel-jornada-cache';

// dashboard-panel-jornada (Backlog #20, PR1; design.md "Caché", tareas 1.3-1.5). Puro, sin
// ioredis, idioma de `resultados-cache.spec.ts` — la diferencia es que la clave de scope no es
// SIEMPRE un procesoId: `panel:institucion` no lleva id.
describe('panel-jornada-cache (D5)', () => {
  const PAYLOAD_A = { estudiantes: 10, vinculos_apoderado: 4, hora_servidor: '2026-08-22T09:00:00.000Z' };
  const PAYLOAD_B = { estudiantes: 999, vinculos_apoderado: 999, hora_servidor: '2026-08-22T09:00:00.000Z' };

  // 1.3
  it('clavePanel(scope) sin id es exactamente "panel:{scope}"', () => {
    expect(clavePanel('institucion')).toBe('panel:institucion');
  });

  it('clavePanel(scope, id) es exactamente "panel:{scope}:{id}"', () => {
    expect(clavePanel('resumen', 'proceso-1')).toBe('panel:resumen:proceso-1');
  });

  it('el prefijo "panel:" es disjunto de "resultados:"/"session:"/"recovery:"', () => {
    const clave = clavePanel('institucion');
    expect(clave.startsWith('resultados:')).toBe(false);
    expect(clave.startsWith('session:')).toBe(false);
    expect(clave.startsWith('recovery:')).toBe(false);
  });

  // 1.4 — autocomprobación anticontaminación (threat: Contaminación cruzada de caché)
  it('serializar/deserializar ida y vuelta con la misma clave de scope', () => {
    const claveScope = clavePanel('institucion');
    const crudo = serializar(claveScope, PAYLOAD_A);
    expect(deserializar(claveScope, crudo)).toEqual(PAYLOAD_A);
  });

  it('deserializar con clave_scope ajena en el envoltorio devuelve null (MISS)', () => {
    const claveA = clavePanel('resumen', 'proceso-a');
    const claveB = clavePanel('resumen', 'proceso-b');
    const crudoDeB = serializar(claveB, PAYLOAD_B);
    expect(deserializar(claveA, crudoDeB)).toBeNull();
  });

  it('deserializar(claveScope, null) devuelve null', () => {
    expect(deserializar(clavePanel('institucion'), null)).toBeNull();
  });

  // 1.5
  it('deserializar con JSON corrupto devuelve null sin lanzar', () => {
    const claveScope = clavePanel('institucion');
    expect(() => deserializar(claveScope, '{esto no es json')).not.toThrow();
    expect(deserializar(claveScope, '{esto no es json')).toBeNull();
  });
});
