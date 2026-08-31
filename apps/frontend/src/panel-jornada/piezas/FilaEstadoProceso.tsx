import type { ResumenJornadaDto } from '../panel-jornada-api';
import { BadgeEstadoProceso } from './BadgeEstadoProceso';
import { BarraVotosProcesados } from './BarraVotosProcesados';

interface FilaEstadoProcesoProps {
  resumen: ResumenJornadaDto;
}

// observación del usuario: mismo tratamiento de fondo suave que `TarjetasMetricasProceso` —
// tonos DISTINTOS de la misma paleta categórica del skill de dataviz, para que ninguna de las 7
// tarjetas del dashboard repita color con las otras 4 (azul/aqua/amarillo/violeta ya usados ahí).
const COLORES_TARJETA = ['#eb6834', '#e34948', '#e87ba4']; // naranja, rojo, magenta

/**
 * dashboard-panel-jornada (rediseño visual, captura de referencia). Presentacional puro: fila de
 * 3 tarjetas — Estado del proceso / Última actualización / Votos procesados — compuestas sobre el
 * mismo `resumen` que ya recibe `PanelJornadaPage` (sin fetch propio, sin datos nuevos).
 */
export function FilaEstadoProceso({ resumen }: FilaEstadoProcesoProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div
        className="rounded-card border-t-4 p-6 shadow-elevation"
        style={{ backgroundColor: `${COLORES_TARJETA[0]}1a`, borderTopColor: COLORES_TARJETA[0] }}
      >
        <h3 className="text-label-md text-on-surface-variant">Estado del proceso</h3>
        <div className="mt-2">
          <BadgeEstadoProceso estado={resumen.estado} />
        </div>
      </div>

      <div
        className="rounded-card border-t-4 p-6 shadow-elevation"
        style={{ backgroundColor: `${COLORES_TARJETA[1]}1a`, borderTopColor: COLORES_TARJETA[1] }}
      >
        <h3 className="text-label-md text-on-surface-variant">Última actualización</h3>
        <p className="mt-2 text-headline-lg-mobile text-primary md:text-headline-lg">
          {new Date(resumen.hora_servidor).toLocaleString()}
        </p>
      </div>

      <div
        className="rounded-card border-t-4 p-6 shadow-elevation"
        style={{ backgroundColor: `${COLORES_TARJETA[2]}1a`, borderTopColor: COLORES_TARJETA[2] }}
      >
        <h3 className="text-label-md text-on-surface-variant">Votos procesados</h3>
        <div className="mt-2">
          <BarraVotosProcesados votosEmitidos={resumen.votos_emitidos} padronTotal={resumen.padron_total} />
        </div>
      </div>
    </div>
  );
}
