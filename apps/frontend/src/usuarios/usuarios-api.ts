import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

/**
 * Semilla mínima para D11 (tasks.md 10.1-10.2): `PanelMatriculas` (PR7) necesita resolver
 * `usuario_id → nombres` para mostrar filas legibles en vez de UUID crudos. SOLO `listarUsuarios`
 * — agregar escrituras aquí es scope explícito de #27, no de este change (proposal "Out of
 * Scope").
 */
export type UsuarioRespuestaDto = components['schemas']['UsuarioRespuestaDto'];

function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

export async function listarUsuarios(
  filtros?: { rol?: string; estado?: string },
  signal?: AbortSignal,
) {
  return client().GET('/usuarios', { params: { query: filtros } as never, signal });
}
