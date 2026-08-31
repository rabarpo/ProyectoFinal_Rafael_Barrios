import type { ResumenJornadaDto } from '../panel-jornada-api';

interface BadgeEstadoProcesoProps {
  estado: ResumenJornadaDto['estado'];
}

const ESTILO_POR_ESTADO: Record<ResumenJornadaDto['estado'], { etiqueta: string; texto: string; punto: string }> = {
  abierto: { etiqueta: 'Activo', texto: 'bg-green-100 text-green-600', punto: 'bg-green-600' },
  cerrado: { etiqueta: 'Cerrado', texto: 'bg-error-container text-error', punto: 'bg-error' },
  acta_emitida: { etiqueta: 'Acta emitida', texto: 'bg-surface-container text-on-surface-variant', punto: 'bg-outline' },
};

/**
 * dashboard-panel-jornada (rediseño visual, captura de referencia del dashboard de elecciones).
 * Presentacional puro: mapea `resumen.estado` a etiqueta + color, con un punto de estado
 * decorativo (`aria-hidden`, la etiqueta de texto ya comunica el estado a lectores de pantalla).
 */
export function BadgeEstadoProceso({ estado }: BadgeEstadoProcesoProps) {
  const { etiqueta, texto, punto } = ESTILO_POR_ESTADO[estado];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-md ${texto}`}>
      <span data-testid="punto-estado-proceso" aria-hidden="true" className={`h-2 w-2 rounded-full ${punto}`} />
      {etiqueta}
    </span>
  );
}
