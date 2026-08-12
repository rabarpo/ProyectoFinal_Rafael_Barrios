import { useId } from 'react';
import type { DatosProceso, Segmentacion } from '../wizard-reducer';
import type { EstadoPadron } from '../usePadronEnVivo';

interface PasoRevisionProps {
  datos: DatosProceso;
  segmentacion: Segmentacion;
  estadoPadron: EstadoPadron;
  ocultarResultados: boolean;
  onCambiarOcultarResultados: (valor: boolean) => void;
  onConfirmar: () => void;
  enviando: boolean;
  errorEnvio: string | undefined;
}

/**
 * Presentacional, paso 4 del asistente (design.md D7): resumen de lo
 * elegido + checkbox `ocultar_resultados` (pre-marcado por el reducer, spec:
 * "El asistente pre-marca ocultar_resultados") + confirmar. El submit real
 * (`procesos-api.crear()`) lo dispara `ProcesoWizardPage` vía
 * `onConfirmar` — este componente no conoce la API.
 */
export function PasoRevision({
  datos,
  segmentacion,
  estadoPadron,
  ocultarResultados,
  onCambiarOcultarResultados,
  onConfirmar,
  enviando,
  errorEnvio,
}: PasoRevisionProps) {
  const idOcultarResultados = useId();

  return (
    <section>
      <h2>Revisión</h2>

      <dl>
        <dt>Nombre</dt>
        <dd>{datos.nombre}</dd>
        <dt>Tipo</dt>
        <dd>{datos.tipo}</dd>
        <dt>Público objetivo</dt>
        <dd>{segmentacion.publico_objetivo}</dd>
        <dt>Alcance</dt>
        <dd>{segmentacion.alcance}</dd>
        <dt>Derechos totales estimados</dt>
        <dd>{estadoPadron.datos?.derechos_totales ?? '—'}</dd>
      </dl>

      <label htmlFor={idOcultarResultados}>
        <input
          id={idOcultarResultados}
          type="checkbox"
          checked={ocultarResultados}
          onChange={(e) => onCambiarOcultarResultados(e.target.checked)}
        />
        Ocultar resultados hasta el cierre
      </label>

      {errorEnvio && <p role="alert">{errorEnvio}</p>}

      <button type="button" disabled={enviando} onClick={onConfirmar}>
        {enviando ? 'Creando…' : 'Confirmar'}
      </button>
    </section>
  );
}
