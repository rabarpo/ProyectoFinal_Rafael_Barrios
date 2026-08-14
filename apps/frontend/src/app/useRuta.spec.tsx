import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRuta, navegar } from './useRuta';

// [design.md D11; spec: minimal-frontend-router, "Navegación entre vistas no
// dispara recarga completa"] `useRuta` es `useSyncExternalStore` sobre
// `popstate` + un evento sintético `seei:navegacion` (pushState no dispara
// popstate). Se prueba con `history.pushState` real en jsdom, sin mocks.
function Sonda() {
  const ruta = useRuta();
  return <p data-testid="ruta">{ruta.nombre}</p>;
}

afterEach(() => {
  window.history.pushState(null, '', '/');
});

describe('useRuta / navegar', () => {
  it('navegar() actualiza useRuta() sin recarga completa del documento', () => {
    window.history.pushState(null, '', '/');
    render(<Sonda />);

    expect(screen.getByTestId('ruta')).toHaveTextContent('proceso-nuevo');

    act(() => {
      navegar({ nombre: 'procesos' });
    });

    expect(screen.getByTestId('ruta')).toHaveTextContent('procesos');
    expect(window.location.pathname).toBe('/procesos');
  });

  it('popstate (botón atrás) también actualiza useRuta()', () => {
    window.history.pushState(null, '', '/');
    render(<Sonda />);

    act(() => {
      window.history.pushState(null, '', '/procesos');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(screen.getByTestId('ruta')).toHaveTextContent('procesos');
  });
});
