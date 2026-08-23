import type { InstitucionDto, ResumenJornadaDto } from '../panel-jornada-api';

interface TarjetasResumenProps {
  institucion: InstitucionDto;
  resumen?: ResumenJornadaDto;
}

/**
 * dashboard-panel-jornada (Backlog #20, PR3; design.md "Cambios de archivos", tasks.md
 * 11.1/11.5). Presentacional pura, sin hooks de datos (idioma de `resultados/piezas/`). La
 * tarjeta institucional se monta SIEMPRE (`institucion`, sin proceso); la tarjeta de resumen
 * scoped por proceso sólo aparece cuando `PanelJornadaPage` ya tiene un `resumen` (proceso
 * seleccionado, tasks.md 12.1-12.2).
 */
export function TarjetasResumen({ institucion, resumen }: TarjetasResumenProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
        <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Institución</h2>
        <dl className="mt-4 space-y-2 text-body-md text-on-surface">
          <div className="flex justify-between border-b border-border-gray pb-2">
            <dt className="text-on-surface-variant">Estudiantes</dt>
            <dd>{institucion.estudiantes}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-on-surface-variant">Vínculos apoderado-estudiante</dt>
            <dd>{institucion.vinculos_apoderado}</dd>
          </div>
        </dl>
      </div>

      {resumen ? (
        <div
          data-testid="tarjeta-resumen-proceso"
          className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation"
        >
          <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Resumen del proceso</h2>
          <dl className="mt-4 space-y-2 text-body-md text-on-surface">
            <div className="flex justify-between border-b border-border-gray pb-2">
              <dt className="text-on-surface-variant">Padrón total</dt>
              <dd>{resumen.padron_total}</dd>
            </div>
            <div className="flex justify-between border-b border-border-gray pb-2">
              <dt className="text-on-surface-variant">Votos emitidos</dt>
              <dd>{resumen.votos_emitidos}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-on-surface-variant">Correos fallidos</dt>
              <dd>{resumen.correos_fallidos}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
