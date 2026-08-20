import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelApoderados } from './PanelApoderados';
import * as usuariosApi from '../usuarios-api';

// [design.md D10; tasks.md 16.1-17.4; spec: administracion-usuarios-apoderados, "Panel de
// Apoderado visible solo para rol === 'estudiante'"] Contenedor con los efectos, montado sólo
// desde `FichaUsuarioPage` cuando `usuario.rol === 'estudiante'` (la condición vive ahí, no acá —
// Fase 18). Mismo cableado que `PanelNiveles`, con la normalización de `correo` vacío propia de
// D10 y borrado FÍSICO (a diferencia de `Usuario`, que no tiene DELETE).
vi.mock('../usuarios-api', () => ({
  listarApoderados: vi.fn(),
  crearApoderado: vi.fn(),
  actualizarApoderado: vi.fn(),
  eliminarApoderado: vi.fn(),
}));

function apoderado(overrides: Partial<{ id: string; nombres: string; dni: string; correo: string | null }> = {}) {
  return { id: 'ap1', nombres: 'María López', dni: '30000001', correo: 'maria@example.com', ...overrides };
}

describe('PanelApoderados', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // [16.1] Monta y llama a listarApoderados(usuarioId) una vez, renderiza filas vía TablaGenerica.
  it('[16.1] llama a listarApoderados(usuarioId) una vez al montar y renderiza las filas', async () => {
    vi.mocked(usuariosApi.listarApoderados).mockResolvedValue({ ok: true, data: [apoderado()] });

    render(<PanelApoderados usuarioId="u1" soloLectura={false} />);

    await waitFor(() => expect(usuariosApi.listarApoderados).toHaveBeenCalledTimes(1));
    expect(usuariosApi.listarApoderados).toHaveBeenCalledWith('u1');
    expect(screen.getByText('María López')).toBeInTheDocument();
  });

  // [16.2] Alta con `correo` vacío: la clave viaja como `undefined`, no como `''` (D10).
  it('[16.2] alta con correo vacío llama a crearApoderado con correo undefined', async () => {
    vi.mocked(usuariosApi.listarApoderados).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(usuariosApi.crearApoderado).mockResolvedValue({ ok: true, data: apoderado() });

    render(<PanelApoderados usuarioId="u1" soloLectura={false} />);
    await waitFor(() => expect(usuariosApi.listarApoderados).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Pedro Ruiz' } });
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '40000001' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(usuariosApi.crearApoderado).toHaveBeenCalledWith('u1', {
        nombres: 'Pedro Ruiz',
        dni: '40000001',
        correo: undefined,
      }),
    );
  });

  // [16.3] Alta con `correo` completo: viaja tal cual.
  it('[16.3] alta con correo completo llama a crearApoderado con el correo enviado', async () => {
    vi.mocked(usuariosApi.listarApoderados).mockResolvedValue({ ok: true, data: [] });
    vi.mocked(usuariosApi.crearApoderado).mockResolvedValue({ ok: true, data: apoderado() });

    render(<PanelApoderados usuarioId="u1" soloLectura={false} />);
    await waitFor(() => expect(usuariosApi.listarApoderados).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Pedro Ruiz' } });
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '40000001' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(usuariosApi.crearApoderado).toHaveBeenCalledWith('u1', {
        nombres: 'Pedro Ruiz',
        dni: '40000001',
        correo: 'a@b.com',
      }),
    );
  });

  // [16.4] Edición de un apoderado existente: misma regla de correo vacío ⇒ undefined.
  it('[16.4] edición llama a actualizarApoderado con los campos cambiados y correo vacío como undefined', async () => {
    vi.mocked(usuariosApi.listarApoderados).mockResolvedValue({ ok: true, data: [apoderado()] });
    vi.mocked(usuariosApi.actualizarApoderado).mockResolvedValue({ ok: true, data: apoderado() });

    render(<PanelApoderados usuarioId="u1" soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('María López')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(usuariosApi.actualizarApoderado).toHaveBeenCalledWith('u1', 'ap1', {
        nombres: 'María López',
        dni: '30000001',
        correo: undefined,
      }),
    );
  });

  // [16.5] soloLectura=true oculta Crear/Editar/Eliminar por completo.
  it('[16.5] soloLectura=true no muestra Crear, Editar ni Eliminar', async () => {
    vi.mocked(usuariosApi.listarApoderados).mockResolvedValue({ ok: true, data: [apoderado()] });

    render(<PanelApoderados usuarioId="u1" soloLectura={true} />);
    await waitFor(() => expect(screen.getByText('María López')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Crear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  // [17.1] "Eliminar" abre DialogoConfirmacion cuyo texto dice explícitamente físico/permanente.
  it('[17.1] "Eliminar" abre un diálogo cuyo texto menciona que el borrado es físico/permanente', async () => {
    vi.mocked(usuariosApi.listarApoderados).mockResolvedValue({ ok: true, data: [apoderado()] });

    render(<PanelApoderados usuarioId="u1" soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('María López')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText(/físic|permanente/i)).toBeInTheDocument();
  });

  // [17.2] Confirmar llama a eliminarApoderado(usuarioId, apoderadoId); la fila desaparece tras
  // recargar (sin quita optimista sin recarga).
  it('[17.2] confirmar llama a eliminarApoderado y la fila desaparece tras recargar', async () => {
    vi.mocked(usuariosApi.listarApoderados)
      .mockResolvedValueOnce({ ok: true, data: [apoderado()] })
      .mockResolvedValueOnce({ ok: true, data: [] });
    vi.mocked(usuariosApi.eliminarApoderado).mockResolvedValue({ ok: true });

    render(<PanelApoderados usuarioId="u1" soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('María López')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(usuariosApi.eliminarApoderado).toHaveBeenCalledWith('u1', 'ap1'));
    await waitFor(() => expect(usuariosApi.listarApoderados).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('María López')).not.toBeInTheDocument());
  });

  // [17.3] Cancelar no llama a eliminarApoderado ni recarga.
  it('[17.3] cancelar el diálogo no llama a eliminarApoderado ni recarga', async () => {
    vi.mocked(usuariosApi.listarApoderados).mockResolvedValue({ ok: true, data: [apoderado()] });

    render(<PanelApoderados usuarioId="u1" soloLectura={false} />);
    await waitFor(() => expect(screen.getByText('María López')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(usuariosApi.eliminarApoderado).not.toHaveBeenCalled();
    expect(usuariosApi.listarApoderados).toHaveBeenCalledTimes(1);
  });
});
