import { BadRequestException, NotFoundException, StreamableFile } from '@nestjs/common';
import type { ImportacionService } from './importacion.service';
import { ArchivoMulter, ImportacionController, filtroArchivoPadron } from './importacion.controller';

/**
 * importacion-excel, PR2 (design.md D7, tarea 2.6, spec "Subida de archivo de padrón con formato
 * de columnas fijo" / "Restricción de rol a administrador/director"). Se testea vía instanciación
 * directa del controller con `ImportacionService` mockeado (Nest Testing module aislado, sin
 * registrar `ImportacionModule` en `app.module.ts` todavía — eso es PR3). Los guards
 * (`AuthGuard`/`RolesGuard`) y `@Roles('administrador', 'director')` son metadata declarativa ya
 * cubierta por `roles.guard.spec.ts`; aquí se prueba la orquestación del handler y el `fileFilter`
 * del `FileInterceptor` (allowlist `.xlsx`/`.csv`, nunca `.xlsm`, D7).
 */

function construirArchivo(overrides: Partial<ArchivoMulter> = {}): ArchivoMulter {
  return {
    originalname: 'padron.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('contenido'),
    ...overrides,
  };
}

describe('filtroArchivoPadron() (D7: allowlist .xlsx/.csv, nunca .xlsm)', () => {
  it('acepta un archivo .xlsx', () => {
    const callback = jest.fn();
    filtroArchivoPadron({}, { originalname: 'padron.xlsx' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('acepta un archivo .csv', () => {
    const callback = jest.fn();
    filtroArchivoPadron({}, { originalname: 'padron.csv' }, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rechaza un archivo .xlsm (nunca se acepta, aunque sea Excel)', () => {
    const callback = jest.fn();
    filtroArchivoPadron({}, { originalname: 'padron.xlsm' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect(aceptar).toBe(false);
  });

  it('rechaza un archivo .pdf', () => {
    const callback = jest.fn();
    filtroArchivoPadron({}, { originalname: 'padron.pdf' }, callback);
    const [error, aceptar] = callback.mock.calls[0];
    expect(error).toBeInstanceOf(BadRequestException);
    expect(aceptar).toBe(false);
  });
});

describe('ImportacionController.importarPadron()', () => {
  function construirControlador(
    overrides: { importar?: jest.Mock; obtenerCsvErrores?: jest.Mock } = {},
  ) {
    const importacionService = {
      importar: overrides.importar ?? jest.fn().mockResolvedValue({
        importacion_id: 'imp-1',
        filas_totales: 0,
        filas_creadas: 0,
        filas_existentes: 0,
        filas_invalidas: 0,
        errores: [],
      }),
      obtenerCsvErrores: overrides.obtenerCsvErrores ?? jest.fn().mockResolvedValue(null),
    };
    const controller = new ImportacionController(importacionService as unknown as ImportacionService);
    return { controller, importacionService };
  }

  it('delega en ImportacionService.importar con el buffer/nombre/mimetype del archivo y el actorId de la sesión', async () => {
    const { controller, importacionService } = construirControlador();
    const archivo = construirArchivo();

    await controller.importarPadron(archivo, { usuario: { userId: 'actor-1' } } as never);

    expect(importacionService.importar).toHaveBeenCalledWith(
      { buffer: archivo.buffer, originalname: archivo.originalname, mimetype: archivo.mimetype },
      'actor-1',
    );
  });

  it('devuelve el ResultadoImportacionDto que produce el servicio', async () => {
    const resultado = {
      importacion_id: 'imp-2',
      filas_totales: 1,
      filas_creadas: 1,
      filas_existentes: 0,
      filas_invalidas: 0,
      errores: [],
    };
    const { controller } = construirControlador({ importar: jest.fn().mockResolvedValue(resultado) });

    const respuesta = await controller.importarPadron(construirArchivo(), { usuario: { userId: 'actor-1' } } as never);

    expect(respuesta).toEqual(resultado);
  });

  it('sin archivo (multipart sin campo `archivo`) responde 400 ARCHIVO_REQUERIDO sin invocar el servicio', async () => {
    const { controller, importacionService } = construirControlador();

    await expect(
      controller.importarPadron(undefined, { usuario: { userId: 'actor-1' } } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(importacionService.importar).not.toHaveBeenCalled();
  });
});

/**
 * importacion-excel, PR3 (design.md D4, "Data Flow", tarea 3.3, spec "Reporte de errores
 * descargable en CSV"). `@Roles('administrador', 'director')` a nivel de clase ya cubre esta ruta
 * (mismo guard que `importarPadron`); aquí se prueba la orquestación del handler.
 */
describe('ImportacionController.descargarErroresCsv()', () => {
  function construirControlador(overrides: { obtenerCsvErrores?: jest.Mock } = {}) {
    const importacionService = {
      importar: jest.fn(),
      obtenerCsvErrores: overrides.obtenerCsvErrores ?? jest.fn().mockResolvedValue(null),
    };
    const controller = new ImportacionController(importacionService as unknown as ImportacionService);
    return { controller, importacionService };
  }

  it('devuelve un StreamableFile con el contenido CSV cuando la importación existe en Redis', async () => {
    const csv = '﻿fila,campo,motivo,valor_recibido\r\n1,correo,formato,no-es-un-correo\r\n';
    const { controller, importacionService } = construirControlador({
      obtenerCsvErrores: jest.fn().mockResolvedValue(csv),
    });

    const resultado = await controller.descargarErroresCsv('imp-1');

    expect(importacionService.obtenerCsvErrores).toHaveBeenCalledWith('imp-1');
    expect(resultado).toBeInstanceOf(StreamableFile);
  });

  it('responde 404 cuando la importación no existe o el reporte expiró en Redis', async () => {
    const { controller } = construirControlador({ obtenerCsvErrores: jest.fn().mockResolvedValue(null) });

    await expect(controller.descargarErroresCsv('imp-inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });
});
