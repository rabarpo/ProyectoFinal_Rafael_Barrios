interface PasoIndicadorProps {
  pasoActual: number;
}

const ETIQUETAS = ['Datos', 'Público', 'Padrón', 'Revisión'];

/**
 * Indicador de progreso del asistente (design.md, "Voting Progress
 * Indicator"): traduce el patrón de barra lineal del sistema de diseño a un
 * stepper de 4 nodos, ya que acá los pasos tienen nombre propio y conviene
 * mostrarlos. Puramente visual — `ProcesoWizardPage` sigue siendo la única
 * fuente de verdad de `estado.paso`.
 */
export function PasoIndicador({ pasoActual }: PasoIndicadorProps) {
  return (
    <ol className="flex items-center">
      {ETIQUETAS.map((etiqueta, indice) => {
        const numero = indice + 1;
        const completado = numero < pasoActual;
        const activo = numero === pasoActual;

        return (
          <li key={etiqueta} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full text-label-md ${
                  completado || activo
                    ? 'bg-primary text-on-primary'
                    : 'border border-border-gray bg-surface-white text-on-surface-variant'
                }`}
              >
                {completado ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4">
                    <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  numero
                )}
              </span>
              <span
                className={`text-caption ${activo ? 'font-semibold text-primary' : 'text-on-surface-variant'}`}
              >
                {etiqueta}
              </span>
            </div>
            {numero < ETIQUETAS.length && (
              <div
                className={`mx-2 h-px flex-1 ${completado ? 'bg-primary' : 'bg-border-gray'}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
