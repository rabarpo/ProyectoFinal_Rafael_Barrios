import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from './AppShell';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';

// [D8] AppShell es de un solo nivel: encabezado con el rol de la sesión y
// "Cerrar sesión", más un <main> que recibe children. Sin navegación, sin
// menú (Out of Scope de la propuesta).
function proveer(contexto: ContextoSesion, children: React.ReactNode) {
  return (
    <SesionContext.Provider value={contexto}>
      <AppShell>{children}</AppShell>
    </SesionContext.Provider>
  );
}

describe('AppShell', () => {
  it('muestra el rol de la sesión activa y renderiza los children en <main>', () => {
    const contexto: ContextoSesion = {
      estado: 'autenticado',
      sesion: { userId: 'u1', rol: 'director', creadoEn: 1 },
      login: vi.fn(),
      google: vi.fn(),
      logout: vi.fn(),
      alRecibir401: vi.fn(),
    };

    render(proveer(contexto, <p>Contenido del asistente</p>));

    expect(screen.getByText(/director/i)).toBeInTheDocument();
    expect(screen.getByText('Contenido del asistente')).toBeInTheDocument();
  });

  it('invoca logout() al activar "Cerrar sesión"', () => {
    const logout = vi.fn();
    const contexto: ContextoSesion = {
      estado: 'autenticado',
      sesion: { userId: 'u1', rol: 'comite', creadoEn: 1 },
      login: vi.fn(),
      google: vi.fn(),
      logout,
      alRecibir401: vi.fn(),
    };

    render(proveer(contexto, <p>Contenido</p>));
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    expect(logout).toHaveBeenCalledTimes(1);
  });
});
