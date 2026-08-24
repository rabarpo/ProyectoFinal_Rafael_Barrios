import { useEffect, useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { MENU_POR_ROL } from './menu-por-rol';
import { navegar, useRuta } from './useRuta';
import { IconoInstitucion, IconoUsuario, IconoCandado } from '../auth/iconos';
import { IconoColapsar, IconoConfiguracion, IconoExpandir, IconoImportacion, IconoPanel, IconoProcesoNuevo, IconoProcesos, IconoVotaciones } from './iconos-menu';

const CLAVE_COLAPSADO = 'seei:sidebar-colapsado';

const ICONO_POR_ID: Record<string, typeof IconoProcesos> = {
  procesos: IconoProcesos,
  'proceso-nuevo': IconoProcesoNuevo,
  academica: IconoInstitucion,
  usuarios: IconoUsuario,
  'cuentas-bloqueadas': IconoCandado,
  configuracion: IconoConfiguracion,
  'importacion-excel': IconoImportacion,
  'panel-jornada': IconoPanel,
  'mis-votaciones': IconoVotaciones,
};

function leerPreferenciaColapsado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_COLAPSADO) === '1';
  } catch {
    // Privacidad estricta del navegador o localStorage inaccesible: se degrada a expandido, no
    // es una preferencia crítica que valga la pena romper la pantalla por ella.
    return false;
  }
}

/**
 * design.md D4/D5/D7 (extendido en revisión manual: pasó de barra horizontal en el header a
 * sidebar vertical colapsable, observación del usuario tras probar el sistema). Lee `rol` desde
 * `useSesion()` y renderiza `MENU_POR_ROL[rol]` — única fuente compartida con `InicioPage` (D6/D8,
 * sin cambios). Items `navegable` llaman `navegar(item.ruta)`; items `proximamente` son un
 * `<button disabled>` sin `href`/`onClick` ni `Ruta` asociada (D5). `MENU_POR_ROL[rol] ?? []` cubre
 * defensivamente un rol sin entrada en el mapa.
 *
 * Colapsado: preferencia puramente visual (ancho de la barra, iconos con o sin etiqueta), no dato
 * de sesión — se persiste en `localStorage` (no hay nada sensible: es sólo "qué tan angosta la
 * quiere el usuario", a diferencia de la sesión de `AuthProvider`, que nunca toca `localStorage`
 * por la razón de seguridad documentada ahí).
 */
export function NavegacionPrincipal() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const items = rol ? (MENU_POR_ROL[rol] ?? []) : [];
  const rutaActual = useRuta();

  const [colapsado, setColapsado] = useState(leerPreferenciaColapsado);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_COLAPSADO, colapsado ? '1' : '0');
    } catch {
      // Ídem leerPreferenciaColapsado: si no se puede persistir, la sesión igual funciona.
    }
  }, [colapsado]);

  if (items.length === 0) return null;

  return (
    <aside
      className={
        'flex h-full shrink-0 flex-col overflow-hidden border-r border-border-gray bg-surface-white transition-[width] ' +
        (colapsado ? 'w-16' : 'w-64')
      }
    >
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Navegación principal">
        {items.map((item) => {
          const Icono = ICONO_POR_ID[item.id];
          const activo = item.clase === 'navegable' && rutaActual.nombre === item.ruta.nombre;

          return item.clase === 'navegable' ? (
            <button
              key={item.id}
              type="button"
              title={colapsado ? item.etiqueta : undefined}
              aria-current={activo ? 'page' : undefined}
              onClick={() => navegar(item.ruta)}
              className={
                'flex items-center gap-3 rounded-control px-3 py-3 text-left text-label-md transition-colors ' +
                (activo
                  ? 'bg-primary text-on-primary'
                  : 'text-primary hover:bg-primary/10')
              }
            >
              <Icono className="size-5 shrink-0" />
              {!colapsado && <span className="truncate">{item.etiqueta}</span>}
            </button>
          ) : (
            <button
              key={item.id}
              type="button"
              disabled
              title={colapsado ? `${item.etiqueta} · Próximamente` : undefined}
              className="flex items-center gap-3 rounded-control px-3 py-3 text-left text-label-md text-on-surface-variant"
            >
              <Icono className="size-5 shrink-0" />
              {!colapsado && (
                <span className="truncate">
                  {item.etiqueta} <span className="text-caption">· Próximamente</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setColapsado((valor) => !valor)}
        aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
        className="flex items-center gap-3 border-t border-border-gray px-3 py-3 text-label-md text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
      >
        {colapsado ? <IconoExpandir className="size-5 shrink-0" /> : <IconoColapsar className="size-5 shrink-0" />}
        {!colapsado && <span>Colapsar</span>}
      </button>
    </aside>
  );
}
