import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarApoderado,
  actualizarUsuario,
  cambiarEstadoUsuario,
  crearApoderado,
  crearUsuario,
  desbloquearCuenta,
  eliminarApoderado,
  listarApoderados,
  listarCuentasBloqueadas,
  listarUsuarios,
} from './usuarios-api';

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

  // [tasks.md 7.1-7.5] D5/D6: `ResultadoApi<T>` + funciones de `Usuario`.
  it('crearUsuario llama POST /usuarios con el body de 5 campos y devuelve ok:true con data en 2xx', async () => {
    let urlCapturada = '';
    let metodoCapturado = '';
    let bodyCapturado: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        metodoCapturado = peticion.method;
        bodyCapturado = await peticion.json();
        return respuesta(201, {
          id: 'u1',
          nombres: 'Ana',
          dni: '12345678',
          codigo: 'C001',
          correo: 'ana@x.com',
          rol: 'docente',
          estado: 'activo',
          creado_en: '2026-01-01T00:00:00.000Z',
        });
      }),
    );

    const input = {
      nombres: 'Ana',
      dni: '12345678',
      codigo: 'C001',
      correo: 'ana@x.com',
      rol: 'docente' as const,
    };
    const resultado = await crearUsuario(input);

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios');
    expect(metodoCapturado).toBe('POST');
    expect(bodyCapturado).toEqual(input);
    expect(resultado).toEqual({
      ok: true,
      data: {
        id: 'u1',
        nombres: 'Ana',
        dni: '12345678',
        codigo: 'C001',
        correo: 'ana@x.com',
        rol: 'docente',
        estado: 'activo',
        creado_en: '2026-01-01T00:00:00.000Z',
      },
    });
  });

  it('crearUsuario devuelve ok:false con status/codigo/campo en 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'CAMPO_DUPLICADO', campo: 'dni' })),
    );

    const resultado = await crearUsuario({
      nombres: 'Ana',
      dni: '12345678',
      codigo: 'C001',
      correo: 'ana@x.com',
      rol: 'docente',
    });

    expect(resultado).toEqual({
      ok: false,
      status: 409,
      codigo: 'CAMPO_DUPLICADO',
      campo: 'dni',
    });
  });

  it('actualizarUsuario llama PATCH /usuarios/{id} con el path param y el body de 4 campos', async () => {
    let urlCapturada = '';
    let metodoCapturado = '';
    let bodyCapturado: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        metodoCapturado = peticion.method;
        bodyCapturado = await peticion.json();
        return respuesta(200, {
          id: 'u1',
          nombres: 'Ana',
          dni: '12345678',
          codigo: 'C001',
          correo: 'nuevo@x.com',
          rol: 'docente',
          estado: 'activo',
          creado_en: '2026-01-01T00:00:00.000Z',
        });
      }),
    );

    const resultado = await actualizarUsuario('u1', { correo: 'nuevo@x.com' });

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios/u1');
    expect(metodoCapturado).toBe('PATCH');
    expect(bodyCapturado).toEqual({ correo: 'nuevo@x.com' });
    expect(resultado.ok).toBe(true);
    expect(resultado.data?.correo).toBe('nuevo@x.com');
  });

  it('actualizarUsuario devuelve ok:false en error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(404, {})));

    const resultado = await actualizarUsuario('inexistente', { correo: 'x@x.com' });

    expect(resultado).toEqual({ ok: false, status: 404 });
  });

  it('cambiarEstadoUsuario llama PATCH /usuarios/{id}/estado con { estado } y resuelve ResultadoApi<CambioEstadoUsuario> en 2xx', async () => {
    let urlCapturada = '';
    let bodyCapturado: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        bodyCapturado = await peticion.json();
        return respuesta(200, { id: 'u1', estado: 'inactivo' });
      }),
    );

    const resultado = await cambiarEstadoUsuario('u1', 'inactivo');

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios/u1/estado');
    expect(bodyCapturado).toEqual({ estado: 'inactivo' });
    expect(resultado).toEqual({ ok: true, data: { id: 'u1', estado: 'inactivo' } });
  });

  it('cambiarEstadoUsuario devuelve ok:false con codigo TRANSICION_DESDE_BLOQUEADO en 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'TRANSICION_DESDE_BLOQUEADO' })),
    );

    const resultado = await cambiarEstadoUsuario('u1', 'activo');

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'TRANSICION_DESDE_BLOQUEADO' });
  });

  // [tasks.md 8.1-8.5] D5/D6: funciones de `Apoderado`.
  it('listarApoderados llama GET /usuarios/{usuarioId}/apoderados y devuelve ResultadoApi<ApoderadoRespuestaDto[]>', async () => {
    let urlCapturada = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        return respuesta(200, []);
      }),
    );

    const resultado = await listarApoderados('u1');

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios/u1/apoderados');
    expect(resultado).toEqual({ ok: true, data: [] });
  });

  it('listarApoderados devuelve ok:false con codigo USUARIO_NO_ES_ESTUDIANTE en 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'USUARIO_NO_ES_ESTUDIANTE' })),
    );

    const resultado = await listarApoderados('u1');

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'USUARIO_NO_ES_ESTUDIANTE' });
  });

  it('crearApoderado llama POST /usuarios/{usuarioId}/apoderados con el body', async () => {
    let urlCapturada = '';
    let bodyCapturado: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        bodyCapturado = await peticion.json();
        return respuesta(201, { id: 'ap1', nombres: 'Luis', dni: '111', correo: null });
      }),
    );

    const resultado = await crearApoderado('u1', { nombres: 'Luis', dni: '111' });

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios/u1/apoderados');
    expect(bodyCapturado).toEqual({ nombres: 'Luis', dni: '111' });
    expect(resultado).toEqual({
      ok: true,
      data: { id: 'ap1', nombres: 'Luis', dni: '111', correo: null },
    });
  });

  it('crearApoderado devuelve ok:false con codigo/campo en error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta(409, { codigo: 'CAMPO_DUPLICADO', campo: 'dni' })),
    );

    const resultado = await crearApoderado('u1', { nombres: 'Luis', dni: '111' });

    expect(resultado).toEqual({ ok: false, status: 409, codigo: 'CAMPO_DUPLICADO', campo: 'dni' });
  });

  it('actualizarApoderado llama PATCH /usuarios/{usuarioId}/apoderados/{apoderadoId} con ambos path params', async () => {
    let urlCapturada = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        return respuesta(200, { id: 'ap1', nombres: 'Luis', dni: '111', correo: 'x@x.com' });
      }),
    );

    const resultado = await actualizarApoderado('u1', 'ap1', { correo: 'x@x.com' });

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios/u1/apoderados/ap1');
    expect(resultado.ok).toBe(true);
  });

  it('eliminarApoderado llama DELETE /usuarios/{usuarioId}/apoderados/{apoderadoId} y resuelve via resolverVacio', async () => {
    let urlCapturada = '';
    let metodoCapturado = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        metodoCapturado = peticion.method;
        return new Response(null, { status: 204 });
      }),
    );

    const resultado = await eliminarApoderado('u1', 'ap1');

    expect(urlCapturada).toBe('http://localhost:3000/api/usuarios/u1/apoderados/ap1');
    expect(metodoCapturado).toBe('DELETE');
    expect(resultado).toEqual({ ok: true });
  });

  // [tasks.md 9.1-9.3] D5/D6: funciones de bloqueo.
  it('listarCuentasBloqueadas llama GET /auth/usuarios/bloqueados y devuelve ok:true con data en 2xx', async () => {
    let urlCapturada = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        return respuesta(200, [
          { id: 'u1', nombres: 'Ana', dni: '111', codigo: 'C001', bloqueado_hasta: null },
        ]);
      }),
    );

    const resultado = await listarCuentasBloqueadas();

    expect(urlCapturada).toBe('http://localhost:3000/api/auth/usuarios/bloqueados');
    expect(resultado).toEqual({
      ok: true,
      data: [{ id: 'u1', nombres: 'Ana', dni: '111', codigo: 'C001', bloqueado_hasta: null }],
    });
  });

  it('listarCuentasBloqueadas devuelve ok:false con status 403 y sin codigo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(403, {})));

    const resultado = await listarCuentasBloqueadas();

    expect(resultado).toEqual({ ok: false, status: 403 });
  });

  it('desbloquearCuenta llama POST /auth/usuarios/{id}/desbloquear y resuelve ResultadoApi<ResultadoDesbloqueo> con desbloqueado:true', async () => {
    let urlCapturada = '';
    let metodoCapturado = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        urlCapturada = peticion.url;
        metodoCapturado = peticion.method;
        return respuesta(200, { desbloqueado: true });
      }),
    );

    const resultado = await desbloquearCuenta('u1');

    expect(urlCapturada).toBe('http://localhost:3000/api/auth/usuarios/u1/desbloquear');
    expect(metodoCapturado).toBe('POST');
    expect(resultado).toEqual({ ok: true, data: { desbloqueado: true } });
  });

  it('desbloquearCuenta con desbloqueado:false (caso idempotente ya recuperado) sigue siendo ok:true', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respuesta(200, { desbloqueado: false })));

    const resultado = await desbloquearCuenta('u1');

    expect(resultado).toEqual({ ok: true, data: { desbloqueado: false } });
  });
});
