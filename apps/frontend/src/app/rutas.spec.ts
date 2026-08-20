import { describe, expect, it } from 'vitest';
import { parsearRuta, rutaAPath } from './rutas';
import type { Ruta } from './rutas';

// [design.md D10; spec: minimal-frontend-router] `parsearRuta` es un parser
// TOTAL: nunca lanza, cualquier pathname no reconocido cae en 'no-encontrada'.
// `rutaAPath` es su inversa exacta para las variantes navegables.
describe('rutas', () => {
  it('ida y vuelta para cada variante navegable de Ruta', () => {
    const casos: Ruta[] = [
      { nombre: 'inicio' },
      { nombre: 'proceso-nuevo' },
      { nombre: 'procesos' },
      { nombre: 'candidatos', procesoId: 'p1' },
      { nombre: 'candidato-nuevo', procesoId: 'p1' },
      { nombre: 'candidato-edicion', procesoId: 'p1', candidatoId: 'c1' },
      { nombre: 'apertura', procesoId: 'p1' },
      { nombre: 'votacion', derechoVotoId: 'dv1' },
      { nombre: 'comprobante', votoId: 'v1' },
      { nombre: 'resultados', procesoId: 'p1' },
      { nombre: 'academica' },
    ];

    for (const ruta of casos) {
      const path = rutaAPath(ruta);
      expect(parsearRuta(path)).toEqual(ruta);
    }
  });

  // [design.md D1; tasks.md 1.1; spec: minimal-frontend-router] Variante `Ruta 'academica'`
  // sin rutas anidadas: `/academica` es la única forma navegable, cualquier segmento adicional
  // (`/academica/niveles`) cae en 'no-encontrada' — la pestaña activa vive en estado de
  // componente, nunca en la URL.
  it("[1.1] '/academica' resuelve a 'academica' y su rutaAPath es '/academica'", () => {
    expect(parsearRuta('/academica')).toEqual({ nombre: 'academica' });
    expect(rutaAPath({ nombre: 'academica' })).toBe('/academica');
  });

  it("[1.1] '/academica/niveles' resuelve a 'no-encontrada'", () => {
    expect(parsearRuta('/academica/niveles')).toEqual({
      nombre: 'no-encontrada',
      pathname: '/academica/niveles',
    });
  });

  // [design.md D12; tasks.md 13.1; threat: Enrutamiento (cliente)] `/comprobante` sin `votoId`
  // no es una variante navegable: debe caer en 'no-encontrada', nunca lanzar ni tratarse como un
  // listado agregado ("Mis votaciones" está explícitamente fuera de alcance de #15).
  it("[13.1] '/comprobante' sin id resuelve a 'no-encontrada'", () => {
    expect(() => parsearRuta('/comprobante')).not.toThrow();
    expect(parsearRuta('/comprobante').nombre).toBe('no-encontrada');
  });

  // [design.md D11; tasks.md 10.1; threat: Enrutamiento (cliente)] `/resultados` sin id no es una
  // variante navegable: debe caer en 'no-encontrada', mismo criterio que '/comprobante' (D12).
  it("[10.1] '/resultados' sin id resuelve a 'no-encontrada'", () => {
    expect(() => parsearRuta('/resultados')).not.toThrow();
    expect(parsearRuta('/resultados').nombre).toBe('no-encontrada');
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

  // [design.md D1; tasks.md 1.1-1.2; spec: menu-navegacion-post-login] `/` deja de ser
  // `proceso-nuevo` y pasa a `inicio`; `proceso-nuevo` se muda a `/procesos/nuevo`.
  it("[1.1] '/' resuelve a 'inicio' y su rutaAPath es '/'", () => {
    expect(parsearRuta('/')).toEqual({ nombre: 'inicio' });
    expect(rutaAPath({ nombre: 'inicio' })).toBe('/');
  });

  it("[1.2] '/procesos/nuevo' resuelve a 'proceso-nuevo' y su rutaAPath es '/procesos/nuevo'", () => {
    expect(parsearRuta('/procesos/nuevo')).toEqual({ nombre: 'proceso-nuevo' });
    expect(rutaAPath({ nombre: 'proceso-nuevo' })).toBe('/procesos/nuevo');
  });

  it("[1.2] '/procesos/nuevo/extra' resuelve a 'no-encontrada'", () => {
    expect(parsearRuta('/procesos/nuevo/extra')).toEqual({
      nombre: 'no-encontrada',
      pathname: '/procesos/nuevo/extra',
    });
  });
});
