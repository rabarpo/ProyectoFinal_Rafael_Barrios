import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listar } from '../procesos/procesos-api';
import { useInstitucion, useResumenJornada, useVotosPorHora, useAvanceAulas } from './usePanelJornada';
import { TarjetasResumen } from './piezas/TarjetasResumen';
import { GraficoVotosPorHora } from './piezas/GraficoVotosPorHora';
import { TablaAvanceAulas } from './piezas/TablaAvanceAulas';
import { SelectorProcesoActivo } from './piezas/SelectorProcesoActivo';

async function obtenerProcesosAbiertos() {
  const { data, response } = await listar({ estado: 'abierto' });
  if (!response.ok || !data) {
    throw new Error(`GET /procesos?estado=abierto respondió ${response.status}`);
  }
  return data;
}

/**
 * dashboard-panel-jornada (Backlog #20, PR3; design.md "Cambios de archivos", tasks.md
 * 12.1-12.3). Contenedor: la selección de proceso vive en estado de componente (`useState`),
 * nunca en la URL (D-piezas). `TarjetasResumen` institucional + `SelectorProcesoActivo` se
 * montan siempre; `GraficoVotosPorHora`/`TablaAvanceAulas` sólo aparecen scoped a un
 * `procesoId` una vez elegido (spec: "Procesos activos reutiliza el endpoint existente" — sin
 * endpoint nuevo, `GET /procesos?estado=abierto`).
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

  const procesos = (procesosQuery.data ?? []).map((proceso) => ({ id: proceso.id, nombre: proceso.nombre }));

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-5 md:px-12">
      <SelectorProcesoActivo procesos={procesos} procesoId={procesoId} onSeleccionar={setProcesoId} />

      <TarjetasResumen
        institucion={institucionQuery.data}
        resumen={procesoId ? resumenQuery.data : undefined}
      />

      {procesoId && votosPorHoraQuery.data ? (
        <GraficoVotosPorHora franjas={votosPorHoraQuery.data.franjas} />
      ) : null}

      {procesoId && avanceAulasQuery.data ? (
        <TablaAvanceAulas aulas={avanceAulasQuery.data.aulas} />
      ) : null}
    </div>
  );
}
