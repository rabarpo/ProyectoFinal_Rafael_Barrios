import type { ResumenJornadaDto } from '../panel-jornada-api';
import { GraficoDesglose } from '../../resultados/piezas/GraficoDesglose';

interface PanelDistribucionVotosProps {
  resumen: ResumenJornadaDto;
}

/**
 * dashboard-panel-jornada (rediseño visual, captura de referencia). Presentacional puro: en modo
 * visible reusa `GraficoDesglose` (resultados-en-vivo #16, PR4) con `dimension`/`desglose`/
 * `blancos` del resumen, cruzando de `resultados/piezas/` a `panel-jornada/piezas/` (sin barrels
 * que lo impidan). En modo oculto muestra un aviso simple (mismo texto que
 * `AvisoResultadosOcultos`, sin reusar el componente literal porque no calza en este layout de
 * tarjeta), nunca ambos a la vez.
 */
export function PanelDistribucionVotos({ resumen }: PanelDistribucionVotosProps) {
  if (
    resumen.estado_visibilidad === 'visible' &&
    resumen.dimension &&
    resumen.desglose &&
    resumen.blancos !== undefined
  ) {
    return <GraficoDesglose dimension={resumen.dimension} desglose={resumen.desglose} blancos={resumen.blancos} />;
  }

  return (
    <div role="status" className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Distribución de Votos</h2>
      <p className="mt-4 text-body-md text-on-surface">
        Los resultados permanecen ocultos hasta el cierre del proceso.
      </p>
    </div>
  );
}
