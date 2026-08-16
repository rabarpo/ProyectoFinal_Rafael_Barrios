import { QueryClient } from '@tanstack/react-query';

/**
 * resultados-en-vivo (#16, PR2; design.md D9, tasks.md 9.3). Primer consumidor de React Query
 * del repo. Defaults deliberados:
 * - `retry: 0` — ninguna capa de fetch del repo reintenta hoy (p. ej. `usePadronEnVivo.ts` marca
 *   `error: true` al primer fallo), una vista que sondea cada 15 s ya es su propio reintento, y
 *   reintentar un `403` sería ruido puro.
 * - `refetchOnWindowFocus: false` — el sondeo periódico (`refetchInterval`, D10) ya cubre la
 *   frescura del dato; no hace falta un refetch adicional al recuperar el foco.
 * - `staleTime: 0` — cada respuesta de `useResultadosEnVivo` es efímera por diseño (caché corta
 *   de 8 s en el servidor, D7); no tiene sentido que React Query la considere "fresca" más allá
 *   de la propia petición.
 */
export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
        refetchOnWindowFocus: false,
        staleTime: 0,
      },
    },
  });
}
