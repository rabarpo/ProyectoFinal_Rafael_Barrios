interface PanelParticipacionProps {
  votosEmitidos: number;
  padronTotal: number;
  horaServidor: string;
}

/**
 * resultados-en-vivo (#16, PR3; design.md, "Vista frontend de resultados en vivo"; tasks.md
 * 14.1-14.3). Presentacional puro. Se monta SIEMPRE en `ResultadosPage`, tanto en modo visible
 * como en modo oculto (spec: "El sistema MUST mostrar participación siempre"). El servidor solo
 * manda `votos_emitidos`/`padron_total` (proposal.md decisión 1): el porcentaje de participación
 * y las abstenciones se derivan acá, en el cliente, con la misma fórmula que la spec fija para el
 * servidor (`padron_total - votos_emitidos`) — no viajan como campos del payload.
 */
export function PanelParticipacion({ votosEmitidos, padronTotal, horaServidor }: PanelParticipacionProps) {
  const abstenciones = padronTotal - votosEmitidos;
  const porcentaje = padronTotal > 0 ? (votosEmitidos / padronTotal) * 100 : 0;

  return (
    <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Participación</h2>

      <dl className="mt-4 space-y-2 text-body-md text-on-surface">
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Votos emitidos</dt>
          <dd>{votosEmitidos}</dd>
        </div>
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Padrón total</dt>
          <dd>{padronTotal}</dd>
        </div>
        <div className="flex justify-between border-b border-border-gray pb-2">
          <dt className="text-on-surface-variant">Participación</dt>
          <dd>{porcentaje.toFixed(1)}%</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Abstenciones</dt>
          <dd>{abstenciones}</dd>
        </div>
      </dl>

      <p className="mt-4 text-label-md text-on-surface-variant">
        Actualizado: {new Date(horaServidor).toLocaleString()}
      </p>
    </div>
  );
}
