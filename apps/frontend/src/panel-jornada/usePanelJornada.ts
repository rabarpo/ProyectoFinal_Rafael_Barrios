import { institucion, resumenJornada, votosPorHora, avanceAulas, proyeccion } from './panel-jornada-api';
import type {
  InstitucionDto,
  ResumenJornadaDto,
  VotosPorHoraDto,
  AvanceAulasDto,
  ProyeccionDto,
} from './panel-jornada-api';
import { usePanelSondeo, INTERVALO_PANEL_MS, INTERVALO_PROYECCION_MS } from './usePanelSondeo';

/**
 * dashboard-panel-jornada (Backlog #20, PR2; design.md "Cambios de archivos", tasks.md 8.4).
 * Un hook por agregación, todos sobre `usePanelSondeo`. Las 4 vistas del dashboard sondean a
 * `INTERVALO_PANEL_MS` (15 s); `useProyeccion` sondea a `INTERVALO_PROYECCION_MS` (30 s),
 * alineado al TTL de avance-aulas (D9/D10).
 */

async function obtenerInstitucion(): Promise<InstitucionDto> {
  const { data, response } = await institucion();
  if (!response.ok || !data) {
    throw new Error(`GET /panel-jornada/institucion respondió ${response.status}`);
  }
  return data;
}

async function obtenerResumenJornada(procesoId: string): Promise<ResumenJornadaDto> {
  const { data, response } = await resumenJornada(procesoId);
  if (!response.ok || !data) {
    throw new Error(`GET /panel-jornada/procesos/${procesoId}/resumen respondió ${response.status}`);
  }
  return data;
}

async function obtenerVotosPorHora(procesoId: string): Promise<VotosPorHoraDto> {
  const { data, response } = await votosPorHora(procesoId);
  if (!response.ok || !data) {
    throw new Error(`GET /panel-jornada/procesos/${procesoId}/votos-por-hora respondió ${response.status}`);
  }
  return data;
}

async function obtenerAvanceAulas(procesoId: string): Promise<AvanceAulasDto> {
  const { data, response } = await avanceAulas(procesoId);
  if (!response.ok || !data) {
    throw new Error(`GET /panel-jornada/procesos/${procesoId}/avance-aulas respondió ${response.status}`);
  }
  return data;
}

async function obtenerProyeccion(procesoId: string): Promise<ProyeccionDto> {
  const { data, response } = await proyeccion(procesoId);
  if (!response.ok || !data) {
    throw new Error(`GET /panel-jornada/procesos/${procesoId}/proyeccion respondió ${response.status}`);
  }
  return data;
}

export function useInstitucion() {
  return usePanelSondeo(['panel-jornada', 'institucion'], () => obtenerInstitucion(), INTERVALO_PANEL_MS);
}

export function useResumenJornada(procesoId: string) {
  return usePanelSondeo(
    ['panel-jornada', 'resumen', procesoId],
    () => obtenerResumenJornada(procesoId),
    INTERVALO_PANEL_MS,
    procesoId !== '',
  );
}

export function useVotosPorHora(procesoId: string) {
  return usePanelSondeo(
    ['panel-jornada', 'votos-por-hora', procesoId],
    () => obtenerVotosPorHora(procesoId),
    INTERVALO_PANEL_MS,
    procesoId !== '',
  );
}

export function useAvanceAulas(procesoId: string) {
  return usePanelSondeo(
    ['panel-jornada', 'avance-aulas', procesoId],
    () => obtenerAvanceAulas(procesoId),
    INTERVALO_PANEL_MS,
    procesoId !== '',
  );
}

export function useProyeccion(procesoId: string) {
  return usePanelSondeo(
    ['panel-jornada', 'proyeccion', procesoId],
    () => obtenerProyeccion(procesoId),
    INTERVALO_PROYECCION_MS,
  );
}
