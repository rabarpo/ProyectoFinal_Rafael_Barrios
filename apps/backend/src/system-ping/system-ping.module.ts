import { Module } from '@nestjs/common';
import { redisProvider } from '../redis/redis.provider';
import { SystemPingController } from './system-ping.controller';
import { systemQueueProvider } from './system-ping-queue.provider';

@Module({
  controllers: [SystemPingController],
  providers: [redisProvider, systemQueueProvider],
})
export class SystemPingModule {}
