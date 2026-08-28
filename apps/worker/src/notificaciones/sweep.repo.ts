import type { PrismaClient } from '@prisma/client';
import { emitirNotificaciones } from '@seei/backend/dist/notificaciones/emitir-notificaciones';
import type { EventoSweep, ProcesoAbierto, SweepRepo } from './sweep-notificaciones';

/**
 * notificaciones (backlog #19), PR10 (design.md D6, tarea 26.1). Adaptador Prisma de `SweepRepo`.
 * `emitirPendientes()` reusa `emitirNotificaciones()` de `@seei/backend` (PR3) — la semántica de
 * deduplicación (`ON CONFLICT` sobre `(proceso_id, evento, usuario_id)`) es literalmente la misma
 * que en los hooks de apertura/cierre (PR4), no una reimplementación.
 *
 * Atajo de D6/tarea 27.4: `count(Notificacion{proceso_id, evento}) > 0` corta ANTES de tocar
 * `DerechoVoto`/`Voto` — una vez emitido el evento para el proceso, un barrido repetido (cada
 * `NOTIFICACIONES_SWEEP_MS`) no vuelve a pagar el JOIN caro sobre el padrón completo [threat:
 * denegación por barrido/transacción larga]. La dedup REAL (correctitud bajo concurrencia) vive en
 * el `ON CONFLICT` de `emitirNotificaciones()`, no en este atajo — dos `emitirPendientes()`
 * concurrentes con el atajo en `0` igual convergen a N notificaciones, no 2N.
 */
export class PrismaSweepRepo implements SweepRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async procesosAbiertos(): Promise<ProcesoAbierto[]> {
    return this.prisma.procesoElectoral.findMany({
      where: { estado: 'abierto' },
      select: { id: true, fecha_cierre_prevista: true },
    });
  }

  async emitirPendientes(procesoId: string, evento: EventoSweep): Promise<void> {
    const yaEmitido = await this.prisma.notificacion.count({ where: { proceso_id: procesoId, evento } });
    if (yaEmitido > 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const proceso = await tx.procesoElectoral.findUnique({
        where: { id: procesoId },
        select: { id: true, nombre: true, fecha_cierre_prevista: true },
      });
      if (!proceso) {
        return;
      }

      const derechos = await tx.derechoVoto.findMany({
        where: { proceso_id: procesoId, votos: { none: {} } },
        select: { usuario_id: true },
      });
      if (derechos.length === 0) {
        return;
      }

      const destinatarios = [...new Set(derechos.map((derecho) => derecho.usuario_id))];

      await emitirNotificaciones(tx, {
        proceso,
        evento,
        destinatarios,
        actorId: null,
      });
    });
  }
}
