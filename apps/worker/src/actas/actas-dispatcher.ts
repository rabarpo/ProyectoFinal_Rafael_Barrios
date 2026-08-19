import type { ActasRepo } from '../processors/actas.processor';

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D10, "copia estructural de outbox-dispatcher.ts").
 * Cola PROPIA (`actas`), nunca compartida con `correo`: un SMTP caído no debe encolar el cierre
 * detrás de los reintentos del outbox de correo. El backend NUNCA encola nada — la fila `Acta`
 * nace en `borrador` dentro de la transacción de `cerrar()` (PR3) y este despachador la descubre
 * por *polling*, barato gracias a `@@index([estado, creado_en])` (PR1). `jobId: 'acta:'+id` es la
 * primera de las dos capas de idempotencia de D11 — la segunda (CAS real en Postgres) vive en
 * `actasRepo.finalizar()`.
 */
export const ACTAS_QUEUE_NAME = 'actas';
export const ACTA_PDF_JOB_NAME = 'acta.pdf';

export interface ActasJobData {
  acta_id: string;
}

export interface ActasJobDescriptor {
  name: string;
  data: ActasJobData;
  opts: {
    jobId: string;
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
  };
}

/** Puerto mínimo de `bullmq.Queue` que este despachador necesita — no depende de BullMQ en sí. */
export interface ActasQueue {
  addBulk(jobs: ActasJobDescriptor[]): Promise<unknown>;
}

export async function despacharLoteActas(
  repo: Pick<ActasRepo, 'pendientes'>,
  queue: ActasQueue,
  limite: number,
): Promise<number> {
  const ids = await repo.pendientes(limite);
  if (ids.length === 0) {
    return 0;
  }

  await queue.addBulk(
    ids.map((id) => ({
      name: ACTA_PDF_JOB_NAME,
      data: { acta_id: id },
      opts: {
        jobId: `acta:${id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    })),
  );

  return ids.length;
}
