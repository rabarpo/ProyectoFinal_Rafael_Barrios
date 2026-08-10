import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { ConfiguracionService } from './configuracion.service';
import { CONFIGURACION_ERROR_CODES } from './configuracion.errors';
import {
  ConfiguracionController,
  LogoTamanioExcedidoFilter,
  filtroArchivoLogo,
} from './configuracion.controller';
import type { UsersService } from '../users/users.service';

/**
 * configuracion-general, PR3 (design.md "Interfaces / Contracts"/Threat Matrix, tareas 3.1/3.2/3.3).
 * `filtroArchivoLogo` reusa el patrón de `filtroArchivoPadron`
 * (`importacion.controller.spec.ts`): allowlist doble extensión+MIME evaluada ANTES de tocar la
 * DB, sin instanciar Nest testing module completo. `LogoTamanioExcedidoFilter` cubre 3.2: el
 * límite de tamaño lo aplica `multer` vía `limits.fileSize` y NestJS lo traduce en
 * `PayloadTooLargeException` (413) por defecto (`@nestjs/platform-express` `transformException`);
 * el filtro lo convierte a `400 LOGO_TAMANIO_EXCEDIDO` para cumplir la spec "error 4xx legible" +
 * `tasks.md` 3.2 (`BadRequestException`, no 413).
 */

describe('filtroArchivoLogo() (3.1: allowlist doble extensión + MIME, PNG/JPG/SVG)', () => {
  it('acepta un PNG con extensión y MIME correctos', () => {
    const callback = jest.fn();
    filtroArchivoLogo({}, { originalname: 'logo.png', mimetype: 'image/png' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('acepta un JPG con extensión y MIME correctos', () => {
    const callback = jest.fn();
    filtroArchivoLogo({}, { originalname: 'logo.jpg', mimetype: 'image/jpeg' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('acepta un SVG con extensión y MIME correctos', () => {
    const callback = jest.fn();
    filtroArchivoLogo({}, { originalname: 'logo.svg', mimetype: 'image/svg+xml' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rechaza un .pdf', () => {
    const callback = jest.fn();
    filtroArchivoLogo({}, { originalname: 'logo.pdf', mimetype: 'application/pdf' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CONFIGURACION_ERROR_CODES.LOGO_FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });

  it('rechaza doble extensión (logo.png.svg) aunque la última extensión esté en la allowlist', () => {
    const callback = jest.fn();
    filtroArchivoLogo({}, { originalname: 'logo.png.svg', mimetype: 'image/svg+xml' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CONFIGURACION_ERROR_CODES.LOGO_FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });

  it('rechaza MIME discrepante del que corresponde a la extensión (logo.png con image/svg+xml)', () => {
    const callback = jest.fn();
    filtroArchivoLogo({}, { originalname: 'logo.png', mimetype: 'image/svg+xml' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CONFIGURACION_ERROR_CODES.LOGO_FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });
});

describe('LogoTamanioExcedidoFilter (3.2: >2 MB responde 400, no 413)', () => {
  it('convierte PayloadTooLargeException en una respuesta 400 con LOGO_TAMANIO_EXCEDIDO', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    };

    new LogoTamanioExcedidoFilter().catch(new PayloadTooLargeException(), host as never);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ codigo: CONFIGURACION_ERROR_CODES.LOGO_TAMANIO_EXCEDIDO });
  });
});

describe('ConfiguracionController.subirLogo()/obtenerLogo() (3.5: orquestación del handler)', () => {
  function construirControlador(overrides: {
    actualizarLogo?: jest.Mock;
    obtenerLogo?: jest.Mock;
  } = {}) {
    const configuracionService = {
      obtener: jest.fn(),
      actualizar: jest.fn(),
      actualizarLogo: overrides.actualizarLogo ?? jest.fn().mockResolvedValue({
        logo_mime: 'image/png',
        logo_actualizado_en: '2026-08-09T00:00:00.000Z',
      }),
      obtenerLogo: overrides.obtenerLogo ?? jest.fn().mockResolvedValue(null),
    };
    const usersService = { listar: jest.fn() };
    const controller = new ConfiguracionController(
      configuracionService as unknown as ConfiguracionService,
      usersService as unknown as UsersService,
    );
    return { controller, configuracionService };
  }

  it('subirLogo() delega en ConfiguracionService.actualizarLogo con buffer/mimetype y el actorId de la sesión', async () => {
    const { controller, configuracionService } = construirControlador();
    const archivo = { originalname: 'logo.png', mimetype: 'image/png', buffer: Buffer.from('contenido') };

    await controller.subirLogo(archivo, { usuario: { userId: 'actor-1' } } as never);

    expect(configuracionService.actualizarLogo).toHaveBeenCalledWith(
      { buffer: archivo.buffer, mimetype: archivo.mimetype },
      'actor-1',
    );
  });

  it('subirLogo() sin archivo responde 400 LOGO_REQUERIDO sin invocar el servicio', async () => {
    const { controller, configuracionService } = construirControlador();

    await expect(
      controller.subirLogo(undefined, { usuario: { userId: 'actor-1' } } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(configuracionService.actualizarLogo).not.toHaveBeenCalled();
  });

  it('obtenerLogo() sin logo persistido responde 404 LOGO_NO_ENCONTRADO', async () => {
    const { controller } = construirControlador({ obtenerLogo: jest.fn().mockResolvedValue(null) });
    const res = { set: jest.fn() };

    await expect(controller.obtenerLogo(res as never)).rejects.toMatchObject({
      response: { codigo: CONFIGURACION_ERROR_CODES.LOGO_NO_ENCONTRADO },
    });
  });

  it('obtenerLogo() con logo persistido responde con nosniff + CSP restrictiva y el Content-Type exacto', async () => {
    const buffer = Buffer.from('<svg></svg>');
    const { controller } = construirControlador({
      obtenerLogo: jest.fn().mockResolvedValue({ buffer, mime: 'image/svg+xml' }),
    });
    const res = { set: jest.fn() };

    const resultado = await controller.obtenerLogo(res as never);

    expect(res.set).toHaveBeenCalledWith({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
    expect(resultado).toBeDefined();
  });
});
