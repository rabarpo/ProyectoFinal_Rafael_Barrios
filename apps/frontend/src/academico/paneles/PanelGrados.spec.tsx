import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelGrados } from './PanelGrados';
import * as academicoApi from '../academico-api';

// [design.md D2/D3/D4/D5/D7/D8; tasks.md 14.1-14.4; spec: academic-tree-management, "Listado de
// Grado filtrado por Nivel seleccionado"] Mismo patrón de contenedor que `PanelNiveles`, más un
// filtro `nivel_id` sourced de `listarNiveles()`.
vi.mock('../academico-api', () => ({
  listarGrados: vi.fn(),
  listarNiveles: vi.fn(),
  crearGrado: vi.fn(),
  actualizarGrado: vi.fn(),
  eliminarGrado: vi.fn(),
}));

function nivel(overrides: Partial<{ id: string; nombre: string }> = {}) {
  return { id: 'n1', nombre: 'Inicial', ...overrides };
}

function grado(overrides: Partial<{ id: string; nombre: string; nivel_id: string }> = {}) {
  return { id: 'g1', nombre: 'Primero', nivel_id: 'n1', ...overrides };
}

describe('PanelGrados', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[14.1] sin Nivel seleccionado lista todos los Grados; seleccionar un Nivel refetchea con nivel_id', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [nivel()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [grado()],
      response: new Response(),
    } as never);

    render(<PanelGrados soloLectura={false} />);

    await waitFor(() => expect(academicoApi.listarGrados).toHaveBeenCalledTimes(1));
    expect(academicoApi.listarGrados).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByText('Primero')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nivel'), { target: { value: 'n1' } });

    await waitFor(() => expect(academicoApi.listarGrados).toHaveBeenCalledTimes(2));
    expect(academicoApi.listarGrados).toHaveBeenLastCalledWith({ nivel_id: 'n1' });
  });

  it('[14.2] soloLectura=false muestra Crear/Editar/Eliminar; soloLectura=true no muestra ninguno', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [nivel()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [grado()],
      response: new Response(),
    } as never);

    const { unmount } = render(<PanelGrados soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('Primero')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    unmount();

    render(<PanelGrados soloLectura={true} />);
    await waitFor(() => expect(screen.getByText('Primero')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('[14.3] Crear/Editar/Eliminar están cableados a crearGrado/actualizarGrado/eliminarGrado; 409 muestra el mensaje legible', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [nivel()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [grado()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearGrado).mockResolvedValue({
      ok: true,
      data: grado({ id: 'g2', nombre: 'Segundo' }),
    });

    render(<PanelGrados soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('Primero')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Nivel'), { target: { value: 'n1' } });
    await waitFor(() => expect(academicoApi.listarGrados).toHaveBeenLastCalledWith({ nivel_id: 'n1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Segundo' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.crearGrado).toHaveBeenCalledWith({ nombre: 'Segundo', nivel_id: 'n1' }),
    );

    vi.mocked(academicoApi.actualizarGrado).mockResolvedValue({ ok: true, data: grado() });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Primero 2' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.actualizarGrado).toHaveBeenCalledWith('g1', { nombre: 'Primero 2' }),
    );

    vi.mocked(academicoApi.eliminarGrado).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
      relacion: 'Sección',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se puede eliminar: todavía tiene Sección asociados.',
      ),
    );
    expect(academicoApi.eliminarGrado).toHaveBeenCalledWith('g1');
  });

  it('[regresión] el select de Nivel en modo creación arranca sin valor seleccionado (no en el primer Nivel de la lista) y una única selección alcanza para habilitar Guardar', async () => {
    // Bug reportado: sin filtro activo, FormularioGenerico arrancaba con valores.nivel_id = ''
    // pero opcionesNivel no tenía ningún <option value="">, así que el navegador mostraba
    // visualmente el primer Nivel de la lista (aquí "Inicial") mientras el estado seguía vacío.
    // El usuario tenía que cambiar el select y volver a poner el valor deseado para que el botón
    // se habilitara. Este test cubre el flujo SIN tocar el filtro primero (a diferencia de [14.3],
    // que ya deja nivel_id precargado vía el filtro).
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [nivel({ id: 'n1', nombre: 'Inicial' }), nivel({ id: 'n2', nombre: 'Primaria' })],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [grado()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearGrado).mockResolvedValue({
      ok: true,
      data: grado({ id: 'g2', nombre: 'Segundo' }),
    });

    render(<PanelGrados soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('Primero')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    const selectNivel = screen.getAllByLabelText('Nivel')[1];
    expect(selectNivel).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Segundo' } });
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();

    fireEvent.change(selectNivel, { target: { value: 'n2' } });
    expect(screen.getByRole('button', { name: /guardar/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.crearGrado).toHaveBeenCalledWith({ nombre: 'Segundo', nivel_id: 'n2' }),
    );
  });
});
