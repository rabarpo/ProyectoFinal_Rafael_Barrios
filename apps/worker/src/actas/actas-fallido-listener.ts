import type { ActasRepo } from '../processors/actas.processor';

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D11, tarea 23.2). Desviación declarada: el design
 * no separa este listener en un archivo propio (`main.ts` lo tiene inline en el precedente de
 * `#15`, sin `.spec.ts`), pero `main.ts` construye conexiones Redis/Prisma reales en el nivel de
 * módulo (efecto de import), así que no se puede importar sin abrir sockets. Extraer la decisión
 * pura (`attemptsMade >= attempts ⇒ marcarFallido`) a un factory testeable es el mínimo cambio que
 * satisface la tarea 23.2 sin tocar el patrón de wiring existente de `correoWorker.on('failed')`.
 *
 * `estado='fallido'` lo escribe SÓLO este listener cuando la cola agota los reintentos — nunca el
 * processor ni el repo (D11), mismo reparto de responsabilidades que `#15` D7/D8.
 */

export interface JobFallido {
  data: { acta_id: string };
  attemptsMade: number;
  opts: { attempts?: number };
}

export function crearListenerActasFallido(
  repo: Pick<ActasRepo, 'marcarFallido'>,
): (job: JobFallido | undefined, error: Error) => void {
  return (job) => {
    if (!job) {
      return;
    }
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      void repo.marcarFallido(job.data.acta_id);
    }
  };
}
