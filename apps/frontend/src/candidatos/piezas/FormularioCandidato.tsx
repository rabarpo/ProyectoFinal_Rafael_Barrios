import { useId, useState } from 'react';
import { CampoArchivo } from './CampoArchivo';
import type { ListaRespuestaDto } from '../candidatos-api';

export interface DatosCandidatoFormulario {
  nombres: string;
  grado: string;
  aula: string;
  cargo: string;
  lista_id: string;
  foto: File | null;
}

interface FormularioCandidatoProps {
  modo: 'creacion' | 'edicion';
  valoresIniciales?: Partial<DatosCandidatoFormulario>;
  listas: ListaRespuestaDto[];
  onEnviar: (datos: DatosCandidatoFormulario) => void;
  enviando: boolean;
  mensajeError?: string;
}

/**
 * Presentacional puro (design.md D13, tasks.md 20.4). Mismo criterio de
 * estado local + `onEnviar` con los valores finales que
 * `FormularioCredenciales` (auth/). La foto es obligatoria SOLO en modo
 * creación (spec: "Creación rechazada sin foto"; `ActualizarCandidatoDto.foto`
 * es opcional) — el submit queda deshabilitado hasta cumplir esa condición.
 */
export function FormularioCandidato({
  modo,
  valoresIniciales,
  listas,
  onEnviar,
  enviando,
  mensajeError,
}: FormularioCandidatoProps) {
  const [nombres, setNombres] = useState(valoresIniciales?.nombres ?? '');
  const [grado, setGrado] = useState(valoresIniciales?.grado ?? '');
  const [aula, setAula] = useState(valoresIniciales?.aula ?? '');
  const [cargo, setCargo] = useState(valoresIniciales?.cargo ?? '');
  const [listaId, setListaId] = useState(valoresIniciales?.lista_id ?? '');
  const [foto, setFoto] = useState<File | null>(null);

  const idNombres = useId();
  const idGrado = useId();
  const idAula = useId();
  const idCargo = useId();
  const idLista = useId();

  const camposCompletos = nombres.trim() !== '';
  const fotoValida = modo === 'edicion' || foto !== null;
  const puedeEnviar = camposCompletos && fotoValida && !enviando;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!puedeEnviar) return;
        onEnviar({ nombres, grado, aula, cargo, lista_id: listaId, foto });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={idNombres} className="text-label-md text-on-surface-variant">
          Nombres
        </label>
        <input
          id={idNombres}
          value={nombres}
          onChange={(e) => setNombres(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={idGrado} className="text-label-md text-on-surface-variant">
            Grado
          </label>
          <input
            id={idGrado}
            value={grado}
            onChange={(e) => setGrado(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={idAula} className="text-label-md text-on-surface-variant">
            Aula
          </label>
          <input
            id={idAula}
            value={aula}
            onChange={(e) => setAula(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idCargo} className="text-label-md text-on-surface-variant">
          Cargo postulado
        </label>
        <input
          id={idCargo}
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idLista} className="text-label-md text-on-surface-variant">
          Lista
        </label>
        <select
          id={idLista}
          value={listaId}
          onChange={(e) => setListaId(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        >
          <option value="">Sin lista (candidato independiente)</option>
          {listas.map((lista) => (
            <option key={lista.id} value={lista.id}>
              {lista.numero} · {lista.nombre}
            </option>
          ))}
        </select>
      </div>

      <CampoArchivo etiqueta="Foto" aceptar="image/png,image/jpeg" onCambiar={setFoto} />

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
        {modo === 'creacion' ? 'Registrar candidato' : 'Guardar cambios'}
      </button>
    </form>
  );
}
