import { useSesion } from '../auth/sesion-context';
import { MENU_POR_ROL } from './menu-por-rol';
import { navegar } from './useRuta';

/**
 * design.md D4/D5/D7: barra horizontal dentro del `<header>` de `AppShell`, apilada en móvil.
 * Lee `rol` desde `useSesion()` y renderiza `MENU_POR_ROL[rol]` — única fuente compartida con
 * `InicioPage` (D6/D8). Items `navegable` llaman `navegar(item.ruta)`; items `proximamente` son
 * un `<button disabled>` sin `href`/`onClick` ni `Ruta` asociada (D5: el DOM no navega aunque se
 * fuerce el click, y no hay ruta que forzar). `MENU_POR_ROL[rol] ?? []` cubre defensivamente un
 * rol sin entrada en el mapa (threat matrix "Enrutamiento (cliente)"; spec.md "Comportamiento
 * defensivo ante rol sin entrada en el mapa"). Tokens exclusivamente de `index.css` (D7).
 */
export function NavegacionPrincipal() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const items = rol ? (MENU_POR_ROL[rol] ?? []) : [];

  if (items.length === 0) return null;

  return (
    <nav className="mx-auto flex w-full max-w-page flex-col gap-2 px-5 pb-4 md:flex-row md:items-center md:gap-4 md:px-12">
      {items.map((item) =>
        item.clase === 'navegable' ? (
          <button
            key={item.id}
            type="button"
            onClick={() => navegar(item.ruta)}
            className="rounded-control px-4 py-3 text-left text-label-md text-on-primary transition-colors hover:bg-primary-fixed-dim hover:text-on-primary-fixed"
          >
            {item.etiqueta}
          </button>
        ) : (
          <button
            key={item.id}
            type="button"
            disabled
            className="rounded-control px-4 py-3 text-left text-label-md text-on-primary-container"
          >
            {item.etiqueta} <span className="text-caption">· Próximamente</span>
          </button>
        ),
      )}
    </nav>
  );
}
