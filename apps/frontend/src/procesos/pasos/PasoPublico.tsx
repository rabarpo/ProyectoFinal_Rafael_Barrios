import { useEffect, useId, useState } from 'react';
import type { AlcanceSegmentacion, PublicoObjetivo, Segmentacion, TipoProceso } from '../wizard-reducer';
import { useAulas, useGrados, useNiveles } from '../useOpcionesSegmentacion';

interface PasoPublicoProps {
  segmentacion: Segmentacion;
  tipoProceso: TipoProceso | undefined;
  onCambiarPublicoObjetivo: (valor: PublicoObjetivo) => void;
  onCambiarAlcance: (valor: AlcanceSegmentacion) => void;
  onCambiarNivel: (valor: string) => void;
  onCambiarGrados: (valor: string[]) => void;
  onCambiarAulas: (valor: string[]) => void;
}

const OPCIONES_PUBLICO: { valor: PublicoObjetivo; etiqueta: string }[] = [
  { valor: 'estudiantes', etiqueta: 'Estudiantes' },
  { valor: 'padres', etiqueta: 'Padres de familia' },
  { valor: 'comunidad', etiqueta: 'Toda la comunidad' },
];

const TODAS_LAS_OPCIONES_ALCANCE: { valor: AlcanceSegmentacion; etiqueta: string }[] = [
  { valor: 'institucion', etiqueta: 'Toda la institución' },
  { valor: 'nivel', etiqueta: 'Nivel' },
  { valor: 'grados', etiqueta: 'Grados' },
  { valor: 'aulas', etiqueta: 'Aulas' },
];

/** Agrega o quita `valor` de una selección múltiple, sin duplicados. */
function alternarValor(seleccion: string[], valor: string): string[] {
  return seleccion.includes(valor)
    ? seleccion.filter((actual) => actual !== valor)
    : [...seleccion, valor];
}

/**
 * Presentacional, paso 2 del asistente (design.md D7): `publico_objetivo` +
 * `alcance` + nivel/grados/aulas. `representante_aula` MUST segmentarse
 * obligatoriamente por aula (spec: "Cuatro tipos de proceso soportados") —
 * este componente oculta la opción `institucion` y fuerza `alcance='aulas'`
 * cuando el tipo lo exige, en vez de dejar que el usuario elija una
 * combinación que el backend rechazaría con `409 SEGMENTACION_INVALIDA`
 * (design.md D5).
 *
 * Nivel/Grados/Aulas se eligen con selectores reales contra
 * `academico/academico-api.ts` (arreglo de UX puntual, #11 ya archivado):
 * antes pedían IDs escritos a mano. El nivel filtra Grados server-side
 * (`GET /grados?nivel_id=`), y el grado filtra Aulas server-side
 * (`GET /aulas?grado_id=`); esos filtros son locales a este componente —
 * ninguno de los dos entra a `Segmentacion`, que solo guarda la selección
 * final. Sin filtro, Aulas se acota al AnioEscolar activo en vez de listar
 * aulas de años ya cerrados (ver `useOpcionesSegmentacion.ts`).
 */
export function PasoPublico({
  segmentacion,
  tipoProceso,
  onCambiarPublicoObjetivo,
  onCambiarAlcance,
  onCambiarNivel,
  onCambiarGrados,
  onCambiarAulas,
}: PasoPublicoProps) {
  const idNivel = useId();
  const idFiltroNivelGrados = useId();
  const idFiltroGradoAulas = useId();

  const [filtroNivelGrados, setFiltroNivelGrados] = useState('');
  const [filtroGradoAulas, setFiltroGradoAulas] = useState('');

  const niveles = useNiveles();
  const grados = useGrados(filtroNivelGrados || undefined);
  const aulas = useAulas(filtroGradoAulas || undefined);

  const esRepresentanteAula = tipoProceso === 'representante_aula';
  const opcionesAlcance = esRepresentanteAula
    ? TODAS_LAS_OPCIONES_ALCANCE.filter((opcion) => opcion.valor !== 'institucion')
    : TODAS_LAS_OPCIONES_ALCANCE;

  useEffect(() => {
    if (esRepresentanteAula && segmentacion.alcance !== 'aulas') {
      onCambiarAlcance('aulas');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esRepresentanteAula, segmentacion.alcance]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-headline-lg-mobile md:text-headline-lg text-on-surface">
        Público y segmentación
      </h2>

      <fieldset className="flex flex-col gap-2 rounded-control border border-border-gray p-4">
        <legend className="text-label-md text-on-surface-variant">Público objetivo</legend>
        {OPCIONES_PUBLICO.map((opcion) => (
          <label key={opcion.valor} className="flex items-center gap-2 text-body-md text-on-surface">
            <input
              type="radio"
              name="publico_objetivo"
              value={opcion.valor}
              checked={segmentacion.publico_objetivo === opcion.valor}
              onChange={() => onCambiarPublicoObjetivo(opcion.valor)}
            />
            {opcion.etiqueta}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-control border border-border-gray p-4">
        <legend className="text-label-md text-on-surface-variant">Alcance</legend>
        {opcionesAlcance.map((opcion) => (
          <label key={opcion.valor} className="flex items-center gap-2 text-body-md text-on-surface">
            <input
              type="radio"
              name="alcance"
              value={opcion.valor}
              checked={segmentacion.alcance === opcion.valor}
              onChange={() => onCambiarAlcance(opcion.valor)}
              disabled={esRepresentanteAula}
            />
            {opcion.etiqueta}
          </label>
        ))}
      </fieldset>

      {segmentacion.alcance === 'nivel' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={idNivel} className="text-label-md text-on-surface-variant">
            Nivel
          </label>
          <select
            id={idNivel}
            value={segmentacion.nivel_id ?? ''}
            onChange={(e) => onCambiarNivel(e.target.value)}
            disabled={niveles.cargando}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          >
            <option value="" disabled>
              {niveles.cargando ? 'Cargando niveles…' : 'Elegí un nivel'}
            </option>
            {niveles.datos.map((nivel) => (
              <option key={nivel.id} value={nivel.id}>
                {nivel.nombre}
              </option>
            ))}
          </select>
          {niveles.error && (
            <p className="text-body-sm text-error">No se pudieron cargar los niveles.</p>
          )}
        </div>
      )}

      {segmentacion.alcance === 'grados' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={idFiltroNivelGrados} className="text-label-md text-on-surface-variant">
              Filtrar por nivel (opcional)
            </label>
            <select
              id={idFiltroNivelGrados}
              value={filtroNivelGrados}
              onChange={(e) => setFiltroNivelGrados(e.target.value)}
              className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">Todos los niveles</option>
              {niveles.datos.map((nivel) => (
                <option key={nivel.id} value={nivel.id}>
                  {nivel.nombre}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-2 rounded-control border border-border-gray p-4">
            <legend className="text-label-md text-on-surface-variant">Grados</legend>
            {grados.cargando && <p className="text-body-sm text-on-surface-variant">Cargando grados…</p>}
            {grados.error && <p className="text-body-sm text-error">No se pudieron cargar los grados.</p>}
            {!grados.cargando && !grados.error && grados.datos.length === 0 && (
              <p className="text-body-sm text-on-surface-variant">No hay grados para mostrar.</p>
            )}
            {grados.datos.map((grado) => (
              <label key={grado.id} className="flex items-center gap-2 text-body-md text-on-surface">
                <input
                  type="checkbox"
                  value={grado.id}
                  checked={segmentacion.grado_ids.includes(grado.id)}
                  onChange={() => onCambiarGrados(alternarValor(segmentacion.grado_ids, grado.id))}
                />
                {grado.nombre}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {segmentacion.alcance === 'aulas' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={idFiltroGradoAulas} className="text-label-md text-on-surface-variant">
              Filtrar por grado (opcional; sin elegir, se muestran las aulas del año escolar activo)
            </label>
            <select
              id={idFiltroGradoAulas}
              value={filtroGradoAulas}
              onChange={(e) => setFiltroGradoAulas(e.target.value)}
              className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
            >
              <option value="">Todos los grados (año activo)</option>
              {grados.datos.map((grado) => (
                <option key={grado.id} value={grado.id}>
                  {grado.nombre}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-2 rounded-control border border-border-gray p-4">
            <legend className="text-label-md text-on-surface-variant">Aulas</legend>
            {aulas.cargando && <p className="text-body-sm text-on-surface-variant">Cargando aulas…</p>}
            {aulas.error && <p className="text-body-sm text-error">No se pudieron cargar las aulas.</p>}
            {!aulas.cargando && !aulas.error && aulas.datos.length === 0 && (
              <p className="text-body-sm text-on-surface-variant">No hay aulas para mostrar.</p>
            )}
            {aulas.datos.map((aula) => {
              const gradoDelAula = grados.datos.find((grado) => grado.id === aula.grado_id);
              const etiquetaTurno = aula.turno === 'manana' ? 'Mañana' : 'Tarde';
              return (
                <label key={aula.id} className="flex items-center gap-2 text-body-md text-on-surface">
                  <input
                    type="checkbox"
                    value={aula.id}
                    checked={segmentacion.aula_ids.includes(aula.id)}
                    onChange={() => onCambiarAulas(alternarValor(segmentacion.aula_ids, aula.id))}
                  />
                  {gradoDelAula ? `${gradoDelAula.nombre} · ${etiquetaTurno}` : etiquetaTurno}
                </label>
              );
            })}
          </fieldset>
        </div>
      )}
    </section>
  );
}
