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
      {/* DESIGN-SYSTEM.md, "Primary (Blue): Used for headers..." — el header nunca aplicaba esto
          (quedaba en bg-surface-white). sticky top-0 lo fija arriba durante el scroll; z-20 lo
          mantiene por encima del contenido de <main>. */}
      <header className="sticky top-0 z-20 bg-primary text-on-primary shadow-elevation">
        <div className="mx-auto flex w-full max-w-page items-center justify-between px-5 py-4 md:px-12">
          {rol && <span className="text-label-md text-on-primary/80">Rol: {rol}</span>}
          <button
            type="button"
            onClick={() => contexto.logout()}
            className="rounded-control px-4 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-fixed-dim hover:text-on-primary-fixed"
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
