import { useEffect, useId, useRef, useState } from 'react';

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
 * confirmacion-voto-como-modal: deja de ser una pantalla de navegación (ya NO monta
 * `BarraProgresoVotacion`) y pasa a ser un diálogo MODAL superpuesto sobre el paso 2
 * (`PasoBoleta`, que sigue visible/oscurecido detrás — lo cablea `VotacionPage`). Primera pieza
 * del proyecto con backdrop real: overlay fijo de pantalla completa (`fixed inset-0 z-50`) con
 * scrim semitransparente, panel `role="dialog"`/`aria-modal="true"`/`aria-labelledby` centrado con
 * ancho acotado (`max-w-md`, no `max-w-page`). Cierra con Escape o click en el backdrop (mientras
 * no `enviando`, mismo gate que ya usan los botones); click DENTRO del panel no propaga
 * (`stopPropagation`). Foco al panel al montar — patrón simple `useRef`/`useEffect`, sin
 * focus-trap de librería externa.
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
  const idTitulo = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function alPresionarTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape' && !enviando) onVolver();
    }
    document.addEventListener('keydown', alPresionarTecla);
    return () => document.removeEventListener('keydown', alPresionarTecla);
  }, [enviando, onVolver]);

  return (
    <div
      data-testid="paso-confirmacion-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 px-5"
      onClick={() => {
        if (!enviando) onVolver();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onClick={(evento) => evento.stopPropagation()}
        className="w-full max-w-md rounded-card bg-surface-white p-6 shadow-elevation focus-visible:outline-none"
      >
        <h2 id={idTitulo} className="text-headline-lg-mobile text-primary md:text-headline-lg">
          Confirmá tu voto
        </h2>

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
    </div>
  );
}
