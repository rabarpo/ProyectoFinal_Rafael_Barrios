import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { urlFotoOpcion, urlPlanTrabajoOpcion } from './votos-api';

// rediseno-boleta-votacion, PR3 (design.md D3/D7, tasks.md 12.1): construcción de URL absoluta
// same-origin — la cookie de sesión viaja sola en <img src>/window.open, mismo patrón de
// `urlFoto` de #12/candidatos-api.ts y `urlLogo` de #10/configuracion-api.ts. Nunca fetch+Blob.
describe('votos-api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('urlFotoOpcion arma la URL absoluta de la foto de una opción propia bajo VITE_API_BASE_URL', () => {
    expect(urlFotoOpcion('dv1', 'o1')).toBe(
      'http://localhost:3000/api/votos/papeleta/dv1/opciones/o1/foto',
    );
  });

  it('urlPlanTrabajoOpcion arma la URL absoluta del plan de trabajo de una opción propia', () => {
    expect(urlPlanTrabajoOpcion('dv1', 'o1')).toBe(
      'http://localhost:3000/api/votos/papeleta/dv1/opciones/o1/plan-trabajo',
    );
  });
});
