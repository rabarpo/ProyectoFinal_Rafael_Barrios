interface ProcesoInfo {
  nombre: string;
  descripcion: string | null;
  fecha_cierre_prevista: string;
}

interface PasoInformacionProcesoProps {
  proceso: ProcesoInfo;
  yaVoto: boolean;
  onContinuar: () => void;
}

/**
 * Presentacional puro (design.md D14, tasks.md 17.4): paso 1 de la boleta — nombre, descripción y
 * hora de cierre del proceso. Si el derecho ya fue ejercido (`ya_voto` de `GET /votos/papeleta`,
 * D13), no deja avanzar a una boleta inútil, aunque la pantalla dedicada "ya votaste"
 * (`PantallaRechazo`, D14) queda para PR6 — acá solo un aviso mínimo en línea.
 */
export function PasoInformacionProceso({ proceso, yaVoto, onContinuar }: PasoInformacionProcesoProps) {
  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">{proceso.nombre}</h1>
      {proceso.descripcion && (
        <p className="mt-2 text-body-md text-on-surface-variant">{proceso.descripcion}</p>
      )}
      <p className="mt-2 text-label-md text-on-surface-variant">
        Cierra: {new Date(proceso.fecha_cierre_prevista).toLocaleString()}
      </p>

      {yaVoto && (
        <p role="alert" className="mt-4 text-label-md text-on-surface">
          Ya votaste en este proceso.
        </p>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={onContinuar}
          disabled={yaVoto}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
