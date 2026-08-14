import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from './App';

// [spec: minimal-login] Flujo completo (App real: AuthProvider > AuthGuard >
// LoginPage/AppShell), con auth-api mockeado — no se depende de un backend
// real. Cubre las tareas 4.3-4.7 de tasks.md.
const { whoamiMock, loginMock, logoutMock } = vi.hoisted(() => ({
  whoamiMock: vi.fn(),
  loginMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock('../auth/auth-api', () => ({
  whoami: whoamiMock,
  login: loginMock,
  logout: logoutMock,
  google: vi.fn(),
}));

beforeEach(() => {
  whoamiMock.mockReset();
  loginMock.mockReset();
  logoutMock.mockReset();
});

describe('Flujo de login (App)', () => {
  it('whoami 200 monta el shell y NUNCA muestra el formulario de login', async () => {
    whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'administrador', creadoEn: 1 });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/administrador/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/código institucional/i)).not.toBeInTheDocument();
  });

  it('whoami 401 (null) muestra el formulario de login', async () => {
    whoamiMock.mockResolvedValueOnce(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/código institucional/i)).toBeInTheDocument();
    });
  });

  it('campos vacíos no invocan login() de auth-api', async () => {
    whoamiMock.mockResolvedValueOnce(null);

    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /continuar/i }));

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(loginMock).not.toHaveBeenCalled();
  });

  it('401 deja el código tecleado y muestra "Credenciales inválidas"', async () => {
    whoamiMock.mockResolvedValueOnce(null);
    loginMock.mockResolvedValueOnce({ ok: false, error: 'credenciales' });

    render(<App />);
    await waitFor(() => screen.getByLabelText(/código institucional/i));

    fireEvent.change(screen.getByLabelText(/código institucional/i), {
      target: { value: 'seed-comite' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i, { selector: 'input' }), {
      target: { value: 'clave-mala' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/código institucional/i)).toHaveValue('seed-comite');
  });

  it('"Cerrar sesión" vuelve a mostrar el login', async () => {
    whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'comite', creadoEn: 1 });
    logoutMock.mockResolvedValueOnce(undefined);

    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /cerrar sesión/i }));

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/código institucional/i)).toBeInTheDocument();
    });
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
