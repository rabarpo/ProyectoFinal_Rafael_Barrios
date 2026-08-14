import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GestionCandidatosPage } from './GestionCandidatosPage';
import * as candidatosApi from './candidatos-api';

// [spec: minimal-frontend-router, "Ruta de listado renderiza la pantalla de
// gestión"; spec: candidatos-listas-management, "Borrado físico rechazado
// con votos asociados"; design.md D13, tasks.md 23.3-23.4] Contenedor con
// TODOS los efectos — mismo patrón de mocking que `RegistroCandidatoPage`.
vi.mock('./candidatos-api', () => ({
  listarCandidatos: vi.fn(),
  listarListas: vi.fn(),
  listarOpciones: vi.fn(),
  cambiarEstadoCandidato: vi.fn(),
  cambiarEstadoLista: vi.fn(),
  eliminarCandidato: vi.fn(),
  eliminarLista: vi.fn(),
  crearLista: vi.fn(),
  subirPlanTrabajo: vi.fn(),
  crearOpcion: vi.fn(),
  eliminarOpcion: vi.fn(),
  urlFoto: (id: string) => `http://localhost/api/candidatos/${id}/foto`,
}));

const { navegarMock } = vi.hoisted(() => ({ navegarMock: vi.fn() }));
vi.mock('../app/useRuta', () => ({ navegar: navegarMock }));

function mockVacio() {
  vi.mocked(candidatosApi.listarCandidatos).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(candidatosApi.listarListas).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(candidatosApi.listarOpciones).mockResolvedValue({ ok: true, data: [] });
}

describe('GestionCandidatosPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lista los candidatos filtrados por el proceso_id de la ruta', async () => {
    vi.mocked(candidatosApi.listarCandidatos).mockResolvedValue({
      ok: true,
      data: [
        { id: 'c1', proceso_id: 'p1', nombres: 'Ana Pérez', foto_presente: false, estado: 'activo' },
      ],
    });
    vi.mocked(candidatosApi.listarListas).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(candidatosApi.listarOpciones).mockResolvedValue({ ok: true, data: [] });

    render(<GestionCandidatosPage procesoId="p1" />);

    await waitFor(() => expect(candidatosApi.listarCandidatos).toHaveBeenCalledWith('p1'));
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  });

  it('dar de baja invoca cambiarEstadoCandidato y refresca el listado', async () => {
    vi.mocked(candidatosApi.listarCandidatos).mockResolvedValueOnce({
      ok: true,
      data: [
        { id: 'c1', proceso_id: 'p1', nombres: 'Ana Pérez', foto_presente: false, estado: 'activo' },
      ],
    });
    vi.mocked(candidatosApi.listarListas).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(candidatosApi.listarOpciones).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(candidatosApi.cambiarEstadoCandidato).mockResolvedValue({
      ok: true,
      data: { id: 'c1', proceso_id: 'p1', nombres: 'Ana Pérez', foto_presente: false, estado: 'baja' },
    });
    vi.mocked(candidatosApi.listarCandidatos).mockResolvedValueOnce({
      ok: true,
      data: [
        { id: 'c1', proceso_id: 'p1', nombres: 'Ana Pérez', foto_presente: false, estado: 'baja' },
      ],
    });

    render(<GestionCandidatosPage procesoId="p1" />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /dar de baja/i }));

    await waitFor(() =>
      expect(candidatosApi.cambiarEstadoCandidato).toHaveBeenCalledWith('c1', 'baja'),
    );
    await waitFor(() => expect(candidatosApi.listarCandidatos).toHaveBeenCalledTimes(2));
  });

  it('borrar un candidato con 409 ENTIDAD_CON_DEPENDIENTES muestra un error legible, sin crash', async () => {
    vi.mocked(candidatosApi.listarCandidatos).mockResolvedValue({
      ok: true,
      data: [
        { id: 'c1', proceso_id: 'p1', nombres: 'Ana Pérez', foto_presente: false, estado: 'activo' },
      ],
    });
    vi.mocked(candidatosApi.listarListas).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(candidatosApi.listarOpciones).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(candidatosApi.eliminarCandidato).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
    });

    render(<GestionCandidatosPage procesoId="p1" />);
    await waitFor(() => expect(screen.getByText('Ana Pérez')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se puede eliminar/i),
    );
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  });

  it('"Registrar candidato" navega a la ruta de alta con el proceso_id actual', async () => {
    mockVacio();
    render(<GestionCandidatosPage procesoId="p1" />);
    await waitFor(() => expect(candidatosApi.listarCandidatos).toHaveBeenCalledWith('p1'));

    fireEvent.click(screen.getByRole('button', { name: /registrar candidato/i }));

    expect(navegarMock).toHaveBeenCalledWith({ nombre: 'candidato-nuevo', procesoId: 'p1' });
  });
});
