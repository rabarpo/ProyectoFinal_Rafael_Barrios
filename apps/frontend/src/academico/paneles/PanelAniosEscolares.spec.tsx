import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelAniosEscolares } from './PanelAniosEscolares';
import * as academicoApi from '../academico-api';

// [design.md D2/D3/D4/D5/D7/D8/D9; tasks.md 11.1-11.7; spec: school-year-management] Contenedor
// con TODOS los efectos, mismo patrón de `vi.mock` que `GestionCandidatosPage.spec.tsx`. Recibe
// `soloLectura` como prop (D8): no lee `useSesion()` directamente.
vi.mock('../academico-api', () => ({
  listarAniosEscolares: vi.fn(),
  crearAnioEscolar: vi.fn(),
  actualizarAnioEscolar: vi.fn(),
  eliminarAnioEscolar: vi.fn(),
  activarAnioEscolar: vi.fn(),
}));

function anio(overrides: Partial<{ id: string; nombre: string; activo: boolean }> = {}) {
  return { id: 'ae1', nombre: '2026', activo: false, ...overrides };
}

describe('PanelAniosEscolares', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[11.1] llama a listarAniosEscolares una vez al montar y renderiza filas', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [anio()],
      response: new Response(),
    } as never);

    render(<PanelAniosEscolares soloLectura={false} />);

    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('[11.2] con soloLectura=false muestra Editar/Eliminar y Activar solo en filas no activas', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [
        anio({ id: 'ae1', nombre: '2025', activo: true }),
        anio({ id: 'ae2', nombre: '2026', activo: false }),
      ],
      response: new Response(),
    } as never);

    render(<PanelAniosEscolares soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('2025')).toBeInTheDocument());

    const filas = screen.getAllByRole('row');
    // filas[0] es el encabezado
    expect(within(filas[1]).getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(within(filas[1]).getAllByRole('button', { name: 'Eliminar' })).toHaveLength(1);
    expect(within(filas[1]).queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();

    expect(within(filas[2]).getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(within(filas[2]).getAllByRole('button', { name: 'Activar' })).toHaveLength(1);
  });

  it('[11.3] con soloLectura=true no muestra Crear/Editar/Eliminar/Activar', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [anio({ activo: false })],
      response: new Response(),
    } as never);

    render(<PanelAniosEscolares soloLectura={true} />);
    await waitFor(() => expect(screen.getByText('2026')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
  });

  it('[11.4] Crear abre el formulario; envío exitoso recarga y cierra; error muestra mensaje sin cerrar', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearAnioEscolar).mockResolvedValueOnce({
      ok: false,
      status: 409,
      codigo: 'RESTRICCION_UNICA',
    });

    render(<PanelAniosEscolares soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    const input = screen.getByLabelText('Nombre');
    fireEvent.change(input, { target: { value: '2026' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(academicoApi.crearAnioEscolar).toHaveBeenCalledWith({ nombre: '2026' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ya existe un registro con esos mismos datos.',
      ),
    );
    // el formulario sigue abierto tras el error
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();

    vi.mocked(academicoApi.crearAnioEscolar).mockResolvedValueOnce({
      ok: true,
      data: anio(),
    });
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [anio()],
      response: new Response(),
    } as never);
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  });

  it('[11.5] Eliminar con ENTIDAD_CON_DEPENDIENTES muestra el mensaje interpolado con la relación', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [anio()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.eliminarAnioEscolar).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
      relacion: 'Sección',
    });

    render(<PanelAniosEscolares soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('2026')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se puede eliminar: todavía tiene Sección asociados.',
      ),
    );
    expect(academicoApi.eliminarAnioEscolar).toHaveBeenCalledWith('ae1');
  });

  it('[11.6] Activar pide confirmación sin nombrar el año activo; confirmar activa y recarga; cancelar no hace nada', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [
        anio({ id: 'ae1', nombre: '2025', activo: true }),
        anio({ id: 'ae2', nombre: '2026', activo: false }),
      ],
      response: new Response(),
    } as never);

    render(<PanelAniosEscolares soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('2026')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toBeInTheDocument();
    expect(dialogo).not.toHaveTextContent('2025');

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(academicoApi.activarAnioEscolar).not.toHaveBeenCalled();
    expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1);

    vi.mocked(academicoApi.activarAnioEscolar).mockResolvedValue({
      ok: true,
      data: { id: 'ae2', activo: true, cambio: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Activar' }));

    await waitFor(() => expect(academicoApi.activarAnioEscolar).toHaveBeenCalledWith('ae2'));
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(2));
  });
});
