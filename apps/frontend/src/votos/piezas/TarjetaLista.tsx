import type { PapeletaOpcionDto } from '../votos-api';

interface TarjetaSeleccionableProps {
  seleccionada: boolean;
  onSeleccionar: () => void;
}

interface TarjetaListaProps extends TarjetaSeleccionableProps {
  opcion: PapeletaOpcionDto;
  urlFoto?: string;
  onVerPropuesta?: () => void;
}

/**
 * rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.1-14.2). Variante de tarjeta para
 * `tipo === 'municipio'`: etiqueta, símbolo, lema, propuesta corta y foto+nombres+cargo del
 * candidato cabeza de lista (convención de desempate D2 — nunca una designación real de dominio).
 * "Ver Propuesta Completa" es un `<button>` HERMANO del `<label>` (no anidado): el click no debe
 * activar el radio por propagación de label (design.md, "Semántica ARIA preservada").
 * Invariante D6: el `id` de selección lo decide el consumidor (`PasoBoleta`) vía `onSeleccionar`
 * usando siempre `opcion.id`, nunca `opcion.candidato_id` — esta pieza no conoce ids, solo notifica.
 */
export function TarjetaLista({
  opcion,
  seleccionada,
  onSeleccionar,
  urlFoto,
  onVerPropuesta,
}: TarjetaListaProps) {
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
          {opcion.simbolo && (
            <p className="mt-1 text-body-md text-on-surface-variant">{opcion.simbolo}</p>
          )}
          {opcion.lema && <p className="text-body-md text-on-surface-variant italic">{opcion.lema}</p>}
          {opcion.propuesta && (
            <p className="mt-2 text-caption text-on-surface-variant">{opcion.propuesta}</p>
          )}
          {opcion.candidato_nombres && (
            <div className="mt-3 flex items-center gap-2">
              {urlFoto && (
                <img
                  src={urlFoto}
                  alt={opcion.candidato_nombres}
                  className="h-10 w-10 rounded-control object-cover"
                />
              )}
              <div>
                <p className="text-label-md text-on-surface">{opcion.candidato_nombres}</p>
                {opcion.cargo && <p className="text-caption text-on-surface-variant">{opcion.cargo}</p>}
              </div>
            </div>
          )}
        </div>
      </label>

      {opcion.plan_trabajo_presente && (
        <button
          type="button"
          onClick={onVerPropuesta}
          className="mt-3 text-label-md text-primary underline"
        >
          Ver Propuesta Completa
        </button>
      )}
    </div>
  );
}
