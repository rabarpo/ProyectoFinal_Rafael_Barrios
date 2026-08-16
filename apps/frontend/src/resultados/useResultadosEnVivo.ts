import { useQuery } from '@tanstack/react-query';
import { resultados } from './resultados-api';
import type { ResultadosRespuestaDto } from './resultados-api';

/**
 * resultados-en-vivo (#16, PR2; design.md D10, tasks.md 11.2-11.4). 15 s: casi el doble del TTL
 * de caché del servidor (8 s, D7), así que prácticamente todo sondeo cruza al menos un
 * vencimiento y puede traer dato nuevo. Exportado para que una vista de proyección futura pueda
 * sobrescribirlo (ADR-0005: "configurable por vista") sin tocar el hook.
 */
export const INTERVALO_SONDEO_MS = 15_000;

async function obtenerResultados(procesoId: string): Promise<ResultadosRespuestaDto> {
  const { data, response } = await resultados(procesoId);
  if (!response.ok || !data) {
    throw new Error(`GET /procesos/${procesoId}/resultados respondió ${response.status}`);
  }
  return data;
}

/**
 * Hook de sondeo (design.md D9/D10): `retry: 0` viene del `QueryClient` de `query-client.ts`
 * (D9) — este hook no lo sobrescribe, así que un `403`/`401` aflora en `isError` al primer
 * fallo, sin reintento. `refetchInterval` fijo en `INTERVALO_SONDEO_MS`; el `QueryClient` ya
 * trae `refetchOnWindowFocus: false`, y `refetchIntervalInBackground` queda en su default
 * (`false`): una pestaña de fondo no sondea.
 */
export function useResultadosEnVivo(procesoId: string) {
  return useQuery({
    queryKey: ['resultados', procesoId],
    queryFn: () => obtenerResultados(procesoId),
    refetchInterval: INTERVALO_SONDEO_MS,
  });
}
