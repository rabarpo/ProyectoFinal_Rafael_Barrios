import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { procesarSystemPing } from './processors/system-ping.processor';
import { procesarCorreoComprobante } from './processors/outbox-correo.processor';
import { PrismaOutboxCorreoRepo } from './outbox/outbox-correo.repo';
import { crearEmailSender } from './outbox/email-sender.factory';
import {
  CORREO_COMPROBANTE_JOB_NAME,
  CORREO_QUEUE_NAME,
  despacharLoteOutbox,
} from './outbox/outbox-dispatcher';

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
