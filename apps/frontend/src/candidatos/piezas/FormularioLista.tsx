import { useId, useState } from 'react';
import { CampoArchivo } from './CampoArchivo';

export interface DatosListaFormulario {
  nombre: string;
  numero: string;
  simbolo: string;
  lema: string;
  propuesta: string;
  planTrabajo: File | null;
}

interface FormularioListaProps {
  valoresIniciales?: Partial<Omit<DatosListaFormulario, 'planTrabajo'>>;
  nombrePlanTrabajoActual?: string;
  onEnviar: (datos: DatosListaFormulario) => void;
  enviando: boolean;
  mensajeError?: string;
}

/**
 * Presentacional puro (design.md D13, tasks.md 20.5). El plan de trabajo
 * (PDF) SIEMPRE es opcional (spec: "Creación exitosa de lista sin plan de
 * trabajo adjunto") — a diferencia de la foto de `FormularioCandidato`, nunca
 * bloquea el submit. `numero` viaja como texto: el contenedor lo convierte a
 * `number` recién al armar el `CrearListaInput`/`ActualizarListaInput`.
 */
export function FormularioLista({
  valoresIniciales,
  nombrePlanTrabajoActual,
  onEnviar,
  enviando,
  mensajeError,
}: FormularioListaProps) {
  const [nombre, setNombre] = useState(valoresIniciales?.nombre ?? '');
  const [numero, setNumero] = useState(valoresIniciales?.numero ?? '');
  const [simbolo, setSimbolo] = useState(valoresIniciales?.simbolo ?? '');
  const [lema, setLema] = useState(valoresIniciales?.lema ?? '');
  const [propuesta, setPropuesta] = useState(valoresIniciales?.propuesta ?? '');
  const [planTrabajo, setPlanTrabajo] = useState<File | null>(null);

  const idNombre = useId();
  const idNumero = useId();
  const idSimbolo = useId();
  const idLema = useId();
  const idPropuesta = useId();

  const puedeEnviar = nombre.trim() !== '' && numero.trim() !== '' && !enviando;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!puedeEnviar) return;
        onEnviar({ nombre, numero, simbolo, lema, propuesta, planTrabajo });
      }}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={idNombre} className="text-label-md text-on-surface-variant">
            Nombre
          </label>
          <input
            id={idNombre}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={idNumero} className="text-label-md text-on-surface-variant">
            Número
          </label>
          <input
            id={idNumero}
            type="number"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idSimbolo} className="text-label-md text-on-surface-variant">
          Símbolo
        </label>
        <input
          id={idSimbolo}
          value={simbolo}
          onChange={(e) => setSimbolo(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idLema} className="text-label-md text-on-surface-variant">
          Lema
        </label>
        <input
          id={idLema}
          value={lema}
          onChange={(e) => setLema(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idPropuesta} className="text-label-md text-on-surface-variant">
          Propuesta
        </label>
        <textarea
          id={idPropuesta}
          value={propuesta}
          onChange={(e) => setPropuesta(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <CampoArchivo
        etiqueta="Plan de trabajo (PDF, opcional)"
        aceptar="application/pdf"
        onCambiar={setPlanTrabajo}
        nombreActual={nombrePlanTrabajoActual}
      />

      {mensajeError && (
        <p role="alert" className="text-label-md text-error">
          {mensajeError}
        </p>
      )}

      <button
        type="submit"
        disabled={!puedeEnviar}
        className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
      >
        {valoresIniciales ? 'Guardar cambios' : 'Crear lista'}
      </button>
    </form>
  );
}
