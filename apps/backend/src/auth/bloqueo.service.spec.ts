import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { BloqueoService, bloqueoVigente, sanarBloqueoVencido } from './bloqueo.service';

/**
 * bloqueo-desbloqueo-cuentas. PR1 (design.md D1/D5/D7 — fundación pura) dejó estas pruebas contra
 * un Redis real (efímero, `infra/docker/docker-compose.test.yml`, mismo criterio que
 * `recovery.service.spec.ts`/`session.service.spec.ts`): el `SET NX` + `INCR` atómico y la
 * ventana fija (TTL no reiniciado) no son simulables con mocks. PR2 (design.md D2) agrega
 * `prisma`/`auditoria`/`sessionService` al constructor para la transición de auto-bloqueo — estas
 * pruebas de PR1 nunca cruzan el umbral (`INTENTOS_MAX=5` por defecto), así que se les pasan
 * mocks que fallan la prueba si llegaran a invocarse. `bloqueoVigente()`/`sanarBloqueoVencido()`
 * son helpers puros — el segundo se prueba con un `tx` de Prisma mockeado, sin Postgres real
 * (la transición de auto-bloqueo en sí se cubre en `test/auth/auth-bloqueo.e2e-spec.ts`, PR2).
 */
function crearMocksDependenciasBloqueo() {
  const noDeberiaLlamarse = () => {
    throw new Error('no se esperaba invocar esta dependencia en una prueba bajo el umbral');
  };
  const prisma = { $transaction: jest.fn(noDeberiaLlamarse) } as unknown as ConstructorParameters<
    typeof BloqueoService
  >[1];
  const auditoria = { log: jest.fn(noDeberiaLlamarse) } as unknown as ConstructorParameters<
    typeof BloqueoService
  >[2];
  const sessionService = {
    revokeAllForUser: jest.fn(noDeberiaLlamarse),
  } as unknown as ConstructorParameters<typeof BloqueoService>[3];
  return { prisma, auditoria, sessionService };
}

function crearService(redisClient: Redis): BloqueoService {
  const { prisma, auditoria, sessionService } = crearMocksDependenciasBloqueo();
  return new BloqueoService(redisClient, prisma, auditoria, sessionService);
}

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
    const service = crearService(redis);

    await service.registrarFallo({ id: 'usuario-1' }, 'codigo-1', 'password_incorrecta');

    const valor = await redis.get('login:intentos:usuario-1');
    expect(valor).toBe('1');
    const ttl = await redis.ttl('login:intentos:usuario-1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);
  });

  // 3.2 [D1]
  it('[D1] fallos repetidos incrementan sin reiniciar el TTL (ventana fija, no deslizante)', async () => {
    const service = crearService(redis);
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
    const service = crearService(redis);
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
    const service = crearService(redis);
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
    const service = crearService(redisRoto);

    await expect(
      service.registrarFallo({ id: 'usuario-roto' }, 'codigo-roto', 'password_incorrecta'),
    ).resolves.toBeUndefined();
    await expect(service.resetearIntentos('usuario-roto')).resolves.toBeUndefined();

    redisRoto.disconnect();
  });
});

/**
 * bloqueo-desbloqueo-cuentas, PR2 (design.md D2, tareas 5.1-5.5). Unit-level: mockea
 * `prisma`/`auditoria`/`sessionService` para aislar la lógica de disparo del umbral
 * (`intentos >= INTENTOS_MAX`) y la condición `count===1` de la sentencia de bloqueo. La
 * concurrencia real (dos requests que cruzan el umbral a la vez) y el estado `inactivo` inmune
 * corren contra Postgres real en `test/auth/auth-bloqueo.e2e-spec.ts`.
 */
describe('BloqueoService — registrarFallo() dispara la transición de auto-bloqueo (D2)', () => {
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

  function crearServiceConMocks(count: number) {
    const updateMany = jest.fn().mockResolvedValue({ count });
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { usuario: { updateMany }, eventoAuditoria: { create } };
    const prisma = {
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    } as unknown as ConstructorParameters<typeof BloqueoService>[1];
    const auditoria = {
      log: jest.fn(async (txArg: unknown, ...args: unknown[]) => {
        const [eventType, actorId, entityType, entityId, payload] = args;
        await (txArg as { eventoAuditoria: { create: typeof create } }).eventoAuditoria.create({
          data: { event_type: eventType, actor_usuario_id: actorId, entity_type: entityType, entity_id: entityId, payload },
        });
      }),
    } as unknown as ConstructorParameters<typeof BloqueoService>[2];
    const revokeAllForUser = jest.fn().mockResolvedValue(undefined);
    const sessionService = { revokeAllForUser } as unknown as ConstructorParameters<
      typeof BloqueoService
    >[3];
    const service = new BloqueoService(redis, prisma, auditoria, sessionService);
    return { service, prisma, updateMany, create, revokeAllForUser };
  }

  // 5.4 (bajo el umbral): 4 fallos consecutivos no disparan ninguna transacción de bloqueo.
  it('[D2] por debajo del umbral, registrarFallo nunca abre la transacción de bloqueo', async () => {
    const { service, prisma } = crearServiceConMocks(1);

    for (let i = 0; i < 4; i += 1) {
      await service.registrarFallo({ id: 'usuario-umbral-1' }, 'codigo', 'password_incorrecta');
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // 5.1 [R4]: el quinto fallo dispara updateMany(estado activo -> bloqueado), audita y revoca.
  it('[R4] el quinto fallo dispara la transición: updateMany condicionado a estado activo, audita y revoca sesiones', async () => {
    const { service, prisma, updateMany, create, revokeAllForUser } = crearServiceConMocks(1);

    for (let i = 0; i < 5; i += 1) {
      await service.registrarFallo({ id: 'usuario-umbral-2' }, 'codigo', 'password_incorrecta');
    }

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'usuario-umbral-2', estado: 'activo' },
      data: { estado: 'bloqueado', bloqueado_hasta: expect.any(Date) },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: AUDIT_EVENT_TYPES.CUENTA_BLOQUEADA,
          actor_usuario_id: null,
          entity_type: 'Usuario',
          entity_id: 'usuario-umbral-2',
          payload: expect.objectContaining({ motivo: 'intentos_fallidos', intentos: 5 }),
        }),
      }),
    );
    expect(revokeAllForUser).toHaveBeenCalledWith('usuario-umbral-2');
  });

  // 5.4 [D2][adversarial]: si el updateMany no afectó fila (count===0, p. ej. ya bloqueado por
  // una carrera concurrente), no audita ni revoca de nuevo.
  it('[D2][adversarial] cuando el updateMany no afecta ninguna fila (count===0), no audita ni revoca', async () => {
    const { service, create, revokeAllForUser } = crearServiceConMocks(0);

    for (let i = 0; i < 5; i += 1) {
      await service.registrarFallo({ id: 'usuario-umbral-3' }, 'codigo', 'password_incorrecta');
    }

    expect(create).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
  });

  // 5.5 [R2]: 4 fallos + 1 éxito (resetearIntentos) + 4 fallos más no cruza el umbral.
  it('[R2] un reseteo intermedio hace que 4+4 fallos no crucen el umbral de 5', async () => {
    const { service, prisma } = crearServiceConMocks(1);
    const usuario = { id: 'usuario-reset-1' };

    for (let i = 0; i < 4; i += 1) {
      await service.registrarFallo(usuario, 'codigo', 'password_incorrecta');
    }
    await service.resetearIntentos(usuario.id);
    for (let i = 0; i < 4; i += 1) {
      await service.registrarFallo(usuario, 'codigo', 'password_incorrecta');
    }

    expect(prisma.$transaction).not.toHaveBeenCalled();
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

/**
 * bloqueo-desbloqueo-cuentas, PR3 (design.md D2-análogo, tareas 8.1-8.4). Mismo criterio unit que
 * la describe de auto-bloqueo de arriba: mockea `prisma`/`auditoria`/`sessionService` para aislar
 * la lógica del `count===1`/`found`. La concurrencia real (dos desbloqueos simultáneos) corre
 * contra Postgres real en `test/auth/auth-desbloqueo.e2e-spec.ts`.
 */
describe('BloqueoService — desbloquearManual() (D2-análogo)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
  });

  afterAll(async () => {
    await redis.quit();
  });

  function crearServiceConMocks(usuarioEncontrado: { id: string } | null, count: number) {
    const findUnique = jest.fn().mockResolvedValue(usuarioEncontrado);
    const updateMany = jest.fn().mockResolvedValue({ count });
    const create = jest.fn().mockResolvedValue(undefined);
    const tx = { usuario: { findUnique, updateMany }, eventoAuditoria: { create } };
    const prisma = {
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
    } as unknown as ConstructorParameters<typeof BloqueoService>[1];
    const auditoria = {
      log: jest.fn(async (txArg: unknown, ...args: unknown[]) => {
        const [eventType, actorId, entityType, entityId, payload] = args;
        await (txArg as { eventoAuditoria: { create: typeof create } }).eventoAuditoria.create({
          data: { event_type: eventType, actor_usuario_id: actorId, entity_type: entityType, entity_id: entityId, payload },
        });
      }),
    } as unknown as ConstructorParameters<typeof BloqueoService>[2];
    const revokeAllForUser = jest.fn().mockResolvedValue(undefined);
    const sessionService = { revokeAllForUser } as unknown as ConstructorParameters<
      typeof BloqueoService
    >[3];
    const service = new BloqueoService(redis, prisma, auditoria, sessionService);
    return { service, prisma, findUnique, updateMany, create, revokeAllForUser };
  }

  // 8.1 [R6]
  it('[R6] desbloquea una cuenta bloqueada: resetea estado/bloqueado_hasta, audita con actor=comité y revoca sesiones', async () => {
    const { service, findUnique, updateMany, create, revokeAllForUser } = crearServiceConMocks(
      { id: 'usuario-desbloqueo-1' },
      1,
    );

    const resultado = await service.desbloquearManual('usuario-desbloqueo-1', 'comite-1');

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'usuario-desbloqueo-1' } });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'usuario-desbloqueo-1', estado: 'bloqueado' },
      data: { estado: 'activo', bloqueado_hasta: null },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: AUDIT_EVENT_TYPES.CUENTA_DESBLOQUEADA,
          actor_usuario_id: 'comite-1',
          entity_type: 'Usuario',
          entity_id: 'usuario-desbloqueo-1',
          payload: { motivo: 'manual_comite' },
        }),
      }),
    );
    expect(revokeAllForUser).toHaveBeenCalledWith('usuario-desbloqueo-1');
    expect(resultado).toEqual({ desbloqueado: true });
  });

  // 8.2 [D2-analog]
  it('[D2-analog] es idempotente sobre una cuenta ya activa: desbloqueado=false, sin auditoría ni revocación', async () => {
    const { service, create, revokeAllForUser } = crearServiceConMocks(
      { id: 'usuario-desbloqueo-2' },
      0,
    );

    const resultado = await service.desbloquearManual('usuario-desbloqueo-2', 'comite-1');

    expect(create).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
    expect(resultado).toEqual({ desbloqueado: false });
  });

  // 8.4
  it('con un id inexistente devuelve la señal de no-encontrado sin escribir ninguna fila', async () => {
    const { service, updateMany, create, revokeAllForUser } = crearServiceConMocks(null, 0);

    const resultado = await service.desbloquearManual('usuario-inexistente', 'comite-1');

    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(revokeAllForUser).not.toHaveBeenCalled();
    expect(resultado).toBeNull();
  });
});

/**
 * bloqueo-desbloqueo-cuentas, PR3 (design.md "Contratos", tareas 9.1-9.2).
 */
describe('BloqueoService — listarBloqueados()', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
  });

  afterAll(async () => {
    await redis.quit();
  });

  function crearServiceConFindMany(filas: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(filas);
    const prisma = { usuario: { findMany } } as unknown as ConstructorParameters<
      typeof BloqueoService
    >[1];
    const auditoria = {} as unknown as ConstructorParameters<typeof BloqueoService>[2];
    const sessionService = {} as unknown as ConstructorParameters<typeof BloqueoService>[3];
    const service = new BloqueoService(redis, prisma, auditoria, sessionService);
    return { service, findMany };
  }

  // 9.1 [R7]
  it('[R7] consulta solo estado=bloqueado, campos mínimos, ordenado por bloqueado_hasta desc y codigo asc', async () => {
    const filas = [{ id: '1', nombres: 'A', dni: '1', codigo: 'a', bloqueado_hasta: null }];
    const { service, findMany } = crearServiceConFindMany(filas);

    const resultado = await service.listarBloqueados();

    expect(findMany).toHaveBeenCalledWith({
      where: { estado: 'bloqueado' },
      select: { id: true, nombres: true, dni: true, codigo: true, bloqueado_hasta: true },
      orderBy: [{ bloqueado_hasta: 'desc' }, { codigo: 'asc' }],
    });
    expect(resultado).toBe(filas);
  });

  // 9.2 [R7]
  it('[R7] no filtra por vencimiento: una fila con bloqueado_hasta pasado igual llega en el resultado del findMany', async () => {
    const filaVencida = {
      id: '2',
      nombres: 'B',
      dni: '2',
      codigo: 'b',
      bloqueado_hasta: new Date(Date.now() - 60_000),
    };
    const { service, findMany } = crearServiceConFindMany([filaVencida]);

    const resultado = await service.listarBloqueados();

    // El filtrado por vencimiento no forma parte del `where` — se confirma en la aserción anterior;
    // acá solo se confirma que la fila vencida efectivamente atraviesa la capa sin descartarse.
    expect(resultado).toEqual([filaVencida]);
    expect(findMany.mock.calls[0][0].where).toEqual({ estado: 'bloqueado' });
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
