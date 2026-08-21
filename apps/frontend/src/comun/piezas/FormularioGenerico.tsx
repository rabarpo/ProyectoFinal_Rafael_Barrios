import { useId, useState } from 'react';

/**
 * Prefijo del `id` de cada campo. Se deriva de `clave` en vez de `useId()`
 * por campo (no se puede invocar un hook dentro de un `.map` con un número
 * de campos variable entre renders) y de un único `useId()` del formulario
 * para evitar colisiones si dos `FormularioGenerico` coexisten en el DOM.
 */

export type CampoFormulario =
  | { tipo: 'texto'; clave: string; etiqueta: string; requerido?: boolean }
  | {
      tipo: 'seleccion';
      clave: string;
      etiqueta: string;
      requerido?: boolean;
      opciones: { valor: string; etiqueta: string }[];
    };

interface FormularioGenericoProps {
  campos: CampoFormulario[];
  modo: 'creacion' | 'edicion';
  valoresIniciales?: Record<string, string>;
  onEnviar: (valores: Record<string, string>) => void;
  onCancelar?: () => void;
  enviando: boolean;
  mensajeError?: string;
}

/**
 * Presentacional puro (design.md D4, tasks.md Fase 7). Campos declarativos
 * `texto|seleccion` sobre un único `Record<string,string>` — verificado que
 * los 6 DTO de escritura del dominio son 100% string (D4). Misma validación
 * mínima que `FormularioCandidato`: `requerido` + no-vacío-tras-`trim()`, sin
 * `useSesion()` (D8: la piezas genéricas nunca leen la sesión).
 */
export function FormularioGenerico({
  campos,
  modo,
  valoresIniciales,
  onEnviar,
  onCancelar,
  enviando,
  mensajeError,
}: FormularioGenericoProps) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const iniciales: Record<string, string> = {};
    for (const campo of campos) {
      iniciales[campo.clave] = valoresIniciales?.[campo.clave] ?? '';
    }
    return iniciales;
  });

  const idBase = useId();

  const camposCompletos = campos.every((campo) => {
    if (!campo.requerido) return true;
    return valores[campo.clave].trim() !== '';
  });
  const puedeEnviar = camposCompletos && !enviando;

  function actualizar(clave: string, valor: string) {
    setValores((anteriores) => ({ ...anteriores, [clave]: valor }));
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!puedeEnviar) return;
        onEnviar(valores);
      }}
    >
      {campos.map((campo) => {
        const id = `${idBase}-${campo.clave}`;
        return (
          <div key={campo.clave} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-label-md text-on-surface-variant">
              {campo.etiqueta}
            </label>
            {campo.tipo === 'texto' ? (
              <input
                id={id}
                value={valores[campo.clave]}
                onChange={(evento) => actualizar(campo.clave, evento.target.value)}
                className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
              />
            ) : (
              <select
                id={id}
                value={valores[campo.clave]}
                onChange={(evento) => actualizar(campo.clave, evento.target.value)}
                className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
              >
                {campo.opciones.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}

      {mensajeError && (
        <p role="alert" className="text-label-md text-error">
          {mensajeError}
        </p>
      )}

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={!puedeEnviar}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
        >
          {modo === 'creacion' ? 'Guardar' : 'Guardar cambios'}
        </button>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-control px-4 py-3 text-label-md text-primary transition-colors hover:bg-primary/10"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
