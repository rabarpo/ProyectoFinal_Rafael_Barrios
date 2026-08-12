import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App } from '../app/App';
import { AuthProvider } from './AuthProvider';
import { AuthGuard } from './AuthGuard';
import { useSesion } from './sesion-context';

// Phase 5 (tasks.md PR2) — casos adversariales RED obligatorios del login
// mínimo (design.md D8, tabla "Adversarial (login, RED obligatorio)").
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

// Sonda de prueba únicamente: simula lo que hará `procesos-api.ts` (PR9) al
// recibir un 401 de una ruta que NO es /auth — invoca el mismo callback que
// expone AuthProvider. No se agrega un botón real a AppShell/App.tsx: eso
// sería alcance de PR9, no de PR2.
function DisparadorDe401DeOtraRuta() {
  const { alRecibir401 } = useSesion();
  return (
    <button type="button" onClick={() => alRecibir401()}>
      Simular 401 de /procesos
    </button>
  );
}

describe('5.1 — un 401 de CUALQUIER ruta (no solo /auth) desmonta el asistente', () => {
  it('alRecibir401() del contexto de sesión hace que el AuthGuard vuelva a mostrar el login', async () => {
    whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'director', creadoEn: 1 });

    render(
      <AuthProvider>
        <AuthGuard>
          <p>Contenido protegido</p>
          <DisparadorDe401DeOtraRuta />
        </AuthGuard>
      </AuthProvider>,
    );
    await waitFor(() => screen.getByText('Contenido protegido'));

    fireEvent.click(screen.getByRole('button', { name: /simular 401 de \/procesos/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/código institucional/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
  });
});

describe('5.2 — el asistente nunca renderiza mientras estado=\'cargando\'', () => {
  it('no muestra ni el login ni el shell antes de que whoami() resuelva', async () => {
    let resolverWhoami: (valor: unknown) => void = () => {};
    whoamiMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolverWhoami = resolve;
      }),
    );

    render(<App />);

    expect(screen.queryByLabelText(/código institucional/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument();

    resolverWhoami(null);

    await waitFor(() => {
      expect(screen.getByLabelText(/código institucional/i)).toBeInTheDocument();
    });
  });
});

describe('5.4 — logout() fallando igual deja la UI anonimo', () => {
  it('la UI vuelve al login aunque logout() rechace (red/500)', async () => {
    whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'comite', creadoEn: 1 });
    logoutMock.mockRejectedValueOnce(new Error('500'));

    render(<App />);
    await waitFor(() => screen.getByRole('button', { name: /cerrar sesión/i }));

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/código institucional/i)).toBeInTheDocument();
    });
  });
});

describe('5.5 — mismo texto exacto para cuenta bloqueada y contraseña incorrecta', () => {
  it('un 401 "cuenta bloqueada" y un 401 "contraseña incorrecta" muestran el mismo mensaje', async () => {
    whoamiMock.mockResolvedValue(null);

    // Primer intento: simula lo que el backend devolvería para una cuenta
    // bloqueada — auth-api.ts ya lo colapsó a error:'credenciales' (401
    // uniforme, auth.service.ts), así que ambos casos llegan idénticos acá.
    loginMock.mockResolvedValueOnce({ ok: false, error: 'credenciales' });
    const { unmount } = render(<App />);
    await waitFor(() => screen.getByLabelText(/código institucional/i));
    fireEvent.change(screen.getByLabelText(/código institucional/i), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'y' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    const mensajeBloqueada = await screen.findByRole('alert');
    const textoBloqueada = mensajeBloqueada.textContent;
    unmount();

    // Segundo intento, contraseña incorrecta: mismo mapeo, misma causa.
    loginMock.mockResolvedValueOnce({ ok: false, error: 'credenciales' });
    render(<App />);
    await waitFor(() => screen.getByLabelText(/código institucional/i));
    fireEvent.change(screen.getByLabelText(/código institucional/i), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'z' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    const mensajeIncorrecta = await screen.findByRole('alert');

    expect(textoBloqueada).toBe(mensajeIncorrecta.textContent);
    expect(textoBloqueada).toBe('Credenciales inválidas');
  });
});
