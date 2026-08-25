import type { PapeletaOpcionDto } from '../votos-api';

interface TarjetaSeleccionableProps {
  seleccionada: boolean;
  onSeleccionar: () => void;
}

interface TarjetaCandidatoProps extends TarjetaSeleccionableProps {
  opcion: PapeletaOpcionDto;
  urlFoto?: string;
}

/**
 * rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.3). Variante para
 * `tipo === 'representante_aula'`/`'padres'`: foto, nombres (`opcion.etiqueta`) y cargo del
 * candidato — sin botón de propuesta (solo `TarjetaLista` lo tiene).
 */
export function TarjetaCandidato({ opcion, seleccionada, onSeleccionar, urlFoto }: TarjetaCandidatoProps) {
  return (
    <div
      className={`rounded-card bg-surface-white p-4 shadow-elevation transition-colors ${
        seleccionada ? 'border-2 border-primary' : 'border border-border-gray'
      }`}
    >
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="radio"
          name="eleccion"
          aria-label={opcion.etiqueta}
          checked={seleccionada}
          onChange={onSeleccionar}
          className="sr-only"
        />
        {urlFoto && (
          <img
            src={urlFoto}
            alt={opcion.etiqueta}
            className="h-12 w-12 rounded-control object-cover"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-title-md text-on-surface">{opcion.etiqueta}</span>
            {seleccionada && (
              <span aria-hidden="true" className="text-primary">
                ✓
              </span>
            )}
          </div>
          {opcion.cargo && <p className="text-caption text-on-surface-variant">{opcion.cargo}</p>}
        </div>
      </label>
    </div>
  );
}
