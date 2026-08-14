import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarCandidato,
  cambiarEstadoCandidato,
  crearCandidato,
  listarCandidatos,
  listarListas,
  listarOpciones,
  urlFoto,
} from './candidatos-api';

// [tasks.md 20.2] `candidatos-api` traduce el `Response` crudo del backend a
// `ResultadoApi<T>`: `ok:true` con `data`, o `ok:false` con `status` y el
// `codigo` de negocio (`candidatos.errors.ts`) cuando el body lo trae —
// mismo patrón de stub de `fetch` que `auth-api.spec.ts`.
function respuesta(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('candidatos-api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('crearCandidato envía multipart/form-data con la foto y los campos de texto', async () => {
    let cuerpoCapturado: FormData | undefined;
    vi.stubGlobal(
      'fetch',
      // openapi-fetch construye un `new Request(url, {body})` y llama
      // `fetch(request)` con un solo argumento: el FormData viaja adentro
      // del propio `Request`, no en un segundo parámetro `init`.
      vi.fn(async (peticion: Request) => {
        cuerpoCapturado = await peticion.clone().formData();
        return respuesta(201, {
          id: 'c1',
          proceso_id: 'p1',
          nombres: 'Ana',
          foto_presente: true,
        });
      }),
    );
    const foto = new File(['contenido'], 'foto.png', { type: 'image/png' });

    const resultado = await crearCandidato({ proceso_id: 'p1', nombres: 'Ana', foto });

    expect(resultado).toEqual({
      ok: true,
      data: { id: 'c1', proceso_id: 'p1', nombres: 'Ana', foto_presente: true },
    });
    // `peticion.clone().formData()` reconstruye un `FormData` en el realm
    // de `jsdom`'s `Request`, distinto de `globalThis.FormData` del test —
    // por eso se verifica por comportamiento (`get`), no por `instanceof`.
    expect(cuerpoCapturado?.get('nombres')).toBe('Ana');
    expect(cuerpoCapturado?.get('proceso_id')).toBe('p1');
    // jsdom reconstruye el `File` al re-parsear el multipart del `Request`
    // clonado y no preserva el nombre original (usa "blob") — se verifica el
    // `type`, que sí sobrevive el round-trip.
    const fotoEnviada = cuerpoCapturado?.get('foto') as File;
    expect(fotoEnviada?.type).toBe('image/png');
  });

  it("mapea 400 FOTO_REQUERIDA a un codigo legible por la UI", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(400, { codigo: 'FOTO_REQUERIDA' })));
    const foto = new File(['x'], 'foto.png', { type: 'image/png' });

    const resultado = await crearCandidato({ proceso_id: 'p1', nombres: 'Ana', foto });

    expect(resultado).toEqual({ ok: false, status: 400, codigo: 'FOTO_REQUERIDA' });
  });

  it('mapea 409 COHERENCIA_JERARQUICA en actualizarCandidato', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'COHERENCIA_JERARQUICA' })),
    );

    const resultado = await actualizarCandidato('c1', { nombres: 'Ana' });

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'COHERENCIA_JERARQUICA' });
  });

  it('listarListas filtra por proceso_id y devuelve el arreglo de listas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, [
          {
            id: 'l1',
            proceso_id: 'p1',
            nombre: 'Lista A',
            numero: 1,
            estado: 'activo',
            plan_trabajo_presente: false,
          },
        ]),
      ),
    );

    const resultado = await listarListas('p1');

    expect(resultado.ok).toBe(true);
    expect(resultado.data).toHaveLength(1);
    expect(resultado.data?.[0].nombre).toBe('Lista A');
  });

  // [tasks.md 23.3] `GestionCandidatosPage` necesita listar candidatos y
  // opciones por proceso además de listas — mismo criterio de filtro por
  // `proceso_id` que `listarListas`.
  it('listarCandidatos filtra por proceso_id y devuelve el arreglo de candidatos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, [
          {
            id: 'c1',
            proceso_id: 'p1',
            nombres: 'Ana',
            foto_presente: true,
            estado: 'activo',
          },
        ]),
      ),
    );

    const resultado = await listarCandidatos('p1');

    expect(resultado.ok).toBe(true);
    expect(resultado.data).toHaveLength(1);
    expect(resultado.data?.[0].nombres).toBe('Ana');
  });

  it('listarOpciones filtra por proceso_id y devuelve el arreglo de opciones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, [{ id: 'o1', proceso_id: 'p1', etiqueta: 'Sí' }]),
      ),
    );

    const resultado = await listarOpciones('p1');

    expect(resultado.ok).toBe(true);
    expect(resultado.data?.[0].etiqueta).toBe('Sí');
  });

  it('cambiarEstadoCandidato envía PATCH .../estado y devuelve el candidato con el estado nuevo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, {
          id: 'c1',
          proceso_id: 'p1',
          nombres: 'Ana',
          foto_presente: true,
          estado: 'baja',
          baja_en: '2026-08-13T00:00:00.000Z',
        }),
      ),
    );

    const resultado = await cambiarEstadoCandidato('c1', 'baja');

    expect(resultado).toEqual({
      ok: true,
      data: {
        id: 'c1',
        proceso_id: 'p1',
        nombres: 'Ana',
        foto_presente: true,
        estado: 'baja',
        baja_en: '2026-08-13T00:00:00.000Z',
      },
    });
  });

  it('cambiarEstadoCandidato mapea 409 ENTIDAD_CON_DEPENDIENTES a un codigo legible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'ENTIDAD_CON_DEPENDIENTES' })),
    );

    const resultado = await cambiarEstadoCandidato('c1', 'baja');

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'ENTIDAD_CON_DEPENDIENTES' });
  });

  it('urlFoto arma la URL absoluta de la foto de un candidato bajo VITE_API_BASE_URL', () => {
    expect(urlFoto('c1')).toBe('http://localhost:3000/api/candidatos/c1/foto');
  });
});
