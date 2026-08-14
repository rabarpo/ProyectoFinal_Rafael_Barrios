import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProcesosIndexPage } from './ProcesosIndexPage';
import * as procesosApi from './procesos-api';
import type { ProcesoRespuestaDto } from './procesos-api';

// [design.md D12; spec: minimal-frontend-router] Punto de entrada al módulo
// de candidatos: sin este índice no hay forma de alcanzar los candidatos de
// un proceso creado en otra sesión. Reutiliza `procesos-api.listar()`
// (ya existente, sin consumidor antes de este PR).
vi.mock('./procesos-api', () => ({ listar: vi.fn() }));

const { navegarMock } = vi.hoisted(() => ({ navegarMock: vi.fn() }));
vi.mock('../app/useRuta', () => ({ navegar: navegarMock }));

function proceso(
  id: string,
  nombre: string,
  estado: ProcesoRespuestaDto['estado'] = 'borrador',
): ProcesoRespuestaDto {
  return {
    id,
    nombre,
    tipo: 'municipio',
    estado,
    fecha_apertura_prevista: '2026-01-01T00:00:00.000Z',
    fecha_cierre_prevista: '2026-01-02T00:00:00.000Z',
    ocultar_resultados: true,
    publico_objetivo: 'estudiantes',
    alcance: 'institucion',
  } as ProcesoRespuestaDto;
}

beforeEach(() => {
  navegarMock.mockReset();
  vi.mocked(procesosApi.listar).mockReset();
});

describe('ProcesosIndexPage', () => {
  it('lista los procesos existentes y navega a /procesos/:id/candidatos sin recarga', async () => {
    vi.mocked(procesosApi.listar).mockResolvedValueOnce({
      data: [proceso('p1', 'Elección de comité 2026')],
      response: { ok: true } as Response,
    });

    render(<ProcesosIndexPage />);

    expect(await screen.findByText('Elección de comité 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /gestionar candidatos/i }));

    expect(navegarMock).toHaveBeenCalledWith({ nombre: 'candidatos', procesoId: 'p1' });
  });

  it('ofrece un enlace/botón para crear un proceso nuevo', async () => {
    vi.mocked(procesosApi.listar).mockResolvedValueOnce({
      data: [],
      response: { ok: true } as Response,
    });

    render(<ProcesosIndexPage />);
    await screen.findByRole('button', { name: /nuevo proceso/i });

    fireEvent.click(screen.getByRole('button', { name: /nuevo proceso/i }));

    expect(navegarMock).toHaveBeenCalledWith({ nombre: 'proceso-nuevo' });
  });

  // [design.md D13; tasks.md 18.3-18.4] El botón "Abrir proceso" solo debe
  // aparecer para procesos en `borrador` — abrir uno ya `abierto`/`cerrado`/
  // `acta_emitida` no tiene sentido (la transición ya ocurrió o el proceso
  // ya no la admite).
  it('muestra "Abrir proceso" solo para procesos en borrador', async () => {
    vi.mocked(procesosApi.listar).mockResolvedValueOnce({
      data: [proceso('p1', 'Borrador X', 'borrador'), proceso('p2', 'Abierto Y', 'abierto')],
      response: { ok: true } as Response,
    });

    render(<ProcesosIndexPage />);
    await screen.findByText('Borrador X');

    const filaBorrador = screen.getByText('Borrador X').closest('li');
    const filaAbierta = screen.getByText('Abierto Y').closest('li');
    if (!filaBorrador || !filaAbierta) throw new Error('fila no encontrada');

    expect(within(filaBorrador).getByRole('button', { name: /abrir proceso/i })).toBeInTheDocument();
    expect(
      within(filaAbierta).queryByRole('button', { name: /abrir proceso/i }),
    ).not.toBeInTheDocument();
  });

  it('el botón "Abrir proceso" navega a la ruta de apertura del proceso', async () => {
    vi.mocked(procesosApi.listar).mockResolvedValueOnce({
      data: [proceso('p1', 'Borrador X', 'borrador')],
      response: { ok: true } as Response,
    });

    render(<ProcesosIndexPage />);
    await screen.findByText('Borrador X');

    fireEvent.click(screen.getByRole('button', { name: /abrir proceso/i }));

    expect(navegarMock).toHaveBeenCalledWith({ nombre: 'apertura', procesoId: 'p1' });
  });
});
