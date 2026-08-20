import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelSecciones } from './PanelSecciones';
import * as academicoApi from '../academico-api';

// [design.md D2/D3/D4/D5/D7/D8; tasks.md 15.1-15.4; spec: academic-tree-management, filtros en
// cascada mirroreados de Grado/Aula para los dos filtros propios de Sección] Mismo patrón de
// contenedor que `PanelGrados`, con dos filtros `grado_id`/`anio_escolar_id`.
vi.mock('../academico-api', () => ({
  listarSecciones: vi.fn(),
  listarGrados: vi.fn(),
  listarAniosEscolares: vi.fn(),
  crearSeccion: vi.fn(),
  actualizarSeccion: vi.fn(),
  eliminarSeccion: vi.fn(),
}));

function grado(overrides: Partial<{ id: string; nombre: string; nivel_id: string }> = {}) {
  return { id: 'g1', nombre: 'Primero', nivel_id: 'n1', ...overrides };
}

function anio(overrides: Partial<{ id: string; nombre: string; activo: boolean }> = {}) {
  return { id: 'ae1', nombre: '2026', activo: false, ...overrides };
}

function seccion(
  overrides: Partial<{ id: string; nombre: string; grado_id: string; anio_escolar_id: string }> = {},
) {
  return { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'ae1', ...overrides };
}

describe('PanelSecciones', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[15.1] seleccionar los filtros refetchea con listarSecciones({ grado_id, anio_escolar_id })', async () => {
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [grado()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [anio()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarSecciones).mockResolvedValue({
      data: [seccion()],
      response: new Response(),
    } as never);

    render(<PanelSecciones soloLectura={false} />);

    await waitFor(() => expect(academicoApi.listarSecciones).toHaveBeenCalledTimes(1));
    expect(academicoApi.listarSecciones).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByText('A')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: 'g1' } });
    await waitFor(() =>
      expect(academicoApi.listarSecciones).toHaveBeenLastCalledWith({ grado_id: 'g1' }),
    );

    fireEvent.change(screen.getByLabelText('Año escolar'), { target: { value: 'ae1' } });
    await waitFor(() =>
      expect(academicoApi.listarSecciones).toHaveBeenLastCalledWith({
        grado_id: 'g1',
        anio_escolar_id: 'ae1',
      }),
    );
  });

  it('[15.2] soloLectura=false muestra Crear/Editar/Eliminar; soloLectura=true no muestra ninguno', async () => {
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [grado()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [anio()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarSecciones).mockResolvedValue({
      data: [seccion()],
      response: new Response(),
    } as never);

    const { unmount } = render(<PanelSecciones soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    unmount();

    render(<PanelSecciones soloLectura={true} />);
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('[15.3] Crear/Editar/Eliminar están cableados a crearSeccion/actualizarSeccion/eliminarSeccion; 409 muestra el mensaje legible', async () => {
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [grado()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [anio()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarSecciones).mockResolvedValue({
      data: [seccion()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearSeccion).mockResolvedValue({
      ok: true,
      data: seccion({ id: 's2', nombre: 'B' }),
    });

    render(<PanelSecciones soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: 'g1' } });
    fireEvent.change(screen.getByLabelText('Año escolar'), { target: { value: 'ae1' } });
    await waitFor(() =>
      expect(academicoApi.listarSecciones).toHaveBeenLastCalledWith({
        grado_id: 'g1',
        anio_escolar_id: 'ae1',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.crearSeccion).toHaveBeenCalledWith({
        nombre: 'B',
        grado_id: 'g1',
        anio_escolar_id: 'ae1',
      }),
    );

    vi.mocked(academicoApi.actualizarSeccion).mockResolvedValue({ ok: true, data: seccion() });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'A 2' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.actualizarSeccion).toHaveBeenCalledWith('s1', { nombre: 'A 2' }),
    );

    vi.mocked(academicoApi.eliminarSeccion).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
      relacion: 'Aula',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se puede eliminar: todavía tiene Aula asociados.',
      ),
    );
    expect(academicoApi.eliminarSeccion).toHaveBeenCalledWith('s1');
  });
});
