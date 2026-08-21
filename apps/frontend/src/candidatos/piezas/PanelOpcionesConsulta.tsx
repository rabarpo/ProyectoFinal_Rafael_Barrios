import { useId, useState } from 'react';
import type { OpcionRespuestaDto } from '../candidatos-api';

export interface DatosOpcionFormulario {
  etiqueta: string;
  descripcion: string;
}

interface PanelOpcionesConsultaProps {
  opciones: OpcionRespuestaDto[];
  onCrear: (datos: DatosOpcionFormulario) => void;
  onBorrar: (id: string) => void;
  enviando: boolean;
}

const SUGERENCIAS = ['A', 'B', 'C'];

/**
 * Presentacional puro (design.md D13, tasks.md 23.2). `etiqueta` SUGIERE la
 * siguiente letra A/B/C según cuántas opciones ya existen, pero jamás
 * restringe la entrada (spec: "Etiqueta personalizada aceptada" — `etiqueta
 * = "Sí"` se acepta igual). La sugerencia solo fija el valor inicial del
 * campo; el usuario puede sobrescribirla con cualquier texto no vacío.
 */
export function PanelOpcionesConsulta({
  opciones,
  onCrear,
  onBorrar,
  enviando,
}: PanelOpcionesConsultaProps) {
  const sugerencia = SUGERENCIAS[opciones.length] ?? '';
  const [etiqueta, setEtiqueta] = useState(sugerencia);
  const [descripcion, setDescripcion] = useState('');
  const idEtiqueta = useId();
  const idDescripcion = useId();

  const puedeEnviar = etiqueta.trim() !== '' && !enviando;

  return (
    <div className="flex flex-col gap-4">
      {opciones.length === 0 && (
        <p className="text-body-md text-on-surface-variant">
          Todavía no hay opciones de consulta registradas.
        </p>
      )}

      {opciones.length > 0 && (
        <ul>
          {opciones.map((opcion) => (
            <li
              key={opcion.id}
              className="flex items-center justify-between border-b border-border-gray px-2 py-3 last:border-b-0"
            >
              <span className="text-body-md text-on-surface">{opcion.etiqueta}</span>
              <button
                type="button"
                className="rounded-control bg-error px-3 py-2 text-label-md text-on-error transition-colors hover:bg-error/10 hover:text-error"
                onClick={() => onBorrar(opcion.id)}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-3 md:flex-row md:items-end"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (!puedeEnviar) return;
          onCrear({ etiqueta, descripcion });
          setEtiqueta(SUGERENCIAS[opciones.length + 1] ?? '');
          setDescripcion('');
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={idEtiqueta} className="text-label-md text-on-surface-variant">
            Etiqueta
          </label>
          <input
            id={idEtiqueta}
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={idDescripcion} className="text-label-md text-on-surface-variant">
            Descripción (opcional)
          </label>
          <input
            id={idDescripcion}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <button
          type="submit"
          disabled={!puedeEnviar}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
        >
          Agregar opción
        </button>
      </form>
    </div>
  );
}
