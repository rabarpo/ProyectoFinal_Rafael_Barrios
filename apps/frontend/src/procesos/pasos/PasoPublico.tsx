import { useEffect, useId } from 'react';
import type { AlcanceSegmentacion, PublicoObjetivo, Segmentacion, TipoProceso } from '../wizard-reducer';

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

function separarValores(texto: string): string[] {
  return texto
    .split(',')
    .map((valor) => valor.trim())
    .filter((valor) => valor.length > 0);
}

/**
 * Presentacional, paso 2 del asistente (design.md D7): `publico_objetivo` +
 * `alcance` + nivel/grados/aulas. `representante_aula` MUST segmentarse
 * obligatoriamente por aula (spec: "Cuatro tipos de proceso soportados") —
 * este componente oculta la opción `institucion` y fuerza `alcance='aulas'`
 * cuando el tipo lo exige, en vez de dejar que el usuario elija una
 * combinación que el backend rechazaría con `409 SEGMENTACION_INVALIDA`
 * (design.md D5).
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
  const idGrados = useId();
  const idAulas = useId();

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
          <input
            id={idNivel}
            value={segmentacion.nivel_id ?? ''}
            onChange={(e) => onCambiarNivel(e.target.value)}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      )}

      {segmentacion.alcance === 'grados' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={idGrados} className="text-label-md text-on-surface-variant">
            Grados (IDs separados por coma)
          </label>
          <input
            id={idGrados}
            value={segmentacion.grado_ids.join(', ')}
            onChange={(e) => onCambiarGrados(separarValores(e.target.value))}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      )}

      {segmentacion.alcance === 'aulas' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={idAulas} className="text-label-md text-on-surface-variant">
            Aulas (IDs separados por coma)
          </label>
          <input
            id={idAulas}
            value={segmentacion.aula_ids.join(', ')}
            onChange={(e) => onCambiarAulas(separarValores(e.target.value))}
            className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      )}
    </section>
  );
}
