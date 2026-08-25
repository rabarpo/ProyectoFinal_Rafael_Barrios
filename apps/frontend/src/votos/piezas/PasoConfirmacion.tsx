import { useId, useState } from 'react';
import { BarraProgresoVotacion } from './BarraProgresoVotacion';

interface PasoConfirmacionProps {
  resumenSeleccion: string;
  enviando: boolean;
  mensajeError?: string;
  onConfirmar: () => void;
  onVolver: () => void;
}

/**
 * Presentacional puro (design.md D14, tasks.md 17.3), mismo criterio de gesto explícito que
 * `piezas/PanelConfirmacionApertura` (#13): exige un checkbox de consentimiento antes de habilitar
 * "Confirmar", y el botón muestra "Registrando…" mientras `enviando` está en curso.
 *
 * rediseno-boleta-votacion, PR4 (design.md D5, tasks.md 19.1): agrega `BarraProgresoVotacion` con
 * `pasoActual=3` como primer hijo — único cambio visual de este paso en este change.
 */
export function PasoConfirmacion({
  resumenSeleccion,
  enviando,
  mensajeError,
  onConfirmar,
  onVolver,
}: PasoConfirmacionProps) {
  const [consentido, setConsentido] = useState(false);
  const idConsentido = useId();

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <BarraProgresoVotacion pasoActual={3} totalPasos={3} />

      <h2 className="mt-4 text-headline-lg-mobile text-primary md:text-headline-lg">Confirmá tu voto</h2>

      <dl className="mt-4 rounded-card border border-border-gray bg-surface-white p-4 text-body-md text-on-surface">
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Tu elección</dt>
          <dd>{resumenSeleccion}</dd>
        </div>
      </dl>

      {mensajeError && (
        <p role="alert" className="mt-4 text-label-md text-error">
          {mensajeError}
        </p>
      )}

      <label
        htmlFor={idConsentido}
        className="mt-6 flex items-start gap-2 text-body-md text-on-surface"
      >
        <input
          id={idConsentido}
          type="checkbox"
          checked={consentido}
          onChange={(evento) => setConsentido(evento.target.checked)}
          className="mt-1 focus-visible:outline-2 focus-visible:outline-primary"
        />
        Confirmo mi elección. Esta acción no se puede deshacer.
      </label>

      <div className="mt-6 flex gap-4">
        <button
          type="button"
          onClick={() => {
            if (consentido && !enviando) onConfirmar();
          }}
          disabled={!consentido || enviando}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {enviando ? 'Registrando…' : 'Confirmar voto'}
        </button>
        <button
          type="button"
          onClick={onVolver}
          disabled={enviando}
          className="rounded-control px-4 py-3 text-label-md text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Volver
        </button>
      </div>
    </div>
  );
}
