import { useEffect, useId, useState } from 'react';
import { CampoArchivo } from './CampoArchivo';
import type { ListaRespuestaDto } from '../candidatos-api';
import { useAulas, useGrados, useSecciones } from '../../procesos/useOpcionesSegmentacion';

const ETIQUETA_TURNO: Record<'manana' | 'tarde', string> = { manana: 'Mañana', tarde: 'Tarde' };

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
 * Estado local + `onEnviar` con los valores finales, mismo criterio que
 * `FormularioCredenciales` (auth/). La foto es obligatoria SOLO en modo
 * creación (spec: "Creación rechazada sin foto"; `ActualizarCandidatoDto.foto`
 * es opcional) — el submit queda deshabilitado hasta cumplir esa condición.
 *
 * Grado/Aula (arreglo posterior a design.md D13/tasks.md 20.4, hallazgo de
 * revisión manual): `Candidato.grado`/`Candidato.aula` siguen siendo texto
 * libre en el backend (sin FK, `String?` en el schema — #12 es anterior al
 * árbol académico de #26), pero se eligen con selectores reales contra
 * `academico-api.ts` en vez de escribirse a mano, reutilizando
 * `useGrados`/`useAulas`/`useSecciones` de `procesos/useOpcionesSegmentacion.ts`
 * (mismo precedente que `PasoPublico`, que también combina piezas de
 * formulario con efectos propios). Al enviar se resuelve el `id` elegido al
 * `nombre`/etiqueta legible y se manda como string, sin requerir ningún
 * cambio de backend. Aula no tiene nombre propio: se muestra como
 * "Sección · Turno" (p.ej. "A · Mañana"), resuelto contra Sección porque Aula
 * en sí es la combinación grado+sección+año+turno (ver schema.prisma).
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
  const [gradoId, setGradoId] = useState('');
  const [aulaId, setAulaId] = useState('');
  const [cargo, setCargo] = useState(valoresIniciales?.cargo ?? '');
  const [listaId, setListaId] = useState(valoresIniciales?.lista_id ?? '');
  const [foto, setFoto] = useState<File | null>(null);

  const idNombres = useId();
  const idGrado = useId();
  const idAula = useId();
  const idCargo = useId();
  const idLista = useId();

  const grados = useGrados(undefined);
  const secciones = useSecciones(gradoId || undefined);
  const aulas = useAulas(gradoId || undefined);

  function etiquetaAula(aulaId: string): string {
    const aulaEncontrada = aulas.datos.find((a) => a.id === aulaId);
    if (!aulaEncontrada) return '';
    const seccion = secciones.datos.find((s) => s.id === aulaEncontrada.seccion_id);
    return `${seccion?.nombre ?? '?'} · ${ETIQUETA_TURNO[aulaEncontrada.turno]}`;
  }

  // Modo edición: los valores existentes (`grado`/`aula`) son texto libre guardado antes de que
  // este formulario ofreciera selects — no hay id que preseleccionar de entrada. Mejor esfuerzo:
  // si el texto guardado coincide con el nombre de un Grado real del catálogo actual, preseleccionarlo
  // (y en cascada, la Aula cuya etiqueta compuesta coincida); si no coincide con nada, el campo
  // arranca vacío y el valor original queda intacto hasta que el usuario elige uno nuevo.
  useEffect(() => {
    if (!valoresIniciales?.grado || gradoId || grados.cargando) return;
    const coincidencia = grados.datos.find(
      (g) => g.nombre.trim().toLowerCase() === valoresIniciales.grado!.trim().toLowerCase(),
    );
    if (coincidencia) setGradoId(coincidencia.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valoresIniciales?.grado, grados.cargando, grados.datos]);

  useEffect(() => {
    if (!valoresIniciales?.aula || aulaId || aulas.cargando || secciones.cargando) return;
    const coincidencia = aulas.datos.find(
      (a) => etiquetaAula(a.id).toLowerCase() === valoresIniciales.aula!.trim().toLowerCase(),
    );
    if (coincidencia) setAulaId(coincidencia.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valoresIniciales?.aula, aulas.cargando, secciones.cargando, aulas.datos]);

  const camposCompletos = nombres.trim() !== '';
  const fotoValida = modo === 'edicion' || foto !== null;
  const puedeEnviar = camposCompletos && fotoValida && !enviando;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!puedeEnviar) return;
        const grado = grados.datos.find((g) => g.id === gradoId)?.nombre ?? '';
        const aula = etiquetaAula(aulaId);
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
          <select
            id={idGrado}
            value={gradoId}
            disabled={grados.cargando}
            onChange={(e) => {
              setGradoId(e.target.value);
              setAulaId('');
            }}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="">{grados.cargando ? 'Cargando grados…' : 'Sin grado'}</option>
            {grados.datos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
          {grados.error && <p className="text-body-sm text-error">No se pudieron cargar los grados.</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={idAula} className="text-label-md text-on-surface-variant">
            Aula
          </label>
          <select
            id={idAula}
            value={aulaId}
            disabled={!gradoId || aulas.cargando}
            onChange={(e) => setAulaId(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="">
              {!gradoId ? 'Elegí un grado primero' : aulas.cargando ? 'Cargando aulas…' : 'Sin aula'}
            </option>
            {aulas.datos.map((a) => (
              <option key={a.id} value={a.id}>
                {etiquetaAula(a.id)}
              </option>
            ))}
          </select>
          {aulas.error && <p className="text-body-sm text-error">No se pudieron cargar las aulas.</p>}
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
        {listas.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">
            Todavía no hay listas creadas en este proceso. Podés registrar el candidato como
            independiente y asociarlo a una lista más tarde desde &quot;Gestión de
            candidatos&quot;, donde también se crean las listas.
          </p>
        )}
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
