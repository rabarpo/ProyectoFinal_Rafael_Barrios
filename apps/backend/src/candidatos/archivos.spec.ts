import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { CANDIDATOS_ERROR_CODES } from './candidatos.errors';
import { ArchivoTamanioExcedidoFilter, filtroFoto, filtroPlanTrabajo } from './archivos';

/**
 * candidatos-listas-opciones-consulta, PR4 (design.md D8, threat matrix "Clasificación de archivo
 * activo", tareas 10.3-10.6). `filtroFoto`/`ArchivoTamanioExcedidoFilter` probados sin instanciar
 * el Nest testing module completo — mismo criterio que `configuracion.controller.spec.ts`
 * (`filtroArchivoLogo`).
 */
describe('filtroFoto() (10.3-10.6: allowlist doble extensión + MIME, PNG/JPG)', () => {
  it('acepta un PNG con extensión y MIME correctos', () => {
    const callback = jest.fn();
    filtroFoto({}, { originalname: 'foto.png', mimetype: 'image/png' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('acepta un JPG con extensión y MIME correctos', () => {
    const callback = jest.fn();
    filtroFoto({}, { originalname: 'foto.jpg', mimetype: 'image/jpeg' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rechaza un .pdf', () => {
    const callback = jest.fn();
    filtroFoto({}, { originalname: 'foto.pdf', mimetype: 'application/pdf' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });

  // 10.3: foto.png.svg -> rechazado por filtroFoto (doble extensión).
  it('rechaza doble extensión (foto.png.svg) aunque la última extensión no esté en la allowlist', () => {
    const callback = jest.fn();
    filtroFoto({}, { originalname: 'foto.png.svg', mimetype: 'image/svg+xml' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });

  it('rechaza doble extensión (foto.jpg.png) con extensión final también en la allowlist', () => {
    const callback = jest.fn();
    filtroFoto({}, { originalname: 'foto.jpg.png', mimetype: 'image/png' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });

  // 10.4: MIME image/png declarado con bytes SVG/HTML -> rechazado (contenido discrepante,
  // detectado vía discrepancia extensión<->MIME declarado, mismo criterio que filtroArchivoLogo).
  it('rechaza MIME discrepante del que corresponde a la extensión (foto.png con image/svg+xml)', () => {
    const callback = jest.fn();
    filtroFoto({}, { originalname: 'foto.png', mimetype: 'image/svg+xml' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });
});

describe('filtroPlanTrabajo() (10.2: regresión de comportamiento tras la promoción a archivos.ts)', () => {
  it('sigue aceptando un PDF con extensión y MIME correctos', () => {
    const callback = jest.fn();
    filtroPlanTrabajo({}, { originalname: 'plan.pdf', mimetype: 'application/pdf' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('sigue rechazando la doble extensión (plan.pdf.exe)', () => {
    const callback = jest.fn();
    filtroPlanTrabajo({}, { originalname: 'plan.pdf.exe', mimetype: 'application/pdf' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO,
    });
    expect(aceptar).toBe(false);
  });
});

describe('ArchivoTamanioExcedidoFilter (10.1: >2 MB / >5 MB responde 400, no 413)', () => {
  it('convierte PayloadTooLargeException en una respuesta 400 con ARCHIVO_DEMASIADO_GRANDE', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    };

    new ArchivoTamanioExcedidoFilter().catch(new PayloadTooLargeException(), host as never);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ codigo: CANDIDATOS_ERROR_CODES.ARCHIVO_DEMASIADO_GRANDE });
  });
});
