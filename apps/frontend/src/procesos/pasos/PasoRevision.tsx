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
    <section className="flex flex-col gap-6">
      <h2 className="text-title-md text-on-surface">Revisión</h2>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-card bg-surface-container-low p-4 md:grid-cols-2">
        <dt className="text-label-md text-on-surface-variant">Nombre</dt>
        <dd className="text-body-lg text-on-surface">{datos.nombre}</dd>
        <dt className="text-label-md text-on-surface-variant">Tipo</dt>
        <dd className="text-body-lg text-on-surface">{datos.tipo}</dd>
        <dt className="text-label-md text-on-surface-variant">Público objetivo</dt>
        <dd className="text-body-lg text-on-surface">{segmentacion.publico_objetivo}</dd>
        <dt className="text-label-md text-on-surface-variant">Alcance</dt>
        <dd className="text-body-lg text-on-surface">{segmentacion.alcance}</dd>
        <dt className="text-label-md text-on-surface-variant">Derechos totales estimados</dt>
        <dd className="text-body-lg text-on-surface">
          {estadoPadron.datos?.derechos_totales ?? '—'}
        </dd>
      </dl>

      <label
        htmlFor={idOcultarResultados}
        className="flex items-center gap-2 text-body-md text-on-surface"
      >
        <input
          id={idOcultarResultados}
          type="checkbox"
          checked={ocultarResultados}
          onChange={(e) => onCambiarOcultarResultados(e.target.checked)}
          className="h-4 w-4 rounded-control border border-border-gray text-primary focus-visible:outline-2 focus-visible:outline-primary"
        />
        Ocultar resultados hasta el cierre
      </label>

      {errorEnvio && (
        <p role="alert" className="text-label-md text-error">
          {errorEnvio}
        </p>
      )}

      <button
        type="button"
        disabled={enviando}
        onClick={onConfirmar}
        className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary disabled:opacity-50"
      >
        {enviando ? 'Creando…' : 'Confirmar'}
      </button>
    </section>
  );
}
