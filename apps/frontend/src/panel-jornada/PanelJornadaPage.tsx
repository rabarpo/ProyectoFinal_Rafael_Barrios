import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listar } from '../procesos/procesos-api';
import { useInstitucion, useResumenJornada, useVotosPorHora, useAvanceAulas } from './usePanelJornada';
import { EncabezadoPanel } from './piezas/EncabezadoPanel';
import { SelectorProcesoActivo } from './piezas/SelectorProcesoActivo';
import { FilaEstadoProceso } from './piezas/FilaEstadoProceso';
import { TarjetasMetricasProceso } from './piezas/TarjetasMetricasProceso';
import { PanelDistribucionVotos } from './piezas/PanelDistribucionVotos';
import { GraficoVotosPorHora } from './piezas/GraficoVotosPorHora';
import { TablaAvanceAulas } from './piezas/TablaAvanceAulas';

async function obtenerProcesosAbiertos() {
  const { data, response } = await listar({ estado: 'abierto' });
  if (!response.ok || !data) {
    throw new Error(`GET /procesos?estado=abierto respondió ${response.status}`);
  }
  return data;
}

/**
 * dashboard-panel-jornada (Backlog #20; rediseño visual sobre la captura de referencia del
 * dashboard de elecciones — sólo visual, reusando datos ya disponibles, sin endpoints nuevos).
 * Contenedor: la selección de proceso vive en estado de componente (`useState`), nunca en la URL
 * (D-piezas). `EncabezadoPanel` + `SelectorProcesoActivo` se montan siempre; el resto del layout
 * (`FilaEstadoProceso`, `TarjetasMetricasProceso`, `PanelDistribucionVotos`,
 * `GraficoVotosPorHora`, `TablaAvanceAulas`) sólo aparece scoped a un `procesoId` una vez elegido.
 * `fecha_cierre_prevista` (tarjeta "Cierre Est.") sale del mismo `GET /procesos?estado=abierto`
 * que ya resuelve `procesosQuery` — ningún fetch nuevo.
 */
export function PanelJornadaPage() {
  const [procesoId, setProcesoId] = useState<string | undefined>(undefined);

  const institucionQuery = useInstitucion();
  const procesosQuery = useQuery({ queryKey: ['procesos', 'abierto'], queryFn: obtenerProcesosAbiertos });
  const resumenQuery = useResumenJornada(procesoId ?? '');
  const votosPorHoraQuery = useVotosPorHora(procesoId ?? '');
  const avanceAulasQuery = useAvanceAulas(procesoId ?? '');

  if (institucionQuery.isLoading || procesosQuery.isLoading) {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface-variant md:px-12">
        Cargando…
      </p>
    );
  }

  if (institucionQuery.isError || !institucionQuery.data) {
    return (
      <p role="alert" className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface md:px-12">
        No pudimos cargar el panel de jornada.
      </p>
    );
  }

  const procesos = (procesosQuery.data ?? []).map((proceso) => ({
    id: proceso.id,
    nombre: proceso.nombre,
    fechaCierrePrevista: proceso.fecha_cierre_prevista,
  }));
  const procesoSeleccionado = procesos.find((proceso) => proceso.id === procesoId);

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-5 md:px-12">
      <EncabezadoPanel nombreProceso={procesoSeleccionado?.nombre} institucion={institucionQuery.data} />

      <SelectorProcesoActivo procesos={procesos} procesoId={procesoId} onSeleccionar={setProcesoId} />

      {procesoId && resumenQuery.data ? (
        <>
          <FilaEstadoProceso resumen={resumenQuery.data} />
          <TarjetasMetricasProceso
            resumen={resumenQuery.data}
            fechaCierrePrevista={procesoSeleccionado?.fechaCierrePrevista}
          />
          <PanelDistribucionVotos resumen={resumenQuery.data} />
        </>
      ) : null}

      {procesoId && votosPorHoraQuery.data ? (
        <GraficoVotosPorHora franjas={votosPorHoraQuery.data.franjas} />
      ) : null}

      {procesoId && avanceAulasQuery.data ? (
        <TablaAvanceAulas aulas={avanceAulasQuery.data.aulas} />
      ) : null}
    </div>
  );
}
