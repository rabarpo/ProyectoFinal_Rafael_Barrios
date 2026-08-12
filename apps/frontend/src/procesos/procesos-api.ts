import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type CrearProcesoDto = components['schemas']['CrearProcesoDto'];
export type ActualizarProcesoDto = components['schemas']['ActualizarProcesoDto'];
export type ProcesoRespuestaDto = components['schemas']['ProcesoRespuestaDto'];
export type ProcesoDetalleRespuestaDto = components['schemas']['ProcesoDetalleRespuestaDto'];
export type SegmentacionDto = components['schemas']['SegmentacionDto'];
export type PadronRespuestaDto = components['schemas']['PadronRespuestaDto'];

/**
 * Wrappers tipados sobre `createSeeiClient('/api')` (design.md D7), en el
 * mismo estilo que `auth/auth-api.ts`: se tipan contra `packages/contracts`
 * regenerado en PR7 (design.md D7, "Dependencia de orden") — este módulo no
 * puede mergear antes de esa regeneración.
 *
 * `crear`/`padron` los consume `ProcesoWizardPage` recién en PR9 (el submit
 * del asistente no es parte de PR8); `listar`/`detalle`/`editar`/`eliminar`
 * quedan disponibles para el resto de la superficie de `/procesos`.
 */
function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

export async function crear(dto: CrearProcesoDto) {
  return client().POST('/procesos', { body: dto });
}

// `@ApiQuery`/`@ApiParam` agregados en este PR a `procesos.controller.ts`
// (deviation, ver apply-progress): el contrato regenerado en PR7 no los
// llevaba (mismo gap que D9 encontró y corrigió para /auth en PR1), así que
// `query`/`path` llegaban tipados `never` y ningún wrapper de `/procesos/:id`
// ni el filtro de `listar` compilaban contra el cliente tipado.
export async function listar(filtros?: {
  estado?: ProcesoRespuestaDto['estado'];
  tipo?: CrearProcesoDto['tipo'];
}) {
  return client().GET('/procesos', { params: { query: filtros } });
}

export async function detalle(id: string) {
  return client().GET('/procesos/{id}', { params: { path: { id } } });
}

export async function editar(id: string, dto: ActualizarProcesoDto) {
  return client().PATCH('/procesos/{id}', { params: { path: { id } }, body: dto });
}

export async function eliminar(id: string) {
  return client().DELETE('/procesos/{id}', { params: { path: { id } } });
}

export async function padron(dto: SegmentacionDto, signal?: AbortSignal) {
  return client().POST('/procesos/padron', { body: dto, signal });
}
