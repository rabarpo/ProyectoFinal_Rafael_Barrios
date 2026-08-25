interface ComprobanteResumen {
  codigo_comprobante: string;
  hora_servidor: string;
  eleccion_resumen: string;
}

interface PanelComprobanteProps {
  comprobante: ComprobanteResumen;
  yaRegistrado?: boolean;
}

/**
 * Presentacional puro (design.md D14, "Contratos HTTP", tasks.md 21.6-21.7). Muestra
 * `codigo_comprobante`, `hora_servidor` y `eleccion_resumen` — el resumen SÍ viaja al votante
 * ([ADR-0006] §2, distinto del payload de auditoría de D11, que nunca lo lleva).
 *
 * rediseno-boleta-votacion, PR4 (design.md D6, tasks.md 19.2-19.5). Jerarquía visual de éxito:
 * ícono de check + "¡Voto emitido correctamente!" + badge condicional "Ya has votado"
 * (`yaRegistrado`, reintento tras voto ya emitido). Sin "periodo lectivo" ni "estado de
 * sincronización" — ningún campo sin respaldo real en `ComprobanteDto`. NO monta
 * `BarraProgresoVotacion` (post-emisión, fuera de los 3 pasos, design.md D5).
 *
 * outbox-correo-comprobante-autenticado, PR4 (design.md D12, tasks.md 14.4-14.5): la casilla de
 * "copia por correo" (proposal.md #14, paso 3) era un gesto explícito del cliente sin efecto en
 * el outbox real — ese envío es #15. Con #15 el `JobCorreo` se inserta de forma incondicional en
 * la misma transacción del voto (D3): ofrecer una casilla que el sistema ya no respeta sería
 * engañoso, así que se reemplaza por una línea informativa de copia ya enviada. Esta pieza es
 * además reutilizada tal cual por `votos/ComprobantePage.tsx` (D12) para la relectura autenticada
 * del comprobante vía el enlace del correo (`yaRegistrado` siempre `true` en esa relectura).
 */
export function PanelComprobante({ comprobante, yaRegistrado }: PanelComprobanteProps) {
  return (
    <div className="mx-auto w-full max-w-page rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed text-headline-lg text-on-tertiary-fixed"
        >
          ✓
        </span>
        <h2 className="mt-3 text-headline-lg-mobile text-primary md:text-headline-lg">
          ¡Voto emitido correctamente!
        </h2>

        {yaRegistrado && (
          <span className="mt-2 rounded-control bg-secondary/10 px-3 py-1 text-label-md text-secondary">
            Ya has votado
          </span>
        )}
      </div>

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
