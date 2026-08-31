import { describe, expect, it } from 'vitest';
import { mensajeDeError } from './mensajes-error';

// [tasks.md 2.3] `Record<CodigoImportacion, string>` TOTAL sobre los 5 códigos de
// `apps/backend/src/importacion/importacion.errors.ts` (`IMPORTACION_ERROR_CODES`) — verificado
// literal contra el archivo fuente, no contra design.md (design.md D7, mismo criterio de #28).
// `mensajeDeError({ codigo, status })` con fallback por `status` (403/404/genérico).
const GENERICO = 'Ocurrió un error inesperado. Intentalo de nuevo.';

describe('importacion/mensajes-error', () => {
  const codigos = [
    'CABECERA_INVALIDA',
    'LIMITE_FILAS_EXCEDIDO',
    'EXTENSION_NO_PERMITIDA',
    'ARCHIVO_REQUERIDO',
    'REPORTE_NO_ENCONTRADO',
  ] as const;

  it.each(codigos)('mensajeDeError({ codigo: %s }) devuelve un texto no genérico', (codigo) => {
    const mensaje = mensajeDeError({ codigo });
    expect(mensaje).toBeTruthy();
    expect(mensaje).not.toBe(GENERICO);
  });

  it('LIMITE_FILAS_EXCEDIDO menciona el tope de 2000 filas', () => {
    expect(mensajeDeError({ codigo: 'LIMITE_FILAS_EXCEDIDO' })).toContain('2000');
  });

  it('sin codigo, usa el fallback por status 403', () => {
    const mensaje = mensajeDeError({ status: 403 });
    expect(mensaje).toBeTruthy();
    expect(mensaje).not.toBe(GENERICO);
  });

  it('sin codigo, usa el fallback por status 404', () => {
    const mensaje = mensajeDeError({ status: 404 });
    expect(mensaje).toBeTruthy();
    expect(mensaje).not.toBe(GENERICO);
  });

  it('sin codigo ni status conocido, devuelve el fallback generico', () => {
    expect(mensajeDeError({})).toBe(GENERICO);
  });

  it('sin codigo con status desconocido (500), devuelve el fallback generico', () => {
    expect(mensajeDeError({ status: 500 })).toBe(GENERICO);
  });

  it('el codigo tiene prioridad sobre el status', () => {
    expect(mensajeDeError({ codigo: 'ARCHIVO_REQUERIDO', status: 403 })).toBe(
      mensajeDeError({ codigo: 'ARCHIVO_REQUERIDO' }),
    );
  });
});
