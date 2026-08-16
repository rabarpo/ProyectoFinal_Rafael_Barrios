import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultadosPage } from './ResultadosPage';
import * as hook from './useResultadosEnVivo';

// [design.md D11; spec: "Vista frontend de resultados en vivo"; tasks.md 13.1-13.4] Único efecto
// de este batch es `useResultadosEnVivo`; se dobla el hook completo (mismo criterio que
// `ComprobantePage.spec.tsx` dobla `votos-api`) para aislar `ResultadosPage` de React Query.
vi.mock('./useResultadosEnVivo', () => ({ useResultadosEnVivo: vi.fn() }));

function resultadoBase() {
  return {
    estado_visibilidad: 'visible' as const,
    resultados_ocultos_por_configuracion: false,
    votos_emitidos: 8,
    padron_total: 10,
    hora_servidor: '2026-08-15T14:32:07.123Z',
    dimension: 'lista' as const,
    desglose: [
      { id: 'c1', etiqueta: 'Lista A', votos: 5, estado: 'activo' as const },
      { id: 'c2', etiqueta: 'Lista B', votos: 3, estado: 'activo' as const },
    ],
    blancos: 0,
  };
}

describe('ResultadosPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[13.1] muestra "Cargando…" antes de la primera respuesta', () => {
    vi.mocked(hook.useResultadosEnVivo).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    render(<ResultadosPage procesoId="p1" />);

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it('[13.2] estado error (403/401 propagado por el hook) muestra un aviso, sin datos', () => {
    vi.mocked(hook.useResultadosEnVivo).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);

    render(<ResultadosPage procesoId="p1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/no pudimos cargar/i);
  });

  it('[13.3] estado_visibilidad = "oculto" renderiza el aviso de ocultos, sin ningún desglose', () => {
    vi.mocked(hook.useResultadosEnVivo).mockReturnValue({
      data: {
        ...resultadoBase(),
        estado_visibilidad: 'oculto',
        resultados_ocultos_por_configuracion: true,
        dimension: undefined,
        desglose: undefined,
        blancos: undefined,
      },
      isLoading: false,
      isError: false,
    } as never);

    render(<ResultadosPage procesoId="p1" />);

    expect(screen.getByRole('status')).toHaveTextContent(/ocultos/i);
    expect(screen.queryByText('Lista A')).not.toBeInTheDocument();
    // Participación siempre visible, también en modo oculto.
    expect(screen.getByText('Votos emitidos')).toBeInTheDocument();
  });

  it('[13.4] estado_visibilidad = "visible" renderiza participación y el desglose', () => {
    vi.mocked(hook.useResultadosEnVivo).mockReturnValue({
      data: resultadoBase(),
      isLoading: false,
      isError: false,
    } as never);

    render(<ResultadosPage procesoId="p1" />);

    expect(screen.getByText('Votos emitidos')).toBeInTheDocument();
    expect(screen.getByText('Lista A')).toBeInTheDocument();
    expect(screen.getByText('Lista B')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
