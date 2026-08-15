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
      { nombre: 'apertura', procesoId: 'p1' },
      { nombre: 'votacion', derechoVotoId: 'dv1' },
      { nombre: 'comprobante', votoId: 'v1' },
    ];

    for (const ruta of casos) {
      const path = rutaAPath(ruta);
      expect(parsearRuta(path)).toEqual(ruta);
    }
  });

  // [design.md D12; tasks.md 13.1; threat: Enrutamiento (cliente)] `/comprobante` sin `votoId`
  // no es una variante navegable: debe caer en 'no-encontrada', nunca lanzar ni tratarse como un
  // listado agregado ("Mis votaciones" está explícitamente fuera de alcance de #15).
  it("[13.1] '/comprobante' sin id resuelve a 'no-encontrada'", () => {
    expect(() => parsearRuta('/comprobante')).not.toThrow();
    expect(parsearRuta('/comprobante').nombre).toBe('no-encontrada');
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
