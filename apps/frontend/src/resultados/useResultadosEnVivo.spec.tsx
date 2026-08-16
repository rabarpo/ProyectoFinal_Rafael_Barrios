import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useResultadosEnVivo, INTERVALO_SONDEO_MS } from './useResultadosEnVivo';

const { resultadosMock } = vi.hoisted(() => ({ resultadosMock: vi.fn() }));

vi.mock('./resultados-api', () => ({
  resultados: resultadosMock,
}));

const RESPUESTA_OK = {
  data: {
    estado_visibilidad: 'visible',
    resultados_ocultos_por_configuracion: false,
    votos_emitidos: 10,
    padron_total: 20,
    hora_servidor: '2026-08-15T00:00:00.000Z',
  },
  response: { status: 200, ok: true },
};

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// [design.md D10; tasks.md 11.2-11.3] `useResultadosEnVivo` sondea cada 15 s exactos
// (`INTERVALO_SONDEO_MS`, exportado del módulo) y NO reintenta: un `403` aflora al primer
// fallo, sin reintento, porque `retry: 0` viene del `QueryClient` de test (mismo default de
// `query-client.ts`, D9) y el hook no lo sobrescribe.
describe('useResultadosEnVivo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resultadosMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[11.2] sondea de nuevo a los 15 s exactos y ninguna petición antes', async () => {
    resultadosMock.mockResolvedValue(RESPUESTA_OK);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useResultadosEnVivo('p1'), {
      wrapper: wrapper(queryClient),
    });

    // Flush de microtasks: la primera petición resuelve en el próximo tick, no en un timer.
    await vi.advanceTimersByTimeAsync(0);
    expect(result.current.isSuccess).toBe(true);
    expect(resultadosMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVALO_SONDEO_MS - 1);
    expect(resultadosMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(resultadosMock).toHaveBeenCalledTimes(2);
  });

  it('[11.3] un 403 aflora al primer fallo, sin reintento', async () => {
    resultadosMock.mockResolvedValue({ data: undefined, response: { status: 403, ok: false } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => useResultadosEnVivo('p1'), {
      wrapper: wrapper(queryClient),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(result.current.isError).toBe(true);
    expect(resultadosMock).toHaveBeenCalledTimes(1);
  });
});
