import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type EmitirVotoDto = components['schemas']['EmitirVotoDto'];
export type ComprobanteDto = components['schemas']['ComprobanteDto'];
export type PapeletaDto = components['schemas']['PapeletaDto'];
export type PapeletaOpcionDto = components['schemas']['PapeletaOpcionDto'];
export type MiDerechoVotoDto = components['schemas']['MiDerechoVotoDto'];

/**
 * vote-casting, PR5 (design.md D14, "Cambios de archivos"). Wrappers tipados sobre
 * `createSeeiClient('/api')`, mismo estilo que `procesos/procesos-api.ts` — se tipan contra
 * `packages/contracts` regenerado en PR3 (`GET /votos/papeleta/:id`, `POST /votos`).
 */
function baseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}

function client() {
  return createSeeiClient(baseUrl());
}

export async function papeleta(derechoVotoId: string) {
  return client().GET('/votos/papeleta/{derechoVotoId}', { params: { path: { derechoVotoId } } });
}

export async function emitir(dto: EmitirVotoDto) {
  return client().POST('/votos', { body: dto });
}

// outbox-correo-comprobante-autenticado, PR4 (design.md D12, tasks.md 13.3): requiere el
// contrato regenerado en PR3 (`GET /votos/comprobante/{votoId}`).
export async function comprobante(votoId: string) {
  return client().GET('/votos/comprobante/{votoId}', { params: { path: { votoId } } });
}

// descubrimiento-derechos-voto, PR2 (#30; design.md D5/D8, tasks.md 5.1): sin parámetros — el
// usuario sale exclusivamente de la sesión (`req.usuario`) en el backend.
export async function misDerechos() {
  return client().GET('/votos/mis-derechos', {});
}

/**
 * rediseno-boleta-votacion, PR3 (design.md D3/D7, tasks.md 12.1). `<img src>`/`window.open`, no
 * `fetch`+`Blob`: la cookie de sesión viaja sola en same-origin, mismo patrón de `urlFoto` de
 * #12/`candidatos-api.ts`. Autorización por pertenencia la resuelve `PapeletaArchivosService`
 * (403 idéntico para ajeno/inexistente, D3 de `design.md`) — este cliente solo arma la URL.
 */
export function urlFotoOpcion(derechoVotoId: string, id: string): string {
  return `${baseUrl()}/votos/papeleta/${derechoVotoId}/opciones/${id}/foto`;
}

/**
 * `window.open(url, '_blank', 'noopener')` desde `TarjetaLista` (design.md D7): el
 * `Content-Disposition: attachment` del backend gobierna la descarga/apertura, sin un ciclo de
 * vida de object URL en una pieza presentacional.
 */
export function urlPlanTrabajoOpcion(derechoVotoId: string, id: string): string {
  return `${baseUrl()}/votos/papeleta/${derechoVotoId}/opciones/${id}/plan-trabajo`;
}
