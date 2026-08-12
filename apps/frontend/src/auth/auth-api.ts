import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type SesionUsuario = components['schemas']['SesionUsuarioDto'];

/**
 * Las tres causas que el resto de `auth/` conoce (design.md D8, "Manejo de
 * errores"). El backend devuelve un 401 uniforme para credenciales
 * incorrectas, cuenta bloqueada, cuenta inactiva y usuario inexistente
 * (`auth.service.ts`) — el cliente NUNCA intenta distinguirlas; hacerlo
 * reintroduciría el oráculo de enumeración que el backend cierra a
 * propósito.
 */
export type CausaError = 'credenciales' | 'vinculacion' | 'red';

export interface ResultadoLogin {
  ok: boolean;
  error?: CausaError;
}

// Mismo default y misma razón que packages/contracts/src/client.ts: Caddy
// comparte origen en producción, y el proxy de vite.config.ts (D10) hace lo
// mismo en desarrollo. Se resuelve por llamada (no al cargar el módulo) para
// que los tests puedan fijar una base absoluta vía `VITE_API_BASE_URL` —
// `fetch`/`Request` en el entorno de test no tiene un `origin` implícito
// contra el cual resolver una URL relativa como `/api` (a diferencia del
// navegador real).
function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

/**
 * Traduce un `Response` HTTP crudo a una `CausaError`, sin distinguir más de
 * lo que el backend ya distingue (D8). `401` es 'credenciales' salvo cuando
 * el llamador indica que ese status también puede significar 'vinculacion'
 * (única ruta que la usa: /auth/google, con 409).
 */
function causaDeRespuesta(status: number, incluyeVinculacion: boolean): CausaError {
  if (status === 401) return 'credenciales';
  if (incluyeVinculacion && status === 409) return 'vinculacion';
  return 'red';
}

export async function login(codigo: string, password: string): Promise<ResultadoLogin> {
  try {
    const { response } = await client().POST('/auth/login', {
      body: { codigo, password },
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: causaDeRespuesta(response.status, false) };
  } catch {
    return { ok: false, error: 'red' };
  }
}

/**
 * Wrapper de `/auth/google` (D8/D10): el disparador de UI (`BotonGoogle`,
 * `useGoogleIdentity`) llega en PR3, pero el mapeo de errores vive acá desde
 * PR2 junto con el resto de las 4 rutas de `/auth`, como fija el listado de
 * componentes de D8.
 */
export async function google(idToken: string, password?: string): Promise<ResultadoLogin> {
  try {
    const { response } = await client().POST('/auth/google', {
      body: { idToken, password },
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: causaDeRespuesta(response.status, true) };
  } catch {
    return { ok: false, error: 'red' };
  }
}

/**
 * `204` idempotente (auth.controller.ts). El llamador (`AuthProvider`) pasa
 * a 'anonimo' incluso si esta promesa rechaza — dejar al usuario "adentro"
 * porque la red se cayó es el peor de los dos errores (D8).
 */
export async function logout(): Promise<void> {
  await client().POST('/auth/logout', {});
}

/**
 * Única fuente de verdad de la sesión (D8): la cookie es `httpOnly` y el
 * cliente no puede leerla. `null` cubre tanto el 401 explícito como
 * cualquier falla de red — ambos deben resolver en 'anonimo' (fail-closed).
 */
export async function whoami(signal?: AbortSignal): Promise<SesionUsuario | null> {
  try {
    const { data, response } = await client().GET('/auth/whoami', { signal });
    if (response.ok && data) return data;
    return null;
  } catch {
    return null;
  }
}
