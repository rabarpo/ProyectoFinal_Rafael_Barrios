import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CuentasBloqueadasPage } from './CuentasBloqueadasPage';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';
import { listarCuentasBloqueadas, desbloquearCuenta } from './usuarios-api';
import type { UsuarioBloqueadoDto } from './usuarios-api';

// [design.md D4; tasks.md 6.1-6.2; spec: bloqueo-desbloqueo-cuentas, "Un rol distinto de comité
// no puede alcanzar la vista"] Segundo gate BINARIO allowlist fail-closed, independiente del de
// `UsuariosPage`: `puedeDesbloquear = rol === 'comite'`. No comparte booleano con el otro gate
// (design.md D4).
const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

vi.mock('./usuarios-api');

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <CuentasBloqueadasPage />
    </SesionContext.Provider>
  );
}

function contextoConRol(rol: string): ContextoSesion {
  return {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol: rol as never, creadoEn: 1 },
    ...acciones,
  };
}

function cuenta(overrides: Partial<UsuarioBloqueadoDto> = {}): UsuarioBloqueadoDto {
  return {
    id: 'u1',
    nombres: 'Ana Pérez',
    dni: '12345678',
    codigo: 'EST001',
    bloqueado_hasta: null,
    ...overrides,
  };
}

describe('CuentasBloqueadasPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('[6.1] rol comite renderiza el shell de la página sin lanzar y sin llamar a fetch', async () => {
    const fetchEspiado = vi.fn();
    vi.stubGlobal('fetch', fetchEspiado);
    vi.mocked(listarCuentasBloqueadas).mockResolvedValue({ ok: true, data: [] });

    expect(() => render(proveer(contextoConRol('comite')))).not.toThrow();

    expect(screen.getByTestId('cuentas-bloqueadas-page-shell')).toBeInTheDocument();
    expect(fetchEspiado).not.toHaveBeenCalled();
  });

  it.each(['administrador', 'director', 'docente', 'estudiante'])(
    '[6.2] rol %s renderiza un aviso de sección no disponible y sin llamar a fetch',
    (rol) => {
      const fetchEspiado = vi.fn();
      vi.stubGlobal('fetch', fetchEspiado);

      render(proveer(contextoConRol(rol)));

      expect(screen.getByRole('status')).toHaveTextContent(/no está disponible para tu rol/i);
      expect(fetchEspiado).not.toHaveBeenCalled();
      expect(listarCuentasBloqueadas).not.toHaveBeenCalled();
    },
  );

  it('[6.2] sin sesión (rol indefinido) renderiza el aviso de sección no disponible y sin llamar a fetch', () => {
    const fetchEspiado = vi.fn();
    vi.stubGlobal('fetch', fetchEspiado);

    render(
      proveer({
        estado: 'anonimo',
        ...acciones,
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(/no está disponible para tu rol/i);
    expect(fetchEspiado).not.toHaveBeenCalled();
    expect(listarCuentasBloqueadas).not.toHaveBeenCalled();
  });

  it('[19.1] monta y llama a listarCuentasBloqueadas una vez, renderizando filas via TablaGenerica', async () => {
    vi.mocked(listarCuentasBloqueadas).mockResolvedValue({ ok: true, data: [cuenta()] });

    render(proveer(contextoConRol('comite')));

    await waitFor(() => expect(listarCuentasBloqueadas).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('12345678')).toBeInTheDocument();
    expect(screen.getByText('EST001')).toBeInTheDocument();
  });

  it('[19.2] una fila con bloqueado_hasta null renderiza "Indefinido"', async () => {
    vi.mocked(listarCuentasBloqueadas).mockResolvedValue({
      ok: true,
      data: [cuenta({ bloqueado_hasta: null })],
    });

    render(proveer(contextoConRol('comite')));

    expect(await screen.findByText('Indefinido')).toBeInTheDocument();
  });

  it('[19.3] una fila con bloqueado_hasta real renderiza la fecha formateada, no el ISO crudo', async () => {
    const iso = '2026-09-05T17:59:00.000Z';
    vi.mocked(listarCuentasBloqueadas).mockResolvedValue({
      ok: true,
      data: [cuenta({ bloqueado_hasta: iso })],
    });

    render(proveer(contextoConRol('comite')));

    expect(await screen.findByText(new Date(iso).toLocaleString())).toBeInTheDocument();
    expect(screen.queryByText(iso)).not.toBeInTheDocument();
  });

  it('[20.1] click en "Desbloquear" abre DialogoConfirmacion mencionando la auditoría', async () => {
    vi.mocked(listarCuentasBloqueadas).mockResolvedValue({ ok: true, data: [cuenta()] });

    render(proveer(contextoConRol('comite')));

    fireEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }));

    expect(screen.getByRole('dialog')).toHaveTextContent(/auditor/i);
    expect(desbloquearCuenta).not.toHaveBeenCalled();
  });

  it('[20.2] cancelar el diálogo no invoca desbloquearCuenta ni recarga, la fila sigue visible', async () => {
    vi.mocked(listarCuentasBloqueadas).mockResolvedValue({ ok: true, data: [cuenta()] });

    render(proveer(contextoConRol('comite')));

    fireEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    expect(desbloquearCuenta).not.toHaveBeenCalled();
    expect(listarCuentasBloqueadas).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
  });

  it('[20.3] confirmar invoca desbloquearCuenta y recarga; la fila desbloqueada desaparece tras el refresco', async () => {
    vi.mocked(listarCuentasBloqueadas)
      .mockResolvedValueOnce({ ok: true, data: [cuenta()] })
      .mockResolvedValueOnce({ ok: true, data: [] });
    vi.mocked(desbloquearCuenta).mockResolvedValue({ ok: true, data: { desbloqueado: true } });

    render(proveer(contextoConRol('comite')));

    fireEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desbloquear' }));

    await waitFor(() => expect(desbloquearCuenta).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(listarCuentasBloqueadas).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument());
  });
});
