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
 * ([ADR-0006] §2, distinto del payload de auditoría de D11, que nunca lo lleva).
 *
 * outbox-correo-comprobante-autenticado, PR4 (design.md D12, tasks.md 14.4-14.5): la casilla de
 * "copia por correo" (proposal.md #14, paso 3) era un gesto explícito del cliente sin efecto en
 * el outbox real — ese envío es #15. Con #15 el `JobCorreo` se inserta de forma incondicional en
 * la misma transacción del voto (D3): ofrecer una casilla que el sistema ya no respeta sería
 * engañoso, así que se reemplaza por una línea informativa de copia ya enviada. Esta pieza es
 * además reutilizada tal cual por `votos/ComprobantePage.tsx` (D12) para la relectura autenticada
 * del comprobante vía el enlace del correo.
 */
export function PanelComprobante({ comprobante }: PanelComprobanteProps) {
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

      <p role="status" className="mt-6 text-label-md text-on-surface-variant">
        Se envió una copia de este comprobante a tu correo institucional.
      </p>
    </div>
  );
}
