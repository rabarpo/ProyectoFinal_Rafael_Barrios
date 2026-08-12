import { useEffect } from 'react';
import type { RefObject } from 'react';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Superficie mínima de `window.google.accounts.id` que este hook usa
 * (design.md D10). No es el tipado completo de la librería de Google —
 * ADR-0017 ya rechazó traer una dependencia (`@react-oauth/google`) por
 * exactamente estas dos llamadas.
 */
interface GoogleIdentityGlobal {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (respuesta: { credential: string }) => void;
      }) => void;
      renderButton: (contenedor: HTMLElement, opciones: Record<string, unknown>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityGlobal;
  }
}

// Módulo-nivel (no por instancia de hook): el script de terceros se inyecta
// UNA sola vez para todo el árbol, aunque `BotonGoogle` se monte/desmonte
// varias veces (p. ej. entre tests o entre navegaciones futuras).
let cargaScript: Promise<void> | undefined;

function cargarScriptGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (cargaScript) return cargaScript;

  cargaScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      cargaScript = undefined;
      reject(new Error('No se pudo cargar el script de Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return cargaScript;
}

interface UseGoogleIdentityOptions {
  /** `undefined`/`''` ⇒ no hace nada (fail-closed, D10) — `BotonGoogle` ya decide no montar el contenedor en ese caso. */
  clientId: string | undefined;
  /** Recibe el ID token (`credential`) devuelto por Google. */
  onCredential: (idToken: string) => void;
  contenedorRef: RefObject<HTMLDivElement | null>;
}

/**
 * Hook de efectos (design.md D10): inyecta `gsi/client` una sola vez,
 * inicializa con `client_id` y renderiza el botón oficial de Google dentro
 * de `contenedorRef`. Sin dependencia npm nueva — ~200 líneas totales entre
 * este archivo y `BotonGoogle.tsx`, mismo criterio que rechazó Passport en
 * ADR-0017.
 */
export function useGoogleIdentity({ clientId, onCredential, contenedorRef }: UseGoogleIdentityOptions): void {
  useEffect(() => {
    if (!clientId || !contenedorRef.current) return;

    let cancelado = false;
    cargarScriptGis()
      .then(() => {
        if (cancelado || !window.google || !contenedorRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (respuesta) => onCredential(respuesta.credential),
        });
        window.google.accounts.id.renderButton(contenedorRef.current, { type: 'standard' });
      })
      .catch(() => {
        // Fallo de red al cargar el script de terceros: sin botón, sin
        // romper el resto del login por código (D8/D10 no exigen reintento).
      });

    return () => {
      cancelado = true;
    };
  }, [clientId, onCredential, contenedorRef]);
}
