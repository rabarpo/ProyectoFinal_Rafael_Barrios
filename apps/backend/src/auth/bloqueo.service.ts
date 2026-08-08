import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Usuario } from '@prisma/client';
import type Redis from 'ioredis';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { REDIS_CLIENT } from '../redis/redis.provider';

const INTENTOS_MAX = Number(process.env.LOGIN_INTENTOS_MAX ?? 5);
const INTENTOS_VENTANA_SEGUNDOS = Number(process.env.LOGIN_INTENTOS_VENTANA_SEGUNDOS ?? 900);
const BLOQUEO_SEGUNDOS = Number(process.env.LOGIN_BLOQUEO_SEGUNDOS ?? 900);

function realKey(userId: string): string {
  return `login:intentos:${userId}`;
}

// D1: la clave la controla el atacante cuando no hay `Usuario` contable — indexar por `codigo`
// sin hashear dejaría cardinalidad no acotada e identificadores en el keyspace de Redis.
function decoyKey(codigo: string): string {
  const hash = createHash('sha256').update(codigo.trim().toLowerCase()).digest('hex');
  return `login:intentos:anon:${hash.slice(0, 32)}`;
}

/**
 * bloqueo-desbloqueo-cuentas, PR1 (design.md D1/D5/D7 — fundación pura, sin wiring a `login()`/
 * `loginConGoogle()` todavía; PR2 la conecta). `INTENTOS_MAX`/`BLOQUEO_SEGUNDOS` quedan
 * declarados acá (mismo idioma env-con-default que `SESSION_TTL_SECONDS`) para que PR2 los
 * consuma sin duplicar la lectura de `process.env`.
 */
@Injectable()
export class BloqueoService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * D1: ejecuta SIEMPRE el mismo par `SET NX` + `INCR`, sobre la clave real (`Usuario` contable)
   * o la señuelo (sin usuario) — ninguna rama de rechazo del caller se distingue por el trabajo
   * hecho en Redis. El `SET NX` fija el TTL una sola vez ⇒ ventana fija, no deslizante.
   * `motivo` viaja en la firma por el contrato de D8 (PR2 la conecta); esta fundación no la
   * consume todavía. D5: nunca propaga excepciones — el modo de falla aceptado es perder el
   * contador y que el atacante gane una ventana nueva.
   */
  async registrarFallo(
    usuario: Pick<Usuario, 'id'> | null,
    codigo: string,
    _motivo: string,
  ): Promise<void> {
    const key = usuario ? realKey(usuario.id) : decoyKey(codigo);
    await this.redis
      .multi()
      .set(key, '0', 'EX', INTENTOS_VENTANA_SEGUNDOS, 'NX')
      .incr(key)
      .exec()
      .catch(() => undefined);
  }

  /** D5: no propaga excepciones; `DEL` de una clave inexistente ya es un no-op en Redis. */
  async resetearIntentos(userId: string): Promise<void> {
    await this.redis.del(realKey(userId)).catch(() => undefined);
  }
}

/**
 * D7: chequeo puro y síncrono, aplica a ambos caminos de login (PR2 lo consume en `login()` y
 * `loginConGoogle()`). `bloqueado_hasta === null` con `estado==='bloqueado'` es un bloqueo
 * indefinido — sigue vigente hasta el desbloqueo manual.
 */
export function bloqueoVigente(usuario: Pick<Usuario, 'estado' | 'bloqueado_hasta'>): boolean {
  return (
    usuario.estado === 'bloqueado' &&
    (usuario.bloqueado_hasta === null || usuario.bloqueado_hasta > new Date())
  );
}

/**
 * D6: expiración perezosa, auditada como `CUENTA_DESBLOQUEADA` con actor `null`. La condición
 * `bloqueado_hasta: { lt: new Date() }` se reevalúa en la escritura (no en una lectura previa),
 * así que un re-bloqueo ocurrido entre la lectura y la transacción no se pisa. Solo audita cuando
 * el `updateMany` afectó efectivamente una fila (`count === 1`) — no-op si `bloqueado_hasta`
 * sigue en el futuro o la fila ya está `activo`. Instancia `AuditoriaService` directamente: no
 * depende de nada inyectado (ver su propio comentario), y esta función vive fuera del grafo de DI
 * a propósito — helper puro sobre `tx`, igual que `bloqueoVigente`.
 */
export async function sanarBloqueoVencido(
  tx: Prisma.TransactionClient,
  usuario: Pick<Usuario, 'id'>,
): Promise<void> {
  const { count } = await tx.usuario.updateMany({
    where: { id: usuario.id, estado: 'bloqueado', bloqueado_hasta: { lt: new Date() } },
    data: { estado: 'activo', bloqueado_hasta: null },
  });

  if (count === 1) {
    await new AuditoriaService().log(
      tx,
      AUDIT_EVENT_TYPES.CUENTA_DESBLOQUEADA,
      null,
      'Usuario',
      usuario.id,
      { motivo: 'expiracion_automatica' } as Prisma.InputJsonValue,
    );
  }
}

// Exportadas para que PR2 (auto-bloqueo, D2) y PR3 (desbloqueo manual, D2-análogo) las reutilicen
// sin recalcular `process.env` en cada archivo — mismo criterio que las constantes de arriba.
export { INTENTOS_MAX, INTENTOS_VENTANA_SEGUNDOS, BLOQUEO_SEGUNDOS };
