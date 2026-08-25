import type { PapeletaOpcionDto } from '../votos-api';
import { BotonSeleccion } from './BotonSeleccion';

interface TarjetaSeleccionableProps {
  seleccionada: boolean;
  onSeleccionar: () => void;
}

interface TarjetaCandidatoProps extends TarjetaSeleccionableProps {
  opcion: PapeletaOpcionDto;
  urlFoto?: string;
}

/**
 * fidelidad-visual-boleta-votacion, PR4 (design.md D1/D8, tasks.md 19.1-19.4). Variante para
 * `tipo === 'representante_aula'`/`'padres'`: foto arriba, cinta con el cargo (el indicador `✓` de
 * estado seleccionado se reubica junto a ella), nombres (`opcion.etiqueta`) — sin botón de
 * propuesta (solo `TarjetaLista` lo tiene). Consume `BotonSeleccion` (PR3) como único dueño del
 * contrato ARIA del radio compartido.
 */
export function TarjetaCandidato({ opcion, seleccionada, onSeleccionar, urlFoto }: TarjetaCandidatoProps) {
  return (
    <div
      className={`overflow-hidden rounded-card bg-surface-white shadow-elevation transition-colors ${
        seleccionada ? 'border-2 border-primary' : 'border border-border-gray'
      }`}
    >
      <div className="relative">
        {urlFoto && (
          <img src={urlFoto} alt={opcion.etiqueta} className="h-40 w-full object-cover" />
        )}
        {(opcion.cargo || seleccionada) && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded-control bg-secondary px-2 py-1 text-label-md text-on-secondary">
            {opcion.cargo && <span>{opcion.cargo}</span>}
            {seleccionada && <span aria-hidden="true">✓</span>}
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="text-title-md text-on-surface">{opcion.etiqueta}</p>

        <div className="mt-3">
          <BotonSeleccion
            texto="Seleccionar Candidato"
            etiqueta={opcion.etiqueta}
            seleccionada={seleccionada}
            onSeleccionar={onSeleccionar}
          />
        </div>
      </div>
    </div>
  );
}
