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
    <section>
      <h2>Público y segmentación</h2>

      <fieldset>
        <legend>Público objetivo</legend>
        {OPCIONES_PUBLICO.map((opcion) => (
          <label key={opcion.valor}>
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

      <fieldset>
        <legend>Alcance</legend>
        {opcionesAlcance.map((opcion) => (
          <label key={opcion.valor}>
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
        <>
          <label htmlFor={idNivel}>Nivel</label>
          <input
            id={idNivel}
            value={segmentacion.nivel_id ?? ''}
            onChange={(e) => onCambiarNivel(e.target.value)}
          />
        </>
      )}

      {segmentacion.alcance === 'grados' && (
        <>
          <label htmlFor={idGrados}>Grados (IDs separados por coma)</label>
          <input
            id={idGrados}
            value={segmentacion.grado_ids.join(', ')}
            onChange={(e) => onCambiarGrados(separarValores(e.target.value))}
          />
        </>
      )}

      {segmentacion.alcance === 'aulas' && (
        <>
          <label htmlFor={idAulas}>Aulas (IDs separados por coma)</label>
          <input
            id={idAulas}
            value={segmentacion.aula_ids.join(', ')}
            onChange={(e) => onCambiarAulas(separarValores(e.target.value))}
          />
        </>
      )}
    </section>
  );
}
