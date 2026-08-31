import type { ResultadoImportacionDto } from '../importacion-api';

interface ResumenImportacionProps {
  resultado: ResultadoImportacionDto;
}

/**
 * frontend-importacion-excel, PR3 (#29; design.md D8, tasks.md 3.3-3.4). Presentacional puro: los
 * cuatro contadores del `ResultadoImportacionDto`. Sin fetch, sin `useSesion()`, sin estado propio
 * (`#26` D8, `#28` D10). Los contadores se muestran SIEMPRE; la tabla de errores y la descarga
 * (condicionadas a `filas_invalidas > 0`) llegan en PR4.
 */
const CONTADORES = [
  { clave: 'filas_totales', etiqueta: 'Filas totales' },
  { clave: 'filas_creadas', etiqueta: 'Filas creadas' },
  { clave: 'filas_existentes', etiqueta: 'Filas existentes' },
  { clave: 'filas_invalidas', etiqueta: 'Filas inválidas' },
] as const;

export function ResumenImportacion({ resultado }: ResumenImportacionProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CONTADORES.map(({ clave, etiqueta }) => (
        <div
          key={clave}
          className="rounded-card border-t-4 border-primary bg-surface-white p-6 shadow-elevation"
        >
          <h3 className="text-label-md text-on-surface-variant">{etiqueta}</h3>
          <p className="mt-2 text-headline-lg-mobile text-primary md:text-headline-lg">
            {resultado[clave]}
          </p>
        </div>
      ))}
    </div>
  );
}
