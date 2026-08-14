import { useId, useState } from 'react';

export interface ResumenProceso {
  nombre: string;
  tipo: string;
  publico_objetivo: string;
  alcance: string;
  aulas: number;
  ocultar_resultados: boolean;
}

interface PanelConfirmacionAperturaProps {
  proceso: ResumenProceso;
  onConfirmar: () => void;
  onCancelar: () => void;
  cargando: boolean;
  mensajeError?: string;
}

/**
 * Presentacional puro (design.md D13), espejo literal de
 * `auth/DialogoVinculacion.tsx`: tarjeta `role="dialog"` en flujo, sin
 * overlay ni portal — el repo no tiene primitiva de modal (D13). Muestra
 * `ocultar_resultados` de forma prominente (`role="alert"` cuando es `true`,
 * requisito de `TECH-DESIGN.md` referenciado por la propuesta) y exige el
 * gesto explícito de un checkbox antes de habilitar "Confirmar apertura": la
 * transición es irreversible (design.md, flujo de datos).
 */
export function PanelConfirmacionApertura({
  proceso,
  onConfirmar,
  onCancelar,
  cargando,
  mensajeError,
}: PanelConfirmacionAperturaProps) {
  const [entendido, setEntendido] = useState(false);
  const idEntendido = useId();

  return (
    <div
      role="dialog"
      aria-label="Confirmar apertura de proceso"
      className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation"
    >
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">
        Abrir «{proceso.nombre}»
      </h2>
      <p className="mt-2 text-body-md text-on-surface">
        Esta acción congela la segmentación de aulas y materializa el padrón de derechos de voto. No
        se puede deshacer.
      </p>

      <dl className="mt-4 space-y-2 text-body-md text-on-surface">
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Tipo</dt>
          <dd>{proceso.tipo}</dd>
        </div>
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Público objetivo</dt>
          <dd>{proceso.publico_objetivo}</dd>
        </div>
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Alcance</dt>
          <dd>{proceso.alcance}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Aulas segmentadas</dt>
          <dd>{proceso.aulas}</dd>
        </div>
      </dl>

      <div
        role={proceso.ocultar_resultados ? 'alert' : undefined}
        className={
          proceso.ocultar_resultados
            ? 'mt-4 rounded-control border border-error bg-error-container p-4 text-label-md text-on-error-container'
            : 'mt-4 rounded-control border border-border-gray p-4 text-label-md text-on-surface'
        }
      >
        {proceso.ocultar_resultados
          ? 'Los resultados quedarán OCULTOS mientras el proceso esté abierto.'
          : 'Los resultados serán visibles mientras el proceso esté abierto.'}
      </div>

      {mensajeError && (
        <p role="alert" className="mt-4 text-label-md text-error">
          {mensajeError}
        </p>
      )}

      <label htmlFor={idEntendido} className="mt-6 flex items-start gap-2 text-body-md text-on-surface">
        <input
          id={idEntendido}
          type="checkbox"
          checked={entendido}
          onChange={(evento) => setEntendido(evento.target.checked)}
          className="mt-1 focus-visible:outline-2 focus-visible:outline-primary"
        />
        Entiendo que esta acción es irreversible y confirmo la apertura.
      </label>

      <div className="mt-6 flex gap-4">
        <button
          type="button"
          onClick={() => {
            if (entendido) onConfirmar();
          }}
          disabled={!entendido || cargando}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {cargando ? 'Abriendo…' : 'Confirmar apertura'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-control px-4 py-3 text-label-md text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
