import type { ReactNode } from 'react';
import { useSesion } from '../auth/sesion-context';
import { NavegacionPrincipal } from './NavegacionPrincipal';

/**
 * Shell de un solo nivel (design.md D8, "Integración con el app shell"):
 * encabezado con el rol de la sesión y "Cerrar sesión", `<main>` con
 * children. menu-navegacion-post-login (#25; design.md D4): monta
 * `NavegacionPrincipal` en una segunda fila del `<header>` — navegación
 * principal por rol, sin submenús ni rutas anidadas. Solo se monta detrás
 * de `AuthGuard`, así que siempre hay sesión.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : null;

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="border-b border-border-gray bg-surface-white">
        <div className="mx-auto flex w-full max-w-page items-center justify-between px-5 py-4 md:px-12">
          {rol && (
            <span className="text-label-md text-on-surface-variant">Rol: {rol}</span>
          )}
          <button
            type="button"
            onClick={() => contexto.logout()}
            className="rounded-control px-4 py-3 text-label-md text-primary"
          >
            Cerrar sesión
          </button>
        </div>
        <NavegacionPrincipal />
      </header>
      <main className="mx-auto w-full max-w-page px-5 py-10 md:px-12 md:py-12">{children}</main>
    </div>
  );
}
