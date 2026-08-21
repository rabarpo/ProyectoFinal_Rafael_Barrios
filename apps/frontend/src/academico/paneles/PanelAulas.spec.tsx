import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelAulas } from './PanelAulas';
import * as academicoApi from '../academico-api';

// [design.md D2/D3/D4/D5/D7/D8; tasks.md 17.1-17.4; spec: academic-tree-management, "Listado de
// Aula filtrado por Grado, Sección, AñoEscolar y turno"] Mismo patrón de contenedor que
// `PanelGrados`/`PanelSecciones`, con 4 filtros: 3 `<select>`s sourced de listarGrados/
// listarSecciones/listarAniosEscolares, y un 4to `<select>` `turno` con 2 opciones literales fijas
// (`manana`/`tarde`) — no hay validación cliente adicional más allá de esas opciones fijas.
vi.mock('../academico-api', () => ({
  listarAulas: vi.fn(),
  listarGrados: vi.fn(),
  listarSecciones: vi.fn(),
  listarAniosEscolares: vi.fn(),
  crearAula: vi.fn(),
  actualizarAula: vi.fn(),
  eliminarAula: vi.fn(),
}));

function grado(overrides: Partial<{ id: string; nombre: string; nivel_id: string }> = {}) {
  return { id: 'g1', nombre: 'Primero', nivel_id: 'n1', ...overrides };
}

function seccion(
  overrides: Partial<{ id: string; nombre: string; grado_id: string; anio_escolar_id: string }> = {},
) {
  return { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'ae1', ...overrides };
}

function anio(overrides: Partial<{ id: string; nombre: string; activo: boolean }> = {}) {
  return { id: 'ae1', nombre: '2026', activo: false, ...overrides };
}

interface AulaFixture {
  id: string;
  turno: 'manana' | 'tarde';
  grado_id: string;
  seccion_id: string;
  anio_escolar_id: string;
}

function aula(overrides: Partial<AulaFixture> = {}): AulaFixture {
  return {
    id: 'au1',
    turno: 'manana',
    grado_id: 'g1',
    seccion_id: 's1',
    anio_escolar_id: 'ae1',
    ...overrides,
  };
}

function mockearListas() {
  vi.mocked(academicoApi.listarGrados).mockResolvedValue({
    data: [grado()],
    response: new Response(),
  } as never);
  vi.mocked(academicoApi.listarSecciones).mockResolvedValue({
    data: [seccion()],
    response: new Response(),
  } as never);
  vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
    data: [anio()],
    response: new Response(),
  } as never);
}

describe('PanelAulas', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[17.1] seleccionar los 4 filtros refetchea con listarAulas({ grado_id, seccion_id, anio_escolar_id, turno })', async () => {
    mockearListas();
    vi.mocked(academicoApi.listarAulas).mockResolvedValue({
      data: [aula()],
      response: new Response(),
    } as never);

    render(<PanelAulas soloLectura={false} />);

    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    expect(academicoApi.listarAulas).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByText('manana')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: 'g1' } });
    await waitFor(() =>
      expect(academicoApi.listarAulas).toHaveBeenLastCalledWith({ grado_id: 'g1' }),
    );

    fireEvent.change(screen.getByLabelText('Sección'), { target: { value: 's1' } });
    await waitFor(() =>
      expect(academicoApi.listarAulas).toHaveBeenLastCalledWith({
        grado_id: 'g1',
        seccion_id: 's1',
      }),
    );

    fireEvent.change(screen.getByLabelText('Año escolar'), { target: { value: 'ae1' } });
    await waitFor(() =>
      expect(academicoApi.listarAulas).toHaveBeenLastCalledWith({
        grado_id: 'g1',
        seccion_id: 's1',
        anio_escolar_id: 'ae1',
      }),
    );

    fireEvent.change(screen.getByLabelText('Turno'), { target: { value: 'manana' } });
    await waitFor(() =>
      expect(academicoApi.listarAulas).toHaveBeenLastCalledWith({
        grado_id: 'g1',
        seccion_id: 's1',
        anio_escolar_id: 'ae1',
        turno: 'manana',
      }),
    );
  });

  it('[17.2] soloLectura=false muestra Crear/Editar/Eliminar; soloLectura=true no muestra ninguno', async () => {
    mockearListas();
    vi.mocked(academicoApi.listarAulas).mockResolvedValue({
      data: [aula()],
      response: new Response(),
    } as never);

    const { unmount } = render(<PanelAulas soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('manana')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    unmount();

    render(<PanelAulas soloLectura={true} />);
    await waitFor(() => expect(screen.getByText('manana')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('[17.3] Crear/Editar/Eliminar están cableados a crearAula/actualizarAula/eliminarAula; turno es un select de 2 opciones fijas; 409 muestra el mensaje legible', async () => {
    mockearListas();
    vi.mocked(academicoApi.listarAulas).mockResolvedValue({
      data: [aula()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearAula).mockResolvedValue({
      ok: true,
      data: aula({ id: 'au2', turno: 'tarde' }),
    });

    render(<PanelAulas soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('manana')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    // "Turno"/"Grado"/"Sección"/"Año escolar" aparecen dos veces (filtro + formulario); el filtro
    // se renderiza primero en el DOM, así que el índice 1 es siempre el control del formulario.
    const selectTurno = screen.getAllByLabelText('Turno')[1];
    const opciones = within(selectTurno).getAllByRole('option').map((o) => o.getAttribute('value'));
    // '' es la opción vacía inicial (placeholder) que evita el desajuste entre el <select>
    // controlado (arranca en '') y las opciones reales cuando no hay valoresIniciales.
    expect(opciones).toEqual(['', 'manana', 'tarde']);

    fireEvent.change(selectTurno, { target: { value: 'tarde' } });
    fireEvent.change(screen.getAllByLabelText('Grado')[1], { target: { value: 'g1' } });
    fireEvent.change(screen.getAllByLabelText('Sección')[1], { target: { value: 's1' } });
    fireEvent.change(screen.getAllByLabelText('Año escolar')[1], { target: { value: 'ae1' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.crearAula).toHaveBeenCalledWith({
        turno: 'tarde',
        grado_id: 'g1',
        seccion_id: 's1',
        anio_escolar_id: 'ae1',
      }),
    );

    vi.mocked(academicoApi.actualizarAula).mockResolvedValue({ ok: true, data: aula() });
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getAllByLabelText('Turno')[1], { target: { value: 'tarde' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(academicoApi.actualizarAula).toHaveBeenCalledWith('au1', { turno: 'tarde' }),
    );

    vi.mocked(academicoApi.eliminarAula).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
      relacion: 'Matrícula',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se puede eliminar: todavía tiene Matrícula asociados.',
      ),
    );
    expect(academicoApi.eliminarAula).toHaveBeenCalledWith('au1');
  });
});
