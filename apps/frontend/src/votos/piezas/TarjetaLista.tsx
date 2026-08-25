import type { PapeletaOpcionDto } from '../votos-api';
import { BotonSeleccion } from './BotonSeleccion';

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
 * fidelidad-visual-boleta-votacion, PR4 (design.md D1/D8, tasks.md 17.1-18.1). Variante de tarjeta
 * para `tipo === 'municipio'`: foto del candidato cabeza de lista arriba, cinta "Lista N°" absoluta
 * sobre la foto (el indicador `✓` de estado seleccionado se reubica junto a ella), símbolo, lema,
 * propuesta corta y botón outline "Ver Propuesta Completa" condicionado a `plan_trabajo_presente`.
 * "Ver Propuesta Completa" es un `<button>` HERMANO del `<label>` de `BotonSeleccion` (no anidado):
 * el click no debe activar el radio por propagación de label (design.md D1, "regresión clave").
 * Consume `BotonSeleccion` (PR3) como único dueño del contrato ARIA del radio compartido.
 * Invariante D6 heredada: el `id` de selección lo decide el consumidor (`PasoBoleta`) vía
 * `onSeleccionar` usando siempre `opcion.id`, nunca `opcion.candidato_id` — esta pieza no conoce ids.
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
      className={`overflow-hidden rounded-card bg-surface-white shadow-elevation transition-colors ${
        seleccionada ? 'border-2 border-primary' : 'border border-border-gray'
      }`}
    >
      <div className="relative">
        {urlFoto && (
          <img
            src={urlFoto}
            alt={opcion.candidato_nombres ?? opcion.etiqueta}
            className="h-40 w-full object-cover"
          />
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-control bg-secondary px-2 py-1 text-label-md text-on-secondary">
          <span>{opcion.etiqueta}</span>
          {seleccionada && (
            <span aria-hidden="true">✓</span>
          )}
        </div>
      </div>

      <div className="p-4">
        {opcion.simbolo && <p className="text-body-md text-on-surface-variant">{opcion.simbolo}</p>}
        {opcion.lema && <p className="text-body-md text-on-surface-variant italic">{opcion.lema}</p>}
        {opcion.propuesta && (
          <p className="mt-2 text-caption text-on-surface-variant">{opcion.propuesta}</p>
        )}
        {opcion.candidato_nombres && (
          <p className="mt-3 text-label-md text-on-surface">{opcion.candidato_nombres}</p>
        )}
        {opcion.cargo && <p className="text-caption text-on-surface-variant">{opcion.cargo}</p>}

        <div className="mt-3 flex flex-col gap-2">
          {opcion.plan_trabajo_presente && (
            <button
              type="button"
              onClick={onVerPropuesta}
              className="rounded-control border border-border-gray bg-surface-white px-4 py-3 text-label-md text-primary"
            >
              Ver Propuesta Completa
            </button>
          )}
          <BotonSeleccion
            texto="Seleccionar Lista"
            etiqueta={opcion.etiqueta}
            seleccionada={seleccionada}
            onSeleccionar={onSeleccionar}
          />
        </div>
      </div>
    </div>
  );
}
