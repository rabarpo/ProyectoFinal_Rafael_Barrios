import { describe, expect, it } from 'vitest';
import { PESTANAS } from './pestanas';

// [design.md D2; tasks.md 3.1; spec: minimal-frontend-router] `PESTANAS` es dato puro, fuente
// única de la barra de pestañas y del `switch` de `AcademicaPage` (misma disciplina que
// `MENU_POR_ROL`, D2 de #25): se prueba exhaustivo, sin render.
describe('PESTANAS', () => {
  it('[3.1] tiene exactamente 6 entradas con los ids esperados en orden', () => {
    expect(PESTANAS.map((p) => p.id)).toEqual(['anios', 'niveles', 'grados', 'secciones', 'aulas', 'matriculas']);
  });

  it('[3.1] cada entrada tiene una etiqueta no vacía', () => {
    for (const pestana of PESTANAS) {
      expect(pestana.etiqueta.trim().length).toBeGreaterThan(0);
    }
  });
});
