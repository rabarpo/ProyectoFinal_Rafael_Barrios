import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { procesarSystemPing } from './processors/system-ping.processor';
import { procesarCorreoComprobante } from './processors/outbox-correo.processor';
import { procesarActa } from './processors/actas.processor';
import { PrismaOutboxCorreoRepo } from './outbox/outbox-correo.repo';
import { crearEmailSender } from './outbox/email-sender.factory';
import {
  CORREO_COMPROBANTE_JOB_NAME,
  CORREO_QUEUE_NAME,
  despacharLoteOutbox,
} from './outbox/outbox-dispatcher';
import { PrismaActasRepo } from './actas/actas.repo';
import { PdfkitRendererActa } from './actas/pdfkit-renderer';
import { ACTA_PDF_JOB_NAME, ACTAS_QUEUE_NAME, despacharLoteActas } from './actas/actas-dispatcher';
import { crearListenerActasFallido, type JobFallido } from './actas/actas-fallido-listener';
import { procesarReporte, type RendererReporte } from './processors/reportes.processor';
import { PrismaReportesRepo } from './reportes/reportes.repo';
import { RendererExcel } from './reportes/exceljs-renderer';
import { RendererPdf } from './reportes/pdfkit-renderer-reporte';
import { RendererCsv } from './reportes/csv-renderer';
import {
  REPORTE_GENERAR_JOB_NAME,
  REPORTES_QUEUE_NAME,
  despacharLoteReportes,
} from './reportes/reportes-dispatcher';
import {
  crearListenerReportesFallido,
  type JobFallido as ReporteJobFallido,
} from './reportes/reportes-fallido-listener';
import { PrismaNotificacionesRepo } from './notificaciones/notificaciones.repo';
import {
  NOTIFICACION_CORREO_JOB_NAME,
  NOTIFICACIONES_QUEUE_NAME,
  despacharLoteNotificaciones,
} from './notificaciones/notificaciones-dispatcher';
import {
  crearListenerNotificacionesFallido,
  type JobFallido as NotificacionJobFallido,
} from './notificaciones/notificaciones-fallido-listener';
import { barrerNotificaciones, numeroPositivo } from './notificaciones/sweep-notificaciones';
import { PrismaSweepRepo } from './notificaciones/sweep.repo';

/**
 * Deben coincidir con `SYSTEM_QUEUE_NAME`/`SYSTEM_PING_JOB_NAME` de
 * `apps/backend/src/system-ping/system-ping-queue.provider.ts`. No se
 * comparten vía un paquete común porque `packages/contracts` es exclusivo
 * del contrato HTTP/OpenAPI (ADR-0001/ADR-0002), no de mensajería interna.
 */
const SYSTEM_QUEUE_NAME = 'system';
const SYSTEM_PING_JOB_NAME = 'system.ping';

/**
 * outbox-correo-comprobante-autenticado (#15, PR2; design.md D5/D7). `OUTBOX_POLL_MS`/
 * `OUTBOX_BATCH` gobiernan el despachador (D5); `attempts`/`backoff` del `addBulk` viven en
 * `outbox-dispatcher.ts`, no acá — este archivo sólo arranca el temporizador.
 */
const OUTBOX_POLL_MS = Number(process.env.OUTBOX_POLL_MS ?? 5000);
const OUTBOX_BATCH = Number(process.env.OUTBOX_BATCH ?? 20);

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D10/D15). Mismos defaults que `OUTBOX_*` (5000/20)
 * — el barrido sobre `Acta WHERE estado='borrador'` es igual de barato gracias a
 * `@@index([estado, creado_en])`.
 */
const ACTAS_POLL_MS = Number(process.env.ACTAS_POLL_MS ?? 5000);
const ACTAS_BATCH = Number(process.env.ACTAS_BATCH ?? 20);

/**
 * reportes-y-exportaciones (#18, PR4; design.md D9/D14). Mismos defaults que `ACTAS_*`/`OUTBOX_*`
 * (5000/20) — el barrido sobre `Reporte WHERE estado='borrador'` es igual de barato gracias a
 * `@@index([estado, creado_en])` (PR1).
 */
const REPORTES_POLL_MS = Number(process.env.REPORTES_POLL_MS ?? 5000);
const REPORTES_BATCH = Number(process.env.REPORTES_BATCH ?? 20);

/**
 * notificaciones (backlog #19), PR8 (design.md D7/D12). Mismos defaults que `OUTBOX_*`/`ACTAS_*`/
 * `REPORTES_*` (5000/20) — el barrido sobre `JobCorreo WHERE estado='pendiente' AND
 * origen='notificacion'` es igual de barato gracias al índice existente de `#15`.
 */
const NOTIFICACIONES_POLL_MS = Number(process.env.NOTIFICACIONES_POLL_MS ?? 5000);
const NOTIFICACIONES_BATCH = Number(process.env.NOTIFICACIONES_BATCH ?? 20);

/**
 * notificaciones (backlog #19), PR10 (design.md D12). `numeroPositivo()` cae al default ante
 * cualquier valor no finito o no positivo — desviación declarada del patrón `Number(x ?? def)` de
 * las demás env vars: un `NaN` acá degeneraría `setInterval` a un temporizador de ~1ms y el sweep
 * dejaría de notificar en silencio.
 */
const NOTIFICACIONES_SWEEP_MS = numeroPositivo(process.env.NOTIFICACIONES_SWEEP_MS, 60000);
const NOTIFICACIONES_RECORDATORIO_HORAS = numeroPositivo(process.env.NOTIFICACIONES_RECORDATORIO_HORAS, 24);
const NOTIFICACIONES_CIERRE_PROXIMO_HORAS = numeroPositivo(process.env.NOTIFICACIONES_CIERRE_PROXIMO_HORAS, 2);

/**
 * `maxRetriesPerRequest: null` es requerido por BullMQ para conexiones de
 * `Worker` (bloqueantes en `BRPOPLPUSH`/`BLMOVE`); a diferencia del cliente
 * `lazyConnect: true` del backend (gotcha D1 de design.md), este worker SÍ
 * necesita una conexión viva de entrada para poder recibir jobs.
 */
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const worker = new Worker(
  SYSTEM_QUEUE_NAME,
  async (job) => {
    if (job.name === SYSTEM_PING_JOB_NAME) {
      await procesarSystemPing(connection);
    }
  },
  { connection },
);

worker.on('error', (error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "system":', error);
});

/**
 * outbox-correo-comprobante-autenticado (#15, PR2; design.md D10). `PrismaClient` generado desde
 * el schema ÚNICO de `@seei/backend` (`pnpm --filter @seei/worker generate`) — sin segundo
 * schema. Único punto de este archivo (junto con el adaptador) que conoce Prisma; el processor
 * puro (`processors/outbox-correo.processor.ts`) nunca lo importa (D8).
 */
const prisma = new PrismaClient();
const outboxRepo = new PrismaOutboxCorreoRepo(prisma);
const correoQueue = new Queue(CORREO_QUEUE_NAME, { connection });

/**
 * D8: el processor recibe puertos (`outboxRepo`, `sender`), nunca Prisma ni BullMQ directamente.
 * `crearEmailSender` resuelve `Configuracion` en cada job (D9) — sin caché, igual semántica que
 * `ConfiguracionEmailSender` del backend.
 */
export const correoWorker = new Worker(
  CORREO_QUEUE_NAME,
  async (job) => {
    if (job.name !== CORREO_COMPROBANTE_JOB_NAME) {
      return;
    }
    const sender = await crearEmailSender(prisma);
    await procesarCorreoComprobante(outboxRepo, sender, job.data.job_correo_id as string);
  },
  { connection },
);

correoWorker.on('error', (error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "correo":', error);
});

/**
 * D7: BullMQ decide CUÁNDO reintentar (`attempts`/`backoff`, ver `outbox-dispatcher.ts`); este
 * listener sólo escribe el estado TERMINAL `fallido` cuando la cola agota los reintentos
 * configurados — nunca desde el processor, que permanece puro (D8).
 */
correoWorker.on('failed', (job, error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "correo":', error);
  if (!job) {
    return;
  }
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= attempts) {
    void outboxRepo.marcarFallido(job.data.job_correo_id as string);
  }
});

/**
 * D5: despachador liviano de *polling* — Postgres es la fuente de verdad, BullMQ sólo ejecuta y
 * reintenta. Ningún encolado ocurre desde el backend tras el commit (patrón vetado, ADR-0018).
 */
setInterval(() => {
  despacharLoteOutbox(outboxRepo, correoQueue, OUTBOX_BATCH).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[worker] error despachando lote de outbox:', error);
  });
}, OUTBOX_POLL_MS);

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D10/D11). Cola PROPIA `actas`, nunca compartida con
 * `correo` (D10): un SMTP caído no debe encolar el cierre detrás de los reintentos del outbox. El
 * backend NUNCA encola nada — la fila `Acta` nace en `borrador` dentro de la transacción de
 * `cerrar()` (PR3) y este despachador la descubre por *polling* (ADR-0018/ADR-0012).
 */
const actasRepo = new PrismaActasRepo(prisma);
const actasRenderer = new PdfkitRendererActa();
const actasQueue = new Queue(ACTAS_QUEUE_NAME, { connection });

/**
 * D10: el processor recibe puertos (`actasRepo`, `actasRenderer`), nunca Prisma ni BullMQ
 * directamente — mismo reparto de responsabilidades que `correoWorker`.
 */
export const actasWorker = new Worker(
  ACTAS_QUEUE_NAME,
  async (job) => {
    if (job.name !== ACTA_PDF_JOB_NAME) {
      return;
    }
    await procesarActa(actasRepo, actasRenderer, job.data.acta_id as string);
  },
  { connection },
);

actasWorker.on('error', (error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "actas":', error);
});

/**
 * D11: BullMQ decide CUÁNDO reintentar (`attempts`/`backoff`, ver `actas-dispatcher.ts`); este
 * listener sólo escribe el estado TERMINAL `fallido` cuando la cola agota los reintentos
 * configurados — nunca desde el processor, que permanece puro (D10). Lógica de decisión extraída
 * a `crearListenerActasFallido` (desviación declarada, tarea 23.2) para que sea testeable sin
 * abrir conexiones reales.
 */
const listenerActasFallido = crearListenerActasFallido(actasRepo);
actasWorker.on('failed', (job, error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "actas":', error);
  listenerActasFallido(job as unknown as JobFallido | undefined, error);
});

/**
 * D10: despachador liviano de *polling* — Postgres es la fuente de verdad, BullMQ sólo ejecuta y
 * reintenta. El backend nunca encola actas (patrón vetado, ADR-0018/ADR-0012).
 */
setInterval(() => {
  despacharLoteActas(actasRepo, actasQueue, ACTAS_BATCH).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[worker] error despachando lote de actas:', error);
  });
}, ACTAS_POLL_MS);

/**
 * reportes-y-exportaciones (#18, PR4; design.md D9/D10). Cola PROPIA `reportes`, nunca compartida
 * con `actas` ni `correo` (D9): un export de 2000 filas en Excel es lento y con `attempts: 5`
 * puede ocupar un worker minutos — encolarlo detrás del cierre de actas retrasaría la operación
 * crítica. El backend NUNCA encola nada — la fila `Reporte` nace en `borrador` dentro de la
 * transacción de `ReportesService.solicitar()` (PR3) y este despachador la descubre por *polling*.
 */
const reportesRepo = new PrismaReportesRepo(prisma);
const reportesQueue = new Queue(REPORTES_QUEUE_NAME, { connection });

/**
 * D10: mapa `Record<FormatoReporte, RendererReporte>` — el processor recibe puertos (`reportesRepo`,
 * `reportesRenderers`), nunca Prisma ni BullMQ directamente.
 */
const reportesRenderers: Record<string, RendererReporte> = {
  excel: new RendererExcel(),
  pdf: new RendererPdf(),
  csv: new RendererCsv(),
};

export const reportesWorker = new Worker(
  REPORTES_QUEUE_NAME,
  async (job) => {
    if (job.name !== REPORTE_GENERAR_JOB_NAME) {
      return;
    }
    await procesarReporte(reportesRepo, reportesRenderers, job.data.reporte_id as string);
  },
  { connection },
);

reportesWorker.on('error', (error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "reportes":', error);
});

/**
 * D13: BullMQ decide CUÁNDO reintentar (`attempts`/`backoff`, ver `reportes-dispatcher.ts`); este
 * listener sólo escribe el estado TERMINAL `fallido` cuando la cola agota los reintentos
 * configurados — nunca desde el processor, que permanece puro (D9).
 */
const listenerReportesFallido = crearListenerReportesFallido(reportesRepo);
reportesWorker.on('failed', (job, error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "reportes":', error);
  listenerReportesFallido(job as unknown as ReporteJobFallido | undefined, error);
});

/**
 * D9: despachador liviano de *polling* — Postgres es la fuente de verdad, BullMQ sólo ejecuta y
 * reintenta. El backend nunca encola reportes (ADR-0012).
 */
setInterval(() => {
  despacharLoteReportes(reportesRepo, reportesQueue, REPORTES_BATCH).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[worker] error despachando lote de reportes:', error);
  });
}, REPORTES_POLL_MS);

/**
 * notificaciones (backlog #19), PR8 (design.md D7). Cola PROPIA `notificaciones`, nunca compartida
 * con `correo` (corrige C5, PR7): un SMTP institucional lento no debe encolar recordatorios detrás
 * de comprobantes de voto, ni viceversa. El processor se REUSA tal cual (`procesarCorreoComprobante`
 * de `#15`) — es agnóstico del contenido y ya tiene la barrera CAS real; sólo cambia el repo
 * (`PrismaNotificacionesRepo`, `pendientes()` propio con `origen:'notificacion'`).
 */
const notificacionesRepo = new PrismaNotificacionesRepo(prisma);
const notificacionesQueue = new Queue(NOTIFICACIONES_QUEUE_NAME, { connection });

export const notificacionesWorker = new Worker(
  NOTIFICACIONES_QUEUE_NAME,
  async (job) => {
    if (job.name !== NOTIFICACION_CORREO_JOB_NAME) {
      return;
    }
    const sender = await crearEmailSender(prisma);
    await procesarCorreoComprobante(notificacionesRepo, sender, job.data.job_correo_id as string);
  },
  { connection },
);

notificacionesWorker.on('error', (error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "notificaciones":', error);
});

/**
 * D7: BullMQ decide CUÁNDO reintentar (`attempts`/`backoff`, ver `notificaciones-dispatcher.ts`);
 * este listener sólo escribe el estado TERMINAL `fallido` cuando la cola agota los reintentos
 * configurados — nunca desde el processor, que permanece agnóstico y sin cambios respecto de `#15`.
 */
const listenerNotificacionesFallido = crearListenerNotificacionesFallido(notificacionesRepo);
notificacionesWorker.on('failed', (job, error) => {
  // eslint-disable-next-line no-console
  console.error('[worker] error en la cola "notificaciones":', error);
  listenerNotificacionesFallido(job as unknown as NotificacionJobFallido | undefined, error);
});

/**
 * D7: despachador liviano de *polling* — Postgres es la fuente de verdad, BullMQ sólo ejecuta y
 * reintenta. El backend nunca encola notificaciones (ADR-0012); las filas nacen `pendiente` dentro
 * de la transacción de `emitirNotificaciones()` (PR3/PR4).
 */
setInterval(() => {
  despacharLoteNotificaciones(notificacionesRepo, notificacionesQueue, NOTIFICACIONES_BATCH).catch(
    (error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[worker] error despachando lote de notificaciones:', error);
    },
  );
}, NOTIFICACIONES_POLL_MS);

/**
 * notificaciones (backlog #19), PR10 (design.md D6/D12). Sweep periódico independiente del
 * despachador: `barrerNotificaciones()` decide QUÉ emitir (pura, `ahora` inyectado como
 * `new Date()` real acá — el único lugar permitido, D6); `PrismaSweepRepo` es el único adaptador
 * de este archivo con `emitirPendientes()`, que reusa `emitirNotificaciones()` de `#19` PR3.
 */
const sweepRepo = new PrismaSweepRepo(prisma);
const umbralesSweep = {
  recordatorioHoras: NOTIFICACIONES_RECORDATORIO_HORAS,
  cierreProximoHoras: NOTIFICACIONES_CIERRE_PROXIMO_HORAS,
};

setInterval(() => {
  barrerNotificaciones(sweepRepo, umbralesSweep, new Date()).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[worker] error en el sweep de notificaciones:', error);
  });
}, NOTIFICACIONES_SWEEP_MS);
