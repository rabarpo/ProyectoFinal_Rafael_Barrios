import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listarUsuarios } from './usuarios-api';

// [tasks.md 10.1] `usuarios-api.ts` es una semilla mínima (D11) para resolver
// `usuario_id → nombres` en `PanelMatriculas` (PR7); sólo `listarUsuarios`,
// estilo lectura cruda (mismo criterio que las 4 lecturas preexistentes de
// `academico-api.ts`, no `ResultadoApi`).
function respuesta(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('usuarios-api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('listarUsuarios sin filtros llama GET /usuarios y devuelve el shape crudo', async () => {
    let urlCapturada = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        return respuesta(200, [{ id: 'u1', nombres: 'Ana', rol: 'estudiante' }]);
      }),
    );

    const resultado = await listarUsuarios();

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios');
    expect(resultado.data).toEqual([{ id: 'u1', nombres: 'Ana', rol: 'estudiante' }]);
    expect(resultado.response.status).toBe(200);
  });

  it('listarUsuarios pasa rol y estado como query params', async () => {
    let urlCapturada = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        return respuesta(200, []);
      }),
    );

    await listarUsuarios({ rol: 'estudiante', estado: 'activo' });

    expect(urlCapturada).toContain('rol=estudiante');
    expect(urlCapturada).toContain('estado=activo');
  });
});
