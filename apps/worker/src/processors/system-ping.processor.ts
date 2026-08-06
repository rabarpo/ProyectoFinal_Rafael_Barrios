import type Redis from 'ioredis';

/**
 * Clave de Redis donde vive el heartbeat del último `system.ping` procesado.
 * Debe coincidir EXACTAMENTE con la clave que lee
 * `apps/backend/src/health/health.controller.ts` (`system:ping:heartbeat`).
 */
export const SYSTEM_PING_HEARTBEAT_KEY = 'system:ping:heartbeat';

/**
 * Procesa el job `system.ping`: escribe un heartbeat con marca de tiempo
 * ISO 8601 en `system:ping:heartbeat` (Redis). `GET /api/health` del backend
 * lee esa misma clave para reportar `worker.ultimoPing`.
 *
 * IMPORTANTE — NO REUTILIZABLE COMO ANDAMIAJE DE OUTBOX (ADR-0012):
 * este processor es, a propósito, el walking skeleton mínimo de `[R6]`. El
 * heartbeat vive únicamente en una clave de Redis, sin esquema y sin tocar
 * PostgreSQL. El patrón outbox del ADR-0012 (issues #12/#15) exige una
 * semántica distinta: la fuente de verdad es una fila de PostgreSQL escrita
 * en la MISMA transacción que el hecho notificado. Quien implemente el
 * outbox NO debe copiar este archivo como punto de partida — ver design.md,
 * "Diagrama de secuencia del walking skeleton".
 *
 * Por eso este processor NUNCA debe importar `PrismaClient`/`PrismaService`
 * ni ningún cliente de PostgreSQL.
 */
export async function procesarSystemPing(redis: Pick<Redis, 'set'>): Promise<void> {
  await redis.set(SYSTEM_PING_HEARTBEAT_KEY, new Date().toISOString());
}
