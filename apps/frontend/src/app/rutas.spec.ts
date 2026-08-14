import { describe, expect, it } from 'vitest';
import { parsearRuta, rutaAPath } from './rutas';
import type { Ruta } from './rutas';

// [design.md D10; spec: minimal-frontend-router] `parsearRuta` es un parser
// TOTAL: nunca lanza, cualquier pathname no reconocido cae en 'no-encontrada'.
// `rutaAPath` es su inversa exacta para las variantes navegables.
describe('rutas', () => {
  it('ida y vuelta para cada variante navegable de Ruta', () => {
    const casos: Ruta[] = [
      { nombre: 'proceso-nuevo' },
      { nombre: 'procesos' },
      { nombre: 'candidatos', procesoId: 'p1' },
      { nombre: 'candidato-nuevo', procesoId: 'p1' },
      { nombre: 'candidato-edicion', procesoId: 'p1', candidatoId: 'c1' },
    ];

    for (const ruta of casos) {
      const path = rutaAPath(ruta);
      expect(parsearRuta(path)).toEqual(ruta);
    }
  });

  it("path traversal ('/../../etc/passwd') resuelve a 'no-encontrada', nunca lanza", () => {
    expect(() => parsearRuta('/../../etc/passwd')).not.toThrow();
    expect(parsearRuta('/../../etc/passwd').nombre).toBe('no-encontrada');
  });

  it('segmento :id no-UUID no crashea: se pasa tal cual o cae en no-encontrada', () => {
    expect(() => parsearRuta('/procesos/no-es-un-uuid/candidatos')).not.toThrow();
    const ruta = parsearRuta('/procesos/no-es-un-uuid/candidatos');
    expect(ruta.nombre === 'candidatos' || ruta.nombre === 'no-encontrada').toBe(true);
  });

  it('ruta inexistente resuelve a no-encontrada, nunca undefined', () => {
    const ruta = parsearRuta('/algo/que/no/existe');
    expect(ruta).toBeDefined();
    expect(ruta.nombre).toBe('no-encontrada');
  });
});
