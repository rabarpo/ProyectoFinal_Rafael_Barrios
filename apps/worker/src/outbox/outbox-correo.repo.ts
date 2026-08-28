import type { PrismaClient } from '@prisma/client';
import type { JobCorreoPendiente, OutboxCorreoRepo } from '../processors/outbox-correo.processor';

/**
 * outbox-correo-comprobante-autenticado (#15, PR2; design.md D8/D10). Único lugar de este módulo
 * que conoce `PrismaClient` — el processor puro (`outbox-correo.processor.ts`) nunca lo importa.
 * Mismo `PrismaClient` que `main.ts`, generado desde el schema único de `@seei/backend`
 * (`prisma generate --schema ../backend/prisma/schema.prisma`, script `generate` del
 * `package.json` de este paquete) — sin segundo schema (D10).
 */
export class PrismaOutboxCorreoRepo implements OutboxCorreoRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async leer(id: string): Promise<JobCorreoPendiente | null> {
    const fila = await this.prisma.jobCorreo.findUnique({
      where: { id },
      include: { usuario: { select: { correo: true } } },
    });
    if (!fila) {
      return null;
    }
    return {
      id: fila.id,
      estado: fila.estado,
      asunto: fila.asunto,
      cuerpo: fila.cuerpo,
      destinatario: fila.usuario.correo,
    };
  }

  /**
   * Barrera CAS real de D6: una sola sentencia atómica que sirve de guardia y de contador de
   * `intentos` (espejo no autoritativo, D7 — BullMQ decide cuándo reintentar, no este contador).
   */
  async reclamar(id: string): Promise<boolean> {
    const resultado = await this.prisma.jobCorreo.updateMany({
      where: { id, estado: 'pendiente' },
      data: { intentos: { increment: 1 } },
    });
    return resultado.count > 0;
  }

  async marcarEnviado(id: string): Promise<void> {
    await this.prisma.jobCorreo.updateMany({
      where: { id, estado: 'pendiente' },
      data: { estado: 'enviado' },
    });
  }

  /**
   * Escrito exclusivamente por el listener `worker.on('failed')` de `main.ts` cuando la cola
   * agota los reintentos (D7) — nunca por el processor puro.
   */
  async marcarFallido(id: string): Promise<void> {
    await this.prisma.jobCorreo.updateMany({
      where: { id },
      data: { estado: 'fallido' },
    });
  }

  /**
   * notificaciones (backlog #19), PR7 (design.md D3, corrige C5). `origen:'comprobante'` aísla
   * esta cola de la cola `notificaciones` (`#19` PR8): sin este filtro, un `JobCorreo` emitido por
   * `emitirNotificaciones()` (`origen:'notificacion'`) también calificaría acá y dos workers
   * podrían disputarse el mismo job.
   */
  async pendientes(limite: number): Promise<string[]> {
    const filas = await this.prisma.jobCorreo.findMany({
      where: { estado: 'pendiente', origen: 'comprobante' },
      orderBy: { creado_en: 'asc' },
      take: limite,
      select: { id: true },
    });
    return filas.map((fila) => fila.id);
  }
}
