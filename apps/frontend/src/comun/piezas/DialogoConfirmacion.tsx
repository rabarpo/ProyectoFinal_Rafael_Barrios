interface DialogoConfirmacionProps {
  titulo: string;
  descripcion: string;
  etiquetaConfirmar: string;
  onConfirmar: () => void;
  onCancelar: () => void;
  procesando: boolean;
}

/**
 * Presentacional puro (design.md D5, tasks.md Fase 8). Misma forma que
 * `auth/DialogoVinculacion` — `role="dialog"` inline, sin portal/overlay.
 * 3 consumidores reales: eliminar (con `codigo === 'ENTIDAD_CON_DEPENDIENTES'`
 * mostrando el mensaje via `mensajeDeError`), activar AñoEscolar (D9, sin
 * resumen del año actual) y el primer paso del traslado de Matrícula (D10).
 * `procesando` deshabilita ambos botones para evitar doble envío durante la
 * llamada asíncrona.
 */
export function DialogoConfirmacion({
  titulo,
  descripcion,
  etiquetaConfirmar,
  onConfirmar,
  onCancelar,
  procesando,
}: DialogoConfirmacionProps) {
  return (
    <div
      role="dialog"
      aria-label={titulo}
      className="rounded-card bg-surface-white p-6 shadow-elevation"
    >
      <p className="text-body-lg text-on-surface">{titulo}</p>
      <p className="mt-2 text-body-md text-on-surface-variant">{descripcion}</p>

      <div className="mt-6 flex gap-4">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={procesando}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary disabled:opacity-50"
        >
          {etiquetaConfirmar}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={procesando}
          className="rounded-control px-4 py-3 text-label-md text-primary disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
