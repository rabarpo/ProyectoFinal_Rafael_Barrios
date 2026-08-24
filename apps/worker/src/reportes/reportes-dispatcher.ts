import type { ReportesRepo } from '../processors/reportes.processor';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D9, copia estructural de `actas-dispatcher.ts`).
 * Cola PROPIA `reportes`, nunca `actas` ni `correo`: un export de 2000 filas en Excel es lento y
 * con `attempts: 5` puede ocupar un worker minutos — encolarlo detrás del cierre de actas
 * retrasaría la operación crítica. El backend NUNCA encola nada (ADR-0012, `#17` D10) — la fila
 * `Reporte` nace en `borrador` dentro de la transacción de `ReportesService.solicitar()` (PR3) y
 * este despachador la descubre por *polling*, barato gracias a `@@index([estado, creado_en])`
 * (PR1). `jobId: 'reporte:'+id` es la primera de las dos capas de idempotencia de D12 — la segunda
 * (CAS real en Postgres) vive en `reportes.repo.ts`.
 */
export const REPORTES_QUEUE_NAME = 'reportes';
export const REPORTE_GENERAR_JOB_NAME = 'reporte.generar';

export interface ReportesJobData {
  reporte_id: string;
}

export interface ReportesJobDescriptor {
  name: string;
  data: ReportesJobData;
  opts: {
    jobId: string;
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
  };
}

/** Puerto mínimo de `bullmq.Queue` que este despachador necesita — no depende de BullMQ en sí. */
export interface ReportesQueue {
  addBulk(jobs: ReportesJobDescriptor[]): Promise<unknown>;
}

export async function despacharLoteReportes(
  repo: Pick<ReportesRepo, 'pendientes'>,
  queue: ReportesQueue,
  limite: number,
): Promise<number> {
  const ids = await repo.pendientes(limite);
  if (ids.length === 0) {
    return 0;
  }

  await queue.addBulk(
    ids.map((id) => ({
      name: REPORTE_GENERAR_JOB_NAME,
      data: { reporte_id: id },
      opts: {
        jobId: `reporte:${id}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    })),
  );

  return ids.length;
}
