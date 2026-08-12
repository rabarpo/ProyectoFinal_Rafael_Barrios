import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthGuard } from './AuthGuard';
import { SesionContext } from './sesion-context';
import type { ContextoSesion } from './sesion-context';

// [D8] `AuthGuard` no es un guard de router: es composición pura que decide
// qué árbol renderizar según `estado`. Se provee el contexto directamente
// (sin `AuthProvider`) para aislar la lógica de composición del efecto de
// red que sí prueba AuthProvider.spec.tsx, y se mockea `LoginPage` (Phase 4,
// aún no existe en Phase 3) para no acoplar este test a su implementación.
vi.mock('./LoginPage', () => ({
  LoginPage: () => <p data-testid="login-page">LoginPage</p>,
}));

function proveer(estadoParcial: ContextoSesion, children: React.ReactNode) {
  return (
    <SesionContext.Provider value={estadoParcial}>
      <AuthGuard>{children}</AuthGuard>
    </SesionContext.Provider>
  );
}

const acciones = { login: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

describe('AuthGuard', () => {
  it("no renderiza el login NI los children mientras estado='cargando'", () => {
    render(proveer({ estado: 'cargando', ...acciones }, <p>Asistente protegido</p>));

    expect(screen.queryByText('Asistente protegido')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it("renderiza LoginPage (no los children) cuando estado='anonimo'", () => {
    render(proveer({ estado: 'anonimo', ...acciones }, <p>Asistente protegido</p>));

    expect(screen.queryByText('Asistente protegido')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it("renderiza los children (no LoginPage) cuando estado='autenticado'", () => {
    render(
      proveer(
        { estado: 'autenticado', sesion: { userId: 'u1', rol: 'director', creadoEn: 1 }, ...acciones },
        <p>Asistente protegido</p>,
      ),
    );

    expect(screen.getByText('Asistente protegido')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});
