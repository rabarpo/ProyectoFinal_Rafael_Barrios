import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePanelSondeo, INTERVALO_PANEL_MS } from './usePanelSondeo';

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// [design.md D9; tasks.md 8.2] `usePanelSondeo` es genérico (queryKey/fetcher/intervaloMs), NO
// refactoriza `useResultadosEnVivo` (#16). Mismo criterio de prueba: `vi.useFakeTimers()`, refetch
// exacto a `intervaloMs`, ninguno antes.
describe('usePanelSondeo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[8.2] refetch exacto a intervaloMs, ninguno antes', async () => {
    const fetcher = vi.fn().mockResolvedValue({ valor: 1 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => usePanelSondeo(['panel-test'], fetcher, 5_000), {
      wrapper: wrapper(queryClient),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(result.current.isSuccess).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('[8.2] usa INTERVALO_PANEL_MS como default cuando no se pasa intervaloMs', async () => {
    const fetcher = vi.fn().mockResolvedValue({ valor: 1 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });

    const { result } = renderHook(() => usePanelSondeo(['panel-default'], fetcher), {
      wrapper: wrapper(queryClient),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(result.current.isSuccess).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVALO_PANEL_MS - 1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
