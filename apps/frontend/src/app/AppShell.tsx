import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useSesion } from '../auth/sesion-context';
import { urlLogo } from '../configuracion/configuracion-api';
import { NavegacionPrincipal } from './NavegacionPrincipal';

/**
 * Shell de layout de app de escritorio (design.md D8 original de menu-navegacion-post-login,
 * #25, extendido en revisión manual): header horizontal fijo arriba con el rol de la sesión y
 * "Cerrar sesión"; debajo, `NavegacionPrincipal` como sidebar vertical colapsable a la izquierda
 * y `<main>` con `children` a la derecha, cada uno con su propio scroll (`flex h-screen flex-col`
 * + fila `flex-1 overflow-hidden`). Sin submenús ni rutas anidadas. Solo se monta detrás de
 * `AuthGuard`, así que siempre hay sesión.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : null;
  const [logoRoto, setLogoRoto] = useState(false);

  // bug reportado por el usuario, diagnosticado con datos reales de consola (no a ciegas):
  // `document.body.style.overflow = 'hidden'` NO alcanza — Chrome fija a qué elemento se le aplica
  // la propagación de overflow del body al viewport en el layout INICIAL; cambiarlo después vía JS
  // (en un efecto, ya montado) no hace que el navegador reconsidere esa asignación. Confirmado en
  // consola: con el fix anterior, `document.body.scrollHeight` (730) sí quedaba igual a
  // `window.innerHeight` (730) — el body estaba bien — pero `document.documentElement.scrollHeight`
  // seguía en 2738 con `overflow: visible`: es `<html>`, no `<body>`, el que de verdad scrollea.
  // Bloqueando `<html>` directamente el scroll queda forzosamente en `<main>` (`overflow-y-auto`),
  // la intención original del layout. Se restaura al desmontar (logout / vuelta a `LoginPage`).
  useEffect(() => {
    const html = document.documentElement;
    const overflowHtmlOriginal = html.style.overflow;
    const overflowBodyOriginal = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = overflowHtmlOriginal;
      document.body.style.overflow = overflowBodyOriginal;
    };
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-on-surface">
      {/* DESIGN-SYSTEM.md, "Primary (Blue): Used for headers..." — el header nunca aplicaba esto
          (quedaba en bg-surface-white). `shrink-0` fuera de la fila con scroll de abajo: no
          necesita `sticky`/offsets calculados a mano, el layout es flex-col de altura completa. */}
      <header className="z-20 shrink-0 bg-primary text-on-primary shadow-elevation">
        {/* observación del usuario: altura reducida otro 75% (py-3 → py-2), botón "Cerrar sesión"
            en la misma proporción (px-4 py-3 → px-3 py-2) para que siga viéndose acorde a la
            cabecera más angosta. Logo institucional a la izquierda (misma fuente que el Paso 1,
            `GET /configuracion/logo`; sin fallback visual si no hay logo configurado — a
            diferencia del hero del Paso 1, acá es solo un ícono chico, se omite sin más). */}
        <div className="flex w-full items-center justify-between gap-3 px-5 py-2 md:px-12">
          <div className="flex items-center gap-3">
            {!logoRoto && (
              <img
                src={urlLogo()}
                alt="Logo institucional"
                onError={() => setLogoRoto(true)}
                className="h-7 w-auto rounded-control object-contain"
              />
            )}
            {rol && <span className="text-label-md text-on-primary/80">Rol: {rol}</span>}
          </div>
          <button
            type="button"
            onClick={() => contexto.logout()}
            className="rounded-control px-3 py-2 text-label-md text-on-primary transition-colors hover:bg-primary-fixed-dim hover:text-on-primary-fixed"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      {/* Rediseño (observación del usuario tras probar el sistema): NavegacionPrincipal pasó de
          barra horizontal en el header a sidebar vertical colapsable a la izquierda, con `<main>`
          ocupando el resto y con su propio scroll — el header ya no scrollea con el contenido. */}
      {/* bug reportado por el usuario: "dos scroll, el del navegador y el interno" — un ítem flex
          sin `min-height: 0` no se encoge por debajo del alto intrínseco de su contenido aunque el
          padre tenga `overflow-hidden` (default CSS `min-height: auto` en flex items). Con
          contenido lo bastante alto (Paso 2 con fotos de candidato) esta fila crecía más allá de
          `h-screen`, empujando scroll a `<body>` además del propio de `<main>`. Paso 1 nunca llegó
          a ser tan alto, por eso no se notaba ahí. `min-h-0` en ambos niveles fuerza a que SOLO
          `overflow-y-auto` de `<main>` scrollee. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavegacionPrincipal />
        <main className="mx-auto min-h-0 w-full max-w-page flex-1 overflow-y-auto px-5 py-10 md:px-12 md:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
