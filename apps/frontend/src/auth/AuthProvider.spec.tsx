import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthProvider';
import { useSesion } from './sesion-context';

// [D8] `AuthProvider` es el único componente con efectos: llama `whoami()`
// al montar y traduce el resultado al estado de sesión que el resto de la
// app consume vía `useSesion()`. Se mockea `auth-api` completo (no `fetch`)
// porque acá se prueba la REDUCCIÓN de estado del provider, no el mapeo de
// errores HTTP — eso ya lo cubre auth-api.spec.ts.
const { whoamiMock } = vi.hoisted(() => ({ whoamiMock: vi.fn() }));

vi.mock('./auth-api', () => ({
  whoami: whoamiMock,
}));

function SondaEstado() {
  const contexto = useSesion();
  return <p data-testid="estado">{contexto.estado}</p>;
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
});
