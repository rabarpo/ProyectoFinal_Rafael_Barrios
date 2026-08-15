import type { OutboxCorreoRepo } from '../processors/outbox-correo.processor';

/**
 * outbox-correo-comprobante-autenticado (#15, PR2; design.md D5, "Cómo llegan los jobs a
 * BullMQ"). El backend NUNCA encola nada: encolar tras el commit es el patrón vetado de forma
 * permanente por ADR-0018. Este despachador vive únicamente en el worker, hace *polling* liviano
 * sobre `estado='pendiente'` (barato gracias a `@@index([estado, creado_en])`, PR1 D1) y encola
 * por lotes. `jobId: 'jobcorreo:'+id` es la primera de las dos capas de idempotencia de D6 — la
 * segunda (CAS real en Postgres) vive en `procesarCorreoComprobante`.
 */
export const CORREO_QUEUE_NAME = 'correo';
export const CORREO_COMPROBANTE_JOB_NAME = 'correo.comprobante';

export interface OutboxJobData {
  job_correo_id: string;
}

export interface OutboxJobDescriptor {
  name: string;
  data: OutboxJobData;
  opts: {
    jobId: string;
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
  };
}

/** Puerto mínimo de `bullmq.Queue` que este despachador necesita — no depende de BullMQ en sí. */
export interface OutboxQueue {
  addBulk(jobs: OutboxJobDescriptor[]): Promise<unknown>;
}

export async function despacharLoteOutbox(
  repo: Pick<OutboxCorreoRepo, 'pendientes'>,
  queue: OutboxQueue,
  limite: number,
): Promise<number> {
  const ids = await repo.pendientes(limite);
  if (ids.length === 0) {
    return 0;
  }

  await queue.addBulk(
    ids.map((id) => ({
      name: CORREO_COMPROBANTE_JOB_NAME,
      data: { job_correo_id: id },
      opts: {
        jobId: `jobcorreo:${id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    })),
  );

  return ids.length;
}
