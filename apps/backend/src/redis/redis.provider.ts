import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * `lazyConnect: true`: el cliente NO abre conexión al instanciarse.
 * La primera conexión real ocurre en el primer comando (gotcha D1 de design.md).
 */
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis =>
    new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
    }),
};
