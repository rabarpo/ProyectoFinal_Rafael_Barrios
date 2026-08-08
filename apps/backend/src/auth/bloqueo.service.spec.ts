import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { BloqueoService, bloqueoVigente, sanarBloqueoVencido } from './bloqueo.service';

/**
 * bloqueo-desbloqueo-cuentas, PR1 (design.md D1/D5/D7 — fundación pura, sin wiring a
 * `AuthService` todavía). Corre contra un Redis real (efímero, `infra/docker/docker-compose.
 * test.yml`, mismo criterio que `recovery.service.spec.ts`/`session.service.spec.ts`): el
 * `SET NX` + `INCR` atómico y la ventana fija (TTL no reiniciado) no son simulables con mocks.
 * `bloqueoVigente()`/`sanarBloqueoVencido()` son helpers puros — el segundo se prueba con un
 * `tx` de Prisma mockeado, sin Postgres real (reservado a `test/auth/auth-bloqueo.e2e-spec.ts`
 * de PR2).
 */
describe('BloqueoService — registrarFallo()/resetearIntentos() (D1/D5)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  // 3.1 [R2]
  it('[R2] primer fallo real fija login:intentos:{userId} en 1 con TTL de la ventana', async () => {
    const service = new BloqueoService(redis);

    await service.registrarFallo({ id: 'usuario-1' }, 'codigo-1', 'password_incorrecta');

    const valor = await redis.get('login:intentos:usuario-1');
    expect(valor).toBe('1');
    const ttl = await redis.ttl('login:intentos:usuario-1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);
  });

  // 3.2 [D1]
  it('[D1] fallos repetidos incrementan sin reiniciar el TTL (ventana fija, no deslizante)', async () => {
    const service = new BloqueoService(redis);
    const usuario = { id: 'usuario-2' };

    await service.registrarFallo(usuario, 'codigo-2', 'password_incorrecta');
    // Simula el paso del tiempo dentro de la ventana: si el segundo fallo reiniciara el TTL,
    // volvería a quedar cerca de 900; si no lo reinicia, sigue acotado por este valor bajo.
    await redis.expire('login:intentos:usuario-2', 10);

    await service.registrarFallo(usuario, 'codigo-2', 'password_incorrecta');

    const valor = await redis.get('login:intentos:usuario-2');
    expect(valor).toBe('2');
    const ttlTrasSegundoFallo = await redis.ttl('login:intentos:usuario-2');
    expect(ttlTrasSegundoFallo).toBeGreaterThan(0);
    expect(ttlTrasSegundoFallo).toBeLessThanOrEqual(10);
  });

  // 3.3 [D1][adversarial]
  it('[D1][adversarial] sin usuario contable, registra en la clave señuelo con el mismo par SET NX + INCR', async () => {
    const service = new BloqueoService(redis);
    const codigo = 'CODIGO-INEXISTENTE';

    await service.registrarFallo(null, codigo, 'usuario_no_encontrado');

    const hash = createHash('sha256').update(codigo.trim().toLowerCase()).digest('hex').slice(0, 32);
    const claveSenuelo = `login:intentos:anon:${hash}`;
    const valor = await redis.get(claveSenuelo);
    expect(valor).toBe('1');
    const ttl = await redis.ttl(claveSenuelo);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);

    // Nunca toca una clave real — solo existe la señuelo.
    const claves = await redis.keys('login:intentos:*');
    expect(claves).toEqual([claveSenuelo]);
  });

  // 3.4 [R2]
  it('[R2] resetearIntentos borra el contador y es no-op si la clave no existe', async () => {
    const service = new BloqueoService(redis);
    await redis.set('login:intentos:usuario-3', '4', 'EX', 900);

    await service.resetearIntentos('usuario-3');
    expect(await redis.get('login:intentos:usuario-3')).toBeNull();

    await expect(service.resetearIntentos('usuario-inexistente')).resolves.toBeUndefined();
    expect(await redis.get('login:intentos:usuario-inexistente')).toBeNull();
  });

  // 3.5 [D5][adversarial]
  it('[D5][adversarial] registrarFallo/resetearIntentos no lanzan cuando Redis es inalcanzable', async () => {
    const redisRoto = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      connectTimeout: 200,
    });
    const service = new BloqueoService(redisRoto);

    await expect(
      service.registrarFallo({ id: 'usuario-roto' }, 'codigo-roto', 'password_incorrecta'),
    ).resolves.toBeUndefined();
    await expect(service.resetearIntentos('usuario-roto')).resolves.toBeUndefined();

    redisRoto.disconnect();
  });
});

describe('bloqueoVigente() (D7)', () => {
  // 3.7 [D7]
  it('[D7] true cuando estado bloqueado y bloqueado_hasta es null (bloqueo indefinido)', () => {
    expect(bloqueoVigente({ estado: 'bloqueado', bloqueado_hasta: null })).toBe(true);
  });

  it('[D7] true cuando estado bloqueado y bloqueado_hasta está en el futuro', () => {
    const futuro = new Date(Date.now() + 60_000);
    expect(bloqueoVigente({ estado: 'bloqueado', bloqueado_hasta: futuro })).toBe(true);
  });

  it('[D7] false cuando estado bloqueado pero bloqueado_hasta ya venció', () => {
    const pasado = new Date(Date.now() - 60_000);
    expect(bloqueoVigente({ estado: 'bloqueado', bloqueado_hasta: pasado })).toBe(false);
  });

  it('[D7] false cuando estado no es bloqueado, sin importar bloqueado_hasta', () => {
    expect(bloqueoVigente({ estado: 'activo', bloqueado_hasta: new Date(Date.now() + 60_000) })).toBe(
      false,
    );
    expect(bloqueoVigente({ estado: 'inactivo', bloqueado_hasta: null })).toBe(false);
  });
});

describe('sanarBloqueoVencido() (D6)', () => {
  function crearTxMock(count: number) {
    const updateMany = jest.fn().mockResolvedValue({ count });
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = {
      usuario: { updateMany },
      eventoAuditoria: { create },
    } as unknown as Prisma.TransactionClient;
    return { tx, updateMany, create };
  }

  // 3.9 [R5][D6]
  it('[R5][D6] cuando la fila estaba vencida (count===1), audita CUENTA_DESBLOQUEADA con actor null y motivo expiracion_automatica', async () => {
    const { tx, updateMany, create } = crearTxMock(1);

    await sanarBloqueoVencido(tx, { id: 'usuario-4' });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'usuario-4', estado: 'bloqueado', bloqueado_hasta: { lt: expect.any(Date) } },
      data: { estado: 'activo', bloqueado_hasta: null },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: AUDIT_EVENT_TYPES.CUENTA_DESBLOQUEADA,
          actor_usuario_id: null,
          entity_type: 'Usuario',
          entity_id: 'usuario-4',
          payload: { motivo: 'expiracion_automatica' },
        }),
      }),
    );
  });

  // 3.9 [R5][D6][adversarial]
  it('[R5][D6][adversarial] no-op (sin auditoría) cuando el update no afectó ninguna fila (bloqueado_hasta futuro o ya activo)', async () => {
    const { tx, create } = crearTxMock(0);

    await sanarBloqueoVencido(tx, { id: 'usuario-5' });

    expect(create).not.toHaveBeenCalled();
  });
});
