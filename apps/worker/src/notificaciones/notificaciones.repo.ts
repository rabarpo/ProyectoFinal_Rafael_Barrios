import type { PrismaClient } from '@prisma/client';
import type { JobCorreoPendiente, OutboxCorreoRepo } from '../processors/outbox-correo.processor';
import { PrismaOutboxCorreoRepo } from '../outbox/outbox-correo.repo';

/**
 * notificaciones (backlog #19), PR8 (design.md D7, tarea 20.1). Composición sobre
 * `PrismaOutboxCorreoRepo`: `leer()`/`reclamar()`/`marcarEnviado()`/`marcarFallido()` operan sobre
 * `JobCorreo` por `id`, sin distinguir `origen` — se delegan tal cual. Sólo `pendientes()` es
 * propio de esta cola (`origen:'notificacion'`), simétrico al filtro `origen:'comprobante'` que
 * PR7 agregó al repo base (corrige C5, aísla ambas colas).
 */
export class PrismaNotificacionesRepo implements OutboxCorreoRepo {
  private readonly base: PrismaOutboxCorreoRepo;

  constructor(private readonly prisma: PrismaClient) {
    this.base = new PrismaOutboxCorreoRepo(prisma);
  }

  leer(id: string): Promise<JobCorreoPendiente | null> {
    return this.base.leer(id);
  }

  reclamar(id: string): Promise<boolean> {
    return this.base.reclamar(id);
  }

  marcarEnviado(id: string): Promise<void> {
    return this.base.marcarEnviado(id);
  }

  marcarFallido(id: string): Promise<void> {
    return this.base.marcarFallido(id);
  }

  async pendientes(limite: number): Promise<string[]> {
    const filas = await this.prisma.jobCorreo.findMany({
      where: { estado: 'pendiente', origen: 'notificacion' },
      orderBy: { creado_en: 'asc' },
      take: limite,
      select: { id: true },
    });
    return filas.map((fila) => fila.id);
  }
}
