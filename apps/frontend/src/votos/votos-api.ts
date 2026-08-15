import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type EmitirVotoDto = components['schemas']['EmitirVotoDto'];
export type ComprobanteDto = components['schemas']['ComprobanteDto'];
export type PapeletaDto = components['schemas']['PapeletaDto'];
export type PapeletaOpcionDto = components['schemas']['PapeletaOpcionDto'];

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
