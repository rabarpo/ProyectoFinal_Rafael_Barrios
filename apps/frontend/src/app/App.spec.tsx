import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from './App';

// [D8] App.tsx solo compone <AuthProvider><AuthGuard><AppShell/></AuthGuard>
// </AuthProvider> — sin lógica propia. Un único caso de punta a punta basta
// (estructural, sin ramas): se mockea auth-api.whoami para no depender de un
// backend real y se confirma que la composición completa llega a mostrar el
// shell autenticado.
const { whoamiMock } = vi.hoisted(() => ({ whoamiMock: vi.fn() }));

vi.mock('../auth/auth-api', () => ({
  whoami: whoamiMock,
  login: vi.fn(),
  google: vi.fn(),
  logout: vi.fn(),
}));

describe('App', () => {
  it('monta AuthProvider > AuthGuard > AppShell y muestra el rol tras resolver whoami()', async () => {
    whoamiMock.mockResolvedValueOnce({
      userId: 'u1',
      rol: 'administrador',
      creadoEn: 1,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/administrador/i)).toBeInTheDocument();
    });
  });
});
