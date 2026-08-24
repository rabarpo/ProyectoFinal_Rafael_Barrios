import type { PrismaClient } from '@prisma/client';
import type { ReportePendiente, ReportesRepo } from '../processors/reportes.processor';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D12/D13). Único lugar de este módulo que conoce
 * `PrismaClient` — el processor puro (`processors/reportes.processor.ts`) nunca lo importa. Mismo
 * `PrismaClient` que `main.ts` y `actas.repo.ts`, generado desde el schema único de `@seei/backend`.
 */
export class PrismaReportesRepo implements ReportesRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async leer(id: string): Promise<ReportePendiente | null> {
    const fila = await this.prisma.reporte.findUnique({
      where: { id },
      include: { proceso: { select: { ocultar_resultados: true } } },
    });
    if (!fila) {
      return null;
    }
    return {
      id: fila.id,
      proceso_id: fila.proceso_id,
      dimension: fila.dimension,
      formato: fila.formato,
      estado: fila.estado,
      contenido: fila.contenido,
      // D7.2: releído AHORA, no el congelado en la solicitud — la visibilidad es política vigente.
      ocultar_resultados: fila.proceso.ocultar_resultados,
    };
  }

  /**
   * Transacción terminal de D12 — SIN `SELECT … FOR UPDATE`: no hay agregación entre filas que
   * proteger (a diferencia de `#17` D11, donde el `FOR UPDATE` protegía un `count()` de actas
   * hermanas). Cada `Reporte` es independiente y no transiciona nada fuera de sí mismo.
   * 1. `findUnique` de `proceso_id`/`dimension`/`formato`/`solicitado_por` (D13: el actor se lee
   *    de la fila, nunca del payload de BullMQ).
   * 2. `updateMany({ where:{ id, estado:'borrador' } })` — CAS real. `count===0` ⇒ no-op y fin:
   *    cubre tanto la reentrega de BullMQ (at-least-once, ADR-0012) como una segunda llamada.
   * 3. `eventoAuditoria.create('REPORTE_GENERADO')` con `actor_usuario_id = fila.solicitado_por`,
   *    payload cerrado (D13: sólo cardinalidades, nunca contenido).
   */
  async finalizar(
    id: string,
    archivo: Buffer,
    mime: string,
    nombre: string,
    gateAplicado: boolean,
    filas: number,
  ): Promise<'emitida' | 'no-op'> {
    return this.prisma.$transaction(async (tx) => {
      const reporte = await tx.reporte.findUnique({
        where: { id },
        select: { proceso_id: true, dimension: true, formato: true, solicitado_por: true },
      });
      if (!reporte) {
        return 'no-op';
      }

      const actualizada = await tx.reporte.updateMany({
        where: { id, estado: 'borrador' },
        data: {
          archivo,
          archivo_mime: mime,
          archivo_nombre: nombre,
          gate_aplicado: gateAplicado,
          estado: 'emitida',
          emitido_en: new Date(),
        },
      });
      if (actualizada.count === 0) {
        return 'no-op';
      }

      await tx.eventoAuditoria.create({
        data: {
          actor_usuario_id: reporte.solicitado_por,
          event_type: 'REPORTE_GENERADO',
          entity_type: 'Reporte',
          entity_id: id,
          payload: {
            proceso_id: reporte.proceso_id,
            dimension: reporte.dimension,
            formato: reporte.formato,
            gate_aplicado: gateAplicado,
            filas,
            bytes: archivo.length,
          },
        },
      });

      return 'emitida';
    });
  }

  /**
   * Escrito exclusivamente por `worker.on('failed')` en `main.ts` cuando la cola agota los
   * reintentos configurados — nunca por el processor puro ni por esta transacción terminal. No
   * pisa una fila ya `emitida` (D2, CAS con `WHERE estado='borrador'`).
   */
  async marcarFallido(id: string): Promise<void> {
    await this.prisma.reporte.updateMany({
      where: { id, estado: 'borrador' },
      data: { estado: 'fallido' },
    });
  }

  async pendientes(limite: number): Promise<string[]> {
    const filas = await this.prisma.reporte.findMany({
      where: { estado: 'borrador' },
      orderBy: { creado_en: 'asc' },
      take: limite,
      select: { id: true },
    });
    return filas.map((fila) => fila.id);
  }
}
