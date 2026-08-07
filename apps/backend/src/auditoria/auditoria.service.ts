import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditEventType } from './audit-event-types';

/**
 * append-only-audit-engine (design.md D6, tarea 5.2). No inyecta `PrismaService`: la conexión
 * llega explícitamente por `tx`, así que este servicio entra al grafo de DI sin abrir Postgres
 * al arrancar (no rompe el gotcha D1 de system-scaffolding — `src/openapi.ts` instancia
 * `AppModule` sin base viva).
 *
 * `log()` no abre transacción propia y no acepta un `PrismaClient` completo: recibir
 * `Prisma.TransactionClient` hace que "escribir auditoría fuera de una transacción" ni siquiera
 * compile. La atomicidad con la escritura de negocio del caller viene de que ambos `INSERT`
 * ocurren en el mismo callback de `$transaction`, sobre la misma conexión — no de este servicio.
 *
 * Sin `occurred_at` en la firma (design.md D8): la columna tiene `DEFAULT now()` y ningún
 * llamador puede proveerla porque el parámetro no existe.
 */
@Injectable()
export class AuditoriaService {
  async log(
    tx: Prisma.TransactionClient,
    eventType: AuditEventType,
    actorId: string | null,
    entityType: string,
    entityId: string | null,
    payload: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.eventoAuditoria.create({
      data: {
        event_type: eventType,
        actor_usuario_id: actorId,
        entity_type: entityType,
        entity_id: entityId,
        payload,
      },
    });
  }
}
