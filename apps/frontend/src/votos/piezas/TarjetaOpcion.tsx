import type { PapeletaOpcionDto } from '../votos-api';

interface TarjetaSeleccionableProps {
  seleccionada: boolean;
  onSeleccionar: () => void;
}

interface TarjetaOpcionProps extends TarjetaSeleccionableProps {
  opcion: PapeletaOpcionDto;
}

/**
 * rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.4). Variante para `tipo === 'consulta'`:
 * únicamente etiqueta y `descripcion`, sin foto.
 */
export function TarjetaOpcion({ opcion, seleccionada, onSeleccionar }: TarjetaOpcionProps) {
  return (
    <div
      className={`rounded-card bg-surface-white p-4 shadow-elevation transition-colors ${
        seleccionada ? 'border-2 border-primary' : 'border border-border-gray'
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="radio"
          name="eleccion"
          aria-label={opcion.etiqueta}
          checked={seleccionada}
          onChange={onSeleccionar}
          className="sr-only"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-title-md text-on-surface">{opcion.etiqueta}</span>
            {seleccionada && (
              <span aria-hidden="true" className="text-primary">
                ✓
              </span>
            )}
          </div>
          {opcion.descripcion && (
            <p className="mt-1 text-body-md text-on-surface-variant">{opcion.descripcion}</p>
          )}
        </div>
      </label>
    </div>
  );
}
