import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { construirNotificacion, type EventoNotificacionSeei } from './plantillas-notificacion';

/**
 * notificaciones (#19, PR3; design.md D4). Emisor ÚNICO — función LIBRE sobre
 * `Prisma.TransactionClient`, mismo idioma que `materializarDerechosVoto()`/`escrutinio.ts`
 * (`procesos.service.ts`): el sweep del worker no puede importar el contenedor de DI de Nest, así
 * que no puede ser un provider inyectable. La usan los dos hooks de `procesos.service.ts` (PR4) Y
 * el sweep del worker (PR9/PR10) — la semántica de deduplicación es literalmente la misma en los
 * tres, no "la misma por convención".
 *
 * Orden de las 4 sentencias (no se reordena): la `Notificacion` se inserta PRIMERO con
 * `ON CONFLICT ("proceso_id","evento","usuario_id") DO NOTHING RETURNING id, usuario_id` — sólo las
 * filas realmente insertadas siguen a la fase 2. Así un `JobCorreo` duplicado no puede llegar a
 * existir nunca: el índice único de la migración de PR1 es quien sostiene la idempotencia, esta
 * función sólo la respeta.
 */

const LOTE_NOTIFICACIONES = 500;

export interface ProcesoNotificable {
  id: string;
  nombre: string;
  fecha_cierre_prevista: Date;
}

export interface ParametrosEmision {
  proceso: ProcesoNotificable;
  evento: EventoNotificacionSeei;
  /** usuario_id[], YA sin duplicados (DISTINCT del caller) — ver D5. */
  destinatarios: string[];
  /** Hooks: usuario del comité. Sweep: null (D11). */
  actorId: string | null;
  app_base_url?: string;
}

export interface ResultadoEmision {
  notificaciones: number;
  jobs_correo: number;
}

interface FilaNotificacionInsertada {
  id: string;
  usuario_id: string;
}

export async function emitirNotificaciones(
  tx: Prisma.TransactionClient,
  params: ParametrosEmision,
): Promise<ResultadoEmision> {
  const { proceso, evento, destinatarios, actorId, app_base_url } = params;

  if (destinatarios.length === 0) {
    return { notificaciones: 0, jobs_correo: 0 };
  }

  const { titulo, cuerpo, asunto } = construirNotificacion(evento, {
    proceso_nombre: proceso.nombre,
    fecha_cierre_prevista: proceso.fecha_cierre_prevista,
    app_base_url,
  });

  let totalNotificaciones = 0;
  let totalJobsCorreo = 0;

  for (let i = 0; i < destinatarios.length; i += LOTE_NOTIFICACIONES) {
    const lote = destinatarios.slice(i, i + LOTE_NOTIFICACIONES);

    const filasNuevas = lote.map((usuarioId) => ({
      id: randomUUID(),
      usuario_id: usuarioId,
    }));

    const valores = Prisma.join(
      filasNuevas.map(
        (fila) =>
          Prisma.sql`(${fila.id}::uuid, ${proceso.id}::uuid, ${evento}::"EventoNotificacion", ${fila.usuario_id}::uuid, 'interna'::"TipoNotificacion", ${titulo}, ${cuerpo})`,
      ),
    );

    // ON CONFLICT DO NOTHING sobre el índice único de PR1 (proceso_id, evento, usuario_id).
    // RETURNING acota las 3 fases siguientes SÓLO a lo realmente insertado.
    const insertadas = await tx.$queryRaw<FilaNotificacionInsertada[]>`
      INSERT INTO "Notificacion" (id, proceso_id, evento, usuario_id, tipo, titulo, cuerpo)
      VALUES ${valores}
      ON CONFLICT ("proceso_id", "evento", "usuario_id") DO NOTHING
      RETURNING id, usuario_id
    `;

    if (insertadas.length === 0) {
      continue;
    }

    totalNotificaciones += insertadas.length;

    const jobs = insertadas.map((notificacion) => ({
      id: randomUUID(),
      notificacionId: notificacion.id,
      usuario_id: notificacion.usuario_id,
      asunto,
      cuerpo,
      origen: 'notificacion' as const,
    }));

    await tx.jobCorreo.createMany({
      data: jobs.map((job) => ({
        id: job.id,
        usuario_id: job.usuario_id,
        asunto: job.asunto,
        cuerpo: job.cuerpo,
        origen: job.origen,
      })),
    });
    totalJobsCorreo += jobs.length;

    // UPDATE batched — una sola sentencia por lote, no N updates.
    const notifIds = jobs.map((job) => job.notificacionId);
    const jobIds = jobs.map((job) => job.id);
    await tx.$executeRaw`
      UPDATE "Notificacion" AS n
      SET job_correo_id = j.job_id
      FROM (
        SELECT unnest(${notifIds}::uuid[]) AS notif_id, unnest(${jobIds}::uuid[]) AS job_id
      ) AS j
      WHERE n.id = j.notif_id
    `;
  }

  if (totalNotificaciones > 0) {
    // Evento agregado, jamás uno por notificación (D11): ≤4 filas por proceso. Payload cerrado
    // sin usuario_id ni identidad de elección [threat: secreto del voto/PII].
    await tx.eventoAuditoria.create({
      data: {
        actor_usuario_id: actorId,
        event_type: 'NOTIFICACIONES_EMITIDAS',
        entity_type: 'ProcesoElectoral',
        entity_id: proceso.id,
        payload: {
          evento,
          notificaciones: totalNotificaciones,
          jobs_correo: totalJobsCorreo,
        },
      },
    });
  }

  return { notificaciones: totalNotificaciones, jobs_correo: totalJobsCorreo };
}
