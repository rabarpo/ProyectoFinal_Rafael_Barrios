import { describe, expect, it } from 'vitest';
import { mensajeDeError } from './mensajes-error';
import type { CodigoUsuarios } from './mensajes-error';

const CODIGOS: CodigoUsuarios[] = [
  'CAMPO_DUPLICADO',
  'ESTADO_DESTINO_NO_PERMITIDO',
  'TRANSICION_DESDE_BLOQUEADO',
  'CAMPO_INVALIDO',
  'USUARIO_NO_ES_ESTUDIANTE',
];

// [design.md D7; tasks.md 4.1-4.5; spec: administracion-usuarios-apoderados,
// bloqueo-desbloqueo-cuentas] `Record` total sobre los 5 códigos de
// `apps/backend/src/users/users.errors.ts` (`USERS_ERROR_CODES`) — agregar un código nuevo ahí
// rompe la compilación de este mapa en vez de degradar en silencio a un texto genérico (misma
// disciplina que `MENU_POR_ROL`, D3 de #25, y `academico/mensajes-error.ts`, D7 de #26). A
// diferencia de académica, este catálogo interpola `campo` (no `relacion`) y añade un fallback
// diferenciado por status (403/404) porque los `NotFoundException` de `users.service.ts` /
// `apoderados.service.ts` son texto plano sin `codigo`.
describe('mensajeDeError', () => {
  it.each(CODIGOS)('[4.1] devuelve un mensaje legible y no genérico para %s', (codigo) => {
    const mensaje = mensajeDeError({ codigo });
    expect(mensaje.trim().length).toBeGreaterThan(0);
    expect(mensaje).not.toBe(codigo);
  });

  it('[4.2] CAMPO_DUPLICADO interpola el campo cuando el backend lo manda', () => {
    const mensaje = mensajeDeError({ codigo: 'CAMPO_DUPLICADO', campo: 'dni' });
    expect(mensaje).toContain('dni');
  });

  it('[4.2] CAMPO_INVALIDO interpola el campo cuando el backend lo manda', () => {
    const mensaje = mensajeDeError({ codigo: 'CAMPO_INVALIDO', campo: 'correo' });
    expect(mensaje).toContain('correo');
  });

  it('[4.3] CAMPO_DUPLICADO sin campo sigue devolviendo un mensaje no vacío', () => {
    const mensaje = mensajeDeError({ codigo: 'CAMPO_DUPLICADO' });
    expect(mensaje.trim().length).toBeGreaterThan(0);
  });

  it('[4.4] sin código, status 403 devuelve un mensaje sobre permisos de rol', () => {
    const mensaje = mensajeDeError({ status: 403 });
    expect(mensaje).toMatch(/rol/i);
  });

  it('[4.4] sin código, status 404 devuelve un mensaje sobre registro inexistente', () => {
    const mensaje = mensajeDeError({ status: 404 });
    expect(mensaje).toMatch(/ya no existe|no existe|no encontrado/i);
  });

  it('[4.4] sin código ni status, devuelve un fallback genérico, nunca undefined', () => {
    const mensaje = mensajeDeError({});
    expect(mensaje).toBeDefined();
    expect(mensaje.trim().length).toBeGreaterThan(0);
  });
});
