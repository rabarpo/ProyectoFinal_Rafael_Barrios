/**
 * notificaciones (backlog #19), PR9 (design.md D6/D12). `barrerNotificaciones` es una decisión
 * PURA: recibe `ahora` por parámetro —nunca `new Date()` adentro— para que los casos de borde se
 * prueben sin relojes falsos, mismo criterio que `actas-contenido.ts` de `#17`. El adaptador
 * Prisma (`sweep.repo.ts`, PR10) implementa `SweepRepo`.
 */

export type EventoSweep = 'recordatorio' | 'cierre_proximo';

export interface ProcesoAbierto {
  id: string;
  fecha_cierre_prevista: Date;
}

export interface Umbrales {
  recordatorioHoras: number;
  cierreProximoHoras: number;
}

export interface SweepRepo {
  procesosAbiertos(): Promise<ProcesoAbierto[]>;
  emitirPendientes(procesoId: string, evento: EventoSweep): Promise<void>;
}

const HORA_MS = 60 * 60 * 1000;

/**
 * D6: los dos umbrales se evalúan INDEPENDIENTEMENTE en el mismo barrido — un proceso dentro de
 * ambos emite una de cada tipo, el más urgente no cancela al otro. `restante <= 0` no emite nada:
 * un proceso vencido y aún abierto es un problema del comité, no ruido a repetir en cada barrido.
 */
export async function barrerNotificaciones(repo: SweepRepo, umbrales: Umbrales, ahora: Date): Promise<void> {
  const procesos = await repo.procesosAbiertos();

  for (const proceso of procesos) {
    const restanteHoras = (proceso.fecha_cierre_prevista.getTime() - ahora.getTime()) / HORA_MS;
    if (restanteHoras <= 0) {
      continue;
    }
    if (restanteHoras <= umbrales.recordatorioHoras) {
      await repo.emitirPendientes(proceso.id, 'recordatorio');
    }
    if (restanteHoras <= umbrales.cierreProximoHoras) {
      await repo.emitirPendientes(proceso.id, 'cierre_proximo');
    }
  }
}

/**
 * D12, desviación declarada: `Number('abc')` es `NaN`, y `NaN` en una comparación de umbral es
 * siempre `false` — el sweep dejaría de notificar en silencio. Este helper cae al default ante
 * cualquier valor no finito o no positivo, así el barrido sigue emitiendo con un umbral válido.
 */
export function numeroPositivo(valor: string | undefined, valorDefault: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : valorDefault;
}
