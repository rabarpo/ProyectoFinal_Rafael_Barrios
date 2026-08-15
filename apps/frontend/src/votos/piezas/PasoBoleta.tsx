import { useState } from 'react';

export type Seleccion = { tipo: 'opcion'; id: string } | { tipo: 'blanco' };

interface OpcionBoleta {
  id: string;
  etiqueta: string;
}

interface PasoBoletaProps {
  opciones: OpcionBoleta[];
  seleccion: Seleccion | undefined;
  onSeleccionar: (seleccion: Seleccion) => void;
  onContinuar: () => void;
}

/**
 * Presentacional puro (design.md D14, tasks.md 17.1-17.2). El voto en blanco es una tarjeta más
 * de la lista con borde discontinuo (marca visual de "esto es distinto") — nunca el estado inicial
 * ni el resultado de no elegir nada: "Continuar" permanece deshabilitado hasta que `seleccion` sea
 * `{tipo:'blanco'}` o `{tipo:'opcion', id}` de forma explícita (spec: "Voto en blanco explícito").
 */
export function PasoBoleta({
  opciones,
  seleccion: seleccionInicial,
  onSeleccionar,
  onContinuar,
}: PasoBoletaProps) {
  // Estado interno espejado desde `seleccionInicial` (design.md D14, "presentacionales puros, sin
  // efectos"): el radio group necesita reaccionar de inmediato al click, sin depender de que el
  // contenedor vuelva a renderizar con la nueva prop; `onSeleccionar` sigue notificando al
  // contenedor para que `VotacionPage` conserve la selección entre pasos.
  const [seleccion, setSeleccion] = useState<Seleccion | undefined>(seleccionInicial);

  function seleccionar(nueva: Seleccion) {
    setSeleccion(nueva);
    onSeleccionar(nueva);
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Elegí tu opción</h2>

      <div role="radiogroup" aria-label="Opciones de la boleta" className="mt-4 space-y-3">
        {opciones.map((opcion) => (
          <label
            key={opcion.id}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-border-gray bg-surface-white p-4 text-body-md text-on-surface"
          >
            <input
              type="radio"
              name="eleccion"
              role="radio"
              checked={seleccion?.tipo === 'opcion' && seleccion.id === opcion.id}
              onChange={() => seleccionar({ tipo: 'opcion', id: opcion.id })}
              className="focus-visible:outline-2 focus-visible:outline-primary"
            />
            {opcion.etiqueta}
          </label>
        ))}

        <label className="flex cursor-pointer items-center gap-3 rounded-card border border-dashed border-border-gray bg-surface-white p-4 text-body-md text-on-surface">
          <input
            type="radio"
            name="eleccion"
            role="radio"
            aria-label="Voto en blanco"
            checked={seleccion?.tipo === 'blanco'}
            onChange={() => seleccionar({ tipo: 'blanco' })}
            className="focus-visible:outline-2 focus-visible:outline-primary"
          />
          Voto en blanco
        </label>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={onContinuar}
          disabled={!seleccion}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
