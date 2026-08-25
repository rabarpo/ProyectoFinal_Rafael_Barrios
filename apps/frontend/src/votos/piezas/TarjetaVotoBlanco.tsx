interface TarjetaVotoBlancoProps {
  seleccionada: boolean;
  onSeleccionar: () => void;
}

/**
 * rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.5). Presente en las 3 variantes del
 * Paso 2 como tarjeta adicional distintiva — texto fijo, `border-dashed` en el `<label>`, nunca
 * preseleccionada al montar (D14 de #14: sin estado inicial implícito).
 */
export function TarjetaVotoBlanco({ seleccionada, onSeleccionar }: TarjetaVotoBlancoProps) {
  return (
    <div
      className={`rounded-card bg-surface-white p-4 shadow-elevation transition-colors ${
        seleccionada ? 'border-2 border-primary' : 'border border-border-gray'
      }`}
    >
      <label className="flex cursor-pointer items-center gap-3 border-dashed">
        <input
          type="radio"
          name="eleccion"
          aria-label="Voto en blanco"
          checked={seleccionada}
          onChange={onSeleccionar}
          className="sr-only"
        />
        <span className="flex-1 text-title-md text-on-surface">Voto en Blanco</span>
        {seleccionada && (
          <span aria-hidden="true" className="text-primary">
            ✓
          </span>
        )}
      </label>
    </div>
  );
}
