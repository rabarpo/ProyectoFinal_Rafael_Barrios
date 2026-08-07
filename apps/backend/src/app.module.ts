import { Module } from '@nestjs/common';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { SystemPingModule } from './system-ping/system-ping.module';

@Module({
  imports: [HealthModule, SystemPingModule, AuditoriaModule, AuthModule],
})
export class AppModule {}
