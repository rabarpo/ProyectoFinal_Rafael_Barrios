import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Enrutador } from './Enrutador';
import { AuthGuard } from '../auth/AuthGuard';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';

// [design.md D11; spec: minimal-frontend-router; threat matrix "Enrutamiento
// (cliente)"] El enrutador se monta DENTRO de AuthGuard: la sesión, nunca la
// URL, decide entre LoginPage y la app. Ruta desconocida cae en
// 'no-encontrada' dentro del shell, sin excepción.
vi.mock('../auth/LoginPage', () => ({
  LoginPage: () => <p data-testid="login-page">LoginPage</p>,
}));

const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <AuthGuard>
        <Enrutador />
      </AuthGuard>
    </SesionContext.Provider>
  );
}

afterEach(() => {
  window.history.pushState(null, '', '/');
});

beforeEach(() => {
  window.history.pushState(null, '', '/procesos/00000000-0000-0000-0000-000000000000/candidatos');
});

describe('Enrutador', () => {
  it('sin sesión, cualquier pathname renderiza LoginPage (nunca resuelve rutas antes del guard)', () => {
    render(proveer({ estado: 'anonimo', ...acciones }));

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  it('con sesión válida, pathname arbitrario resuelve a no-encontrada sin excepción', () => {
    window.history.pushState(null, '', '/algo/que/no/existe');

    expect(() =>
      render(
        proveer({
          estado: 'autenticado',
          sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
          ...acciones,
        }),
      ),
    ).not.toThrow();

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  // resultados-en-vivo, PR2 (#16; design.md D11, tasks.md 10.3). El caso de enrutamiento se
  // prueba acá; la página real (`ResultadosPage`) llega en PR3 y reemplaza este placeholder.
  it('con sesión válida, /resultados/:procesoId resuelve sin excepción (placeholder de PR2)', () => {
    window.history.pushState(null, '', '/resultados/p1');

    expect(() =>
      render(
        proveer({
          estado: 'autenticado',
          sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
          ...acciones,
        }),
      ),
    ).not.toThrow();

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });
});
