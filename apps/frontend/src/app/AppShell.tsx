import type { ReactNode } from 'react';
import { useSesion } from '../auth/sesion-context';
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

  return (
    <div className="flex h-screen flex-col bg-background text-on-surface">
      {/* DESIGN-SYSTEM.md, "Primary (Blue): Used for headers..." — el header nunca aplicaba esto
          (quedaba en bg-surface-white). `shrink-0` fuera de la fila con scroll de abajo: no
          necesita `sticky`/offsets calculados a mano, el layout es flex-col de altura completa. */}
      <header className="z-20 shrink-0 bg-primary text-on-primary shadow-elevation">
        <div className="flex w-full items-center justify-between px-5 py-4 md:px-12">
          {rol && <span className="text-label-md text-on-primary/80">Rol: {rol}</span>}
          <button
            type="button"
            onClick={() => contexto.logout()}
            className="rounded-control px-4 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-fixed-dim hover:text-on-primary-fixed"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      {/* Rediseño (observación del usuario tras probar el sistema): NavegacionPrincipal pasó de
          barra horizontal en el header a sidebar vertical colapsable a la izquierda, con `<main>`
          ocupando el resto y con su propio scroll — el header ya no scrollea con el contenido. */}
      <div className="flex flex-1 overflow-hidden">
        <NavegacionPrincipal />
        <main className="mx-auto w-full max-w-page flex-1 overflow-y-auto px-5 py-10 md:px-12 md:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
