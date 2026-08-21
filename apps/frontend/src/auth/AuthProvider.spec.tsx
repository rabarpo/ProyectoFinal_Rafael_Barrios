import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthProvider';
import { useSesion } from './sesion-context';

// [D8] `AuthProvider` es el único componente con efectos: llama `whoami()`
// al montar y traduce el resultado al estado de sesión que el resto de la
// app consume vía `useSesion()`. Se mockea `auth-api` completo (no `fetch`)
// porque acá se prueba la REDUCCIÓN de estado del provider, no el mapeo de
// errores HTTP — eso ya lo cubre auth-api.spec.ts.
const { whoamiMock, logoutMock } = vi.hoisted(() => ({
  whoamiMock: vi.fn(),
  logoutMock: vi.fn(),
}));

vi.mock('./auth-api', () => ({
  whoami: whoamiMock,
  logout: logoutMock,
}));

function SondaEstado() {
  const contexto = useSesion();
  return (
    <div>
      <p data-testid="estado">{contexto.estado}</p>
      <button onClick={() => contexto.logout()}>logout</button>
      <button onClick={() => contexto.alRecibir401()}>401</button>
    </div>
  );
}

describe('AuthProvider', () => {
  it("pasa de 'cargando' a 'autenticado' cuando whoami() resuelve una sesión", async () => {
    whoamiMock.mockResolvedValueOnce({
      userId: 'u1',
      rol: 'administrador',
      creadoEn: 1_700_000_000,
    });

    render(
      <AuthProvider>
        <SondaEstado />
      </AuthProvider>,
    );

    expect(screen.getByTestId('estado')).toHaveTextContent('cargando');

    await waitFor(() => {
      expect(screen.getByTestId('estado')).toHaveTextContent('autenticado');
    });
  });

  it("pasa de 'cargando' a 'anonimo' cuando whoami() resuelve null", async () => {
    whoamiMock.mockResolvedValueOnce(null);

    render(
      <AuthProvider>
        <SondaEstado />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('estado')).toHaveTextContent('anonimo');
    });
  });

  // Hallazgo de revisión manual: sin este reset, un usuario que cierra sesión desde una pantalla
  // restringida (p. ej. administrador en /usuarios) deja esa URL puesta; si otro rol inicia sesión
  // después en la misma pestaña, Enrutador re-lee ese pathname viejo contra el rol nuevo y, si no
  // tiene acceso, aterriza directo en el aviso "no disponible para tu rol" en vez de en /.
  describe('reset de navegación al perder la sesión', () => {
    beforeEach(() => {
      window.history.pushState(null, '', '/usuarios');
    });

    afterEach(() => {
      window.history.pushState(null, '', '/');
    });

    it('logout() vuelve la URL a / aunque la sesión estuviera en una pantalla restringida', async () => {
      whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'administrador', creadoEn: 1 });
      logoutMock.mockResolvedValueOnce(undefined);

      render(
        <AuthProvider>
          <SondaEstado />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('autenticado'));
      expect(window.location.pathname).toBe('/usuarios');

      fireEvent.click(screen.getByRole('button', { name: 'logout' }));

      await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('anonimo'));
      expect(window.location.pathname).toBe('/');
    });

    it('alRecibir401() también vuelve la URL a /', async () => {
      whoamiMock.mockResolvedValueOnce({ userId: 'u1', rol: 'administrador', creadoEn: 1 });

      render(
        <AuthProvider>
          <SondaEstado />
        </AuthProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('autenticado'));

      fireEvent.click(screen.getByRole('button', { name: '401' }));

      expect(screen.getByTestId('estado')).toHaveTextContent('anonimo');
      expect(window.location.pathname).toBe('/');
    });
  });
});
