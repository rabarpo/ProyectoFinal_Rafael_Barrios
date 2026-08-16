import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type ResultadosRespuestaDto = components['schemas']['ResultadosRespuestaDto'];

/**
 * resultados-en-vivo (#16, PR2; design.md D11, tasks.md 11.1). Wrapper tipado sobre
 * `createSeeiClient('/api')`, mismo estilo que `procesos/procesos-api.ts` y `votos/votos-api.ts`
 * — se tipa contra `packages/contracts` regenerado en Phase 8 (`GET /procesos/{id}/resultados`).
 */
function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

export async function resultados(procesoId: string) {
  return client().GET('/procesos/{id}/resultados', { params: { path: { id: procesoId } } });
}
