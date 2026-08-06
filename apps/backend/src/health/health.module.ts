import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { redisProvider } from '../redis/redis.provider';

@Module({
  controllers: [HealthController],
  providers: [PrismaService, redisProvider],
})
export class HealthModule {}
