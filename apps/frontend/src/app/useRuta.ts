import { useSyncExternalStore } from 'react';
import { parsearRuta, rutaAPath } from './rutas';
import type { Ruta } from './rutas';

/**
 * design.md D10/D11: `useSyncExternalStore` suscrito a `popstate` (botón
 * atrás) y a un evento sintético `seei:navegacion`, porque `pushState` NO
 * dispara `popstate` por sí mismo.
 */
const EVENTO_NAVEGACION = 'seei:navegacion';

function suscribir(alCambiar: () => void): () => void {
  window.addEventListener('popstate', alCambiar);
  window.addEventListener(EVENTO_NAVEGACION, alCambiar);
  return () => {
    window.removeEventListener('popstate', alCambiar);
    window.removeEventListener(EVENTO_NAVEGACION, alCambiar);
  };
}

function obtenerPathname(): string {
  return window.location.pathname;
}

export function useRuta(): Ruta {
  const pathname = useSyncExternalStore(suscribir, obtenerPathname);
  return parsearRuta(pathname);
}

export function navegar(ruta: Ruta): void {
  window.history.pushState(null, '', rutaAPath(ruta));
  window.dispatchEvent(new Event(EVENTO_NAVEGACION));
}
