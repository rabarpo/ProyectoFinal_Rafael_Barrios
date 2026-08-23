import { useProyeccion } from './usePanelJornada';
import { GraficoVotosPorHora } from './piezas/GraficoVotosPorHora';
import { TablaAvanceAulas } from './piezas/TablaAvanceAulas';

interface ProyeccionPageProps {
  procesoId: string;
}

/**
 * dashboard-panel-jornada (Backlog #20, PR4; design.md D10, tasks.md 14.1-14.3; spec: "Modo
 * proyección sin desglose por candidato"/"Proyección no expone controles"). Contenedor de
 * kiosco: sondea con `useProyeccion` (`INTERVALO_PROYECCION_MS`, 30 s), SIN controles
 * interactivos — sin `SelectorProcesoActivo`, sin botones ni filtros de ningún tipo. Se monta
 * FUERA de `AppShell` (D10, `App.tsx`/`RUTAS_SIN_SHELL`). El servidor ya garantiza que el
 * payload nunca trae desglose por candidato (D8); este componente sólo consume `franjas`/`aulas`
 * — nunca `desglose`/`blancos`/`dimension`, que ni siquiera existen en `ProyeccionDto`.
 */
export function ProyeccionPage({ procesoId }: ProyeccionPageProps) {
  const { data, isLoading, isError } = useProyeccion(procesoId);

  if (isLoading) {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface-variant md:px-12">
        Cargando…
      </p>
    );
  }

  if (isError || !data) {
    return (
      <p role="alert" className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface md:px-12">
        No pudimos cargar la proyección.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-5 py-6 md:px-12">
      <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
        <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">Proyección</h1>
        <dl className="mt-4 flex justify-between text-body-md text-on-surface">
          <div>
            <dt className="text-on-surface-variant">Votos emitidos</dt>
            <dd>{data.votos_emitidos}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Padrón total</dt>
            <dd>{data.padron_total}</dd>
          </div>
        </dl>
      </div>

      <GraficoVotosPorHora franjas={data.franjas} />
      <TablaAvanceAulas aulas={data.aulas} />
    </div>
  );
}
