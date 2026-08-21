import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarConfiguracion,
  listarComite,
  obtenerConfiguracion,
  subirLogo,
  urlLogo,
} from './configuracion-api';

// [tasks.md 5.1-6.4] `configuracion-api.ts` copia `ResultadoApi<T>`/`resolver` de
// `candidatos-api.ts`, incluidas las dos lecturas (design.md D3) — a diferencia de
// `#26` D6, `GET /configuracion` también carga el envelope porque un fallo no puede
// dejar montar el formulario con valores basura.
function respuesta(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('configuracion-api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('obtenerConfiguracion', () => {
    it('llama GET /configuracion y devuelve { ok: true, data } en 2xx', async () => {
      let urlCapturada = '';
      const datos = {
        id: 'c1',
        nombre: 'Colegio X',
        director: 'Ana',
        color_primario: '#123456',
        color_secundario: '#abcdef',
        zona_horaria: 'America/Lima',
        dominios_google: ['colegio.edu.pe'],
        logo_presente: false,
        logo_mime: null,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (peticion: Request) => {
          urlCapturada = peticion.url;
          return respuesta(200, datos);
        }),
      );

      const resultado = await obtenerConfiguracion();

      expect(urlCapturada).toBe('http://localhost:3000/api/configuracion');
      expect(resultado).toEqual({ ok: true, data: datos });
    });

    it('devuelve { ok: false, status } en una respuesta no-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => respuesta(403, {})));

      const resultado = await obtenerConfiguracion();

      expect(resultado).toEqual({ ok: false, status: 403 });
    });
  });

  describe('actualizarConfiguracion', () => {
    it('llama PUT /configuracion con el body parcial y devuelve { ok: true, data } en 2xx', async () => {
      let urlCapturada = '';
      let metodoCapturado = '';
      let cuerpoCapturado: unknown;
      const datos = {
        id: 'c1',
        nombre: 'Colegio Y',
        director: 'Ana',
        color_primario: '#123456',
        color_secundario: '#abcdef',
        zona_horaria: 'America/Lima',
        dominios_google: [],
        logo_presente: false,
        logo_mime: null,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (peticion: Request) => {
          urlCapturada = peticion.url;
          metodoCapturado = peticion.method;
          cuerpoCapturado = await peticion.clone().json();
          return respuesta(200, datos);
        }),
      );

      const resultado = await actualizarConfiguracion({ nombre: 'Colegio Y' });

      expect(urlCapturada).toBe('http://localhost:3000/api/configuracion');
      expect(metodoCapturado).toBe('PUT');
      expect(cuerpoCapturado).toEqual({ nombre: 'Colegio Y' });
      expect(resultado).toEqual({ ok: true, data: datos });
    });

    it('mapea 400 CAMPO_INVALIDO con campo a { ok: false, status, codigo, campo }', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          respuesta(400, { codigo: 'CAMPO_INVALIDO', campo: 'color_primario' }),
        ),
      );

      const resultado = await actualizarConfiguracion({ color_primario: 'no-es-un-color' });

      expect(resultado).toEqual({
        ok: false,
        status: 400,
        codigo: 'CAMPO_INVALIDO',
        campo: 'color_primario',
      });
    });
  });

  describe('listarComite', () => {
    it('llama GET /configuracion/comite y devuelve { ok: true, data: [] } en un arreglo vacío', async () => {
      let urlCapturada = '';
      vi.stubGlobal(
        'fetch',
        vi.fn(async (peticion: Request) => {
          urlCapturada = peticion.url;
          return respuesta(200, []);
        }),
      );

      const resultado = await listarComite();

      expect(urlCapturada).toBe('http://localhost:3000/api/configuracion/comite');
      expect(resultado).toEqual({ ok: true, data: [] });
    });

    it('devuelve { ok: false, status } en una respuesta no-2xx', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => respuesta(403, {})));

      const resultado = await listarComite();

      expect(resultado).toEqual({ ok: false, status: 403 });
    });
  });

  describe('subirLogo', () => {
    it('envía POST /configuracion/logo con FormData clave "logo" y sin Content-Type manual', async () => {
      let urlCapturada = '';
      let metodoCapturado = '';
      let cuerpoCapturado: FormData | undefined;
      let contentTypeCapturado: string | null = null;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (peticion: Request) => {
          urlCapturada = peticion.url;
          metodoCapturado = peticion.method;
          contentTypeCapturado = peticion.headers.get('Content-Type');
          cuerpoCapturado = await peticion.clone().formData();
          return respuesta(200, {
            logo_mime: 'image/png',
            logo_actualizado_en: '2026-01-01T00:00:00.000Z',
          });
        }),
      );
      const archivo = new File(['contenido'], 'logo.png', { type: 'image/png' });

      const resultado = await subirLogo(archivo);

      expect(urlCapturada).toBe('http://localhost:3000/api/configuracion/logo');
      expect(metodoCapturado).toBe('POST');
      // openapi-fetch no fija manualmente el Content-Type con un FormData; el
      // navegador/jsdom agrega el boundary multipart automáticamente.
      const contentTypeOk =
        contentTypeCapturado === null ||
        (contentTypeCapturado as string).includes('multipart/form-data');
      expect(contentTypeOk).toBe(true);
      const logoEnviado = cuerpoCapturado?.get('logo') as File;
      expect(logoEnviado?.type).toBe('image/png');
      expect(resultado).toEqual({
        ok: true,
        data: { logo_mime: 'image/png', logo_actualizado_en: '2026-01-01T00:00:00.000Z' },
      });
    });

    it('mapea un 4xx bare { codigo } a { ok: false, status, codigo }', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => respuesta(400, { codigo: 'LOGO_TAMANIO_EXCEDIDO' })),
      );
      const archivo = new File(['x'.repeat(10)], 'logo.png', { type: 'image/png' });

      const resultado = await subirLogo(archivo);

      expect(resultado).toEqual({ ok: false, status: 400, codigo: 'LOGO_TAMANIO_EXCEDIDO' });
    });
  });

  describe('urlLogo', () => {
    it('devuelve una URL que contiene /configuracion/logo y un parámetro de versión', () => {
      const url = urlLogo('2026-01-01T00:00:00.000Z');

      expect(url).toContain('/configuracion/logo');
      expect(url).toContain('2026-01-01T00%3A00%3A00.000Z');
    });

    it('urlLogo(undefined) devuelve una URL válida sin lanzar', () => {
      expect(() => urlLogo(undefined)).not.toThrow();
      const url = urlLogo(undefined);
      expect(url).toContain('/configuracion/logo');
    });
  });
});
