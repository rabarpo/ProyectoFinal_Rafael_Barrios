import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  window.localStorage.clear();
});

describe('NavegacionPrincipal', () => {
  // administracion-academica, PR1 (#26; design.md D12): "académica" deja de ser el ejemplo de
  // item "próximamente" — pasa a navegable para administrador/director/comité.
  // administracion-usuarios-apoderados, PR1 (#27; design.md D2): "usuarios" deja de ser el
  // frontend-importacion-excel, PR1 (#29; design.md D2, tasks.md 1.4): "importación excel" deja de
  // ser el último placeholder "próximamente" — pasa a item navegable con `Ruta 'importacion-excel'`
  // para `administrador`/`director`. Ya no queda ningún item `proximamente` en el mapa, así que
  // este caso pasa a cubrir la rama navegable del ítem.
  it('[1.4] el item "importación excel" es navegable y llama navegar() al hacer click', () => {
    render(proveer('administrador'));

    const boton = screen.getByRole('button', { name: /^importación excel$/i });
    expect(boton).not.toBeDisabled();

    fireEvent.click(boton);

    expect(window.location.pathname).toBe('/importacion-excel');
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

  // [rediseño: sidebar vertical colapsable, observación del usuario tras probar el sistema]
  describe('colapsar/expandir', () => {
    it('arranca expandido por defecto, muestra etiquetas de texto', () => {
      render(proveer('administrador'));

      expect(screen.getByRole('button', { name: /^procesos$/i })).toHaveTextContent('Procesos');
      expect(screen.getByRole('button', { name: /colapsar menú/i })).toBeInTheDocument();
    });

    it('al colapsar, oculta las etiquetas de texto (sólo íconos) y el botón pasa a "Expandir menú"', () => {
      render(proveer('administrador'));

      fireEvent.click(screen.getByRole('button', { name: /colapsar menú/i }));

      // El botón sigue siendo accesible por su `title`/`aria-label` aunque el texto visible
      // desaparezca — la búsqueda por name accesible debe seguir encontrándolo.
      expect(screen.queryByText('Procesos')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /expandir menú/i })).toBeInTheDocument();
    });

    it('la preferencia de colapsado persiste en localStorage entre montajes', () => {
      const { unmount } = render(proveer('administrador'));
      fireEvent.click(screen.getByRole('button', { name: /colapsar menú/i }));
      expect(window.localStorage.getItem('seei:sidebar-colapsado')).toBe('1');
      unmount();

      render(proveer('administrador'));

      expect(screen.getByRole('button', { name: /expandir menú/i })).toBeInTheDocument();
    });
  });

  // observación del usuario: colapsado + hover despliega temporalmente el menú (flyout), sin
  // persistir el cambio — al sacar el mouse vuelve a colapsarse y `localStorage` sigue en '1'.
  describe('flyout al pasar el mouse estando colapsado', () => {
    function colapsar() {
      fireEvent.click(screen.getByRole('button', { name: /colapsar menú/i }));
    }

    it('con el mouse encima, muestra las etiquetas de texto sin persistir el cambio', () => {
      render(proveer('administrador'));
      colapsar();
      expect(screen.queryByText('Procesos')).not.toBeInTheDocument();

      const aside = screen.getByRole('navigation', { name: /navegación principal/i }).closest('aside')!;
      fireEvent.mouseEnter(aside);

      expect(within(aside).getByText('Procesos')).toBeInTheDocument();
      expect(window.localStorage.getItem('seei:sidebar-colapsado')).toBe('1');
    });

    it('al sacar el mouse, vuelve a ocultar las etiquetas', () => {
      render(proveer('administrador'));
      colapsar();
      const aside = screen.getByRole('navigation', { name: /navegación principal/i }).closest('aside')!;
      fireEvent.mouseEnter(aside);
      expect(within(aside).getByText('Procesos')).toBeInTheDocument();

      fireEvent.mouseLeave(aside);

      expect(screen.queryByText('Procesos')).not.toBeInTheDocument();
    });

    it('si el menú ya está expandido (no colapsado), el hover no hace nada distinto', () => {
      render(proveer('administrador'));
      const aside = screen.getByRole('navigation', { name: /navegación principal/i }).closest('aside')!;

      fireEvent.mouseEnter(aside);

      expect(screen.getByText('Procesos')).toBeInTheDocument();
    });

    // observación del usuario: el botón expandir/colapsar debe obedecer siempre, incluso con el
    // flyout de hover ya desplegado — antes quedaba deshabilitado en ese momento.
    it('el botón "Expandir menú" funciona y persiste el cambio incluso con el flyout ya desplegado por hover', () => {
      render(proveer('administrador'));
      colapsar();
      const aside = screen.getByRole('navigation', { name: /navegación principal/i }).closest('aside')!;
      fireEvent.mouseEnter(aside);
      expect(within(aside).getByText('Procesos')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /expandir menú/i }));

      expect(window.localStorage.getItem('seei:sidebar-colapsado')).toBe('0');
      expect(screen.getByRole('button', { name: /colapsar menú/i })).toBeInTheDocument();
      // sigue expandido tras sacar el mouse, porque ya no está colapsado
      fireEvent.mouseLeave(aside);
      expect(screen.getByText('Procesos')).toBeInTheDocument();
    });
  });

  // observación del usuario: para estudiante, "/" (ruta `inicio`) monta MisVotacionesPage
  // (Enrutador.tsx) — el ítem "Mis votaciones" del menú debe verse activo ahí desde el inicio,
  // aunque la URL siga siendo `inicio` y no `mis-votaciones`.
  it('para estudiante, "Mis votaciones" aparece activo en la ruta raíz "/" desde el inicio', () => {
    window.history.pushState(null, '', '/');

    render(proveer('estudiante'));

    expect(screen.getByRole('button', { name: /mis votaciones/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('resalta el item de la ruta actual con aria-current="page"', () => {
    window.history.pushState(null, '', '/academica');

    render(proveer('administrador'));

    expect(screen.getByRole('button', { name: /^académica$/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: /^procesos$/i })).not.toHaveAttribute('aria-current');
  });
});
