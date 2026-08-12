import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { login, google } from './auth-api';

// [D8] `auth-api.ts` es el único lugar que traduce las respuestas crudas del
// backend a las tres causas que el resto de `auth/` conoce: 'credenciales'
// (401 uniforme, ver auth.service.ts), 'vinculacion' (409
// VINCULACION_REQUERIDA, solo en /auth/google) y 'red' (fetch rechaza o
// cualquier otro status). Se stubea `fetch` global (mismo patrón que
// packages/contracts/src/client.spec.ts) para no depender de un backend real.
function respuesta(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('login()', () => {
  beforeEach(() => {
    // openapi-fetch construye un `Request` real; el entorno de test no tiene
    // un `origin` implícito para resolver una URL relativa como `/api`
    // (a diferencia del navegador), así que se fija una base absoluta.
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('resuelve ok:true cuando el backend responde 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(200, { mensaje: 'Login exitoso' })));

    const resultado = await login('seed-comite', 'clave-correcta');

    expect(resultado).toEqual({ ok: true });
  });

  it("mapea 401 a error:'credenciales'", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(401)));

    const resultado = await login('seed-comite', 'clave-incorrecta');

    expect(resultado).toEqual({ ok: false, error: 'credenciales' });
  });

  it("mapea un fetch que rechaza a error:'red'", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const resultado = await login('seed-comite', 'clave-cualquiera');

    expect(resultado).toEqual({ ok: false, error: 'red' });
  });
});

describe('google()', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("mapea 409 (VINCULACION_REQUERIDA) a error:'vinculacion'", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'VINCULACION_REQUERIDA' })),
    );

    const resultado = await google('id-token-valido');

    expect(resultado).toEqual({ ok: false, error: 'vinculacion' });
  });

  it("mapea 401 a error:'credenciales'", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(401)));

    const resultado = await google('id-token-rechazado');

    expect(resultado).toEqual({ ok: false, error: 'credenciales' });
  });
});
