import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type InstitucionDto = components['schemas']['InstitucionDto'];
export type ResumenJornadaDto = components['schemas']['ResumenJornadaDto'];
export type VotosPorHoraDto = components['schemas']['VotosPorHoraDto'];
export type AvanceAulasDto = components['schemas']['AvanceAulasDto'];
export type ProyeccionDto = components['schemas']['ProyeccionDto'];

/**
 * dashboard-panel-jornada (Backlog #20, PR2; design.md "Cambios de archivos", tasks.md 8.1).
 * Wrappers tipados sobre `createSeeiClient('/api')`, mismo estilo que `resultados-api.ts` —
 * se tipan contra `packages/contracts` regenerado en Phase 7 (5 rutas `/panel-jornada/*`).
 */
function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

export async function institucion() {
  return client().GET('/panel-jornada/institucion');
}

export async function resumenJornada(procesoId: string) {
  return client().GET('/panel-jornada/procesos/{id}/resumen', { params: { path: { id: procesoId } } });
}

export async function votosPorHora(procesoId: string) {
  return client().GET('/panel-jornada/procesos/{id}/votos-por-hora', { params: { path: { id: procesoId } } });
}

export async function avanceAulas(procesoId: string) {
  return client().GET('/panel-jornada/procesos/{id}/avance-aulas', { params: { path: { id: procesoId } } });
}

export async function proyeccion(procesoId: string) {
  return client().GET('/panel-jornada/procesos/{id}/proyeccion', { params: { path: { id: procesoId } } });
}
