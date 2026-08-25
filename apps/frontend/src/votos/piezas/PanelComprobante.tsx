interface ComprobanteResumen {
  codigo_comprobante: string;
  hora_servidor: string;
  eleccion_resumen: string;
  periodo_lectivo?: string;
}

interface PanelComprobanteProps {
  comprobante: ComprobanteResumen;
  yaRegistrado?: boolean;
  onVolverAlInicio: () => void;
  onCerrarSesion: () => void;
}

/**
 * Presentacional puro (design.md D14, "Contratos HTTP", tasks.md 21.6-21.7). Muestra
 * `codigo_comprobante`, `hora_servidor` y `eleccion_resumen` — el resumen SÍ viaja al votante
 * ([ADR-0006] §2, distinto del payload de auditoría de D11, que nunca lo lleva).
 *
 * rediseno-boleta-votacion, PR4 (design.md D6, tasks.md 19.2-19.5). Jerarquía visual de éxito:
 * ícono de check + "¡Voto emitido correctamente!" + badge condicional "Ya has votado"
 * (`yaRegistrado`, reintento tras voto ya emitido). NO monta `BarraProgresoVotacion` (post-emisión,
 * fuera de los 3 pasos, design.md D5).
 *
 * fidelidad-visual-boleta-votacion, PR5 (design.md D2/D3/D7, tasks.md Phases 23-26).
 * - D2: "Período Lectivo" es condicional sobre `comprobante.periodo_lectivo` — mismo criterio que
 *   el resto de campos opcionales; si no viene, la fila no se renderiza (sin romper el resto).
 * - D3: "Estado del Sistema: Sincronizado" es un indicador puramente decorativo, SIN fuente de
 *   verdad — no verifica conectividad ni replicación real. Si algún día existe un mecanismo real,
 *   este literal debe reemplazarse, no envolverse en un condicional falso. El punto de color va
 *   `aria-hidden="true"`; el par etiqueta/valor sí se lee.
 * - D7: sigue siendo presentacional puro — las acciones ("Volver al Inicio", "Cerrar Sesión")
 *   entran por props obligatorias (`onVolverAlInicio`, `onCerrarSesion`); el componente NO llama
 *   `useSesion()`/`navegar()` internamente.
 *
 * outbox-correo-comprobante-autenticado, PR4 (design.md D12, tasks.md 14.4-14.5): la casilla de
 * "copia por correo" (proposal.md #14, paso 3) era un gesto explícito del cliente sin efecto en
 * el outbox real — ese envío es #15. Con #15 el `JobCorreo` se inserta de forma incondicional en
 * la misma transacción del voto (D3): ofrecer una casilla que el sistema ya no respeta sería
 * engañoso, así que se reemplaza por una línea informativa de copia ya enviada. Esta pieza es
 * además reutilizada tal cual por `votos/ComprobantePage.tsx` (D12) para la relectura autenticada
 * del comprobante vía el enlace del correo (`yaRegistrado` siempre `true` en esa relectura).
 */
export function PanelComprobante({ comprobante, yaRegistrado, onVolverAlInicio, onCerrarSesion }: PanelComprobanteProps) {
  return (
    <div className="mx-auto w-full max-w-page rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed text-headline-lg text-on-tertiary-fixed"
        >
          ✓
        </span>
        <h2 className="mt-3 text-headline-lg-mobile text-primary md:text-headline-lg">
          ¡Voto emitido correctamente!
        </h2>

        {yaRegistrado && (
          <span className="mt-2 rounded-control bg-secondary/10 px-3 py-1 text-label-md text-secondary">
            Ya has votado
          </span>
        )}
      </div>

      <dl className="mt-4 space-y-2 text-body-md text-on-surface">
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Comprobante</dt>
          <dd>{comprobante.codigo_comprobante}</dd>
        </div>
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Hora</dt>
          <dd>{new Date(comprobante.hora_servidor).toLocaleString()}</dd>
        </div>
        {comprobante.periodo_lectivo && (
          <div className="flex justify-between border-b border-border-gray pb-2">
            <dt className="text-on-surface-variant">Período Lectivo</dt>
            <dd>{comprobante.periodo_lectivo}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Tu elección</dt>
          <dd>{comprobante.eleccion_resumen}</dd>
        </div>
      </dl>

      <p role="status" className="mt-6 text-label-md text-on-surface-variant">
        Se envió una copia de este comprobante a tu correo institucional.
      </p>

      {/*
        D3: indicador puramente decorativo, sin condicional sobre ningún dato real del comprobante
        ni del sistema — NO verifica conectividad ni replicación. Reemplazar el literal, no
        envolverlo en un condicional falso, si algún día existe un mecanismo real de verificación.
      */}
      <div className="mt-4 flex items-center justify-center gap-2 text-body-md text-on-tertiary-fixed-variant">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-tertiary-fixed-dim" />
        <span>Estado del Sistema: Sincronizado</span>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row">
        <button
          type="button"
          onClick={onVolverAlInicio}
          className="w-full rounded-control bg-primary px-4 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary md:w-auto"
        >
          Volver al Inicio
        </button>
        <button
          type="button"
          onClick={onCerrarSesion}
          className="w-full rounded-control border border-secondary bg-surface-white px-4 py-3 text-label-md text-secondary transition-colors focus-visible:outline-2 focus-visible:outline-secondary md:w-auto"
        >
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
