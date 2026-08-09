import { BadRequestException } from '@nestjs/common';
import {
  normalizarYValidarDominiosGoogle,
  validarColorHex,
  validarZonaHoraria,
} from './configuracion.errors';

/**
 * configuracion-general, PR2 (design.md "Interfaces / Contracts", tareas 2.1-2.3). Validadores
 * manuales (sin `class-validator`, patrón vigente) del color hex, zona horaria IANA y dominios
 * Google Workspace. RED antes de crear `configuracion.errors.ts` — mismo criterio que
 * `anios-escolares.service.spec.ts`.
 */
describe('validarColorHex (2.1)', () => {
  it.each(['#1A2B3C', '#abc'])('[2.1] %s se acepta (hex largo o corto)', (valor) => {
    expect(() => validarColorHex('color_primario', valor)).not.toThrow();
  });

  it.each(['azul', '#12345', '#1A2B3G'])(
    '[2.1] %s se rechaza con BadRequestException CAMPO_INVALIDO',
    (valor) => {
      expect(() => validarColorHex('color_primario', valor)).toThrow(BadRequestException);
      try {
        validarColorHex('color_primario', valor);
      } catch (error) {
        expect((error as BadRequestException).getResponse()).toMatchObject({
          codigo: 'CAMPO_INVALIDO',
          campo: 'color_primario',
        });
      }
    },
  );
});

describe('validarZonaHoraria (2.2)', () => {
  it('[2.2] America/Lima se acepta', () => {
    expect(() => validarZonaHoraria('America/Lima')).not.toThrow();
  });

  it('[2.2] No/Existe se rechaza con BadRequestException CAMPO_INVALIDO', () => {
    expect(() => validarZonaHoraria('No/Existe')).toThrow(BadRequestException);
    try {
      validarZonaHoraria('No/Existe');
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'CAMPO_INVALIDO',
        campo: 'zona_horaria',
      });
    }
  });
});

describe('normalizarYValidarDominiosGoogle (2.3)', () => {
  it('[2.3] normaliza con trim().toLowerCase() y deduplica', () => {
    expect(
      normalizarYValidarDominiosGoogle([' Colegio.edu.PE ', 'colegio.edu.pe', 'otro.edu.pe']),
    ).toEqual(['colegio.edu.pe', 'otro.edu.pe']);
  });

  it('[2.3] un elemento con formato inválido rechaza todo el arreglo', () => {
    expect(() =>
      normalizarYValidarDominiosGoogle(['colegio.edu.pe', 'no es un dominio']),
    ).toThrow(BadRequestException);
    try {
      normalizarYValidarDominiosGoogle(['colegio.edu.pe', 'no es un dominio']);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'CAMPO_INVALIDO',
        campo: 'dominios_google',
      });
    }
  });

  it('[2.3] arreglo vacío es válido (fail-closed explícito)', () => {
    expect(normalizarYValidarDominiosGoogle([])).toEqual([]);
  });
});
