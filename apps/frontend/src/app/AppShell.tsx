import type { ReactNode } from 'react';
import { useSesion } from '../auth/sesion-context';

/**
 * Shell de un solo nivel (design.md D8, "Integración con el app shell"):
 * encabezado con el rol de la sesión y "Cerrar sesión", `<main>` con
 * children. Sin navegación, sin menú — fuera de alcance de la propuesta.
 * Solo se monta detrás de `AuthGuard`, así que siempre hay sesión.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : null;

  return (
    <div>
      <header>
        {rol && <span>Rol: {rol}</span>}
        <button type="button" onClick={() => contexto.logout()}>
          Cerrar sesión
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}
