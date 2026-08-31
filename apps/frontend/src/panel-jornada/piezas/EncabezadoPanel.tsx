import type { InstitucionDto } from '../panel-jornada-api';

interface EncabezadoPanelProps {
  nombreProceso: string | undefined;
  institucion: InstitucionDto;
}

/**
 * dashboard-panel-jornada (rediseño visual, captura de referencia del dashboard de elecciones).
 * Presentacional puro: breadcrumb + título + subtítulo con el nombre REAL del proceso
 * seleccionado — nunca un nombre de institución hardcodeado, `nombreProceso` viene del array
 * `procesos` que ya arma `PanelJornadaPage` desde `GET /procesos?estado=abierto`. Los botones de
 * acción de la referencia ("Configurar Visibilidad"/"Descargar Reporte") quedan FUERA de este
 * alcance (sólo visual, sin funcionalidad nueva) y se omiten. Mantiene visible el conteo
 * institucional que ya exponía `TarjetasResumen` (estudiantes/vínculos apoderado-estudiante), sin
 * perder esa funcionalidad.
 */
export function EncabezadoPanel({ nombreProceso, institucion }: EncabezadoPanelProps) {
  return (
    <div className="space-y-1">
      <p className="text-caption text-on-surface-variant">Elecciones Estudiantiles → Resultados Parciales</p>
      <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
        Resultados Parciales en Tiempo Real
      </h1>
      {nombreProceso ? <p className="text-body-lg text-on-surface">{nombreProceso}</p> : null}
      <p className="text-caption text-on-surface-variant">
        <span>{institucion.estudiantes}</span> estudiantes · <span>{institucion.vinculos_apoderado}</span> vínculos
        apoderado-estudiante
      </p>
    </div>
  );
}
