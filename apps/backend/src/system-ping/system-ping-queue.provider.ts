import { Provider } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.provider';

export const SYSTEM_QUEUE = 'SYSTEM_QUEUE';
export const SYSTEM_QUEUE_NAME = 'system';
export const SYSTEM_PING_JOB_NAME = 'system.ping';

/**
 * Reutiliza el cliente `ioredis` perezoso (`lazyConnect: true`) del health check.
 * `skipWaitingForReady: true` evita que BullMQ llame a `client.connect()` al
 * construirse (gotcha D1 de design.md): la extracción de OpenAPI (`src/openapi.ts`)
 * instancia todo el árbol de módulos de Nest sin Redis vivo.
 */
export const systemQueueProvider: Provider = {
  provide: SYSTEM_QUEUE,
  useFactory: (redis: Redis): Queue =>
    new Queue(SYSTEM_QUEUE_NAME, {
      connection: redis,
      skipWaitingForReady: true,
    }),
  inject: [REDIS_CLIENT],
};
