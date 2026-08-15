import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type NivelRespuestaDto = components['schemas']['NivelRespuestaDto'];
export type GradoRespuestaDto = components['schemas']['GradoRespuestaDto'];
export type AulaRespuestaDto = components['schemas']['AulaRespuestaDto'];
export type AnioEscolarRespuestaDto = components['schemas']['AnioEscolarRespuestaDto'];

/**
 * Wrappers tipados sobre `createSeeiClient('/api')`, mismo estilo que
 * `procesos/procesos-api.ts` y `auth/auth-api.ts`. Consumidos por
 * `procesos/useOpcionesSegmentacion.ts` para poblar los selectores de
 * nivel/grados/aulas del paso 2 del asistente de creación de procesos.
 */
function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

export async function listarNiveles(signal?: AbortSignal) {
  return client().GET('/niveles', { signal });
}

export async function listarGrados(filtros?: { nivel_id?: string }, signal?: AbortSignal) {
  return client().GET('/grados', { params: { query: filtros }, signal });
}

export async function listarAulas(
  filtros?: { grado_id?: string; anio_escolar_id?: string },
  signal?: AbortSignal,
) {
  return client().GET('/aulas', { params: { query: filtros }, signal });
}

/**
 * `activo: 'true'` filtra al único AnioEscolar activo (invariante del
 * backend: a lo sumo uno activo a la vez). Usado para acotar `/aulas` al
 * año escolar vigente cuando no hay un `grado_id` elegido.
 */
export async function listarAniosEscolares(filtros?: { activo?: string }, signal?: AbortSignal) {
  return client().GET('/anios-escolares', { params: { query: filtros }, signal });
}
