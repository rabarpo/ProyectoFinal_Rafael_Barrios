interface BarraVotosProcesadosProps {
  votosEmitidos: number;
  padronTotal: number;
}

/**
 * dashboard-panel-jornada (rediseño visual). Presentacional puro: deriva el porcentaje de
 * `votosEmitidos / padronTotal` (misma fórmula que `PanelParticipacion`, resultados-en-vivo #16)
 * y lo refleja tanto en texto como en el ancho de la barra de progreso. `padronTotal === 0` no
 * divide por cero.
 */
export function BarraVotosProcesados({ votosEmitidos, padronTotal }: BarraVotosProcesadosProps) {
  const porcentaje = padronTotal > 0 ? (votosEmitidos / padronTotal) * 100 : 0;

  return (
    <div>
      <p className="text-headline-lg-mobile text-primary md:text-headline-lg">{porcentaje.toFixed(1)}%</p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-container">
        <div
          data-testid="barra-votos-procesados-relleno"
          className="h-full rounded-full bg-primary"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}
