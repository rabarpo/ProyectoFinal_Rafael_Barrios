import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PanelJornadaPage } from './PanelJornadaPage';

const { institucionMock, resumenJornadaMock, votosPorHoraMock, avanceAulasMock, listarMock } = vi.hoisted(() => ({
  institucionMock: vi.fn(),
  resumenJornadaMock: vi.fn(),
  votosPorHoraMock: vi.fn(),
  avanceAulasMock: vi.fn(),
  listarMock: vi.fn(),
}));

vi.mock('./panel-jornada-api', () => ({
  institucion: institucionMock,
  resumenJornada: resumenJornadaMock,
  votosPorHora: votosPorHoraMock,
  avanceAulas: avanceAulasMock,
  proyeccion: vi.fn(),
}));

vi.mock('../procesos/procesos-api', () => ({
  listar: listarMock,
}));

const RESPUESTA_INSTITUCION = {
  data: { estudiantes: 100, vinculos_apoderado: 150, hora_servidor: '2026-08-23T12:00:00.000Z' },
  response: { status: 200, ok: true },
};

const RESPUESTA_PROCESOS = {
  data: [{ id: 'p1', nombre: 'Proceso 1', estado: 'abierto' }],
  response: { status: 200, ok: true },
};

const RESPUESTA_RESUMEN = {
  data: {
    proceso_id: 'p1',
    estado: 'abierto',
    padron_total: 10,
    votos_emitidos: 5,
    correos_fallidos: 0,
    estado_visibilidad: 'visible',
    hora_servidor: '2026-08-23T12:00:00.000Z',
  },
  response: { status: 200, ok: true },
};

const RESPUESTA_VOTOS_HORA = {
  data: { hora_servidor: '2026-08-23T12:00:00.000Z', franjas: [] },
  response: { status: 200, ok: true },
};

const RESPUESTA_AVANCE_AULAS = {
  data: { hora_servidor: '2026-08-23T12:00:00.000Z', participacion_global_pp: 50, umbral_rezago_pp: 15, aulas: [] },
  response: { status: 200, ok: true },
};

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// [design.md "Cambios de archivos"; tasks.md 12.1-12.3] Contenedor: sin proceso seleccionado,
// sólo `TarjetasResumen` institucional + `SelectorProcesoActivo`; con proceso seleccionado,
// monta `GraficoVotosPorHora`/`TablaAvanceAulas` scoped.
describe('PanelJornadaPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    institucionMock.mockReset().mockResolvedValue(RESPUESTA_INSTITUCION);
    listarMock.mockReset().mockResolvedValue(RESPUESTA_PROCESOS);
    resumenJornadaMock.mockReset().mockResolvedValue(RESPUESTA_RESUMEN);
    votosPorHoraMock.mockReset().mockResolvedValue(RESPUESTA_VOTOS_HORA);
    avanceAulasMock.mockReset().mockResolvedValue(RESPUESTA_AVANCE_AULAS);
  });

  it('[12.1] sin proceso seleccionado: sólo institucional + selector, sin piezas scoped', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    render(<PanelJornadaPage />, { wrapper: wrapper(queryClient) });

    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByText('Votos por hora')).not.toBeInTheDocument();
    expect(screen.queryByText('Avance por aula')).not.toBeInTheDocument();
  });

  it('[12.2] con proceso seleccionado: monta GraficoVotosPorHora y TablaAvanceAulas scoped', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    render(<PanelJornadaPage />, { wrapper: wrapper(queryClient) });

    await vi.advanceTimersByTimeAsync(0);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p1' } });
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByText('Votos por hora')).toBeInTheDocument();
    expect(screen.getByText('Avance por aula')).toBeInTheDocument();
    expect(resumenJornadaMock).toHaveBeenCalledWith('p1');
    expect(votosPorHoraMock).toHaveBeenCalledWith('p1');
    expect(avanceAulasMock).toHaveBeenCalledWith('p1');
  });
});
