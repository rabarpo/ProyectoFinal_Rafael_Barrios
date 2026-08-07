import Redis from 'ioredis';
import { SessionService } from './session.service';

/**
 * auth-server-sessions, PR2 (design.md D1/D4). Corre contra un Redis real
 * (efímero, `infra/docker/docker-compose.test.yml` en 6380 — ver Work Unit 3
 * de tasks.md) para probar TTL/expiración reales, no simulables con mocks.
 * `REDIS_URL` se puede sobreescribir; por defecto apunta al puerto de test.
 */
describe('SessionService', () => {
  let redis: Redis;
  let service: SessionService;

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb();
    service = new SessionService(redis);
  });

  // 4.2 RED [R2][D4]: crear() escribe session:{id} (JSON, EX=1800) y agrega a
  // session:user:{userId} (SET, EXPIRE=28800).
  it('[R2][D4] crear() escribe session:{id} con EX=1800 y agrega el id a session:user:{userId} con EXPIRE=28800', async () => {
    const sessionId = await service.crear('usuario-1', 'docente');

    const raw = await redis.get(`session:${sessionId}`);
    expect(raw).not.toBeNull();
    const sesion = JSON.parse(raw as string);
    expect(sesion.userId).toBe('usuario-1');
    expect(sesion.rol).toBe('docente');

    const ttlSesion = await redis.ttl(`session:${sessionId}`);
    expect(ttlSesion).toBeGreaterThan(0);
    expect(ttlSesion).toBeLessThanOrEqual(1800);

    const miembros = await redis.smembers('session:user:usuario-1');
    expect(miembros).toContain(sessionId);

    const ttlSet = await redis.ttl('session:user:usuario-1');
    expect(ttlSet).toBeGreaterThan(1800);
    expect(ttlSet).toBeLessThanOrEqual(28800);
  });

  // 4.2 triangulación: dos crear() para el mismo usuario producen sessionIds distintos y ambos
  // quedan en el set (base de la sesión concurrente, D4).
  it('dos crear() para el mismo usuario producen sessionIds distintos, ambos presentes en el set', async () => {
    const idA = await service.crear('usuario-2', 'estudiante');
    const idB = await service.crear('usuario-2', 'estudiante');

    expect(idA).not.toBe(idB);
    const miembros = await redis.smembers('session:user:usuario-2');
    expect(miembros.sort()).toEqual([idA, idB].sort());
  });

  // 4.4 [D1]: obtener() renueva el TTL deslizante en cada llamada.
  it('[D1] obtener() renueva el TTL deslizante en cada llamada', async () => {
    const sessionId = await service.crear('usuario-3', 'comite');
    await redis.expire(`session:${sessionId}`, 5);

    const sesion = await service.obtener(sessionId);

    expect(sesion?.userId).toBe('usuario-3');
    const ttlDespues = await redis.ttl(`session:${sessionId}`);
    expect(ttlDespues).toBeGreaterThan(5);
  });

  // 4.4 [D1]: el techo absoluto de 28800s desde creadoEn se respeta aunque la clave siga viva.
  it('[D1] obtener() aplica el techo absoluto desde creadoEn aunque la clave session:{id} siga viva', async () => {
    const sessionId = await service.crear('usuario-4', 'administrador');
    const raw = (await redis.get(`session:${sessionId}`)) as string;
    const sesion = JSON.parse(raw);
    sesion.creadoEn = Math.floor(Date.now() / 1000) - 28800 - 1;
    await redis.set(`session:${sessionId}`, JSON.stringify(sesion), 'EX', 1800);

    const resultado = await service.obtener(sessionId);

    expect(resultado).toBeNull();
    const raw2 = await redis.get(`session:${sessionId}`);
    expect(raw2).toBeNull();
  });

  // 4.5: revocar() elimina session:{id} y hace SREM del set del usuario.
  it('revocar() elimina session:{id} y quita el id de session:user:{userId}', async () => {
    const sessionId = await service.crear('usuario-5', 'director');

    await service.revocar(sessionId);

    const raw = await redis.get(`session:${sessionId}`);
    expect(raw).toBeNull();
    const miembros = await redis.smembers('session:user:usuario-5');
    expect(miembros).not.toContain(sessionId);
  });

  // 4.6 [R8]: revokeAllForUser con 2+ sesiones activas no deja ninguna session:{id} de ese usuario.
  it('[R8] revokeAllForUser con dos o más sesiones activas no deja session:{id} de ese usuario', async () => {
    const idA = await service.crear('usuario-6', 'estudiante');
    const idB = await service.crear('usuario-6', 'estudiante');

    await service.revokeAllForUser('usuario-6');

    expect(await redis.get(`session:${idA}`)).toBeNull();
    expect(await redis.get(`session:${idB}`)).toBeNull();
    expect(await redis.smembers('session:user:usuario-6')).toEqual([]);
  });

  // 4.7 [R8][adversarial]: revokeAllForUser invocado dos veces no lanza (idempotente).
  it('[R8][adversarial] revokeAllForUser invocado dos veces no lanza (DEL de huérfano es no-op)', async () => {
    await service.crear('usuario-7', 'docente');

    await service.revokeAllForUser('usuario-7');
    await expect(service.revokeAllForUser('usuario-7')).resolves.toBeUndefined();
  });
});
