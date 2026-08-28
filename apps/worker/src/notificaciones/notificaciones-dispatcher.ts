import type { OutboxCorreoRepo } from '../processors/outbox-correo.processor';

/**
 * notificaciones (backlog #19), PR8 (design.md D7, copia estructural de `reportes-dispatcher.ts`).
 * Cola PROPIA `notificaciones`, nunca `correo`: un SMTP institucional lento no debe encolar
 * recordatorios detrás de comprobantes de voto, ni viceversa (aislamiento de colas, corrige C5 en
 * PR7). `attempts: 5` + backoff exponencial de 2000ms es el valor literal de las otras tres colas
 * vivas (`outbox`/`actas`/`reportes`) — sin motivo para un cuarto valor.
 */
export const NOTIFICACIONES_QUEUE_NAME = 'notificaciones';
export const NOTIFICACION_CORREO_JOB_NAME = 'notificacion.correo';

export interface NotificacionesJobData {
  job_correo_id: string;
}

export interface NotificacionesJobDescriptor {
  name: string;
  data: NotificacionesJobData;
  opts: {
    jobId: string;
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
  };
}

/** Puerto mínimo de `bullmq.Queue` que este despachador necesita — no depende de BullMQ en sí. */
export interface NotificacionesQueue {
  addBulk(jobs: NotificacionesJobDescriptor[]): Promise<unknown>;
}

export async function despacharLoteNotificaciones(
  repo: Pick<OutboxCorreoRepo, 'pendientes'>,
  queue: NotificacionesQueue,
  limite: number,
): Promise<number> {
  const ids = await repo.pendientes(limite);
  if (ids.length === 0) {
    return 0;
  }

  await queue.addBulk(
    ids.map((id) => ({
      name: NOTIFICACION_CORREO_JOB_NAME,
      data: { job_correo_id: id },
      opts: {
        jobId: `notificacion:${id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    })),
  );

  return ids.length;
}
