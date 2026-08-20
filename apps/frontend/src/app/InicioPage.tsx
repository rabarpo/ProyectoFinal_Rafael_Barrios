import { useSesion } from '../auth/sesion-context';
import { MENU_POR_ROL } from './menu-por-rol';
import { navegar } from './useRuta';

/**
 * design.md D6: saludo por rol + grid de tarjetas derivado del MISMO `MENU_POR_ROL` que
 * `NavegacionPrincipal` (D8: una sola fuente para nav y home). Sin `useEffect`, sin fetch, sin
 * estado local — el backlog fija "sin lógica de negocio propia, sólo enrutamiento y layout".
 * Estado vacío explícito para `docente`/`estudiante` (spec.md: "aterriza en inicio sin items de
 * gestión"). `MENU_POR_ROL[rol] ?? []` cubre defensivamente un rol sin entrada en el mapa.
 */
export function InicioPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const items = rol ? (MENU_POR_ROL[rol] ?? []) : [];

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
        {rol ? `Hola, ${rol}` : 'Hola'}
      </h1>

      {items.length === 0 && (
        <p className="mt-4 text-body-md text-on-surface-variant">
          Todavía no tenés accesos disponibles en esta sección.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) =>
            item.clase === 'navegable' ? (
              <button
                key={item.id}
                type="button"
                onClick={() => navegar(item.ruta)}
                className="rounded-card border border-border-gray bg-surface-white p-6 text-left shadow-elevation transition-colors hover:bg-surface-container"
              >
                <p className="text-label-md text-on-surface">{item.etiqueta}</p>
              </button>
            ) : (
              <div
                key={item.id}
                className="rounded-card border border-border-gray bg-surface-container p-6 text-left"
              >
                <p className="text-label-md text-on-surface-variant">{item.etiqueta}</p>
                <p className="mt-1 text-caption text-on-surface-variant">Próximamente</p>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
