import { useQuery } from '@tanstack/react-query';

/**
 * dashboard-panel-jornada (Backlog #20, PR2; design.md D9, "Contratos/interfaces", tasks.md
 * 8.2-8.3). Hook de sondeo GENÉRICO local a este módulo: NO refactoriza `useResultadosEnVivo`
 * (#16) — una migración posterior de #16 hacia este hook es un change aparte (D9). `retry: 0`
 * viene del `QueryClient` global (D9); `refetchIntervalInBackground` queda en su default
 * (`false`).
 */
export const INTERVALO_PANEL_MS = 15_000; // dashboard: ~2x el TTL de 8 s del resumen
export const INTERVALO_PROYECCION_MS = 30_000; // proyección: alineado al TTL de avance-aulas

export function usePanelSondeo<T>(
  queryKey: readonly unknown[],
  fetcher: (signal?: AbortSignal) => Promise<T>,
  intervaloMs: number = INTERVALO_PANEL_MS,
  enabled = true,
) {
  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetcher(signal),
    refetchInterval: intervaloMs,
    enabled,
  });
}
