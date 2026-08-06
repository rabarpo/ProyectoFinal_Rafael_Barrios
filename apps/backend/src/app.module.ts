import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SystemPingModule } from './system-ping/system-ping.module';

@Module({
  imports: [HealthModule, SystemPingModule],
})
export class AppModule {}
