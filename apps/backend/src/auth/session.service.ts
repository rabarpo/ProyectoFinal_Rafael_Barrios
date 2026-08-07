import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import type { RolUsuario } from '@prisma/client';
import { REDIS_CLIENT } from '../redis/redis.provider';
import type { SesionUsuario } from './sesion-usuario';

/**
 * auth-server-sessions, PR2 (design.md D1/D4). TTL deslizante (por defecto 1800s) renovado en
 * cada `obtener()`, y techo absoluto (por defecto 28800s) desde `creadoEn`, verificado a mano en
 * `obtener()` porque `session:{id}` se renueva y nunca expiraría solo. Ambos configurables por
 * env sin tocar código.
 */
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 1800);
const SESSION_ABSOLUTE_TTL_SECONDS = Number(process.env.SESSION_ABSOLUTE_TTL_SECONDS ?? 28800);

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function userSetKey(userId: string): string {
  return `session:user:${userId}`;
}

@Injectable()
export class SessionService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Sesiones concurrentes permitidas (D4): NO invalida sesiones previas del usuario.
   * `session:user:{userId}` es el índice (SET) usado por `revokeAllForUser`; su EXPIRE se
   * renueva en cada login, igual que el techo absoluto de una sesión nueva.
   */
  async crear(userId: string, rol: RolUsuario): Promise<string> {
    const sessionId = randomBytes(32).toString('base64url');
    const sesion: SesionUsuario = { userId, rol, creadoEn: Math.floor(Date.now() / 1000) };

    await this.redis
      .multi()
      .set(sessionKey(sessionId), JSON.stringify(sesion), 'EX', SESSION_TTL_SECONDS)
      .sadd(userSetKey(userId), sessionId)
      .expire(userSetKey(userId), SESSION_ABSOLUTE_TTL_SECONDS)
      .exec();

    return sessionId;
  }

  /**
   * Aplica el techo absoluto desde `creadoEn` (D1) — necesario porque el TTL de `session:{id}`
   * se renueva en cada llamada y, sin este chequeo manual, nunca expiraría por sí solo.
   */
  async obtener(sessionId: string): Promise<SesionUsuario | null> {
    const raw = await this.redis.get(sessionKey(sessionId));
    if (!raw) return null;

    const sesion = JSON.parse(raw) as SesionUsuario;
    const ahora = Math.floor(Date.now() / 1000);
    if (ahora - sesion.creadoEn >= SESSION_ABSOLUTE_TTL_SECONDS) {
      await this.redis.del(sessionKey(sessionId));
      return null;
    }

    await this.redis.expire(sessionKey(sessionId), SESSION_TTL_SECONDS);
    return sesion;
  }

  async revocar(sessionId: string): Promise<void> {
    const raw = await this.redis.get(sessionKey(sessionId));
    await this.redis.del(sessionKey(sessionId));

    if (raw) {
      const { userId } = JSON.parse(raw) as SesionUsuario;
      await this.redis.srem(userSetKey(userId), sessionId);
    }
  }

  /**
   * Idempotente (spec "Punto de extensión de revocación de sesión"): miembros huérfanos del set
   * (sesiones ya expiradas) se auto-sanan porque `DEL` de una clave inexistente es un no-op.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const sessionIds = await this.redis.smembers(userSetKey(userId));
    if (sessionIds.length > 0) {
      await this.redis.del(...sessionIds.map(sessionKey));
    }
    await this.redis.del(userSetKey(userId));
  }
}
