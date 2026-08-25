interface BarraProgresoVotacionProps {
  pasoActual: number;
  totalPasos: number;
}

/**
 * rediseno-boleta-votacion, PR3 (design.md D5, tasks.md 13.4). Instancia concreta del "Voting
 * Progress Indicator" del design system (`DESIGN-SYSTEM.md`): barra lineal sin etiquetas por
 * paso, montada por cada componente de paso (`PasoInformacionProceso` -> 1, `PasoBoleta` -> 2,
 * `PasoConfirmacion` -> 3) como primer hijo de su propio contenedor. `PanelComprobante` no la
 * monta (post-emisión, fuera de los 3 pasos). Presentacional puro: sin estado propio.
 */
export function BarraProgresoVotacion({ pasoActual, totalPasos }: BarraProgresoVotacionProps) {
  const porcentaje = Math.round((pasoActual / totalPasos) * 100);

  return (
    <div>
      <div
        role="progressbar"
        aria-label="Progreso de la votación"
        aria-valuemin={1}
        aria-valuemax={totalPasos}
        aria-valuenow={pasoActual}
        className="h-2 w-full overflow-hidden rounded-control bg-surface-container"
      >
        <div
          className="h-full rounded-control bg-primary transition-colors"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-caption text-on-surface-variant">
        <span>
          Paso {pasoActual} de {totalPasos}
        </span>
        <span>{porcentaje}% Completado</span>
      </div>
    </div>
  );
}
