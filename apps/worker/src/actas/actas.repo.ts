import type { PrismaClient } from '@prisma/client';
import type { ActaPendiente, ActasRepo } from '../processors/actas.processor';

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D11). Único lugar de este módulo que conoce
 * `PrismaClient` — el processor puro (`processors/actas.processor.ts`) nunca lo importa. Mismo
 * `PrismaClient` que `main.ts` y `outbox-correo.repo.ts`, generado desde el schema único de
 * `@seei/backend` — sin segundo schema (patrón de D10 de `#15`).
 */
export class PrismaActasRepo implements ActasRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async leer(id: string): Promise<ActaPendiente | null> {
    const fila = await this.prisma.acta.findUnique({ where: { id } });
    if (!fila) {
      return null;
    }
    return {
      id: fila.id,
      proceso_id: fila.proceso_id,
      tipo: fila.tipo,
      estado: fila.estado,
      contenido: fila.contenido,
    };
  }

  /**
   * Transacción terminal completa de D11:
   * 1. `SELECT id FROM "ProcesoElectoral" WHERE id=$1::uuid FOR UPDATE` — OBLIGATORIO. Sin este
   *    lock, dos workers que terminan la 3ª y la 4ª acta en paralelo bajo `ReadCommitted` pueden
   *    ver `count=3` cada uno y ninguno transiciona: el proceso quedaría atascado en `cerrado`
   *    para siempre con sus cuatro actas `emitida` — un estado inconsistente que ningún reintento
   *    repara. Es lo CONTRARIO de lo que `#14` D4 prohibía (`FOR UPDATE OF dv`, nunca el proceso)
   *    porque acá el proceso ya está `cerrado` y nadie más la toca: serializar cuatro
   *    transacciones por proceso es gratis.
   * 2. `updateMany({ where:{ id, estado:'borrador' }, data:{ pdf, pdf_mime, estado:'emitida' } })`
   *    — CAS real. `count===0` ⇒ no-op y fin: cubre tanto la reentrega de BullMQ (at-least-once,
   *    ADR-0012) como una segunda llamada a `finalizar` sobre la misma acta.
   * 3. `eventoAuditoria.create(ACTA_GENERADA)` con `actor_usuario_id: null` (el worker no tiene
   *    sesión) — primer evento de auditoría escrito por el worker (viable: `seei_app` conserva
   *    `INSERT`, ADR-0015).
   * 4. `acta.count({ where:{ proceso_id, estado:'emitida' } })`.
   * 5. si `=== 4`: `procesoElectoral.updateMany({ where:{ id: proceso_id, estado:'cerrado' },
   *    data:{ estado:'acta_emitida' } })` — CAS también, aunque bajo el `FOR UPDATE` del paso 1 no
   *    puede perder la carrera.
   */
  async finalizar(id: string, pdf: Buffer): Promise<'emitida' | 'no-op'> {
    return this.prisma.$transaction(async (tx) => {
      const acta = await tx.acta.findUnique({ where: { id }, select: { proceso_id: true, tipo: true } });
      if (!acta) {
        return 'no-op';
      }

      await tx.$queryRaw`SELECT id FROM "ProcesoElectoral" WHERE id = ${acta.proceso_id}::uuid FOR UPDATE`;

      const actualizada = await tx.acta.updateMany({
        where: { id, estado: 'borrador' },
        data: { pdf, pdf_mime: 'application/pdf', estado: 'emitida' },
      });
      if (actualizada.count === 0) {
        return 'no-op';
      }

      await tx.eventoAuditoria.create({
        data: {
          actor_usuario_id: null,
          event_type: 'ACTA_GENERADA',
          entity_type: 'Acta',
          entity_id: id,
          payload: { proceso_id: acta.proceso_id, tipo: acta.tipo, bytes: pdf.length },
        },
      });

      const emitidas = await tx.acta.count({
        where: { proceso_id: acta.proceso_id, estado: 'emitida' },
      });

      if (emitidas === 4) {
        await tx.procesoElectoral.updateMany({
          where: { id: acta.proceso_id, estado: 'cerrado' },
          data: { estado: 'acta_emitida' },
        });
      }

      return 'emitida';
    });
  }

  /**
   * Escrito exclusivamente por `worker.on('failed')` en `main.ts` cuando la cola agota los
   * reintentos configurados — nunca por el processor puro ni por esta transacción terminal.
   */
  async marcarFallido(id: string): Promise<void> {
    await this.prisma.acta.updateMany({
      where: { id, estado: 'borrador' },
      data: { estado: 'fallido' },
    });
  }

  async pendientes(limite: number): Promise<string[]> {
    const filas = await this.prisma.acta.findMany({
      where: { estado: 'borrador' },
      orderBy: { creado_en: 'asc' },
      take: limite,
      select: { id: true },
    });
    return filas.map((fila) => fila.id);
  }
}
