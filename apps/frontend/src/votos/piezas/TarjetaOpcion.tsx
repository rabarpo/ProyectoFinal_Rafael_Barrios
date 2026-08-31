import type { PapeletaOpcionDto } from '../votos-api';
import { BotonSeleccion } from './BotonSeleccion';

interface TarjetaSeleccionableProps {
  seleccionada: boolean;
  onSeleccionar: () => void;
}

interface TarjetaOpcionProps extends TarjetaSeleccionableProps {
  opcion: PapeletaOpcionDto;
}

/**
 * fidelidad-visual-boleta-votacion, PR4 (design.md D1/D8, tasks.md 20.1-20.4). Variante para
 * `tipo === 'consulta'`: sin foto, cinta de etiqueta (el indicador `✓` de estado seleccionado se
 * reubica junto a ella) y `descripcion`. Consume `BotonSeleccion` (PR3) como único dueño del
 * contrato ARIA del radio compartido.
 */
export function TarjetaOpcion({ opcion, seleccionada, onSeleccionar }: TarjetaOpcionProps) {
  return (
    <div
      className={`self-start rounded-card bg-surface-white p-4 shadow-elevation transition-colors ${
        seleccionada ? 'border-2 border-primary' : 'border border-border-gray'
      }`}
    >
      <div className="inline-flex items-center gap-1 rounded-control bg-secondary px-2 py-1 text-label-md text-on-secondary">
        <span>{opcion.etiqueta}</span>
        {seleccionada && <span aria-hidden="true">✓</span>}
      </div>

      {opcion.descripcion && (
        <p className="mt-2 text-body-md text-on-surface-variant">{opcion.descripcion}</p>
      )}

      <div className="mt-3">
        <BotonSeleccion
          texto="Seleccionar esta Opción"
          etiqueta={opcion.etiqueta}
          seleccionada={seleccionada}
          onSeleccionar={onSeleccionar}
        />
      </div>
    </div>
  );
}
