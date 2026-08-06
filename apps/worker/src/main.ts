import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { procesarSystemPing } from './processors/system-ping.processor';

/**
 * Deben coincidir con `SYSTEM_QUEUE_NAME`/`SYSTEM_PING_JOB_NAME` de
 * `apps/backend/src/system-ping/system-ping-queue.provider.ts`. No se
 * comparten vía un paquete común porque `packages/contracts` es exclusivo
 * del contrato HTTP/OpenAPI (ADR-0001/ADR-0002), no de mensajería interna.
 */
const SYSTEM_QUEUE_NAME = 'system';
const SYSTEM_PING_JOB_NAME = 'system.ping';

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
