import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelNiveles } from './PanelNiveles';
import * as academicoApi from '../academico-api';

// [design.md D2/D3/D4/D5/D7/D8; tasks.md 12.1-12.4; spec: academic-tree-management] Mismo patrón
// de contenedor que `PanelAniosEscolares`, sin filtros ni acción "Activar".
vi.mock('../academico-api', () => ({
  listarNiveles: vi.fn(),
  crearNivel: vi.fn(),
  actualizarNivel: vi.fn(),
  eliminarNivel: vi.fn(),
}));

function nivel(overrides: Partial<{ id: string; nombre: string }> = {}) {
  return { id: 'n1', nombre: 'Inicial', ...overrides };
}

describe('PanelNiveles', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[12.1] llama a listarNiveles una vez al montar, sin filtros', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [nivel()],
      response: new Response(),
    } as never);

    render(<PanelNiveles soloLectura={false} />);

    await waitFor(() => expect(academicoApi.listarNiveles).toHaveBeenCalledTimes(1));
    expect(academicoApi.listarNiveles).toHaveBeenCalledWith();
    expect(screen.getByText('Inicial')).toBeInTheDocument();
  });

  it('[12.2] soloLectura=false muestra Crear/Editar/Eliminar; soloLectura=true no muestra ninguno', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [nivel()],
      response: new Response(),
    } as never);

    const { unmount } = render(<PanelNiveles soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('Inicial')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    unmount();

    render(<PanelNiveles soloLectura={true} />);
    await waitFor(() => expect(screen.getByText('Inicial')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('[12.3] Crear/Editar están cableados a crearNivel/actualizarNivel; Eliminar con 409 muestra el mensaje legible', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [nivel()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearNivel).mockResolvedValue({ ok: true, data: nivel({ id: 'n2', nombre: 'Primaria' }) });

    render(<PanelNiveles soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('Inicial')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Primaria' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(academicoApi.crearNivel).toHaveBeenCalledWith({ nombre: 'Primaria' }));

    vi.mocked(academicoApi.actualizarNivel).mockResolvedValue({ ok: true, data: nivel() });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Inicial 2' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.actualizarNivel).toHaveBeenCalledWith('n1', { nombre: 'Inicial 2' }),
    );

    vi.mocked(academicoApi.eliminarNivel).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
      relacion: 'Grado',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se puede eliminar: todavía tiene Grado asociados.',
      ),
    );
    expect(academicoApi.eliminarNivel).toHaveBeenCalledWith('n1');
  });
});
