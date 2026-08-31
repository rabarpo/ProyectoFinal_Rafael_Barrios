import { useEffect, useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { MENU_POR_ROL } from './menu-por-rol';
import { navegar, useRuta } from './useRuta';
import { IconoInstitucion, IconoUsuario, IconoCandado } from '../auth/iconos';
import { IconoColapsar, IconoConfiguracion, IconoExpandir, IconoImportacion, IconoPanel, IconoProcesoNuevo, IconoProcesos, IconoVotaciones } from './iconos-menu';

const CLAVE_COLAPSADO = 'seei:sidebar-colapsado';
const ANCHO_COLAPSADO = '4rem';
const ANCHO_EXPANDIDO = '16rem';

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
 *
 * observación del usuario — aspecto más profesional + flyout on-hover: el ítem activo pasa de
 * relleno sólido a un acento lateral + tinte suave (patrón común en paneles tipo Linear/Notion,
 * menos "botón", más "indicador de sección actual"). Con el menú colapsado, pasar el mouse por
 * encima lo despliega temporalmente SIN persistir el cambio (`hoverExpandido`, estado aparte de
 * `colapsado`): el contenedor reservado en el layout (`div` externo) mantiene siempre el ancho
 * colapsado real, y el `<aside>` se vuelve `absolute` sólo mientras dura el hover, flotando sobre
 * `<main>` sin empujarlo ni angostarlo.
 */
export function NavegacionPrincipal() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const items = rol ? (MENU_POR_ROL[rol] ?? []) : [];
  const rutaActual = useRuta();

  const [colapsado, setColapsado] = useState(leerPreferenciaColapsado);
  const [hoverExpandido, setHoverExpandido] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_COLAPSADO, colapsado ? '1' : '0');
    } catch {
      // Ídem leerPreferenciaColapsado: si no se puede persistir, la sesión igual funciona.
    }
  }, [colapsado]);

  if (items.length === 0) return null;

  const desplegado = !colapsado || hoverExpandido;
  const flotando = colapsado && hoverExpandido;

  return (
    <div
      className="relative h-full shrink-0 transition-[width]"
      style={{ width: colapsado ? ANCHO_COLAPSADO : ANCHO_EXPANDIDO }}
    >
      <aside
        onMouseEnter={() => colapsado && setHoverExpandido(true)}
        onMouseLeave={() => setHoverExpandido(false)}
        className={
          'flex h-full flex-col overflow-hidden border-r border-border-gray bg-surface-white transition-[width] ' +
          (flotando ? 'absolute inset-y-0 left-0 z-30 shadow-elevation' : 'relative')
        }
        style={{ width: desplegado ? ANCHO_EXPANDIDO : ANCHO_COLAPSADO }}
      >
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Navegación principal">
          {items.map((item) => {
            const Icono = ICONO_POR_ID[item.id];
            // observación del usuario: para el rol estudiante, "/" (ruta `inicio`) monta
            // `MisVotacionesPage` (ver Enrutador.tsx), no `InicioPage` — pero la URL sigue siendo
            // `inicio`, así que sin este caso especial el ítem "Mis votaciones" nunca se marcaba
            // activo al aterrizar ahí.
            const activo =
              item.clase === 'navegable' &&
              (rutaActual.nombre === item.ruta.nombre ||
                (rol === 'estudiante' && rutaActual.nombre === 'inicio' && item.ruta.nombre === 'mis-votaciones'));

            return item.clase === 'navegable' ? (
              <button
                key={item.id}
                type="button"
                title={desplegado ? undefined : item.etiqueta}
                aria-current={activo ? 'page' : undefined}
                onClick={() => navegar(item.ruta)}
                className={
                  'flex items-center gap-3 rounded-control border-l-4 py-2.5 pl-2.5 pr-3 text-left text-label-md font-medium transition-colors ' +
                  (activo
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent text-on-surface-variant hover:bg-surface-container hover:text-primary')
                }
              >
                <Icono className="size-5 shrink-0" />
                {desplegado && <span className="truncate">{item.etiqueta}</span>}
              </button>
            ) : (
              <button
                key={item.id}
                type="button"
                disabled
                title={desplegado ? undefined : `${item.etiqueta} · Próximamente`}
                className="flex items-center gap-3 rounded-control border-l-4 border-transparent py-2.5 pl-2.5 pr-3 text-left text-label-md text-on-surface-variant/60"
              >
                <Icono className="size-5 shrink-0" />
                {desplegado && (
                  <span className="truncate">
                    {item.etiqueta} <span className="text-caption">· Próximamente</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* observación del usuario: sin el texto "Colapsar" — solo el ícono, más grande, para que
            resalte más (mismo aria-label para el nombre accesible, el control sigue siendo un
            botón real). El botón SIEMPRE obedece, incluso con el flyout de hover desplegado: si se
            clickea "Expandir" mientras `flotando` está activo, `colapsado` pasa a `false` y el
            flyout se resuelve solo a estado expandido persistido (misma medida ANCHO_EXPANDIDO en
            ambos casos, sin salto visual) — no tenía sentido bloquear la acción explícita del
            usuario solo porque el hover ya lo estaba mostrando temporalmente. */}
        <button
          type="button"
          onClick={() => setColapsado((valor) => !valor)}
          aria-label={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          title={colapsado ? 'Expandir menú' : 'Colapsar menú'}
          className="flex items-center justify-center border-t border-border-gray py-2.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
        >
          {colapsado ? <IconoExpandir className="size-7 shrink-0" /> : <IconoColapsar className="size-7 shrink-0" />}
        </button>
      </aside>
    </div>
  );
}
