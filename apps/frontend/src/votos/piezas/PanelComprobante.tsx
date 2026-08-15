import { useId, useState } from 'react';

interface ComprobanteResumen {
  codigo_comprobante: string;
  hora_servidor: string;
  eleccion_resumen: string;
}

interface PanelComprobanteProps {
  comprobante: ComprobanteResumen;
}

/**
 * Presentacional puro (design.md D14, "Contratos HTTP", tasks.md 21.6-21.7). Muestra
 * `codigo_comprobante`, `hora_servidor` y `eleccion_resumen` — el resumen SÍ viaja al votante
 * ([ADR-0006] §2, distinto del payload de auditoría de D11, que nunca lo lleva). La casilla de
 * "copia por correo" (proposal.md, paso 3: "resumen + casilla de consentimiento de copia por
 * correo") es un gesto explícito del cliente sin campo asociado en `EmitirVotoDto` ni efecto en el
 * outbox real: ese envío es #15, íntegramente fuera de alcance de #14 (proposal.md, "Fuera de
 * alcance"). Marcarla solo confirma la intención en pantalla, nunca se infiere de la ausencia de
 * selección — mismo criterio de gesto explícito que `PasoConfirmacion`/`PanelConfirmacionApertura`.
 */
export function PanelComprobante({ comprobante }: PanelComprobanteProps) {
  const [copiaPorCorreo, setCopiaPorCorreo] = useState(false);
  const idCopia = useId();

  return (
    <div className="mx-auto w-full max-w-page rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Voto registrado</h2>

      <dl className="mt-4 space-y-2 text-body-md text-on-surface">
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Comprobante</dt>
          <dd>{comprobante.codigo_comprobante}</dd>
        </div>
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Hora</dt>
          <dd>{new Date(comprobante.hora_servidor).toLocaleString()}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Tu elección</dt>
          <dd>{comprobante.eleccion_resumen}</dd>
        </div>
      </dl>

      <label htmlFor={idCopia} className="mt-6 flex items-start gap-2 text-body-md text-on-surface">
        <input
          id={idCopia}
          type="checkbox"
          checked={copiaPorCorreo}
          onChange={(evento) => setCopiaPorCorreo(evento.target.checked)}
          className="mt-1 focus-visible:outline-2 focus-visible:outline-primary"
        />
        Quiero recibir una copia de este comprobante por correo
      </label>

      {copiaPorCorreo && (
        <p role="status" className="mt-2 text-label-md text-on-surface-variant">
          Se enviará una copia a tu correo cuando esté disponible.
        </p>
      )}
    </div>
  );
}
