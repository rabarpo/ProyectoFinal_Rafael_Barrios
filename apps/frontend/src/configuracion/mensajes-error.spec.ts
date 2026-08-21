import { describe, expect, it } from 'vitest';
import { mensajeDeError } from './mensajes-error';

// [tasks.md 7.1-7.5] `Record<CodigoConfiguracion, string>` TOTAL sobre los 6 códigos de
// `apps/backend/src/configuracion/configuracion.errors.ts` (design.md D7) — verificado literal
// contra el archivo fuente, no contra design.md, mismo criterio de #27 Phase 4.1.
describe('configuracion/mensajes-error', () => {
  const codigos = [
    'CAMPO_INVALIDO',
    'LOGO_FORMATO_NO_PERMITIDO',
    'LOGO_TAMANIO_EXCEDIDO',
    'LOGO_VACIO',
    'LOGO_REQUERIDO',
    'LOGO_NO_ENCONTRADO',
  ] as const;

  it.each(codigos)('mensajeDeError({ codigo: %s }) devuelve un texto no genérico', (codigo) => {
    const mensaje = mensajeDeError({ codigo });
    expect(mensaje).toBeTruthy();
    expect(mensaje).not.toBe('Ocurrió un error inesperado. Intentalo de nuevo.');
  });

  it('CAMPO_INVALIDO interpola el campo color_primario', () => {
    const mensaje = mensajeDeError({ codigo: 'CAMPO_INVALIDO', campo: 'color_primario' });
    expect(mensaje).toContain('color_primario');
  });

  it('CAMPO_INVALIDO interpola el campo zona_horaria', () => {
    const mensaje = mensajeDeError({ codigo: 'CAMPO_INVALIDO', campo: 'zona_horaria' });
    expect(mensaje).toContain('zona_horaria');
  });

  it('CAMPO_INVALIDO interpola el campo dominios_google', () => {
    const mensaje = mensajeDeError({ codigo: 'CAMPO_INVALIDO', campo: 'dominios_google' });
    expect(mensaje).toContain('dominios_google');
  });

  it('CAMPO_INVALIDO sin campo devuelve un texto no vacío', () => {
    const mensaje = mensajeDeError({ codigo: 'CAMPO_INVALIDO' });
    expect(mensaje).toBeTruthy();
  });

  it('sin codigo, usa el fallback por status 403', () => {
    const mensaje = mensajeDeError({ status: 403 });
    expect(mensaje).toBeTruthy();
    expect(mensaje).not.toBe('Ocurrió un error inesperado. Intentalo de nuevo.');
  });

  it('sin codigo, usa el fallback por status 404', () => {
    const mensaje = mensajeDeError({ status: 404 });
    expect(mensaje).toBeTruthy();
    expect(mensaje).not.toBe('Ocurrió un error inesperado. Intentalo de nuevo.');
  });

  it('sin codigo ni status conocido, devuelve el fallback generico no vacio', () => {
    const mensaje = mensajeDeError({});
    expect(mensaje).toBeTruthy();
  });
});
