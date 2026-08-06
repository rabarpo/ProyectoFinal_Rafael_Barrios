import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';

export interface RespuestaHealth {
  estado: 'ok' | 'degradado';
  db: { estado: 'ok' | 'error'; latenciaMs: number };
  redis: { estado: 'ok' | 'error'; latenciaMs: number };
  worker: { ultimoPing: string | null };
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Reporta el estado real de Postgres, Redis y el último heartbeat del worker' })
  @ApiResponse({ status: 200, description: 'Estado agregado del walking skeleton (puede ser "degradado")' })
  async obtenerHealth(): Promise<RespuestaHealth> {
    const db = await this.verificarDb();
    const redis = await this.verificarRedis();
    const ultimoPing = redis.estado === 'ok' ? await this.redis.get('system:ping:heartbeat') : null;

    return {
      estado: db.estado === 'ok' && redis.estado === 'ok' ? 'ok' : 'degradado',
      db,
      redis,
      worker: { ultimoPing },
    };
  }

  private async verificarDb(): Promise<{ estado: 'ok' | 'error'; latenciaMs: number }> {
    const inicio = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { estado: 'ok', latenciaMs: Date.now() - inicio };
    } catch {
      return { estado: 'error', latenciaMs: Date.now() - inicio };
    }
  }

  private async verificarRedis(): Promise<{ estado: 'ok' | 'error'; latenciaMs: number }> {
    const inicio = Date.now();
    try {
      await this.redis.ping();
      return { estado: 'ok', latenciaMs: Date.now() - inicio };
    } catch {
      return { estado: 'error', latenciaMs: Date.now() - inicio };
    }
  }
}
