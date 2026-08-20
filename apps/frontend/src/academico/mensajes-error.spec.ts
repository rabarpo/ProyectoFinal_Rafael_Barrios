import { describe, expect, it } from 'vitest';
import { mensajeDeError } from './mensajes-error';
import type { CodigoAcademico } from './mensajes-error';

const CODIGOS: CodigoAcademico[] = [
  'RESTRICCION_UNICA',
  'REFERENCIA_INEXISTENTE',
  'ENTIDAD_CON_DEPENDIENTES',
  'ACTIVACION_CONCURRENTE',
  'CAMPO_INVALIDO',
  'COHERENCIA_JERARQUICA',
  'USUARIO_NO_ES_ESTUDIANTE',
];

// [design.md D7; tasks.md 4.1; spec: academic-tree-management/school-year-management] `Record`
// total sobre los 7 códigos de `academico.errors.ts` (backend) — agregar un código nuevo rompe
// la compilación en vez de degradar en silencio a un mensaje genérico (misma disciplina que
// `MENU_POR_ROL`, D3 de #25).
describe('mensajeDeError', () => {
  it.each(CODIGOS)('[4.1] devuelve un mensaje legible y no genérico para %s', (codigo) => {
    const mensaje = mensajeDeError({ codigo });
    expect(mensaje.trim().length).toBeGreaterThan(0);
    expect(mensaje).not.toBe(codigo);
  });

  it('[4.1] ENTIDAD_CON_DEPENDIENTES interpola la relación cuando el backend la manda', () => {
    const mensaje = mensajeDeError({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Grado' });
    expect(mensaje).toContain('Grado');
  });

  it('[4.1] sin código, devuelve un fallback genérico por status, nunca undefined', () => {
    const mensaje = mensajeDeError({ status: 500 });
    expect(mensaje).toBeDefined();
    expect(mensaje.trim().length).toBeGreaterThan(0);
  });
});
