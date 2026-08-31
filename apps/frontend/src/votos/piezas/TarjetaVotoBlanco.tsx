import { IconoProhibido } from './iconos-reglas';
import { BotonSeleccion } from './BotonSeleccion';

interface TarjetaVotoBlancoProps {
  seleccionada: boolean;
  onSeleccionar: () => void;
}

/**
 * fidelidad-visual-boleta-votacion, PR3 (design.md D1, tasks.md 12.1-13.1). Presente en las 3
 * variantes del Paso 2 como tarjeta adicional distintiva — ícono circular + `BotonSeleccion`,
 * nunca preseleccionada al montar (D14 de #14: sin estado inicial implícito). El nombre accesible
 * del botón es "Votar en Blanco" (D1: ya es único, sin sufijo de etiqueta); el título visible de
 * la tarjeta sigue siendo "Voto en Blanco".
 */
export function TarjetaVotoBlanco({ seleccionada, onSeleccionar }: TarjetaVotoBlancoProps) {
  return (
    <div
      className={`self-start flex flex-col items-center gap-3 rounded-card bg-surface-white p-4 text-center shadow-elevation transition-colors ${
        seleccionada ? 'border-2 border-primary' : 'border border-border-gray'
      }`}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-card bg-surface-container text-on-surface-variant">
        <IconoProhibido className="h-7 w-7" />
      </div>
      <span className="text-title-md text-on-surface">Voto en Blanco</span>
      <BotonSeleccion texto="Votar en Blanco" seleccionada={seleccionada} onSeleccionar={onSeleccionar} />
    </div>
  );
}
