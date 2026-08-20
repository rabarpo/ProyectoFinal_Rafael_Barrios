import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelMatriculas } from './PanelMatriculas';
import * as academicoApi from '../academico-api';
import * as usuariosApi from '../../usuarios/usuarios-api';

// [design.md D9/D10/D11; tasks.md 18.1-18.10; spec: student-enrollment] `PanelMatriculas` es el
// panel más grande del change: exige elegir un Aula antes de listar (D9, MatriculasService.listar()
// hace findMany sin `take`), resuelve usuario_id → nombres con `listarUsuarios()` (D11), nunca
// ofrece "Editar" (spec: "No existe botón 'Editar' en el listado de Matrícula") y el traslado
// ejecuta `crearMatricula` ANTES que `eliminarMatricula`, en ese orden literal (D10 — el orden
// importa por `@@unique([usuario_id, aula_id, anio_escolar_id])`).
vi.mock('../academico-api', () => ({
  listarMatriculas: vi.fn(),
  listarAulas: vi.fn(),
  listarAniosEscolares: vi.fn(),
  crearMatricula: vi.fn(),
  eliminarMatricula: vi.fn(),
}));

vi.mock('../../usuarios/usuarios-api', () => ({
  listarUsuarios: vi.fn(),
}));

function aula(overrides: Partial<{ id: string; turno: 'manana' | 'tarde' }> = {}) {
  return { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'ae1', ...overrides };
}

function anio(overrides: Partial<{ id: string; nombre: string; activo: boolean }> = {}) {
  return { id: 'ae1', nombre: '2026', activo: true, ...overrides };
}

function usuario(
  overrides: Partial<{ id: string; nombres: string; rol: string }> = {},
) {
  return {
    id: 'u1',
    nombres: 'Ana Torres',
    dni: '12345678',
    codigo: 'C001',
    correo: 'ana@example.com',
    rol: 'estudiante',
    estado: 'activo',
    creado_en: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function matricula(
  overrides: Partial<{ id: string; usuario_id: string; aula_id: string; anio_escolar_id: string }> = {},
) {
  return { id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'ae1', ...overrides };
}

function mockearListasBase() {
  vi.mocked(academicoApi.listarAulas).mockResolvedValue({
    data: [aula()],
    response: new Response(),
  } as never);
  vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
    data: [anio()],
    response: new Response(),
  } as never);
  vi.mocked(usuariosApi.listarUsuarios).mockResolvedValue({
    data: [usuario()],
    response: new Response(),
  } as never);
}

describe('PanelMatriculas', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[18.1] sin aula_id seleccionado: estado vacío instructivo y cero llamadas a listarMatriculas', async () => {
    mockearListasBase();

    render(<PanelMatriculas soloLectura={false} />);

    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/eleg[íi] un aula/i),
    ).toBeInTheDocument();
    expect(academicoApi.listarMatriculas).not.toHaveBeenCalled();
  });

  it('[18.2] seleccionar aula_id (y opcionalmente anio_escolar_id) llama listarMatriculas({ aula_id, anio_escolar_id })', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [matricula()],
      response: new Response(),
    } as never);

    render(<PanelMatriculas soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });
    await waitFor(() =>
      expect(academicoApi.listarMatriculas).toHaveBeenLastCalledWith({ aula_id: 'au1' }),
    );

    fireEvent.change(screen.getByLabelText('Año escolar'), { target: { value: 'ae1' } });
    await waitFor(() =>
      expect(academicoApi.listarMatriculas).toHaveBeenLastCalledWith({
        aula_id: 'au1',
        anio_escolar_id: 'ae1',
      }),
    );
  });

  it('[18.3] resuelve usuario_id → nombres vía listarUsuarios(), nunca un UUID crudo', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [matricula()],
      response: new Response(),
    } as never);

    render(<PanelMatriculas soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });

    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());
    expect(screen.queryByText('u1')).not.toBeInTheDocument();
  });

  it('[18.4] las acciones de fila son exactamente "Eliminar" y "Trasladar", nunca "Editar"', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [matricula()],
      response: new Response(),
    } as never);

    render(<PanelMatriculas soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });

    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trasladar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('[18.5] "Crear" requiere usuario_id + aula_id/anio_escolar_id del filtro; envía crearMatricula({ usuario_id, aula_id, anio_escolar_id })', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearMatricula).mockResolvedValue({
      ok: true,
      data: matricula({ id: 'm2' }),
    });

    render(<PanelMatriculas soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });
    fireEvent.change(screen.getByLabelText('Año escolar'), { target: { value: 'ae1' } });
    await waitFor(() =>
      expect(academicoApi.listarMatriculas).toHaveBeenLastCalledWith({
        aula_id: 'au1',
        anio_escolar_id: 'ae1',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    fireEvent.change(screen.getByLabelText('Estudiante'), { target: { value: 'u1' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(academicoApi.crearMatricula).toHaveBeenCalledWith({
        usuario_id: 'u1',
        aula_id: 'au1',
        anio_escolar_id: 'ae1',
      }),
    );
  });

  it('[18.6] "Trasladar" explica los dos pasos y luego llama crearMatricula ANTES que eliminarMatricula, en ese orden', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [matricula()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearMatricula).mockResolvedValue({
      ok: true,
      data: matricula({ id: 'm2', aula_id: 'au1' }),
    });
    vi.mocked(academicoApi.eliminarMatricula).mockResolvedValue({ ok: true });

    render(<PanelMatriculas soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });
    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Trasladar' }));
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveTextContent(/dos pasos|crear.*eliminar|primero.*luego/i);
    fireEvent.click(within(dialogo).getByRole('button', { name: /continuar/i }));

    // "Aula"/"Año escolar" aparecen dos veces (filtro + formulario de traslado); el filtro se
    // renderiza primero en el DOM, así que el índice 1 es siempre el control del formulario.
    fireEvent.change(screen.getAllByLabelText('Aula')[1], { target: { value: 'au1' } });
    fireEvent.change(screen.getAllByLabelText('Año escolar')[1], { target: { value: 'ae1' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar traslado|guardar/i }));

    await waitFor(() => expect(academicoApi.eliminarMatricula).toHaveBeenCalledWith('m1'));
    expect(academicoApi.crearMatricula).toHaveBeenCalledWith({
      usuario_id: 'u1',
      aula_id: 'au1',
      anio_escolar_id: 'ae1',
    });

    const ordenCrear = vi.mocked(academicoApi.crearMatricula).mock.invocationCallOrder[0];
    const ordenEliminar = vi.mocked(academicoApi.eliminarMatricula).mock.invocationCallOrder[0];
    expect(ordenCrear).toBeLessThan(ordenEliminar);
  });

  it('[18.7] si crearMatricula falla en el traslado, nunca llama eliminarMatricula y muestra el error', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [matricula()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearMatricula).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'RESTRICCION_UNICA',
    });

    render(<PanelMatriculas soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });
    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Trasladar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /continuar/i }));
    fireEvent.change(screen.getAllByLabelText('Aula')[1], { target: { value: 'au1' } });
    fireEvent.change(screen.getAllByLabelText('Año escolar')[1], { target: { value: 'ae1' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar traslado|guardar/i }));

    await waitFor(() => expect(academicoApi.crearMatricula).toHaveBeenCalledTimes(1));
    expect(academicoApi.eliminarMatricula).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe un registro con esos mismos datos.');
  });

  it('[18.8] si crearMatricula tiene éxito pero eliminarMatricula falla, muestra role="alert" persistente con ambos ids', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [matricula()],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.crearMatricula).mockResolvedValue({
      ok: true,
      data: matricula({ id: 'm2', aula_id: 'au1' }),
    });
    vi.mocked(academicoApi.eliminarMatricula).mockResolvedValue({ ok: false, status: 500 });

    render(<PanelMatriculas soloLectura={false} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });
    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Trasladar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /continuar/i }));
    fireEvent.change(screen.getAllByLabelText('Aula')[1], { target: { value: 'au1' } });
    fireEvent.change(screen.getAllByLabelText('Año escolar')[1], { target: { value: 'ae1' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar traslado|guardar/i }));

    await waitFor(() => {
      const alerta = screen.getByRole('alert');
      expect(alerta).toHaveTextContent('m2');
      expect(alerta).toHaveTextContent('m1');
    });
  });

  it('[18.9] soloLectura oculta "Crear", "Eliminar" y "Trasladar"', async () => {
    mockearListasBase();
    vi.mocked(academicoApi.listarMatriculas).mockResolvedValue({
      data: [matricula()],
      response: new Response(),
    } as never);

    render(<PanelMatriculas soloLectura={true} />);
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'au1' } });
    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trasladar' })).not.toBeInTheDocument();
  });
});
