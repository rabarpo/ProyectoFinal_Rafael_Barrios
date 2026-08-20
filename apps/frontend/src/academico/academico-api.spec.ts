import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activarAnioEscolar,
  actualizarAnioEscolar,
  actualizarAula,
  actualizarGrado,
  actualizarNivel,
  actualizarSeccion,
  crearAnioEscolar,
  crearAula,
  crearGrado,
  crearMatricula,
  crearNivel,
  crearSeccion,
  eliminarAnioEscolar,
  eliminarAula,
  eliminarGrado,
  eliminarMatricula,
  eliminarNivel,
  eliminarSeccion,
  listarMatriculas,
  listarSecciones,
} from './academico-api';

// [tasks.md 9.1-9.4] `academico-api.ts` combina dos estilos en el mismo módulo (D6): las 4
// lecturas preexistentes devuelven el `{ data, response }` crudo de `openapi-fetch` (no se tocan,
// las consume `procesos/useOpcionesSegmentacion.ts`); las 2 lecturas nuevas (`listarSecciones`,
// `listarMatriculas`) siguen ese mismo estilo crudo; las 15 escrituras usan `ResultadoApi<T>` +
// `resolver`/`resolverVacio`, copiados de `candidatos-api.ts`.
function respuesta(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('academico-api', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('listarSecciones filtra por grado_id y anio_escolar_id y devuelve el shape crudo', async () => {
    let urlCapturada = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        return respuesta(200, [{ id: 's1', nombre: 'A' }]);
      }),
    );

    const resultado = await listarSecciones({ grado_id: 'g1', anio_escolar_id: 'a1' });

    expect(urlCapturada).toContain('grado_id=g1');
    expect(urlCapturada).toContain('anio_escolar_id=a1');
    expect(resultado.data).toEqual([{ id: 's1', nombre: 'A' }]);
    expect(resultado.response.status).toBe(200);
  });

  it('listarMatriculas filtra por aula_id y anio_escolar_id y devuelve el shape crudo', async () => {
    let urlCapturada = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        return respuesta(200, [{ id: 'm1' }]);
      }),
    );

    const resultado = await listarMatriculas({ aula_id: 'au1', anio_escolar_id: 'a1' });

    expect(urlCapturada).toContain('aula_id=au1');
    expect(urlCapturada).toContain('anio_escolar_id=a1');
    expect(resultado.data).toEqual([{ id: 'm1' }]);
  });

  it('crearAnioEscolar devuelve ok:true con data en 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(201, { id: 'ae1', nombre: '2026', activo: false })),
    );

    const resultado = await crearAnioEscolar({ nombre: '2026' });

    expect(resultado).toEqual({ ok: true, data: { id: 'ae1', nombre: '2026', activo: false } });
  });

  it('crearAnioEscolar devuelve ok:false con status y codigo en 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(409, { codigo: 'RESTRICCION_UNICA' })));

    const resultado = await crearAnioEscolar({ nombre: '2026' });

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'RESTRICCION_UNICA' });
  });

  it('actualizarAnioEscolar envía PATCH y resuelve ok:true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { id: 'ae1', nombre: '2027', activo: false })),
    );

    const resultado = await actualizarAnioEscolar('ae1', { nombre: '2027' });

    expect(resultado).toEqual({ ok: true, data: { id: 'ae1', nombre: '2027', activo: false } });
  });

  it('eliminarAnioEscolar devuelve ok:false con codigo ENTIDAD_CON_DEPENDIENTES en 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'ENTIDAD_CON_DEPENDIENTES' })),
    );

    const resultado = await eliminarAnioEscolar('ae1');

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'ENTIDAD_CON_DEPENDIENTES' });
  });

  it('activarAnioEscolar resuelve ResultadoApi<ResultadoActivacion> pasando el body sin cambios', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { id: 'ae1', activo: true, cambio: true })),
    );

    const resultado = await activarAnioEscolar('ae1');

    expect(resultado).toEqual({ ok: true, data: { id: 'ae1', activo: true, cambio: true } });
  });

  it('activarAnioEscolar devuelve ok:false con codigo ACTIVACION_CONCURRENTE en 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'ACTIVACION_CONCURRENTE' })),
    );

    const resultado = await activarAnioEscolar('ae1');

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'ACTIVACION_CONCURRENTE' });
  });

  it('crearNivel/actualizarNivel/eliminarNivel están conectados a resolver/resolverVacio', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(201, { id: 'n1', nombre: 'Inicial' })));
    expect(await crearNivel({ nombre: 'Inicial' })).toEqual({
      ok: true,
      data: { id: 'n1', nombre: 'Inicial' },
    });

    vi.stubGlobal('fetch', vi.fn(async () => respuesta(200, { id: 'n1', nombre: 'Primaria' })));
    expect(await actualizarNivel('n1', { nombre: 'Primaria' })).toEqual({
      ok: true,
      data: { id: 'n1', nombre: 'Primaria' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'ENTIDAD_CON_DEPENDIENTES' })),
    );
    expect(await eliminarNivel('n1')).toEqual({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
    });
  });

  it('crearGrado/actualizarGrado/eliminarGrado están conectados a resolver/resolverVacio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(201, { id: 'g1', nombre: '1ro', nivel_id: 'n1' })),
    );
    expect(await crearGrado({ nombre: '1ro', nivel_id: 'n1' })).toEqual({
      ok: true,
      data: { id: 'g1', nombre: '1ro', nivel_id: 'n1' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(200, { id: 'g1', nombre: '2do', nivel_id: 'n1' })),
    );
    expect(await actualizarGrado('g1', { nombre: '2do' })).toEqual({
      ok: true,
      data: { id: 'g1', nombre: '2do', nivel_id: 'n1' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'ENTIDAD_CON_DEPENDIENTES' })),
    );
    expect(await eliminarGrado('g1')).toEqual({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
    });
  });

  it('crearSeccion/actualizarSeccion/eliminarSeccion están conectados a resolver/resolverVacio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(201, { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'ae1' }),
      ),
    );
    expect(
      await crearSeccion({ nombre: 'A', grado_id: 'g1', anio_escolar_id: 'ae1' }),
    ).toEqual({
      ok: true,
      data: { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'ae1' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, { id: 's1', nombre: 'B', grado_id: 'g1', anio_escolar_id: 'ae1' }),
      ),
    );
    expect(await actualizarSeccion('s1', { nombre: 'B' })).toEqual({
      ok: true,
      data: { id: 's1', nombre: 'B', grado_id: 'g1', anio_escolar_id: 'ae1' },
    });

    vi.stubGlobal('fetch', vi.fn(async () => respuesta(409, { codigo: 'ENTIDAD_CON_DEPENDIENTES' })));
    expect(await eliminarSeccion('s1')).toEqual({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
    });
  });

  it('crearAula/actualizarAula/eliminarAula están conectados a resolver/resolverVacio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(201, {
          id: 'au1',
          turno: 'manana',
          grado_id: 'g1',
          seccion_id: 's1',
          anio_escolar_id: 'ae1',
        }),
      ),
    );
    expect(
      await crearAula({ turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'ae1' }),
    ).toEqual({
      ok: true,
      data: {
        id: 'au1',
        turno: 'manana',
        grado_id: 'g1',
        seccion_id: 's1',
        anio_escolar_id: 'ae1',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(200, {
          id: 'au1',
          turno: 'tarde',
          grado_id: 'g1',
          seccion_id: 's1',
          anio_escolar_id: 'ae1',
        }),
      ),
    );
    expect(await actualizarAula('au1', { turno: 'tarde' })).toEqual({
      ok: true,
      data: {
        id: 'au1',
        turno: 'tarde',
        grado_id: 'g1',
        seccion_id: 's1',
        anio_escolar_id: 'ae1',
      },
    });

    vi.stubGlobal('fetch', vi.fn(async () => respuesta(409, { codigo: 'ENTIDAD_CON_DEPENDIENTES' })));
    expect(await eliminarAula('au1')).toEqual({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
    });
  });

  it('crearMatricula/eliminarMatricula están conectados a resolver/resolverVacio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respuesta(201, { id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'ae1' }),
      ),
    );
    expect(
      await crearMatricula({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'ae1' }),
    ).toEqual({
      ok: true,
      data: { id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'ae1' },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    expect(await eliminarMatricula('m1')).toEqual({ ok: true });
  });

  it('eliminarMatricula devuelve ok:false con status y sin codigo cuando el body no lo trae', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(404, {})));

    const resultado = await eliminarMatricula('inexistente');

    expect(resultado).toEqual({ ok: false, status: 404, codigo: undefined });
  });
});
