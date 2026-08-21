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
  // administracion-academica, PR1 (#26; design.md D12): "académica" deja de ser el ejemplo de
  // item "próximamente" — pasa a navegable para administrador/director/comité.
  // administracion-usuarios-apoderados, PR1 (#27; design.md D2): "usuarios" deja de ser el
  // ejemplo de placeholder deshabilitado (pasa a navegable, ver [3.1] abajo).
  // frontend-configuracion-general, PR1 (#28; design.md D2, tasks.md 4.4): "configuracion" deja
  // de ser el ejemplo de placeholder (pasa a navegable, ver [3.1] de #28 en menu-por-rol.spec.ts)
  // — se usa "importacion-excel" como ejemplo de item "próximamente" que sigue sin construirse.
  it('[5.1] un item "próximamente" se renderiza deshabilitado y no navega al hacer click', () => {
    render(proveer('administrador'));

    const boton = screen.getByRole('button', { name: /importación excel/i });
    expect(boton).toBeDisabled();
    expect(boton).toHaveTextContent(/próximamente/i);

    fireEvent.click(boton);

    expect(window.location.pathname).toBe('/');
  });

  // frontend-configuracion-general, PR1 (#28; design.md D2, tasks.md 4.4).
  it('[4.4] el item "configuración" es navegable y llama navegar() al hacer click', () => {
    render(proveer('administrador'));

    fireEvent.click(screen.getByRole('button', { name: /^configuración$/i }));

    expect(window.location.pathname).toBe('/configuracion');
  });

  it('[2.1] el item "académica" es navegable y llama navegar() al hacer click', () => {
    render(proveer('administrador'));

    fireEvent.click(screen.getByRole('button', { name: /^académica$/i }));

    expect(window.location.pathname).toBe('/academica');
  });

  // administracion-usuarios-apoderados, PR1 (#27; design.md D2, tasks.md 3.1).
  it('[3.1] el item "usuarios" es navegable y llama navegar() al hacer click', () => {
    render(proveer('administrador'));

    fireEvent.click(screen.getByRole('button', { name: /^usuarios$/i }));

    expect(window.location.pathname).toBe('/usuarios');
  });

  // administracion-usuarios-apoderados, PR1 (#27; design.md D2, tasks.md 3.2).
  it('[3.2] el item "cuentas bloqueadas" es navegable sólo para comite', () => {
    render(proveer('comite'));

    fireEvent.click(screen.getByRole('button', { name: /^cuentas bloqueadas$/i }));

    expect(window.location.pathname).toBe('/cuentas-bloqueadas');
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
