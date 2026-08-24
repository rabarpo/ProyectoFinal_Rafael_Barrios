import type { ReportesRepo } from '../processors/reportes.processor';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D13, tarea 20.2). Espejo de
 * `actas-fallido-listener.ts` (`#17` D11, tarea 23.2): `estado='fallido'` lo escribe SÓLO este
 * listener cuando la cola agota los reintentos — nunca el processor ni el repo (D9), mismo reparto
 * de responsabilidades.
 */

export interface JobFallido {
  data: { reporte_id: string };
  attemptsMade: number;
  opts: { attempts?: number };
}

export function crearListenerReportesFallido(
  repo: Pick<ReportesRepo, 'marcarFallido'>,
): (job: JobFallido | undefined, error: Error) => void {
  return (job) => {
    if (!job) {
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      void repo.marcarFallido(job.data.reporte_id);
    }
  };
}
