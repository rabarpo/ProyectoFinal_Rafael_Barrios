import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegistroCandidatoPage } from './RegistroCandidatoPage';
import * as candidatosApi from './candidatos-api';

// [spec: candidatos-listas-management, "Creación rechazada sin foto"; spec:
// minimal-frontend-router, "Ruta de alta/edición renderiza el formulario
// correspondiente"; design.md D13, tasks.md 21.2-21.3] Único contenedor con
// efectos de este batch — orquesta `candidatos-api` y `navegar()`, mismo
// patrón que `ProcesoWizardPage`.
vi.mock('./candidatos-api', () => ({
  crearCandidato: vi.fn(),
  actualizarCandidato: vi.fn(),
  obtenerCandidato: vi.fn(),
  listarListas: vi.fn(),
}));

const { navegarMock } = vi.hoisted(() => ({ navegarMock: vi.fn() }));
vi.mock('../app/useRuta', () => ({ navegar: navegarMock }));

function mockListasVacias() {
  vi.mocked(candidatosApi.listarListas).mockResolvedValue({ ok: true, data: [] });
}

describe('RegistroCandidatoPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('modo edición: precarga los datos reales del candidato en el formulario, no lo deja en blanco', async () => {
    mockListasVacias();
    vi.mocked(candidatosApi.obtenerCandidato).mockResolvedValue({
      ok: true,
      data: {
        id: 'c1',
        proceso_id: 'p1',
        nombres: 'Sebastián Chávez Rojas',
        cargo: 'Representante de Aula',
        foto_presente: true,
        estado: 'activo',
      },
    });

    render(<RegistroCandidatoPage procesoId="p1" candidatoId="c1" />);

    await waitFor(() =>
      expect(screen.getByLabelText(/nombres/i)).toHaveValue('Sebastián Chávez Rojas'),
    );
    expect(screen.getByLabelText(/cargo postulado/i)).toHaveValue('Representante de Aula');
  });

  it('modo creación: submit sin foto no invoca crearCandidato', async () => {
    mockListasVacias();
    render(<RegistroCandidatoPage procesoId="p1" />);
    await waitFor(() => expect(candidatosApi.listarListas).toHaveBeenCalledWith('p1'));

    fireEvent.change(screen.getByLabelText(/nombres/i), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar candidato/i }));

    expect(candidatosApi.crearCandidato).not.toHaveBeenCalled();
  });

  it('modo creación: submit exitoso navega de vuelta a la ruta de candidatos del proceso', async () => {
    mockListasVacias();
    vi.mocked(candidatosApi.crearCandidato).mockResolvedValue({
      ok: true,
      data: { id: 'c1', proceso_id: 'p1', nombres: 'Ana', foto_presente: true, estado: 'activo' },
    });
    render(<RegistroCandidatoPage procesoId="p1" />);
    await waitFor(() => expect(candidatosApi.listarListas).toHaveBeenCalledWith('p1'));

    fireEvent.change(screen.getByLabelText(/nombres/i), { target: { value: 'Ana' } });
    const foto = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/^foto/i), { target: { files: [foto] } });
    fireEvent.click(screen.getByRole('button', { name: /registrar candidato/i }));

    await waitFor(() =>
      expect(navegarMock).toHaveBeenCalledWith({ nombre: 'candidatos', procesoId: 'p1' }),
    );
  });
});
