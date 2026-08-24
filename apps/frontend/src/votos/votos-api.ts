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
function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
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
