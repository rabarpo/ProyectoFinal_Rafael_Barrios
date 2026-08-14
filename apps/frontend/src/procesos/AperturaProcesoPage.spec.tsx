import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AperturaProcesoPage } from './AperturaProcesoPage';
import * as procesosApi from './procesos-api';
import type { ProcesoDetalleRespuestaDto, AperturaRespuestaDto } from './procesos-api';

// [design.md D13/D14; tasks.md 18.1/18.5] Único contenedor con efectos de
// este batch: `GET /procesos/:id` (D14) para el resumen mostrado en el
// panel, `procesos-api.abrir()` al confirmar. Tras el `200` navega de vuelta
// al índice (tasks.md 18.5) — la apertura real ya quedó registrada en el
// servidor, no hace falta una pantalla intermedia adicional.
vi.mock('./procesos-api', () => ({ abrir: vi.fn(), detalle: vi.fn() }));

const { navegarMock } = vi.hoisted(() => ({ navegarMock: vi.fn() }));
vi.mock('../app/useRuta', () => ({ navegar: navegarMock }));

function detalleMock(): { data: ProcesoDetalleRespuestaDto; response: Response } {
  return {
    data: {
      id: 'p1',
      nombre: 'Elección de comité 2026',
      tipo: 'municipio',
      estado: 'borrador',
      fecha_apertura_prevista: '2026-01-01T00:00:00.000Z',
      fecha_cierre_prevista: '2026-01-02T00:00:00.000Z',
      ocultar_resultados: true,
      publico_objetivo: 'estudiantes',
      alcance: 'institucion',
      grado_ids_snapshot: [],
      aulas: ['a1', 'a2'],
      aulas_excluidas: [],
    } as ProcesoDetalleRespuestaDto,
    response: { ok: true } as Response,
  };
}

function aperturaMock(): { data: AperturaRespuestaDto; response: Response } {
  return {
    data: {
      id: 'p1',
      estado: 'abierto',
      apertura_real: '2026-01-01T00:00:00.000Z',
      ocultar_resultados: true,
      aulas: 2,
      derechos_totales: 10,
      derechos_estudiante: 8,
      derechos_padre: 2,
    } as AperturaRespuestaDto,
    response: { ok: true } as Response,
  };
}

describe('AperturaProcesoPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('confirmar en el panel navega de vuelta al índice tras el 200', async () => {
    vi.mocked(procesosApi.detalle).mockResolvedValueOnce(detalleMock());
    vi.mocked(procesosApi.abrir).mockResolvedValueOnce(aperturaMock());

    render(<AperturaProcesoPage procesoId="p1" />);

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar apertura/i }));

    await waitFor(() => expect(navegarMock).toHaveBeenCalledWith({ nombre: 'procesos' }));
    expect(procesosApi.abrir).toHaveBeenCalledWith('p1');
  });

  it('error del backend se muestra sin navegar', async () => {
    vi.mocked(procesosApi.detalle).mockResolvedValueOnce(detalleMock());
    vi.mocked(procesosApi.abrir).mockResolvedValueOnce({
      data: undefined,
      error: undefined,
      response: { ok: false, status: 409 } as Response,
    });

    render(<AperturaProcesoPage procesoId="p1" />);

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar apertura/i }));

    await screen.findByText(/no se pudo abrir/i);
    expect(navegarMock).not.toHaveBeenCalled();
  });
});
