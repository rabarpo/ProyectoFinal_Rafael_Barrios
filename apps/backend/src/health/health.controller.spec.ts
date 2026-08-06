import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };
    redis = { ping: jest.fn(), get: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    controller = moduleRef.get<HealthController>(HealthController);
  });

  it('responde 200 con db.estado y redis.estado en "ok" cuando ambas dependencias responden', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue('PONG');
    redis.get.mockResolvedValue(null);

    const resultado = await controller.obtenerHealth();

    expect(resultado.estado).toBe('ok');
    expect(resultado.db.estado).toBe('ok');
    expect(resultado.redis.estado).toBe('ok');
  });

  it('reporta redis.estado "error" y estado "degradado" cuando Redis rechaza PING, sin ocultarlo con un 200 genérico', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockRejectedValue(new Error('ECONNREFUSED'));

    const resultado = await controller.obtenerHealth();

    expect(resultado.db.estado).toBe('ok');
    expect(resultado.redis.estado).toBe('error');
    expect(resultado.estado).toBe('degradado');
    expect(redis.get).not.toHaveBeenCalled();
  });
});
