import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importarPadron } from './importacion-api';

// [design.md D3; tasks.md 3.1] `importarPadron` reusa el cliente tipado con un `FormData` de una
// sola clave (`archivo`, la que espera `FileInterceptor('archivo')`). Traduce el `Response` crudo a
// `ResultadoApi<T>`: `ok:true` con `data` en `201`, o `ok:false` con `status`/`codigo` en `400`.
// Mismo patrón de stub de `fetch` que `candidatos-api.spec.ts` (openapi-fetch llama
// `fetch(request)` con el `Request` completo, el cuerpo viaja adentro).
function respuesta(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const RESULTADO_OK = {
  importacion_id: 'imp-1',
  filas_totales: 3,
  filas_creadas: 2,
  filas_existentes: 0,
  filas_invalidas: 1,
  errores: [
    { fila: 3, campo: 'correo', motivo: 'formato', valor_recibido: 'no-es-correo' },
  ],
};

describe('importacion-api / importarPadron', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('envía POST /importaciones/padron con FormData(archivo) y sin Content-Type JSON manual', async () => {
    let urlCapturada: string | undefined;
    let contentType: string | null = null;
    let cuerpo: FormData | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        contentType = peticion.headers.get('Content-Type');
        cuerpo = await peticion.clone().formData();
        return respuesta(201, RESULTADO_OK);
      }),
    );
    const archivo = new File(['a,b,c'], 'padron.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const resultado = await importarPadron(archivo);

    expect(resultado.ok).toBe(true);
    expect(resultado.data?.importacion_id).toBe('imp-1');
    expect(resultado.data?.filas_totales).toBe(3);
    expect(urlCapturada).toBe('http://localhost:3000/api/importaciones/padron');
    expect(contentType ?? '').not.toContain('application/json');
    // jsdom reconstruye el `File` al re-parsear el multipart del `Request` clonado en su propio
    // realm (no preserva el `name`, usa "blob"); se verifica por comportamiento igual que
    // `candidatos-api.spec.ts`: el `type` sobrevive el round-trip y no es un string plano.
    const archivoEnviado = cuerpo?.get('archivo') as File;
    expect(typeof archivoEnviado).not.toBe('string');
    expect(archivoEnviado.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('mapea un 400 con codigo de negocio a ok:false con status y codigo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(400, { codigo: 'CABECERA_INVALIDA' })),
    );

    const resultado = await importarPadron(new File(['x'], 'padron.xlsx'));

    expect(resultado).toEqual({ ok: false, status: 400, codigo: 'CABECERA_INVALIDA' });
  });

  it('ante un error de red devuelve ok:false sin lanzar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    const resultado = await importarPadron(new File(['x'], 'padron.xlsx'));

    expect(resultado).toEqual({ ok: false });
  });
});
