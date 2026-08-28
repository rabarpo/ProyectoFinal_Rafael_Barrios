import type { OutboxCorreoRepo } from '../processors/outbox-correo.processor';

/**
 * notificaciones (backlog #19), PR8 (design.md D7, tarea 21.1). Espejo de
 * `crearListenerActasFallido`/`crearListenerReportesFallido`: `estado='fallido'` lo escribe SÓLO
 * este listener cuando la cola agota los reintentos — nunca `procesarCorreoComprobante`, que se
 * reusa sin cambios (D7) y sigue sin conocer el estado terminal.
 */

export interface JobFallido {
  data: { job_correo_id: string };
  attemptsMade: number;
  opts: { attempts?: number };
}

export function crearListenerNotificacionesFallido(
  repo: Pick<OutboxCorreoRepo, 'marcarFallido'>,
): (job: JobFallido | undefined, error: Error) => void {
  return (job) => {
    if (!job) {
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      void repo.marcarFallido(job.data.job_correo_id);
    }
  };
}
