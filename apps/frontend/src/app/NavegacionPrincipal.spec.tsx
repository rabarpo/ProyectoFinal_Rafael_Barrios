import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavegacionPrincipal } from './NavegacionPrincipal';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';

// [design.md D4/D5/D7; spec: menu-navegacion-post-login] `NavegacionPrincipal` lee `rol` desde
// `useSesion()` y renderiza `MENU_POR_ROL[rol]`: items navegables llaman `navegar()`, items
// `proximamente` son un `<button disabled>` sin `href`/`onClick` — el DOM no navega aunque se
// fuerce el click.
const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(rol: 'administrador' | 'director' | 'comite' | 'docente' | 'estudiante') {
  const contexto: ContextoSesion = {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol, creadoEn: 1 },
    ...acciones,
  };
  return (
    <SesionContext.Provider value={contexto}>
      <NavegacionPrincipal />
    </SesionContext.Provider>
  );
}

afterEach(() => {
  window.history.pushState(null, '', '/');
});

describe('NavegacionPrincipal', () => {
  it('[5.1] un item "próximamente" se renderiza deshabilitado y no navega al hacer click', () => {
    render(proveer('administrador'));

    const boton = screen.getByRole('button', { name: /académica/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveTextContent(/próximamente/i);

    fireEvent.click(boton);

    expect(window.location.pathname).toBe('/');
  });

  it('[5.2] un rol sin items (docente/estudiante) renderiza sin lanzar y sin items', () => {
    expect(() => render(proveer('docente'))).not.toThrow();
    expect(screen.queryAllByRole('button')).toHaveLength(0);

    expect(() => render(proveer('estudiante'))).not.toThrow();
  });

  it('[5.3] un item navegable llama navegar() y actualiza la ruta al hacer click', () => {
    render(proveer('administrador'));

    fireEvent.click(screen.getByRole('button', { name: /^procesos$/i }));

    expect(window.location.pathname).toBe('/procesos');
  });

  // [design.md, threat matrix "Enrutamiento (cliente)"; spec.md "Comportamiento defensivo ante
  // rol sin entrada en el mapa"; tasks.md 8.3] Un rol inesperado (desalineado con `MENU_POR_ROL`)
  // no debe lanzar ni dejar el resto del shell roto — el `?? []` de D2 cubre este caso.
  it('[8.3] un rol sin entrada en MENU_POR_ROL no lanza y no muestra items', () => {
    const contexto: ContextoSesion = {
      estado: 'autenticado',
      sesion: { userId: 'u1', rol: 'rol-inesperado' as never, creadoEn: 1 },
      ...acciones,
    };

    expect(() =>
      render(
        <SesionContext.Provider value={contexto}>
          <NavegacionPrincipal />
        </SesionContext.Provider>,
      ),
    ).not.toThrow();

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
