import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { App } from './App';

// [spec: minimal-login] Flujo de Google (App real: AuthProvider > AuthGuard
// > LoginPage/AppShell), con auth-api mockeado. Cubre las tareas 7.4-7.6 de
// tasks.md. `useGoogleIdentity` también se mockea: captura el `onCredential`
// que `BotonGoogle` le pasa, para simular el `credential` que Google
// devolvería sin depender de su iframe real (no renderizable en jsdom, ver
// design.md D10).
const { whoamiMock, loginMock, logoutMock, googleMock } = vi.hoisted(() => ({
  whoamiMock: vi.fn(),
  loginMock: vi.fn(),
  logoutMock: vi.fn(),
  googleMock: vi.fn(),
}));

vi.mock('../auth/auth-api', () => ({
  whoami: whoamiMock,
  login: loginMock,
  logout: logoutMock,
  google: googleMock,
}));

const { onCredentialCapturado } = vi.hoisted(() => ({
  onCredentialCapturado: { current: undefined as ((idToken: string) => void) | undefined },
}));

vi.mock('../auth/useGoogleIdentity', () => ({
  useGoogleIdentity: ({ onCredential }: { onCredential: (idToken: string) => void }) => {
    onCredentialCapturado.current = onCredential;
  },
}));

beforeEach(() => {
  whoamiMock.mockReset();
  loginMock.mockReset();
  logoutMock.mockReset();
  googleMock.mockReset();
  onCredentialCapturado.current = undefined;
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id-de-prueba');
});

describe('Flujo de login con Google (App)', () => {
  it('Google exitoso invoca POST /auth/google y redirige al asistente (200)', async () => {
    whoamiMock.mockResolvedValueOnce(null);
    googleMock.mockResolvedValueOnce({ ok: true });
    whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'administrador', creadoEn: 1 });

    render(<App />);
    await waitFor(() => screen.getByLabelText(/código institucional/i));
    expect(onCredentialCapturado.current).toBeTypeOf('function');

    await act(async () => {
      onCredentialCapturado.current?.('id-token-valido');
    });

    await waitFor(() => {
      expect(screen.getByText(/administrador/i)).toBeInTheDocument();
    });
    expect(googleMock).toHaveBeenCalledWith('id-token-valido', undefined);
    expect(screen.queryByLabelText(/código institucional/i)).not.toBeInTheDocument();
  });

  it('409 VINCULACION_REQUERIDA abre el diálogo y el reenvío lleva {idToken, password}', async () => {
    whoamiMock.mockResolvedValueOnce(null);
    googleMock.mockResolvedValueOnce({ ok: false, error: 'vinculacion' });
    googleMock.mockResolvedValueOnce({ ok: true });
    whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'comite', creadoEn: 1 });

    render(<App />);
    await waitFor(() => screen.getByLabelText(/código institucional/i));

    await act(async () => {
      onCredentialCapturado.current?.('id-token-sin-vincular');
    });

    await waitFor(() => screen.getByLabelText(/contraseña actual/i));
    expect(screen.queryByText(/administrador|comite/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'clave-actual' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => {
      expect(screen.getByText(/comite/i)).toBeInTheDocument();
    });
    expect(googleMock).toHaveBeenNthCalledWith(2, 'id-token-sin-vincular', 'clave-actual');
  });

  it('401 de Google muestra el mismo mensaje genérico que el login por código', async () => {
    whoamiMock.mockResolvedValueOnce(null);
    googleMock.mockResolvedValueOnce({ ok: false, error: 'credenciales' });

    render(<App />);
    await waitFor(() => screen.getByLabelText(/código institucional/i));

    await act(async () => {
      onCredentialCapturado.current?.('id-token-rechazado');
    });

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
    });
  });
});
