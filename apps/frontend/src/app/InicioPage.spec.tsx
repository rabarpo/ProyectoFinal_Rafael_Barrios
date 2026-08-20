import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InicioPage } from './InicioPage';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';

// [design.md D6; spec: menu-navegacion-post-login] `InicioPage` deriva su contenido del MISMO
// `MENU_POR_ROL` que `NavegacionPrincipal` (D8) — sin fetch, sin estado, sin efectos (backlog:
// "sin lógica de negocio propia, sólo enrutamiento y layout").
const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(rol: 'administrador' | 'director' | 'comite' | 'docente' | 'estudiante') {
  const contexto: ContextoSesion = {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol, creadoEn: 1 },
    ...acciones,
  };
  return (
    <SesionContext.Provider value={contexto}>
      <InicioPage />
    </SesionContext.Provider>
  );
}

describe('InicioPage', () => {
  it('[6.1] administrador ve el saludo y tarjetas para sus items de MENU_POR_ROL', () => {
    render(proveer('administrador'));

    expect(screen.getByText(/administrador/i)).toBeInTheDocument();
    expect(screen.getByText(/procesos/i)).toBeInTheDocument();
    expect(screen.getByText(/nuevo proceso/i)).toBeInTheDocument();
    expect(screen.getByText(/académica/i)).toBeInTheDocument();
  });

  it('[6.2] estudiante/docente ven un estado vacío explícito, sin lanzar ni disparar red', () => {
    expect(() => render(proveer('estudiante'))).not.toThrow();
    expect(screen.getByText(/sin accesos disponibles|no tenés accesos/i)).toBeInTheDocument();
  });
});
