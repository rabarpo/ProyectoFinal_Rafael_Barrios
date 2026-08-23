import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProyeccionPage } from './ProyeccionPage';
import { INTERVALO_PROYECCION_MS, INTERVALO_PANEL_MS } from './usePanelSondeo';

const { proyeccionMock } = vi.hoisted(() => ({ proyeccionMock: vi.fn() }));

vi.mock('./panel-jornada-api', () => ({
  proyeccion: proyeccionMock,
}));

const RESPUESTA_PROYECCION = {
  data: {
    hora_servidor: '2026-08-23T12:00:00.000Z',
    padron_total: 100,
    votos_emitidos: 40,
    franjas: [{ hora_inicio: '2026-08-23T09:00:00.000Z', votos: 10 }],
    aulas: [{ aula_id: 'a1', etiqueta: 'Mañana 1ro A', padron: 30, votos: 10, porcentaje: 33.3, rezagada: false }],
  },
  response: { status: 200, ok: true },
};

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// [design.md D10; spec: "Modo proyección sin desglose por candidato"/"Proyección no expone
// controles"; tasks.md 14.1-14.2] Contenedor de kiosco: SIN controles interactivos (sin
// SelectorProcesoActivo, sin botones/filtros). Sondea a INTERVALO_PROYECCION_MS (30s), NO a
// INTERVALO_PANEL_MS (15s).
describe('ProyeccionPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    proyeccionMock.mockReset().mockResolvedValue(RESPUESTA_PROYECCION);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[14.1] no renderiza ningún control interactivo (sin <select>, sin <button>)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    render(<ProyeccionPage procesoId="p1" />, { wrapper: wrapper(queryClient) });

    await vi.advanceTimersByTimeAsync(0);

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('[14.2] usa INTERVALO_PROYECCION_MS (30s), no INTERVALO_PANEL_MS (15s)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    render(<ProyeccionPage procesoId="p1" />, { wrapper: wrapper(queryClient) });

    await vi.advanceTimersByTimeAsync(0);
    expect(proyeccionMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVALO_PANEL_MS);
    expect(proyeccionMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVALO_PROYECCION_MS - INTERVALO_PANEL_MS);
    expect(proyeccionMock).toHaveBeenCalledTimes(2);
  });
});
